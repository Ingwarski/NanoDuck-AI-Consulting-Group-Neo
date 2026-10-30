"""Blend the sharper v3 and woody v4 taps, with two quiet early reflections.

Usage: python3 edit-audio.py SHARP_V3_WAV WOODY_V4_WAV OUTPUT_WAV
Listening candidate only; not promoted to the application.
"""
import array
import json
import math
import sys
import wave
from pathlib import Path

sharp_path, woody_path, output_path = map(Path, sys.argv[1:])


def read_mono(path):
    with wave.open(str(path)) as source:
        assert source.getnchannels() == 1 and source.getsampwidth() == 2
        rate = source.getframerate()
        pcm = array.array('h', source.readframes(source.getnframes()))
    if sys.byteorder != 'little':
        pcm.byteswap()
    return rate, [x / 32768 for x in pcm]


rate, sharp = read_mono(sharp_path)
woody_rate, woody = read_mono(woody_path)
assert rate == woody_rate
start, length = round(.008 * rate), round(.045 * rate)
sharp, woody = sharp[start:start + length], woody[start:start + length]
rms = lambda samples: math.sqrt(sum(x * x for x in samples) / len(samples))
# Equalize energy before mixing so the louder woody version does not dominate.
sharp_rms, woody_rms = rms(sharp), rms(woody)
dry = [.5 * a / sharp_rms + .5 * b / woody_rms for a, b in zip(sharp, woody)]
peak = max(abs(x) for x in dry)
dry = [x / peak for x in dry]

# Darker, quiet reflections add a trace of space without a repeating echo train.
alpha = 1 - math.exp(-2 * math.pi * 4000 / rate)
low = 0.
reflected = []
for x in dry:
    low += alpha * (x - low)
    reflected.append(low)
for i in range(round(.004 * rate)):
    reflected[-1 - i] *= i / round(.004 * rate)
reflections = [(28, .12), (47, .045)]
tap_length = length + round(.047 * rate)
tap = dry + [0.] * (tap_length - length)
for delay_ms, gain in reflections:
    offset = round(delay_ms / 1000 * rate)
    for i, x in enumerate(reflected):
        tap[offset + i] += gain * x
peak = max(abs(x) for x in tap)
tap = [x * .96 / peak for x in tap]
frames = round(.65 * rate)
out = [0.] * frames
for i in range(3):
    onset = round((.008 + i * .25) * rate)
    out[onset:onset + tap_length] = tap
pcm = array.array('h', [round(x * 32767) for x in out])
if sys.byteorder != 'little':
    pcm.byteswap()
with wave.open(str(output_path), 'wb') as target:
    target.setparams((1, 2, rate, frames, 'NONE', 'not compressed'))
    target.writeframes(pcm.tobytes())
print(json.dumps({
    'sample_rate': rate, 'channels': 1, 'duration_seconds': frames / rate,
    'blend': '50/50 after matching the RMS of the two 45 ms source windows',
    'direct_impact_ms': 45, 'impact_with_reflections_ms': tap_length / rate * 1000,
    'onset_interval_ms': 250, 'reflection_low_pass_hz': 4000,
    'reflections': [{'delay_ms': d, 'gain': g} for d, g in reflections],
    'feedback': 0, 'peak_fraction': max(abs(x) for x in out),
    'clipped_samples': sum(abs(x) >= 1 for x in out),
    'pitch': 'unchanged; no resampling'
}, indent=2))

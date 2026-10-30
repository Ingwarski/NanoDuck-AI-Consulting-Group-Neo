"""More pronounced, dry table-bounce: mild soft-knee compression and extra headroom use.
Usage: python3 edit-audio.py DECODED_SOURCE_WAV OUTPUT_WAV
"""
import array
import json
import math
import sys
import wave
from pathlib import Path

source_path, output_path = map(Path, sys.argv[1:])
with wave.open(str(source_path)) as source:
    assert source.getsampwidth() == 2
    rate, channels = source.getframerate(), source.getnchannels()
    raw = array.array('h', source.readframes(source.getnframes()))
    if sys.byteorder != 'little':
        raw.byteswap()
# Mono removes stereo room width. Keep the original impact without resampling.
mono = [sum(raw[i:i + channels]) / channels / 32768 for i in range(0, len(raw), channels)]
# Second-order high-pass removes the dull low body; parallel high-frequency
# emphasis brings out the recorded contact transient rather than adding a tone.
w = 2 * math.pi * 850 / rate
co, si = math.cos(w), math.sin(w)
alpha = si / (2 * math.sqrt(.5))
a0 = 1 + alpha
b0, b1, b2 = (1 + co) / 2 / a0, -(1 + co) / a0, (1 + co) / 2 / a0
a1, a2 = -2 * co / a0, (1 - alpha) / a0
x1 = x2 = y1 = y2 = low = 0.
split = 1 - math.exp(-2 * math.pi * 2800 / rate)
bright = []
for x in mono:
    high = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2, x1, y2, y1 = x1, x, y1, high
    low += split * (high - low)
    bright.append(high + 1.15 * (high - low))
start, length = round(.3945 * rate), round(.040 * rate)
impact = bright[start:start + length]
for i in range(length):
    t = i / rate
    attack = min(1., t / .0003)
    decay = math.exp(-max(0., t - .0035) / .0055)
    fade_out = min(1., (length - 1 - i) / (.004 * rate))
    impact[i] *= attack * decay * max(0., fade_out)
peak = max(abs(x) for x in impact)
# Bring up the body of the brief impact while keeping every sample below full scale.
impact = [math.tanh(1.35 * x / peak) / math.tanh(1.35) * .96 for x in impact]
frames = round(.59 * rate)
out = [0.] * frames
onsets = [round(.008 * rate) + round(i * .25 * rate) for i in range(3)]
for onset in onsets:
    out[onset:onset + length] = impact
pcm = array.array('h', [round(x * 32767) for x in out])
if sys.byteorder != 'little':
    pcm.byteswap()
with wave.open(str(output_path), 'wb') as target:
    target.setparams((1, 2, rate, frames, 'NONE', 'not compressed'))
    target.writeframes(pcm.tobytes())
print(json.dumps({'sample_rate': rate, 'channels': 1, 'duration_seconds': frames/rate, 'tap_length_ms': 40, 'onset_interval_ms': 250, 'high_pass_hz': 850, 'treble_split_hz': 2800, 'treble_emphasis': 'parallel high-frequency emphasis, 1.15 gain added above the split', 'decay_after_ms': 3.5, 'decay_time_constant_ms': 5.5, 'source_segment_seconds': [.3945, .4345], 'impact_emphasis': 'mild tanh compression, drive 1.35; peak 0.96', 'peak_fraction': max(abs(x) for x in out), 'clipped_samples': sum(abs(x) >= 1 for x in out), 'pitch': 'unchanged; no resampling'}, indent=2))

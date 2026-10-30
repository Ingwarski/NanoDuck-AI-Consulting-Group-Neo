const patterns = Object.freeze({
  chime: Object.freeze([[659, 0, .32], [880, .13, .44]]),
  ripple: Object.freeze([[523, 0, .16], [659, .10, .18], [784, .21, .24]])
});
const choices = new Set(["knock", "chime", "ripple", "off"]);

const wavBytes = pattern => {
  const rate = 44_100;
  const seconds = pattern.length ? Math.max(...pattern.map(([, offset, duration]) => offset + duration)) + .08 : .05;
  const samples = Math.ceil(seconds * rate);
  const wav = new ArrayBuffer(44 + samples * 2); const view = new DataView(wav);
  const tag = (offset, text) => [...text].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  tag(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); tag(8, "WAVE"); tag(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); tag(36, "data"); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) {
    const time = index / rate; let value = 0;
    for (const [frequency, offset, duration] of pattern) {
      const progress = (time - offset) / duration; if (progress < 0 || progress > 1) continue;
      const envelope = Math.min(1, progress / .025) * Math.pow(1 - progress, 1.35) * .58;
      value += Math.sin(2 * Math.PI * frequency * (time - offset)) * envelope;
    }
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, value)) * 0x7fff), true);
  }
  return wav;
};

const playbackDeadline = 8_000;

/** One session-scoped media element. Call prime/preview directly in a gesture handler. */
export const createNotificationAudio = ({ onStatusChange = () => {} } = {}) => {
  const urls = new Map();
  let preference = "off"; let status = "off"; let disposed = false; let prepared = false; let priming;
  let media; let cancelPlayback; let generation = 0;
  const updateStatus = next => {
    const effective = disposed ? "disposed" : preference === "off" ? "off" : next;
    if (effective === status) return;
    status = effective; onStatusChange(status);
  };
  const stop = () => { generation += 1; priming = undefined; cancelPlayback?.(); };
  const releaseMedia = () => {
    prepared = false;
    if (media) { media.pause(); media.removeAttribute("src"); media.load(); }
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  };
  const sourceFor = name => {
    if (name === "knock") return "/sounds/table-taps-250ms-v5.wav";
    if (!urls.has(name)) urls.set(name, URL.createObjectURL(new Blob([wavBytes(patterns[name] ?? [])], { type: "audio/wav" })));
    return urls.get(name);
  };
  const selectSource = name => {
    const url = sourceFor(name);
    if (media.getAttribute("src") !== url) { media.src = url; media.load(); }
    else media.currentTime = 0;
  };
  const ensureMedia = () => {
    if (!media) { media = new Audio(); media.preload = "auto"; media.volume = .85; media.setAttribute("playsinline", ""); }
    return media;
  };
  const start = (name, { silent = false, gesture = false } = {}) => {
    stop();
    let settled = false; let settle; let timer; let activeMedia;
    const completion = new Promise(resolve => { settle = resolve; });
    const cleanup = () => {
      clearTimeout(timer);
      if (activeMedia) { activeMedia.removeEventListener("ended", mediaEnded); activeMedia.removeEventListener("error", mediaFailed); activeMedia.pause(); }
      if (cancelPlayback === cancelled) cancelPlayback = undefined;
    };
    const finish = result => {
      if (settled) return;
      settled = true; cleanup();
      // Abort an outstanding native play/load, so it cannot start after Off,
      // disposal, a deadline, or a superseding notification/preview.
      if (result !== "played" && activeMedia) activeMedia.load();
      if (result !== "cancelled" && !disposed) {
        prepared = result === "played";
        updateStatus(result === "played" ? "ready" : result === "needs-gesture" ? "idle" : result);
      }
      if (result === "played" && !disposed) {
        if (preference === "off") releaseMedia();
        else {
          try { selectSource(preference); }
          catch { prepared = false; updateStatus("unavailable"); }
        }
      }
      settle(result);
    };
    const cancelled = () => finish("cancelled");
    const mediaEnded = () => { if (activeMedia.ended) finish("played"); };
    const mediaFailed = () => finish("unavailable");
    const failed = error => finish(error?.name === "NotAllowedError" ? "blocked" : "unavailable");
    cancelPlayback = cancelled;
    timer = setTimeout(() => finish("unavailable"), playbackDeadline);
    try {
      if (!gesture && !prepared) { finish("needs-gesture"); return completion; }
      activeMedia = ensureMedia();
      selectSource(silent ? "silence" : name);
      activeMedia.addEventListener("ended", mediaEnded); activeMedia.addEventListener("error", mediaFailed);
      // Keep play in this exact gesture stack. WebKit grants media playback per
      // element, so future sounds retain this element even when its source changes.
      void Promise.resolve(activeMedia.play()).catch(failed);
    } catch (error) { failed(error); }
    return completion;
  };
  return {
    get preference() { return preference; },
    get status() { return status; },
    setPreference(name) {
      if (disposed) return;
      const next = choices.has(name) ? name : "off";
      if (preference === next && next !== "off") return;
      stop(); preference = next;
      if (next === "off") releaseMedia();
      else if (media && prepared) {
        try { selectSource(next); }
        catch { prepared = false; updateStatus("unavailable"); return; }
      }
      updateStatus(prepared ? "ready" : "idle");
    },
    prime() {
      if (disposed) return Promise.resolve("cancelled");
      if (preference === "off") return Promise.resolve("off");
      if (prepared) return Promise.resolve("ready");
      if (priming) return priming;
      const pending = start(preference, { silent: true, gesture: true }); priming = pending;
      void pending.then(() => { if (priming === pending) priming = undefined; });
      return pending;
    },
    play() {
      if (disposed) return Promise.resolve("cancelled");
      if (preference === "off") return Promise.resolve("off");
      if (priming) {
        const current = generation;
        return priming.then(result => generation !== current || disposed ? "cancelled" : result === "played" ? this.play() : result);
      }
      return start(preference);
    },
    preview(name = preference) {
      if (disposed) return Promise.resolve("cancelled");
      if (!choices.has(name) || name === "off") return Promise.resolve("off");
      return start(name, { gesture: true });
    },
    dispose() {
      if (disposed) return;
      disposed = true; stop(); releaseMedia(); media = undefined;
      updateStatus("disposed");
    }
  };
};

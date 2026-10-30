import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationAudio } from "../src/client/notification-audio.js";

// Ownership/cancellation tests; browser-notification-audio.mjs separately checks
// real media decoding, autoplay permission and natural native ended events.
const fixture = t => {
  const names = ["Audio", "AudioContext", "webkitAudioContext", "navigator"];
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const players = []; const statuses = []; const blobs = new Map(); const revoked = []; const session = { type: "auto" };
  class Media extends EventTarget {
    constructor() { super(); this.attributes = new Map(); this.calls = []; this.loads = 0; this.paused = true; this.ended = false; this.position = 0; players.push(this); }
    set src(value) { this.attributes.set("src", value); this.ended = false; }
    get src() { return this.getAttribute("src"); }
    set currentTime(value) { this.position = value; this.ended = false; }
    get currentTime() { return this.position; }
    setAttribute(name, value) { this.attributes.set(name, value); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    pause() { this.paused = true; }
    load() { this.loads += 1; this.paused = true; this.ended = false; this.position = 0; }
    play() {
      const call = { src: this.src, time: this.currentTime, load: this.loads }; this.calls.push(call); this.paused = false; this.ended = false;
      if (this.rejectNext) { const error = this.rejectNext; this.rejectNext = undefined; return Promise.reject(error); }
      if (!this.holdNext) return Promise.resolve();
      this.holdNext = false;
      return new Promise((resolve, reject) => { call.reject = reject; call.deliver = () => { if (call.load === this.loads && !this.paused) this.end(); resolve(); }; });
    }
    end() { this.paused = true; this.ended = true; this.dispatchEvent(new Event("ended")); }
  }
  for (const name of ["AudioContext", "webkitAudioContext"]) Object.defineProperty(globalThis, name, { configurable: true, value: class { constructor() { throw new Error("Must not create Web Audio output"); } } });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: Media });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { audioSession: session } });
  t.mock.method(URL, "createObjectURL", blob => { const url = `blob:notification-${blobs.size}`; blobs.set(url, blob); return url; });
  t.mock.method(URL, "revokeObjectURL", url => revoked.push(url));
  const controller = createNotificationAudio({ onStatusChange: value => statuses.push(value) });
  t.after(() => { controller.dispose(); for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } });
  const prime = async () => { const pending = controller.prime(); players[0].end(); assert.equal(await pending, "played"); return players[0]; };
  return { controller, players, statuses, blobs, revoked, session, prime };
};

test("Off and notifications before activation allocate no output", async t => {
  const { controller, players } = fixture(t);
  assert.equal(await controller.prime(), "off"); assert.equal(await controller.play(), "off");
  controller.setPreference("knock"); assert.equal(await controller.play(), "needs-gesture");
  assert.equal(controller.status, "idle"); assert.equal(players.length, 0);
});

test("gesture play is synchronous and primes only a finite all-zero WAV through natural completion", async t => {
  const { controller, players, blobs, session } = fixture(t);
  controller.setPreference("knock"); const pending = controller.prime(); const media = players[0];
  assert.equal(media.calls.length, 1, "play stays in the input handler before any asynchronous work");
  const bytes = Buffer.from(await blobs.get(media.calls[0].src).arrayBuffer());
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF"); assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
  assert.equal(bytes.readUInt32LE(40) / 2 / bytes.readUInt32LE(24), .05);
  assert.equal(bytes.subarray(44).every(value => value === 0), true); assert.equal(media.volume, .85); assert.equal(media.getAttribute("playsinline"), "");
  assert.equal(controller.status, "idle", "a resolved play promise is not completion");
  media.dispatchEvent(new Event("ended")); assert.equal(controller.status, "idle", "ignore a stale event while the new media has not ended");
  media.end(); assert.equal(await pending, "played"); assert.equal(controller.status, "ready");
  assert.equal(media.src, "/sounds/table-taps-250ms-v5.wav"); assert.equal(session.type, "auto");
});

test("incoming Knock replays the exact stable asset on the gesture-authorized element", async t => {
  const { controller, players, prime } = fixture(t); controller.setPreference("knock"); const media = await prime(); const loads = media.loads;
  for (let index = 0; index < 2; index += 1) {
    media.position = .65; const pending = controller.play();
    assert.equal(media.calls.at(-1).src, "/sounds/table-taps-250ms-v5.wav"); assert.equal(media.calls.at(-1).time, 0);
    assert.equal(media.loads, loads, "normal alerts do not reload their source"); media.end(); assert.equal(await pending, "played");
  }
  assert.equal(players.length, 1); assert.equal(media.calls.length, 3);
});

test("unsaved Preview reuses the element and restores the saved source for incoming alerts", async t => {
  const { controller, players, blobs, prime } = fixture(t); controller.setPreference("knock"); const media = await prime();
  for (const name of ["chime", "ripple"]) {
    const pending = controller.preview(name); const bytes = Buffer.from(await blobs.get(media.src).arrayBuffer());
    assert.equal(bytes.subarray(44).some(value => value !== 0), true); media.end(); assert.equal(await pending, "played");
    assert.equal(controller.preference, "knock"); assert.equal(media.src, "/sounds/table-taps-250ms-v5.wav"); assert.equal(controller.status, "ready");
  }
  const incoming = controller.play(); media.end(); assert.equal(await incoming, "played"); assert.equal(players.length, 1);
});

test("Preview while Off plays on request then releases its source and Blob resources", async t => {
  const { controller, players, revoked, session } = fixture(t); const preview = controller.preview("ripple"); const media = players[0]; const source = media.src;
  media.end(); assert.equal(await preview, "played"); assert.equal(controller.preference, "off"); assert.equal(controller.status, "off");
  assert.equal(media.src, null); assert.equal(media.paused, true); assert.deepEqual(revoked, [source]); assert.equal(session.type, "auto");
  assert.equal(await controller.play(), "off"); assert.equal(media.calls.length, 1);
});

test("explicitly setting Off also cancels a Preview started while the saved choice was already Off", async t => {
  const { controller, players, revoked } = fixture(t); const preview = controller.preview("chime"); const media = players[0]; const source = media.src;
  controller.setPreference("off"); assert.equal(await preview, "cancelled");
  assert.equal(media.src, null); assert.equal(media.paused, true); assert.deepEqual(revoked, [source]); assert.equal(controller.status, "off");
});

test("incoming alert waits for the primer and coalesces simultaneous waiters", async t => {
  const { controller, players } = fixture(t); controller.setPreference("knock");
  const primed = controller.prime(); const incoming = controller.play(); const duplicate = controller.play();
  assert.equal(players[0].calls.length, 1); players[0].end(); await primed; await Promise.resolve();
  assert.equal(players[0].calls.length, 2); players[0].end(); assert.equal(await incoming, "played"); assert.equal(await duplicate, "cancelled");
});

test("Off during priming cancels its queued alert without late playback", async t => {
  const { controller, players } = fixture(t); controller.setPreference("knock"); const primed = controller.prime(); const incoming = controller.play();
  const media = players[0]; controller.setPreference("off"); media.end();
  assert.equal(await primed, "cancelled"); assert.equal(await incoming, "cancelled"); assert.equal(media.calls.length, 1);
  assert.equal(media.src, null); assert.equal(controller.status, "off");
});

test("a preference change after primer completion invalidates an already-queued alert", async t => {
  const { controller, players } = fixture(t); controller.setPreference("knock"); const primed = controller.prime(); const incoming = controller.play();
  players[0].end(); controller.setPreference("ripple"); assert.equal(await primed, "played"); assert.equal(await incoming, "cancelled"); assert.equal(players[0].calls.length, 1);
});

test("autoplay rejection reports blocked and explicit Preview recovers on the same element", async t => {
  const { controller, players, prime } = fixture(t); controller.setPreference("knock"); const media = await prime();
  media.rejectNext = new DOMException("User activation required", "NotAllowedError");
  assert.equal(await controller.play(), "blocked"); assert.equal(controller.status, "blocked"); assert.equal(media.paused, true);
  const preview = controller.preview(); media.end(); assert.equal(await preview, "played"); assert.equal(controller.status, "ready"); assert.equal(players.length, 1);
});

test("Off aborts pending native playback before delayed media becomes available", async t => {
  const { controller, prime } = fixture(t); controller.setPreference("knock"); const media = await prime(); media.holdNext = true;
  const pending = controller.play(); const delayed = media.calls.at(-1); controller.setPreference("off"); delayed.deliver();
  assert.equal(await pending, "cancelled"); assert.equal(media.src, null); assert.equal(media.paused, true); assert.equal(media.ended, false);
});

test("a superseded play promise cannot overwrite a newer Preview or its status", async t => {
  const { controller, prime } = fixture(t); controller.setPreference("knock"); const media = await prime(); media.holdNext = true;
  const incoming = controller.play(); const oldCall = media.calls.at(-1); const preview = controller.preview("ripple");
  oldCall.reject(new DOMException("Old request rejected", "NotAllowedError")); await Promise.resolve();
  assert.equal(await incoming, "cancelled"); assert.equal(media.paused, false); assert.equal(controller.status, "ready");
  media.end(); assert.equal(await preview, "played"); assert.equal(controller.status, "ready");
});

test("no-end and media-error failures are bounded and explicit Preview recovers", async t => {
  const { controller, prime } = fixture(t); t.mock.timers.enable({ apis: ["setTimeout"] }); controller.setPreference("knock"); const media = await prime();
  const pending = controller.play(); t.mock.timers.tick(8_000);
  assert.equal(await pending, "unavailable"); assert.equal(controller.status, "unavailable"); assert.equal(media.paused, true);
  const failed = controller.preview(); media.dispatchEvent(new Event("error")); assert.equal(await failed, "unavailable");
  const recovered = controller.preview(); media.end(); assert.equal(await recovered, "played"); assert.equal(controller.status, "ready");
});

test("disposal cancels playback, revokes sources, and stays terminal", async t => {
  const { controller, players, blobs, revoked, prime } = fixture(t); controller.setPreference("chime"); const media = await prime(); media.holdNext = true;
  const pending = controller.play(); const delayed = media.calls.at(-1); controller.dispose(); delayed.deliver();
  assert.equal(await pending, "cancelled"); assert.equal(media.paused, true); assert.equal(media.src, null);
  assert.deepEqual(new Set(revoked), new Set(blobs.keys())); assert.equal(controller.status, "disposed");
  controller.setPreference("ripple"); assert.equal(await controller.prime(), "cancelled"); assert.equal(await controller.play(), "cancelled");
  assert.equal(await controller.preview(), "cancelled"); assert.equal(players.length, 1);
});

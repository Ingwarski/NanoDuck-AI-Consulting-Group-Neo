import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createMySqlStore } from "../src/server/store.mjs";

const flush = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve(); };
const fixture = async ({ idleTimeoutSeconds = 60, probe = async () => [[{ owned: 1 }]] } = {}) => {
  let now = 0;
  const pending = new Map();
  const clock = {
    setTimeout(fn, delay) { const timer = { unref() {} }; pending.set(timer, { fn, at: now + delay, delay }); return timer; },
    clearTimeout(timer) { pending.delete(timer); },
    async next() {
      const [timer, event] = [...pending].sort((a, b) => a[1].at - b[1].at)[0] ?? [];
      assert.ok(event, "Expected a pending heartbeat or deadline");
      pending.delete(timer); now = event.at; event.fn(); await flush();
    },
    delays() { return [...pending.values()].map(event => event.delay); }
  };
  const connection = new EventEmitter();
  const counts = { acquired: 0, probed: 0, released: 0, destroyed: 0, ended: 0, connected: 0 };
  connection.execute = async options => {
    const sql = typeof options === "string" ? options : options.sql;
    if (sql.includes("GET_LOCK")) { counts.acquired += 1; return [[{ acquired: 1, idleTimeoutSeconds }]]; }
    if (sql.includes("IS_USED_LOCK")) { counts.probed += 1; assert.ok(options.timeout > 0 && options.timeout <= 10_000); return probe(); }
    if (sql.includes("RELEASE_LOCK")) { counts.released += 1; return [[{ released: 1 }]]; }
    throw new Error("Unexpected database operation");
  };
  connection.destroy = () => { counts.destroyed += 1; };
  connection.release = () => {};
  const store = await createMySqlStore("mysql://example.invalid/synthetic", Buffer.alloc(32, 1), undefined, {
    leadershipTimers: clock,
    createPool: () => ({ getConnection: async () => { counts.connected += 1; return connection; }, end: async () => { counts.ended += 1; } })
  });
  const lost = []; const acquired = [];
  store.onLeadershipLost((code, errno) => lost.push({ code, errno }));
  store.onLeadershipAcquired(details => acquired.push(details));
  return { store, connection, counts, clock, lost, acquired };
};

test("database heartbeat keeps using the reserved connection and releases it on close", async () => {
  const f = await fixture();
  assert.equal(await f.store.acquireLeadership(), true);
  assert.deepEqual(f.acquired, [{ idleTimeoutSeconds: 60, heartbeatIntervalMs: 15_000 }]);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(f.clock.delays(), [15_000]);
    await f.clock.next();
  }
  assert.equal(f.counts.probed, 3); assert.equal(f.counts.connected, 1); assert.equal(f.counts.acquired, 1);
  assert.deepEqual(f.lost, []);
  await f.store.close();
  assert.deepEqual(f.clock.delays(), []); assert.equal(f.counts.released, 1); assert.equal(f.counts.destroyed, 0);
});

test("heartbeat honors short session timeouts and fails closed if lock ownership changes", async () => {
  const f = await fixture({ idleTimeoutSeconds: 2, probe: async () => [[{ owned: 0 }]] });
  assert.equal(await f.store.acquireLeadership(), true);
  assert.deepEqual(f.clock.delays(), [666]);
  await f.clock.next();
  assert.deepEqual(f.lost, [{ code: "LEADERSHIP_OWNERSHIP_LOST", errno: undefined }]);
  assert.equal(f.counts.destroyed, 1); assert.deepEqual(f.clock.delays(), []);
  assert.equal(await f.store.acquireLeadership(), false);
  assert.equal(f.counts.acquired, 1);
  await f.store.close();
});

test("a stalled heartbeat cannot overlap or reacquire and a late result cannot revive it", async () => {
  let resolveProbe;
  const f = await fixture({ probe: () => new Promise(resolve => { resolveProbe = resolve; }) });
  await f.store.acquireLeadership(); await f.clock.next();
  assert.deepEqual(f.clock.delays(), [10_000]); assert.equal(f.counts.probed, 1);
  await f.clock.next();
  assert.deepEqual(f.lost, [{ code: "LEADERSHIP_HEARTBEAT_TIMEOUT", errno: undefined }]);
  assert.equal(f.counts.destroyed, 1); assert.deepEqual(f.clock.delays(), []);
  resolveProbe([[{ owned: 1 }]]); await flush();
  f.connection.emit("error", { code: "ECONNRESET" });
  assert.equal(f.lost.length, 1); assert.deepEqual(f.clock.delays(), []);
  assert.equal(await f.store.acquireLeadership(), false); assert.equal(f.counts.acquired, 1);
  await f.store.close();
});

test("closing during a heartbeat destroys the pending connection without late notifications", async () => {
  let rejectProbe;
  const f = await fixture({ probe: () => new Promise((resolve, reject) => { rejectProbe = reject; }) });
  await f.store.acquireLeadership(); await f.clock.next();
  await f.store.close();
  assert.equal(f.counts.destroyed, 1); assert.equal(f.counts.released, 0); assert.deepEqual(f.clock.delays(), []);
  rejectProbe({ code: 4031 }); await flush();
  assert.deepEqual(f.lost, []); assert.deepEqual(f.clock.delays(), []);
});

test("numeric MySQL idle errors from a heartbeat become safe diagnostics exactly once", async () => {
  const f = await fixture({ probe: async () => { throw { code: 4031, message: "Private connection details" }; } });
  await f.store.acquireLeadership(); await f.clock.next();
  f.connection.emit("error", { code: 4031 });
  assert.deepEqual(f.lost, [{ code: "ER_CLIENT_INTERACTION_TIMEOUT", errno: 4031 }]);
  assert.equal(f.counts.destroyed, 1); assert.deepEqual(f.clock.delays(), []);
  await f.store.close();
});

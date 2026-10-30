import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createMySqlStore } from "../src/server/store.mjs";

test("database leadership loss reports only an allowlisted code and notifies once", async () => {
  for (const [code, expected] of [
    ["PROTOCOL_CONNECTION_LOST", "PROTOCOL_CONNECTION_LOST"],
    ["ER_CLIENT_INTERACTION_TIMEOUT", "ER_CLIENT_INTERACTION_TIMEOUT"],
    [4031, "ER_CLIENT_INTERACTION_TIMEOUT"],
    ["mysql://private-user:private-password@private-host/database", "UNKNOWN_DATABASE_ERROR"],
    [undefined, "UNKNOWN_DATABASE_ERROR"]
  ]) {
    const connection = new EventEmitter();
    let destroyed = 0; let ended = 0;
    connection.execute = async () => [[{ acquired: 1, idleTimeoutSeconds: 60 }]];
    connection.destroy = () => { destroyed += 1; };
    const store = await createMySqlStore("mysql://example.invalid/synthetic", Buffer.alloc(32, 1), undefined, {
      createPool: () => ({ getConnection: async () => connection, end: async () => { ended += 1; } })
    });
    const reported = [];
    store.onLeadershipLost(value => reported.push(value));
    assert.equal(await store.acquireLeadership(), true);
    const error = Object.assign(new Error("Private connection details must never reach diagnostics."), { code });
    connection.emit("error", error);
    connection.emit("error", error);
    assert.deepEqual(reported, [expected]);
    assert.equal(destroyed, 1);
    await store.close();
    assert.equal(ended, 1);
  }
});

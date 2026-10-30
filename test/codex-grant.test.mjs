import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStore, createMySqlStore } from "../src/server/store.mjs";

const grant = (refresh, access = "synthetic-access", extra = {}) => Buffer.from(JSON.stringify({ ...extra, auth_mode: "chatgpt", tokens: { access_token: access, refresh_token: refresh } }));

test("the encrypted Codex grant retains rotations, ignores an unchanged seed identity and rejects stale writes", async () => {
  let row; let held = false; let poolGrantQueries = 0;
  const execute = async (input, values = []) => {
    const sql = typeof input === "string" ? input : input.sql;
    if (sql.includes("GET_LOCK")) { held = true; return [[{ acquired: 1, idleTimeoutSeconds: 60 }]]; }
    if (sql.includes("IS_USED_LOCK")) return [[{ owned: held ? 1 : 0 }]];
    if (sql.includes("RELEASE_LOCK")) { held = false; return [[{ released: 1 }]]; }
    if (sql.startsWith("SELECT generation,seed_fingerprint")) return [[row ? { generation: row.generation, seed_fingerprint: row.seedFingerprint } : undefined].filter(Boolean)];
    if (sql.startsWith("SELECT ciphertext,iv,tag,generation")) return [[row ? { ciphertext: row.ciphertext, iv: row.iv, tag: row.tag, generation: row.generation } : undefined].filter(Boolean)];
    if (sql.startsWith("INSERT INTO nanoduck_provider_grants")) { row = { ciphertext: values[0], iv: values[1], tag: values[2], seedFingerprint: values[3], generation: 1 }; return [{ affectedRows: 1 }]; }
    if (sql.includes("seed_fingerprint=?,generation=generation+1")) { Object.assign(row, { ciphertext: values[0], iv: values[1], tag: values[2], seedFingerprint: values[3], generation: row.generation + 1 }); return [{ affectedRows: 1 }]; }
    if (sql.includes("WHERE provider_id='codex' AND generation=?")) {
      if (row?.generation !== values[4]) return [{ affectedRows: 0 }];
      Object.assign(row, { ciphertext: values[0], iv: values[1], tag: values[2], generation: row.generation + 1 });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`unexpected_grant_query:${sql}`);
  };
  const connection = { execute, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, destroy() {} };
  const poolExecute = async (input, values) => {
    const sql = typeof input === "string" ? input : input.sql;
    if (sql.includes("nanoduck_provider_grants")) poolGrantQueries += 1;
    return execute(input, values);
  };
  const store = await createMySqlStore("mysql://unused", Buffer.alloc(32, 7), undefined, { createPool: () => ({ execute: poolExecute, getConnection: async () => connection, async end() {} }) });
  const initial = grant("synthetic-initial");
  try {
    await assert.rejects(store.seedCodexGrant(initial), /codex_grant_leadership_required/u);
    assert.equal(await store.acquireLeadership(), true); assert.equal(held, true);
    await store.seedCodexGrant(initial);
    assert.equal(row.ciphertext.includes(initial), false);
    assert.equal((await store.codexGrant()).generation, 1);
    await store.saveCodexGrant(grant("synthetic-rotated"), 1);
    await store.seedCodexGrant(grant("synthetic-initial", "different-access", { metadata: "changed-format" }));
    const retained = await store.codexGrant();
    assert.equal(retained.generation, 2);
    assert.equal(JSON.parse(retained.bytes.toString()).tokens.refresh_token, "synthetic-rotated");
    retained.bytes.fill(0);
    await assert.rejects(store.saveCodexGrant(grant("stale-writer"), 1), /codex_grant_conflict/u);
    await store.seedCodexGrant(grant("new-owner-login"));
    const reseeded = await store.codexGrant();
    assert.equal(reseeded.generation, 3);
    assert.equal(JSON.parse(reseeded.bytes.toString()).tokens.refresh_token, "new-owner-login");
    reseeded.bytes.fill(0);
    assert.equal(poolGrantQueries, 0, "grant operations stay on the advisory-lock-owning connection");
    held = false;
    await assert.rejects(store.codexGrant(), /codex_grant_leadership_required/u);
  } finally { initial.fill(0); await store.close(); }
  assert.equal(held, false);
  await assert.rejects(store.codexGrant(), /codex_grant_leadership_required/u);
});

test("unsupported managed-auth payloads cannot enter the grant store", async () => {
  const store = createMemoryStore();
  await assert.rejects(store.seedCodexGrant(Buffer.from("{}")), /codex_grant_invalid/u);
  await assert.rejects(store.seedCodexGrant(Buffer.from(JSON.stringify({ auth_mode: "apikey", tokens: { access_token: "x", refresh_token: "y" } }))), /codex_grant_invalid/u);
  await assert.rejects(store.seedCodexGrant(Buffer.alloc(64 * 1024 + 1, 1)), /codex_grant_invalid/u);
});

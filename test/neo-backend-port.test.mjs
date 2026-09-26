import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createMemoryStore, createMySqlStore } from "../src/server/store.mjs";
import { decryptText, encryptText, randomId } from "../src/server/crypto.mjs";
import { openRunSnapshot, sealRunSnapshot } from "../src/server/run-snapshot.mjs";
import { normalizeUsageAttempt } from "../src/server/usage.mjs";

const key = Buffer.alloc(32, 19);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const oldDocument = name => readFile(new URL(`./fixtures/retired-${name}`, import.meta.url), "utf8");

const usageAttempt = (patch = {}) => normalizeUsageAttempt({
  id: randomId(), provider: "codex", model: "gpt-6-sol", status: "completed",
  startedAt: "2026-09-27T10:00:00.000Z", finishedAt: "2026-09-27T10:00:03.000Z",
  attribution: { requestId: randomId(), participantId: randomId(), participant: "Demand Analyst", purpose: "initial" },
  diagnostics: { stage: "specialist_position", effort: "high", promptBytes: 1200, prefixBytes: 800 },
  usage: [{ model: "gpt-6-sol", tokens: { input: 100, output: 40, total: 140, cachedInput: 60, cacheWriteInput: 0, reasoningOutput: 20 } }],
  ...patch
});

test("packaged instruction migration updates only an exact retired default and preserves an owner edit", async () => {
  const store = createMemoryStore();
  await store.initializeDocuments();
  const current = Object.fromEntries((await store.instructionDocuments()).map(item => [item.name, item]));
  const oldAgents = await oldDocument("AGENTS.md");
  const oldConsilium = await oldDocument("CONSILIUM.md");
  assert.equal(sha256(oldAgents), "34ca8b01845a9c6a292cc93aa3ba2ce2656814c52d4391a10878e823106d6d62");
  assert.equal(sha256(oldConsilium), "2a889fff9fc209348c4057dbebb89a6550f5f3dcd2a3d697eda607d4f9cc0c62");
  const retiredAgents = await store.saveInstructionDocument("AGENTS.md", current["AGENTS.md"].revision, oldAgents, "synthetic_retired_default");
  const retiredConsilium = await store.saveInstructionDocument("CONSILIUM.md", current["CONSILIUM.md"].revision, oldConsilium, "synthetic_retired_default");
  const ownerEdit = await store.saveInstructionDocument("CONSILIUM.md", retiredConsilium.revision, `${oldConsilium}\nOwner-specific instruction.\n`, "save");
  assert.deepEqual(await store.migrateDefaultDocuments(), ["AGENTS.md"]);
  const migrated = Object.fromEntries((await store.instructionDocuments()).map(item => [item.name, item]));
  assert.equal(migrated["AGENTS.md"].revision, retiredAgents.revision + 1);
  assert.equal(migrated["AGENTS.md"].action, "parallel_protocol_migration");
  assert.notEqual(migrated["AGENTS.md"].sha256, retiredAgents.sha256);
  assert.equal(migrated["CONSILIUM.md"].revision, ownerEdit.revision);
  assert.equal(migrated["CONSILIUM.md"].markdown, ownerEdit.markdown);
  assert.deepEqual(await store.migrateDefaultDocuments(), []);
});

test("MySQL usage writes keep model, attribution and tokens inside an authenticated encrypted payload", async () => {
  const commands = [];
  const connection = {
    async beginTransaction() { commands.push({ statement: "BEGIN", values: [] }); },
    async commit() { commands.push({ statement: "COMMIT", values: [] }); },
    async rollback() { commands.push({ statement: "ROLLBACK", values: [] }); },
    release() {},
    async execute(statement, values = []) {
      commands.push({ statement, values });
      if (statement.startsWith("SELECT id FROM nanoduck_conversations")) return [[{ id: "conversation-fixture-0001" }]];
      if (statement.startsWith("SELECT id,provider,model,status")) return [[]];
      if (statement.startsWith("INSERT INTO nanoduck_usage")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => ({ getConnection: async () => connection, end: async () => {} }) });
  const attempt = usageAttempt();
  assert.equal(await store.recordUsage("conversation-fixture-0001", attempt), true);
  const insertion = commands.find(item => item.statement.startsWith("INSERT INTO nanoduck_usage"));
  assert.ok(insertion);
  const ciphertext = insertion.values[7];
  assert.equal(ciphertext.includes(attempt.model), false);
  assert.equal(ciphertext.includes(attempt.attribution.participant), false);
  assert.deepEqual(JSON.parse(decryptText({ ciphertext, iv: insertion.values[8], tag: insertion.values[9] }, key)), attempt);
  assert.deepEqual(commands.map(item => item.statement), ["BEGIN", commands[1].statement, commands[2].statement, insertion.statement, "COMMIT"]);
});

test("MySQL parallel work commits messages and the encrypted revision in one transaction", async () => {
  const ownerId = randomId(); const runId = randomId(); const assignmentId = randomId(); const taskId = randomId();
  const snapshot = { contractVersion: "parallel-v1", requestMessageId: ownerId };
  const ownerBody = "Synthetic owner request"; const ownerSealed = encryptText(ownerBody, key);
  const work = {
    version: 1, revision: 0, ownerMessageIds: [ownerId],
    assignments: [{ id: assignmentId, role: "Demand Analyst", guidance: "Measure demand.", task: "Assess demand for the pilot.", dependsOn: [], taskMessageId: taskId }],
    results: {}, orders: [], rounds: []
  };
  const addition = { id: taskId, role: "Head Consultant", recipient: "Demand Analyst", body: work.assignments[0].task, sources: [] };
  const commands = [];
  const connection = {
    async beginTransaction() { commands.push({ statement: "BEGIN", values: [] }); },
    async commit() { commands.push({ statement: "COMMIT", values: [] }); },
    async rollback() { commands.push({ statement: "ROLLBACK", values: [] }); },
    release() {},
    async execute(statement, values = []) {
      commands.push({ statement, values });
      if (statement.startsWith("SELECT owner_id")) return [[{ owner_id: "owner" }]];
      if (statement.startsWith("SELECT id FROM nanoduck_conversations")) return [[{ id: "conversation-fixture-0001" }]];
      if (statement.startsWith("SELECT id,snapshot_json FROM nanoduck_runs")) return [[{ id: runId, snapshot_json: sealRunSnapshot(snapshot, key) }]];
      if (statement.startsWith("SELECT id,role,recipient")) return [[{ id: ownerId, role: "owner", recipient: null, ...ownerSealed, sequence: 1, created_at: "2026-09-27T10:00:00.000Z", sources_json: [] }]];
      if (statement.startsWith("INSERT INTO nanoduck_messages") || statement.startsWith("UPDATE nanoduck_runs SET snapshot_json") || statement.startsWith("UPDATE nanoduck_conversations SET updated_at")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => ({ getConnection: async () => connection, end: async () => {} }) });
  const result = await store.commitParallelWork("conversation-fixture-0001", 1, -1, work, [addition]);
  assert.equal(result.revision, 0); assert.equal(result.messages[0].body, addition.body);
  const messageInsert = commands.findIndex(item => item.statement.startsWith("INSERT INTO nanoduck_messages"));
  const runUpdate = commands.findIndex(item => item.statement.startsWith("UPDATE nanoduck_runs SET snapshot_json"));
  const commit = commands.findIndex(item => item.statement === "COMMIT");
  assert.ok(messageInsert > 0 && runUpdate > messageInsert && commit > runUpdate);
  const sealed = commands[runUpdate].values[0];
  assert.equal(sealed.includes(addition.body), false);
  assert.deepEqual(openRunSnapshot(sealed, key).parallelWork, work);
});

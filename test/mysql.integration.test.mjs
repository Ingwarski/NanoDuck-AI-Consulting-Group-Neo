import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { createCodexProvider } from "../src/server/codex-provider.mjs";
import { runParallelConsultation } from "../src/server/consultation-parallel.mjs";
import { createMySqlStore, defaultSettings } from "../src/server/store.mjs";
import { randomId } from "../src/server/crypto.mjs";
import { databaseLockName } from "../src/server/database-lock.mjs";
import { initializeInstructions } from "../src/server/instruction-bootstrap.mjs";
import { sealRecoverySnapshot, openRecoveryEnvelope } from "../src/server/recovery.mjs";
import { sealRunSnapshot } from "../src/server/run-snapshot.mjs";
import { testRuntimeInstructions } from "./fixtures/runtime-instructions.mjs";

const testUrl = process.env.NANODUCK_MYSQL_TEST_URL;
const installSchema = async (admin, name) => {
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.query(`USE ${name}`);
  const schema = await readFile(new URL("../src/server/schema.sql", import.meta.url), "utf8");
  for (const statement of schema.split(/;\s*$/mu).map(value => value.trim()).filter(Boolean)) await admin.query(statement);
};
test("real MySQL: idle leadership survives the session timeout and remains exclusive until close", { skip: !testUrl, timeout: 20_000 }, async () => {
  const target = new URL(testUrl);
  assert.equal(target.hostname, "127.0.0.1", "Only a disposable loopback test service is allowed");
  assert.ok(target.pathname === "" || target.pathname === "/", "Tests create their own databases; never pass an application DB");
  const admin = await mysql.createConnection(testUrl);
  const name = `nanoduck_idle_test_${randomBytes(8).toString("hex")}`;
  const url = new URL(testUrl); url.pathname = `/${name}`;
  const stores = new Set();
  const connections = [];
  const driver = {
    createPool(options) {
      const pool = mysql.createPool({ ...options, ssl: undefined }); // Local disposable service only.
      const getConnection = pool.getConnection.bind(pool);
      pool.getConnection = async () => {
        const connection = await getConnection();
        try {
          await connection.query("SET SESSION wait_timeout = 2");
          connections.push(connection);
          return connection;
        } catch (error) { connection.destroy(); throw error; }
      };
      return pool;
    }
  };
  try {
    await admin.query(`CREATE DATABASE ${name}`);
    const leader = await createMySqlStore(url.toString(), Buffer.alloc(32, 8), undefined, driver); stores.add(leader);
    const lost = [];
    leader.onLeadershipLost(code => lost.push(code));
    assert.equal(await leader.acquireLeadership(), true);
    const leadershipConnection = connections[0];
    const [before] = await leadershipConnection.query("SELECT CONNECTION_ID() AS connectionId, @@SESSION.wait_timeout AS idleTimeoutSeconds");
    assert.equal(Number(before[0].idleTimeoutSeconds), 2);

    // No application query touches the leader connection during this period.
    // Without its heartbeat MySQL closes this session and releases its lock.
    await delay(3_200);
    assert.deepEqual(lost, [], "An otherwise idle owner must retain its database lease");
    const [ownership] = await admin.execute("SELECT IS_USED_LOCK(?) AS ownerId", [databaseLockName(url.toString())]);
    assert.equal(Number(ownership[0].ownerId), Number(before[0].connectionId), "The same session must still own the lease; no reacquisition is allowed");
    const [after] = await leadershipConnection.query("SELECT CONNECTION_ID() AS connectionId, @@SESSION.wait_timeout AS idleTimeoutSeconds");
    assert.deepEqual(after, before, "The heartbeat must preserve the original session and its two-second timeout");

    const duplicate = await createMySqlStore(url.toString(), Buffer.alloc(32, 8), undefined, driver); stores.add(duplicate);
    assert.equal(await duplicate.acquireLeadership(), false, "A second instance must remain fenced after the idle period");
    await leader.close(); stores.delete(leader);
    assert.equal(await duplicate.acquireLeadership(), true, "Normal shutdown must release the lease for the next instance");
    assert.deepEqual(lost, [], "Normal shutdown must not report leadership failure");
  } finally {
    await Promise.allSettled([...stores].map(store => store.close()));
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
});

test("real MySQL: isolation, long sources, encrypted usage, restart, deletion and full recovery", { skip: !testUrl, timeout: 90_000 }, async () => {
  const target = new URL(testUrl);
  assert.equal(target.hostname, "127.0.0.1", "Only a disposable loopback test service is allowed");
  assert.ok(target.pathname === "" || target.pathname === "/", "Tests create their own databases; never pass an application DB");
  const admin = await mysql.createConnection(testUrl);
  const names = [0,1].map(i => `nanoduck_test_${randomBytes(8).toString("hex")}_${i}`);
  const stores = new Set();
  const urls = [];
  const key = Buffer.alloc(32, 8);
  const driver = { createPool: options => mysql.createPool({ ...options, ssl: undefined }) }; // Local disposable service only.
  try {
    for (const name of names) {
      await installSchema(admin, name);
      const url = new URL(testUrl); url.pathname = `/${name}`;
      urls.push(url.toString()); stores.add(await createMySqlStore(url.toString(), key, undefined, driver));
    }
    let [source, restored] = [...stores];
    assert.equal(await source.acquireLeadership(), true);
    assert.equal(await restored.acquireLeadership(), true, "Independent databases must not block each other");
    const duplicateUrl = new URL(testUrl); duplicateUrl.pathname = `/${names[0]}`;
    const duplicate = await createMySqlStore(duplicateUrl.toString(), key, undefined, driver); stores.add(duplicate);
    assert.equal(await duplicate.acquireLeadership(), false, "One database has exactly one running app");
    await initializeInstructions(source);
    const document = (await source.instructionDocuments()).find(d => d.name === "WORKING_CONTEXT.md");
    const contenders = await Promise.all([source.saveInstructionDocument(document.name, 1, "# Private synthetic plan\nLaunch a fictional bakery."), duplicate.saveInstructionDocument(document.name, 1, "# A conflicting plan\nAnother edit.")]);
    assert.equal(contenders.filter(Boolean).length, 1);
    const selected = contenders.find(Boolean);
    await source.saveSettings({ ...defaultSettings, specialistCount: "3" });
    const conversation = await source.createConversation();
    const message = { body: "Should the fictional bakery test preorders?", clientRequestId: "mysql-duplicate-request-0001" };
    const snapshot = { ...defaultSettings, instructionDocuments: await source.instructionDocuments(), runtimeInstructions: await source.runtimeInstructions() };
    const [first, repeated] = await Promise.all([source.acceptMessage(conversation.id, message, snapshot), duplicate.acceptMessage(conversation.id, message, snapshot)]);
    assert.equal(first.message.id, repeated.message.id);
    assert.equal([first,repeated].filter(item => item.replayed).length, 1);
    assert.equal(await source.acceptMessage(conversation.id, { ...message, body: "Changed retry" }, snapshot), undefined);
    await admin.query(`USE ${names[0]}`);
    const [runs] = await admin.query("SELECT snapshot_json FROM nanoduck_runs");
    assert.equal(JSON.stringify(runs).includes("Private synthetic"), false);
    assert.equal(JSON.stringify(runs).includes("WORKING_CONTEXT.md"), false);
    const [docs] = await admin.query("SELECT ciphertext FROM nanoduck_instruction_documents");
    assert.equal(JSON.stringify(docs).includes(selected.markdown), false);
    assert.deepEqual((await source.run(conversation.id)).snapshot, { ...snapshot, requestMessageId: first.message.id });
    const codex = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] });
    const providerResponse = await codex.invoke({ assignment: "Exercise MySQL source persistence", model: "gpt-6-sol", effort: "high", evidence: { owner: message.body, discussion: "" }, research: false, outputKind: "specialist_position", runtimeInstructions: testRuntimeInstructions, contextScope: first.run.id });
    assert.equal(providerResponse.ok, true);
    assert.ok(providerResponse.sources[0].title.length > 280 && providerResponse.sources[0].claim.length > 1_000);
    const agentMessage = await source.appendAgentMessage(conversation.id, first.run.generation, { role: "Head Consultant", body: providerResponse.body, sources: providerResponse.sources });
    assert.deepEqual(agentMessage.sources, providerResponse.sources);
    const completedUsageId = randomId(); const interruptedUsageId = randomId();
    const usageBase = { provider: "codex", model: "gpt-6-sol", startedAt: "2026-09-27T10:00:00.000Z", attribution: { requestId: first.message.id, participantId: randomId(), participant: "Synthetic Demand Analyst", purpose: "initial" }, diagnostics: { stage: "specialist_position", effort: "high", effortSource: "request", promptBytes: 1_200, prefixBytes: 800, webSearchCount: 0 } };
    await source.recordUsage(conversation.id, { ...usageBase, id: completedUsageId, status: "running", finishedAt: null, usage: [] });
    await source.recordUsage(conversation.id, { ...usageBase, id: completedUsageId, status: "completed", finishedAt: "2026-09-27T10:00:03.000Z", usage: [{ model: "gpt-6-sol", tokens: { input: 100, output: 30, total: 130, cachedInput: 40, cacheWriteInput: 0, reasoningOutput: 10 } }] });
    await source.recordUsage(conversation.id, { ...usageBase, id: interruptedUsageId, status: "running", finishedAt: null, usage: [] });
    const [rawUsage] = await admin.query("SELECT ciphertext FROM nanoduck_usage ORDER BY id");
    assert.equal(JSON.stringify(rawUsage).includes("Synthetic Demand Analyst"), false);
    await source.finishRun(conversation.id, first.run.generation, "complete", "Fictional bakery launch");
    await source.close(); stores.delete(source);
    source = await createMySqlStore(urls[0], key, undefined, driver); stores.add(source);
    assert.equal(await source.acquireLeadership(), true, "The reopened store must reacquire its database lease");
    await source.interruptUsage();
    const restartedUsage = await source.usageSummary(conversation.id);
    assert.equal(restartedUsage.total, 130);
    assert.equal(restartedUsage.attempts, 2);
    assert.equal(restartedUsage.incomplete, 1);
    const reopenedEvents = await source.events(conversation.id);
    assert.deepEqual(reopenedEvents.find(item => item.id === agentMessage.id).sources, providerResponse.sources);
    const envelope = sealRecoverySnapshot(await source.recoverySnapshot(), Buffer.alloc(32,9));
    await restored.restoreRecovery(openRecoveryEnvelope(envelope, Buffer.alloc(32,9)), { restoreConfiguration: true });
    assert.deepEqual(await restored.instructionDocuments(), await source.instructionDocuments());
    assert.deepEqual(await restored.settings(), await source.settings());
    assert.deepEqual(await restored.runtimeInstructions(), await source.runtimeInstructions());
    assert.equal((await restored.events(conversation.id))[0].body, message.body);
    const restoredUsage = await restored.usageSummary(conversation.id);
    assert.equal(restoredUsage.total, 130);
    assert.equal(restoredUsage.incomplete, 1);
    assert.deepEqual((await restored.events(conversation.id)).find(item => item.id === agentMessage.id).sources, providerResponse.sources);
    assert.equal(await source.deleteConversation(conversation.id), true);
    const [remainingUsage] = await admin.query("SELECT COUNT(*) AS count FROM nanoduck_usage");
    assert.equal(Number(remainingUsage[0].count), 0);
    const [deletedRuns] = await admin.query("SELECT status,snapshot_json FROM nanoduck_runs");
    assert.equal(deletedRuns[0].status, "deleted");
    assert.deepEqual(deletedRuns[0].snapshot_json, {});
    const [deleted] = await admin.query("SELECT title FROM nanoduck_conversations");
    assert.equal(deleted[0].title, "Deleted consultation");
    const tombstones = await source.recoverySnapshot();
    await restored.restoreRecovery(tombstones);
    await restored.restoreRecovery(openRecoveryEnvelope(envelope, Buffer.alloc(32,9)));
    assert.equal(await restored.getConversation(conversation.id), undefined);
    assert.equal(await restored.usageSummary(conversation.id), undefined);
  } finally {
    await Promise.allSettled([...stores].map(store => store.close()));
    for (const name of names) await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
});

test("real MySQL: run bindings reject rebinding, cross-chat ids and parallel ledger mismatch", { skip: !testUrl, timeout: 60_000 }, async () => {
  const target = new URL(testUrl);
  assert.equal(target.hostname, "127.0.0.1", "Only a disposable loopback test service is allowed");
  assert.ok(target.pathname === "" || target.pathname === "/", "Tests create their own databases; never pass an application DB");
  const admin = await mysql.createConnection(testUrl);
  const name = `nanoduck_binding_test_${randomBytes(8).toString("hex")}`;
  const url = new URL(testUrl); url.pathname = `/${name}`;
  const key = Buffer.alloc(32, 18);
  const driver = { createPool: options => mysql.createPool({ ...options, ssl: undefined }) }; // Local disposable service only.
  let store;
  try {
    await installSchema(admin, name);
    store = await createMySqlStore(url.toString(), key, undefined, driver);
    assert.equal(await store.acquireLeadership(), true);
    const firstChat = await store.createConversation();
    const firstInput = { body: "First synthetic request.", clientRequestId: "mysql-binding-request-0001" };
    const firstRequest = await store.acceptMessage(firstChat.id, firstInput, defaultSettings);
    await store.finishRun(firstChat.id, firstRequest.run.generation, "complete");
    const currentRequest = await store.acceptMessage(firstChat.id, { body: "Current synthetic request.", clientRequestId: "mysql-binding-request-0002" }, defaultSettings);
    const firstReplay = await store.acceptMessage(firstChat.id, firstInput, defaultSettings);
    assert.equal(firstReplay.replayed, true);
    assert.equal(firstReplay.message.id, firstRequest.message.id);
    assert.equal(firstReplay.run.id, firstRequest.run.id);
    assert.equal(firstReplay.run.status, "complete");
    assert.equal((await store.run(firstChat.id)).id, currentRequest.run.id);
    assert.equal(await store.updateRunSnapshot(firstChat.id, currentRequest.run.generation, { ...currentRequest.run.snapshot, requestMessageId: firstRequest.message.id }), undefined, "The public update path cannot rebind an accepted run");
    const stopped = await store.stop(firstChat.id);
    const validSnapshot = structuredClone(stopped.snapshot);

    const secondChat = await store.createConversation();
    const otherRequest = await store.acceptMessage(secondChat.id, { body: "Other chat request.", clientRequestId: "mysql-binding-request-0003" }, defaultSettings);
    await store.finishRun(secondChat.id, otherRequest.run.generation, "complete");
    await admin.query(`USE ${name}`);
    const replaceSnapshot = snapshot => admin.execute("UPDATE nanoduck_runs SET snapshot_json=? WHERE id=?", [JSON.stringify(sealRunSnapshot(snapshot, key)), stopped.id]);
    const assertFenced = async snapshot => {
      await replaceSnapshot(snapshot);
      assert.equal(await store.run(firstChat.id), undefined);
      assert.equal(await store.continueRun(firstChat.id), undefined);
      const [rows] = await admin.execute("SELECT status,generation FROM nanoduck_runs WHERE id=?", [stopped.id]);
      assert.equal(rows[0].status, "stopped");
      assert.equal(Number(rows[0].generation), stopped.generation);
    };

    await assertFenced({ ...validSnapshot, requestMessageId: firstRequest.message.id });
    await assertFenced({ ...validSnapshot, requestMessageId: otherRequest.message.id });
    await assertFenced({ ...validSnapshot, parallelWork: { ownerMessageIds: [firstRequest.message.id] } });
    await replaceSnapshot(validSnapshot);
    assert.equal((await store.run(firstChat.id)).snapshot.requestMessageId, currentRequest.message.id);
    assert.equal((await store.continueRun(firstChat.id)).status, "active");
  } finally {
    await store?.close();
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
});

test("real MySQL: a restart resumes after saved follow-up research and correction without replay", { skip: !testUrl, timeout: 60_000 }, async () => {
  const target = new URL(testUrl);
  assert.equal(target.hostname, "127.0.0.1", "Only a disposable loopback test service is allowed");
  assert.ok(target.pathname === "" || target.pathname === "/", "Tests create their own databases; never pass an application DB");
  const admin = await mysql.createConnection(testUrl);
  const name = `nanoduck_checkpoint_test_${randomBytes(8).toString("hex")}`;
  const url = new URL(testUrl); url.pathname = `/${name}`;
  const key = Buffer.alloc(32, 28);
  const driver = { createPool: options => mysql.createPool({ ...options, ssl: undefined }) }; // Local disposable service only.
  const stores = new Set(); let store;
  const calls = []; let assessmentFailures = 1;
  const provider = { async invoke(input) {
    calls.push(input.outputKind);
    if (input.outputKind === "head_plan") return { ok: true, body: JSON.stringify({ assignments: [{ role: "Demand Analyst", guidance: "Check public demand evidence.", task: "Assess demand for the pilot.", dependsOn: [] }], researchQuery: null }), sources: [] };
    if (input.outputKind === "specialist_position") return { ok: true, body: "The initial estimate needs direct public evidence.", sources: [] };
    if (input.outputKind === "team_review") return { ok: true, body: JSON.stringify({ summary: "Demand evidence is missing.", researchRequest: "Verify public demand.", findings: [{ assignment: 1, issue: "The estimate has no public evidence.", correction: "Use a verified public source." }] }), sources: [] };
    if (input.outputKind === "research_query") return { ok: true, body: JSON.stringify({ query: "public bakery pilot demand", reuseRecord: null, fresh: true, researchFor: [1] }), sources: [] };
    if (input.outputKind === "public_research") return { ok: true, body: "A public pilot report supplies bounded evidence.", sources: [{ url: "https://example.com/pilot-demand", title: "Public pilot report", claim: "The report describes a bounded pilot.", retrievedAt: "2026-09-27T10:00:00.000Z" }] };
    if (input.outputKind === "specialist_reply") return { ok: true, body: "The corrected estimate is limited to the sourced pilot evidence.", sources: [] };
    if (input.outputKind === "critic_order_assessment") {
      if (assessmentFailures-- > 0) return { ok: false, code: "provider_unavailable" };
      const orderIds = [...input.evidence.discussion.matchAll(/ order ([A-Za-z0-9_-]{32})/gu)].map(match => match[1]);
      return { ok: true, body: JSON.stringify({ assessments: orderIds.map(orderId => ({ orderId, state: "resolved_corrected", reason: "The correction now uses the verified public evidence." })) }), sources: [] };
    }
    if (input.outputKind === "head_final") return { ok: true, body: "Run the bounded pilot and retain the stated evidence limit.", sources: [] };
    throw new Error(`Unexpected provider step: ${input.outputKind}`);
  } };
  try {
    await installSchema(admin, name);
    store = await createMySqlStore(url.toString(), key, undefined, driver); stores.add(store);
    assert.equal(await store.acquireLeadership(), true);
    const conversation = await store.createConversation();
    const accepted = await store.acceptMessage(conversation.id, { body: "Evaluate a synthetic bakery pilot.", clientRequestId: "mysql-checkpoint-request-0001" }, { ...defaultSettings, runtimeInstructions: testRuntimeInstructions, contractVersion: "parallel-v1", specialistCount: "1", discussionDepth: "1" });
    const execute = runState => runParallelConsultation({ store, provider, conversationId: conversation.id, runState, signal: new AbortController().signal, onProvider() {} });
    await assert.rejects(execute(accepted.run), /provider_unavailable/u);
    const checkpoint = await store.run(conversation.id);
    assert.equal(checkpoint.snapshot.parallelWork.rounds[0].research.status, "complete");
    assert.ok(checkpoint.snapshot.parallelWork.orders[0].responseMessageId);
    assert.equal(checkpoint.snapshot.parallelWork.orders[0].assessmentMessageId, undefined);
    assert.equal(await store.finishRun(conversation.id, checkpoint.generation, "failed"), true);
    await store.close(); stores.delete(store);

    store = await createMySqlStore(url.toString(), key, undefined, driver); stores.add(store);
    assert.equal(await store.acquireLeadership(), true);
    const resumed = await store.continueRun(conversation.id);
    assert.ok(resumed);
    await execute(resumed);
    assert.equal(calls.filter(kind => kind === "public_research").length, 1);
    assert.equal(calls.filter(kind => kind === "specialist_reply").length, 1);
    assert.equal(calls.filter(kind => kind === "critic_order_assessment").length, 2);
    const completed = await store.run(conversation.id);
    assert.equal(completed.status, "complete");
    assert.equal(completed.snapshot.parallelWork.consiliumReached, true);
  } finally {
    await Promise.allSettled([...stores].map(item => item.close()));
    await admin.query(`DROP DATABASE IF EXISTS ${name}`);
    await admin.end();
  }
});

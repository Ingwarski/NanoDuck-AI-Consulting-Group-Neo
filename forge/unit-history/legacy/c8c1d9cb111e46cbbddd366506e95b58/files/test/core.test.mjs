import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { decryptBytes, decryptText, encryptBytes, encryptText } from "../src/server/crypto.mjs";
import { inspectImageAttachment } from "../src/server/attachments.mjs";
import { openRecoveryEnvelope, sealRecoverySnapshot } from "../src/server/recovery.mjs";
import { createAuth } from "../src/server/auth.mjs";
import { loadConfig } from "../src/server/config.mjs";
import { createMemoryStore, createMySqlStore, defaultSettings } from "../src/server/store.mjs";
import { hasProhibitedLanguage, maximumMessageBytes, parseConversationIds, parseMessage, parseSettings, safeExternalUrl } from "../src/server/validation.mjs";
import { testRuntimeInstructions } from "./fixtures/runtime-instructions.mjs";

test("new consultations default to the current saved Codex settings", () => {
  assert.deepEqual(defaultSettings, {
    headModel: "gpt-6-astra",
    headReasoning: "xhigh",
    criticProvider: "codex",
    criticCodexModel: "gpt-6-astra",
    criticCodexReasoning: "xhigh",
    criticModel: "gpt-6-astra",
    criticReasoning: "xhigh",
    specialistCount: "2",
    discussionDepth: "1",
    notificationSound: "knock"
  });
});

test("Claude Code accepts only a managed token and bounded owner-configured candidates", () => {
  const config = loadConfig({ NODE_ENV: "development", DEV_OWNER_EMAIL: "owner@local.test", CLAUDE_CODE_OAUTH_TOKEN: " managed-token ", CLAUDE_CODE_MODEL_CANDIDATES: "claude-sonnet, claude-opus,claude-sonnet" });
  assert.equal(config.claudeOAuthToken, "managed-token");
  assert.deepEqual(config.claudeModelCandidates, ["claude-sonnet", "claude-opus"]);
  assert.match(config.claudeCommand, /node_modules[/\\]\.bin[/\\]claude$/u);
  assert.throws(() => loadConfig({ NODE_ENV: "development", CLAUDE_CODE_MODEL_CANDIDATES: "not valid" }), /invalid model id/u);
  assert.throws(() => loadConfig({ NODE_ENV: "development", EDGE_PROXY_KEY: "too-short" }), /EDGE_PROXY_KEY must contain at least 32 bytes/u);
});

const key = Buffer.alloc(32, 7);

test("encrypted message values authenticate before decryption", () => {
  const encrypted = encryptText("Private decision context", key);
  assert.equal(decryptText(encrypted, key), "Private decision context");
  const alteredCiphertext = `${encrypted.ciphertext[0] === "A" ? "B" : "A"}${encrypted.ciphertext.slice(1)}`;
  assert.throws(() => decryptText({ ...encrypted, ciphertext: alteredCiphertext }, key));
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const encryptedImage = encryptBytes(image, key);
  assert.deepEqual(decryptBytes(encryptedImage, key), image);
});

test("the MySQL adapter accepts mysql2-decoded JSON values when reopening a consultation", async () => {
  const encrypted = encryptText("The specialist should test buyer demand.", key);
  const snapshot = { ...defaultSettings, runtimeInstructions: { revision: "instruction-revision" } };
  const source = { title: "Primary evidence", url: "https://example.com/evidence", claim: "Buyer demand is unproven.", retrievedAt: "2026-09-15T00:00:00.000Z" };
  const driver = {
    createPool() {
      return {
        async execute(statement) {
          if (statement.includes("FROM nanoduck_settings")) return [[{ settings_json: { specialistCount: "3" } }]];
          if (statement.includes("FROM nanoduck_messages")) return [[{ id: "message", role: "Strategy Consultant", recipient: "Critic", ...encrypted, sequence: 2, created_at: "2026-09-15T00:00:00.000Z", sources_json: [source] }]];
          if (statement.includes("FROM nanoduck_attachments")) return [[]];
          if (statement.includes("FROM nanoduck_runs")) return [[{ id: "run", conversation_id: "conversation", status: "active", generation: 1, snapshot_json: snapshot, created_at: "2026-09-15T00:00:00.000Z", updated_at: "2026-09-15T00:00:00.000Z" }]];
          throw new Error(`unexpected_query:${statement}`);
        },
        async end() {}
      };
    }
  };
  const store = await createMySqlStore("mysql://owner:password@db.example/nanoduck", key, undefined, driver);
  assert.deepEqual(await store.settings(), { ...defaultSettings, specialistCount: "3" });
  assert.deepEqual((await store.events("conversation")).map(item => ({ body: item.body, sources: item.sources })), [{ body: "The specialist should test buyer demand.", sources: [source] }]);
  assert.deepEqual((await store.run("conversation")).snapshot, snapshot);
  assert.deepEqual((await store.activeRuns()).map(run => run.snapshot), [snapshot]);
  await store.close();
});

test("image signatures accept only bounded raster formats without decoding them", () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([12, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.from([0, 0, 0, 0])]);
  assert.equal(inspectImageAttachment(jpeg), "image/jpeg");
  assert.equal(inspectImageAttachment(png), "image/png");
  assert.equal(inspectImageAttachment(webp), "image/webp");
  assert.equal(inspectImageAttachment(Buffer.from("%PDF-1.7")), undefined);
  assert.equal(inspectImageAttachment(jpeg.subarray(0, -2)), undefined);
  assert.equal(inspectImageAttachment(png.subarray(0, -8)), undefined);
  assert.equal(inspectImageAttachment(webp.subarray(0, -4)), undefined);
});

test("encrypted recovery restores confirmed records but never resurrects a deletion", async () => {
  const source = createMemoryStore();
  const conversation = await source.createConversation();
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const attachment = await source.createAttachment(conversation.id, { content: image, contentType: "image/jpeg", byteLength: image.byteLength });
  const accepted = await source.acceptMessage(conversation.id, { body: "Should we test this offer first?", attachmentIds: [attachment.id], clientRequestId: "recovery-source-request-0001" }, defaultSettings);
  await source.appendAgentMessage(conversation.id, accepted.run.generation, { role: "Head Consultant", body: "Test the buyer before scaling.", sources: [{ url: "https://example.com/evidence", title: "Buyer evidence", claim: "Test the buyer.", retrievedAt: "2026-09-14T00:00:00.000Z" }] });
  await source.stop(conversation.id);
  const backupKey = Buffer.alloc(32, 8);
  const envelope = sealRecoverySnapshot(await source.recoverySnapshot(), backupKey);
  assert.equal(openRecoveryEnvelope({ ...envelope, payload: { ...envelope.payload, tag: `${envelope.payload.tag[0] === "A" ? "B" : "A"}${envelope.payload.tag.slice(1)}` } }, backupKey), undefined);
  const restored = createMemoryStore();
  assert.deepEqual(await restored.restoreRecovery(openRecoveryEnvelope(envelope, backupKey)), { restored: 1, tombstones: 0, preservedTombstones: 0 });
  assert.deepEqual((await restored.events(conversation.id)).map(item => item.body), ["Should we test this offer first?", "Test the buyer before scaling."]);
  assert.deepEqual((await restored.attachment(conversation.id, attachment.id)).content, image);
  assert.ok(await restored.deleteConversation(conversation.id));
  assert.deepEqual(await restored.restoreRecovery(openRecoveryEnvelope(envelope, backupKey)), { restored: 0, tombstones: 0, preservedTombstones: 1 });
  assert.equal(await restored.getConversation(conversation.id), undefined);
  assert.equal((await restored.recoverySnapshot()).conversations[0].messages.length, 0);
});

test("multiple selected conversations are tombstoned together", async () => {
  const store = createMemoryStore();
  const first = await store.createConversation(); const second = await store.createConversation(); const third = await store.createConversation();
  assert.deepEqual(await store.deleteConversations([first.id, second.id]), [first.id, second.id]);
  assert.deepEqual((await store.listConversations()).map(item => item.id), [third.id]);
  assert.deepEqual(await store.deleteConversations([first.id, third.id]), [third.id]);
  assert.deepEqual(await store.listConversations(), []);
});

test("accepted owner messages are idempotent and a stopped run fences later agent output", async () => {
  const store = createMemoryStore();
  const conversation = await store.createConversation();
  const input = { body: "Should we enter this market?", clientRequestId: "request-identifier-0001" };
  const first = await store.acceptMessage(conversation.id, input, defaultSettings);
  const replay = await store.acceptMessage(conversation.id, input, defaultSettings);
  assert.equal(replay.replayed, true);
  assert.equal(replay.message.id, first.message.id);
  await store.saveSettings({ ...defaultSettings, specialistCount: "3", discussionDepth: "3" });
  assert.deepEqual((await store.run(conversation.id)).snapshot, { ...defaultSettings, requestMessageId: first.message.id });
  assert.ok(await store.appendAgentMessage(conversation.id, first.run.generation, { role: "Head Consultant", body: "First view." }));
  const stopped = await store.stop(conversation.id);
  assert.equal(stopped.status, "stopped");
  assert.equal(await store.appendAgentMessage(conversation.id, first.run.generation, { role: "Critic", body: "Late output." }), undefined);
  assert.equal((await store.events(conversation.id)).length, 2);
});

test("an older accepted request replays its original run after a later Send and local-state restart", async () => {
  let store = createMemoryStore();
  const conversation = await store.createConversation();
  const firstInput = { body: "Assess the first decision.", clientRequestId: "historical-replay-request-0001" };
  const first = await store.acceptMessage(conversation.id, firstInput, defaultSettings);
  await store.finishRun(conversation.id, first.run.generation, "complete");
  const second = await store.acceptMessage(conversation.id, { body: "Assess the later decision.", clientRequestId: "historical-replay-request-0002" }, defaultSettings);
  assert.ok(second);
  const replay = await store.acceptMessage(conversation.id, firstInput, defaultSettings);
  assert.equal(replay.replayed, true);
  assert.equal(replay.message.id, first.message.id);
  assert.equal(replay.run.id, first.run.id);
  assert.equal(replay.run.status, "complete");
  assert.equal((await store.run(conversation.id)).id, second.run.id);

  store = createMemoryStore(store.snapshotState());
  const restoredReplay = await store.acceptMessage(conversation.id, firstInput, defaultSettings);
  assert.equal(restoredReplay.replayed, true);
  assert.equal(restoredReplay.run.id, first.run.id);
  assert.equal(restoredReplay.run.status, "complete");
  assert.equal((await store.run(conversation.id)).id, second.run.id);
});

test("all message storage paths reject bodies that exceed the encrypted column budget", async () => {
  const store = createMemoryStore(); const conversation = await store.createConversation();
  const oversized = "a".repeat(maximumMessageBytes + 1);
  assert.equal(await store.acceptMessage(conversation.id, { body: oversized, clientRequestId: "oversize-store-request-0001" }, defaultSettings), undefined);
  const accepted = await store.acceptMessage(conversation.id, { body: "Bounded request.", clientRequestId: "bounded-store-request-0001" }, defaultSettings);
  assert.ok(accepted);
  assert.equal(await store.appendAgentMessage(conversation.id, accepted.run.generation, { role: "Head Consultant", body: oversized, sources: [] }), undefined);
});

test("only one consultation can be active across the owner's conversations", async () => {
  const store = createMemoryStore();
  const first = await store.createConversation();
  const second = await store.createConversation();
  const firstRun = await store.acceptMessage(first.id, { body: "First active consultation", clientRequestId: "single-active-request-0001" }, defaultSettings);
  assert.ok(firstRun);
  assert.equal(await store.acceptMessage(second.id, { body: "Second active consultation", clientRequestId: "single-active-request-0002" }, defaultSettings), undefined);
  assert.ok(await store.stop(first.id));
  const secondRun = await store.acceptMessage(second.id, { body: "Second active consultation", clientRequestId: "single-active-request-0002" }, defaultSettings);
  assert.ok(secondRun);
  assert.equal(await store.continueRun(first.id), undefined);
  assert.ok(await store.stop(second.id));
  assert.equal((await store.continueRun(first.id))?.status, "active");
});

test("MySQL runtime instructions are encrypted, versioned and restored through the owner lock", async () => {
  let current; const history = new Map(); const commands = [];
  const connection = {
    async beginTransaction() { commands.push("BEGIN"); },
    async commit() { commands.push("COMMIT"); },
    async rollback() { commands.push("ROLLBACK"); },
    release() {},
    async execute(statement, values = []) {
      commands.push(statement);
      if (statement.startsWith("SELECT owner_id FROM nanoduck_owner_locks")) return [[{ owner_id: "owner" }]];
      if (statement.startsWith("SELECT ciphertext,iv,tag,revision,content_hash,created_at,updated_at FROM nanoduck_runtime_instructions")) return [current ? [current] : []];
      if (statement.startsWith("SELECT revision FROM nanoduck_runtime_instructions")) return [current ? [{ revision: current.revision }] : []];
      if (statement.startsWith("INSERT INTO nanoduck_runtime_instructions")) {
        current = { ciphertext: values[0], iv: values[1], tag: values[2], revision: values[3], content_hash: values[4], created_at: values[5], updated_at: values[6] }; return [{ affectedRows: 1 }];
      }
      if (statement.startsWith("UPDATE nanoduck_runtime_instructions")) {
        current = { ...current, ciphertext: values[0], iv: values[1], tag: values[2], revision: values[3], content_hash: values[4], updated_at: values[5] }; return [{ affectedRows: 1 }];
      }
      if (statement.startsWith("INSERT INTO nanoduck_runtime_instruction_history")) {
        history.set(values[0], { id: values[0], owner_id: "owner", action: values[1], restored_from_id: values[2], ciphertext: values[3], iv: values[4], tag: values[5], content_hash: values[6], created_at: values[7] }); return [{ affectedRows: 1 }];
      }
      if (statement.startsWith("SELECT id,action,restored_from_id,content_hash,created_at FROM nanoduck_runtime_instruction_history")) return [[...history.values()].map(({ id, action, restored_from_id, content_hash, created_at }) => ({ id, action, restored_from_id, content_hash, created_at }))];
      if (statement.startsWith("SELECT id,action,restored_from_id,ciphertext,iv,tag,content_hash,created_at FROM nanoduck_runtime_instruction_history")) {
        const row = history.get(values[0]); return [row ? [row] : []];
      }
      if (statement.startsWith("SELECT id FROM nanoduck_runtime_instruction_history")) return [history.has(values[0]) ? [{ id: values[0] }] : []];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const pool = { getConnection: async () => connection, execute: (...args) => connection.execute(...args), end: async () => {} };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => pool });
  const bootstrapped = await store.bootstrapRuntimeInstructions(testRuntimeInstructions);
  assert.notEqual(current.ciphertext, testRuntimeInstructions.markdown);
  assert.equal(decryptText(current, key), testRuntimeInstructions.markdown);
  const routingMigrated = await store.migrateRuntimeInstructions(markdown => ({ ...testRuntimeInstructions, markdown: markdown.replace("must not give the owner advice, a recommendation, analysis, or a preliminary conclusion.", "must not give the owner advice before the final synthesis."), revision: "b".repeat(64) }));
  assert.ok(routingMigrated);
  assert.equal((await store.listRuntimeInstructionHistory()).find(item => item.id === routingMigrated.revision)?.action, "routing_migration");
  const edited = { ...testRuntimeInstructions, markdown: testRuntimeInstructions.markdown.replace("must not give the owner advice, a recommendation, analysis, or a preliminary conclusion.", "must not give the owner advice before the final synthesis."), revision: "a".repeat(64) };
  const saved = await store.saveRuntimeInstructions(edited, routingMigrated.revision);
  assert.ok(saved);
  assert.equal((await store.listRuntimeInstructionHistory()).length, 3);
  assert.equal((await store.runtimeInstructionVersion(bootstrapped.revision))?.markdown, testRuntimeInstructions.markdown);
  const restored = await store.restoreRuntimeInstructions(testRuntimeInstructions, saved.revision, bootstrapped.revision);
  assert.ok(restored);
  assert.notEqual(restored.revision, bootstrapped.revision);
  assert.equal((await store.runtimeInstructions())?.markdown, testRuntimeInstructions.markdown);
  assert.ok(commands.filter(command => command === "SELECT owner_id FROM nanoduck_owner_locks WHERE owner_id='owner' FOR UPDATE").length >= 4);
});

test("MySQL agent writes and deletion serialize through the conversation lock", async () => {
  const commands = []; let transactions = 0; let commits = 0; let releases = 0;
  const connection = {
    async beginTransaction() { transactions += 1; commands.push("BEGIN"); },
    async commit() { commits += 1; commands.push("COMMIT"); },
    async rollback() { commands.push("ROLLBACK"); },
    release() { releases += 1; },
    async execute(statement) {
      commands.push(statement);
      if (statement.startsWith("SELECT owner_id FROM nanoduck_owner_locks")) return [[{ owner_id: "owner" }]];
      if (statement.startsWith("SELECT id FROM nanoduck_conversations")) return [[{ id: "conversation-id" }]];
      if (statement.startsWith("SELECT id,status,generation FROM nanoduck_runs")) return [[{ id: "run-id", status: "active", generation: 3 }]];
      if (statement.startsWith("SELECT COALESCE(MAX(sequence)")) return [[{ max_sequence: 4 }]];
      if (statement.startsWith("INSERT INTO nanoduck_messages")) return [{ affectedRows: 1 }];
      if (statement.startsWith("UPDATE nanoduck_conversations SET updated_at")) return [{ affectedRows: 1 }];
      if (statement.startsWith("UPDATE nanoduck_runs SET updated_at")) return [{ affectedRows: 1 }];
      if (statement.startsWith("UPDATE nanoduck_conversations SET deleted_at") || statement.startsWith("DELETE FROM nanoduck_attachments") || statement.startsWith("DELETE FROM nanoduck_messages") || statement.startsWith("DELETE FROM nanoduck_requests") || statement.startsWith("DELETE FROM nanoduck_usage")) return [{ affectedRows: 1 }];
      if (statement.startsWith("UPDATE nanoduck_runs SET snapshot_json")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => ({ getConnection: async () => connection, end: async () => {} }) });
  const message = await store.appendAgentMessage("conversation-id", 3, { role: "Critic", body: "One material risk.", sources: [] });
  assert.equal(message.sequence, 5);
  assert.equal(await store.deleteConversation("conversation-id"), true);
  assert.equal(transactions, 2);
  assert.equal(commits, 2);
  assert.equal(releases, 2);
  assert.ok(commands.some(command => command.includes("nanoduck_conversations WHERE id=? AND deleted_at IS NULL FOR UPDATE")));
  assert.ok(commands.some(command => command.includes("nanoduck_messages WHERE conversation_id=? FOR UPDATE")));
  const deleteIndex = commands.findIndex(command => command.startsWith("UPDATE nanoduck_conversations SET deleted_at"));
  assert.match(commands[deleteIndex + 1], /^DELETE FROM nanoduck_attachments/u);
  assert.match(commands[deleteIndex + 2], /^DELETE FROM nanoduck_messages/u);
  assert.match(commands[deleteIndex + 3], /^DELETE FROM nanoduck_requests/u);
  assert.match(commands[deleteIndex + 4], /^DELETE FROM nanoduck_usage/u);
  assert.match(commands[deleteIndex + 5], /^UPDATE nanoduck_runs SET snapshot_json/u);
});

test("MySQL recovery exports app records and restores deletion tombstones before active history", async () => {
  const commands = []; const activeId = "recovery-active-0001"; const deletedId = "recovery-deleted-0001";
  const encrypted = encryptText("Retain the accepted conclusion.", key);
  const connection = {
    async beginTransaction() { commands.push("BEGIN"); },
    async commit() { commands.push("COMMIT"); },
    async rollback() { commands.push("ROLLBACK"); },
    release() {},
    async execute(statement) {
      commands.push(statement);
      if (statement.startsWith("SELECT owner_id FROM nanoduck_owner_locks")) return [[{ owner_id: "owner" }]];
      if (statement.startsWith("SELECT id,title,created_at,updated_at,deleted_at FROM nanoduck_conversations ORDER BY")) return [[
        { id: activeId, title: "Active record", created_at: "2026-09-14T00:00:00.000Z", updated_at: "2026-09-14T00:01:00.000Z", deleted_at: null },
        { id: deletedId, title: "Deleted record", created_at: "2026-09-14T00:00:00.000Z", updated_at: "2026-09-14T00:02:00.000Z", deleted_at: "2026-09-14T00:02:00.000Z" }
      ]];
      if (statement.startsWith("SELECT id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json FROM nanoduck_messages")) return [[{ id: "recovery-message-0001", role: "Head Consultant", recipient: null, ...encrypted, sequence: 1, created_at: "2026-09-14T00:01:00.000Z", sources_json: "[]" }]];
      if (statement.startsWith("SELECT id,message_id,content_type,byte_length,ciphertext,iv,tag,created_at FROM nanoduck_attachments")) return [[]];
      if (statement.startsWith("SELECT id,provider,model,status,started_at,finished_at,ciphertext,iv,tag FROM nanoduck_usage")) return [[]];
      if (statement.startsWith("SELECT id,deleted_at FROM nanoduck_conversations")) return [[]];
      if (["FROM nanoduck_settings", "FROM nanoduck_runtime_instructions", "FROM nanoduck_runtime_instruction_history", "FROM nanoduck_instruction_documents"].some(table => statement.includes(table))) return [[]];
      if (statement.startsWith("INSERT INTO nanoduck_conversations") || statement.startsWith("INSERT INTO nanoduck_messages") || statement.startsWith("INSERT INTO nanoduck_attachments") || statement.startsWith("DELETE FROM nanoduck_attachments") || statement.startsWith("DELETE FROM nanoduck_messages") || statement.startsWith("DELETE FROM nanoduck_requests") || statement.startsWith("DELETE FROM nanoduck_usage") || statement.startsWith("UPDATE nanoduck_runs SET snapshot_json")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => ({ getConnection: async () => connection, end: async () => {} }) });
  const snapshot = await store.recoverySnapshot();
  assert.deepEqual(snapshot.conversations.map(item => [item.conversation.id, item.messages.length]), [[activeId, 1], [deletedId, 0]]);
  assert.deepEqual(await store.restoreRecovery(snapshot), { restored: 1, tombstones: 1, preservedTombstones: 0 });
  const tombstoneIndex = commands.findIndex(command => command.startsWith("INSERT INTO nanoduck_conversations (id,title,created_at,updated_at,deleted_at)"));
  const activeIndex = commands.findIndex(command => command.startsWith("INSERT INTO nanoduck_conversations (id,title,created_at,updated_at)"));
  assert.ok(tombstoneIndex >= 0 && activeIndex > tombstoneIndex);
});

test("MySQL acceptance holds the owner lock before allowing an active run", async () => {
  const commands = []; let active = false;
  const connection = {
    async beginTransaction() { commands.push("BEGIN"); },
    async commit() { commands.push("COMMIT"); },
    async rollback() { commands.push("ROLLBACK"); },
    release() {},
    async execute(statement) {
      commands.push(statement);
      if (statement.startsWith("SELECT owner_id FROM nanoduck_owner_locks")) return [[{ owner_id: "owner" }]];
      if (statement.startsWith("SELECT id,title FROM nanoduck_conversations")) return [[{ id: "conversation-id", title: "New consultation" }]];
      if (statement.startsWith("SELECT message_id,run_id FROM nanoduck_requests")) return [[]];
      if (statement.startsWith("SELECT id FROM nanoduck_runs WHERE status='active'")) return [active ? [{ id: "other-active-run" }] : []];
      if (statement.startsWith("SELECT COALESCE(MAX(sequence)")) return [[{ max_sequence: 0 }]];
      if (statement.startsWith("SELECT COALESCE(MAX(generation)")) return [[{ max_generation: 0 }]];
      if (statement.startsWith("INSERT INTO nanoduck_messages") || statement.startsWith("INSERT INTO nanoduck_runs") || statement.startsWith("INSERT INTO nanoduck_requests") || statement.startsWith("UPDATE nanoduck_conversations SET title") || statement.startsWith("UPDATE nanoduck_conversations SET updated_at")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => ({ getConnection: async () => connection, end: async () => {} }) });
  assert.ok(await store.acceptMessage("conversation-id", { body: "First run", clientRequestId: "mysql-active-request-0001" }, defaultSettings));
  active = true;
  assert.equal(await store.acceptMessage("conversation-id", { body: "Second run", clientRequestId: "mysql-active-request-0002" }, defaultSettings), undefined);
  const firstLock = commands.indexOf("SELECT owner_id FROM nanoduck_owner_locks WHERE owner_id='owner' FOR UPDATE");
  const firstActiveCheck = commands.indexOf("SELECT id FROM nanoduck_runs WHERE status='active' LIMIT 1");
  assert.ok(firstLock >= 0 && firstLock < firstActiveCheck);
});

test("MySQL duplicate-request replay loads the request's bound run through its locked transaction connection", async () => {
  const conversationId = "conversation-replay-identifier-01";
  const messageId = "m".repeat(32); const runId = "r".repeat(32);
  const body = "Replay this exact synthetic request."; const sealed = encryptText(body, key);
  const snapshot = { ...defaultSettings, requestMessageId: messageId };
  const commands = []; let poolExecutions = 0;
  const connection = {
    async beginTransaction() { commands.push("BEGIN"); },
    async commit() { commands.push("COMMIT"); },
    async rollback() { commands.push("ROLLBACK"); },
    release() {},
    async execute(statement, values = []) {
      commands.push(statement);
      if (statement.startsWith("SELECT owner_id FROM nanoduck_owner_locks")) return [[{ owner_id: "owner" }]];
      if (statement.startsWith("SELECT id,title FROM nanoduck_conversations")) return [[{ id: conversationId, title: "Synthetic replay" }]];
      if (statement.startsWith("SELECT message_id,run_id FROM nanoduck_requests")) return [[{ message_id: messageId, run_id: runId }]];
      if (statement.startsWith("SELECT id,role,recipient,ciphertext")) return [[{ id: messageId, role: "owner", recipient: null, ...sealed, sequence: 1, created_at: "2026-09-27T10:00:00.000Z", sources_json: [] }]];
      if (statement.startsWith("SELECT id,message_id,content_type")) return [[]];
      if (statement.startsWith("SELECT id,conversation_id,status,generation")) {
        assert.deepEqual(values, [conversationId, runId]);
        return [[{ id: runId, conversation_id: conversationId, status: "complete", generation: 1, snapshot_json: snapshot, created_at: "2026-09-27T10:00:00.000Z", updated_at: "2026-09-27T10:00:00.000Z" }]];
      }
      if (statement.startsWith("SELECT m.id FROM nanoduck_messages")) return [[{ id: messageId }]];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const pool = { getConnection: async () => connection, async execute() { poolExecutions += 1; throw new Error("nested_pool_read"); }, async end() {} };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => pool });
  const replay = await store.acceptMessage(conversationId, { body, clientRequestId: "mysql-replay-request-0001" }, snapshot);
  assert.equal(replay.replayed, true);
  assert.equal(replay.message.id, messageId);
  assert.equal(replay.run.id, runId);
  assert.equal(replay.run.status, "complete");
  assert.equal(poolExecutions, 0);
  assert.equal(commands.at(-1), "ROLLBACK");
});

test("MySQL image attachments are encrypted at rest and linked in the message transaction", async () => {
  const commands = []; let pendingId;
  const image = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
  const connection = {
    async beginTransaction() { commands.push({ statement: "BEGIN", values: [] }); },
    async commit() { commands.push({ statement: "COMMIT", values: [] }); },
    async rollback() { commands.push({ statement: "ROLLBACK", values: [] }); },
    release() {},
    async execute(statement, values = []) {
      commands.push({ statement, values });
      if (statement.startsWith("SELECT owner_id FROM nanoduck_owner_locks")) return [[{ owner_id: "owner" }]];
      if (statement.startsWith("SELECT id FROM nanoduck_conversations") || statement.startsWith("SELECT id,title FROM nanoduck_conversations")) return [[{ id: "conversation-id", title: "New consultation" }]];
      if (statement.startsWith("SELECT id FROM nanoduck_runs WHERE status='active'")) return [[]];
      if (statement.startsWith("INSERT INTO nanoduck_attachments")) { pendingId = values[0]; return [{ affectedRows: 1 }]; }
      if (statement.startsWith("SELECT message_id,run_id FROM nanoduck_requests")) return [[]];
      if (statement.startsWith("SELECT id,content_type,byte_length,created_at FROM nanoduck_attachments")) return [[{ id: pendingId, content_type: "image/jpeg", byte_length: image.byteLength, created_at: "2026-09-14T00:00:00.000Z" }]];
      if (statement.startsWith("SELECT COALESCE(MAX(sequence)")) return [[{ max_sequence: 0 }]];
      if (statement.startsWith("SELECT COALESCE(MAX(generation)")) return [[{ max_generation: 0 }]];
      if (statement.startsWith("INSERT INTO nanoduck_messages") || statement.startsWith("UPDATE nanoduck_attachments SET message_id") || statement.startsWith("INSERT INTO nanoduck_runs") || statement.startsWith("INSERT INTO nanoduck_requests") || statement.startsWith("UPDATE nanoduck_conversations SET title") || statement.startsWith("UPDATE nanoduck_conversations SET updated_at")) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected statement: ${statement}`);
    }
  };
  const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => ({ getConnection: async () => connection, end: async () => {} }) });
  const attachment = await store.createAttachment("conversation-id", { content: image, contentType: "image/jpeg", byteLength: image.byteLength });
  assert.ok(attachment);
  const stored = commands.find(command => command.statement.startsWith("INSERT INTO nanoduck_attachments"));
  assert.ok(stored);
  assert.equal(stored.values[0], attachment.id);
  assert.equal(Buffer.isBuffer(stored.values[5]), true);
  assert.notEqual(Buffer.compare(stored.values[5], image), 0);
  assert.deepEqual(decryptBytes({ ciphertext: stored.values[5], iv: stored.values[6], tag: stored.values[7] }, key), image);

  const accepted = await store.acceptMessage("conversation-id", { body: "Assess this visual direction.", attachmentIds: [attachment.id], clientRequestId: "mysql-image-message-request-0001" }, defaultSettings);
  assert.deepEqual(accepted.message.attachments.map(item => item.id), [attachment.id]);
  const linked = commands.find(command => command.statement.startsWith("UPDATE nanoduck_attachments SET message_id"));
  assert.ok(linked);
  assert.deepEqual(linked.values.slice(1), ["conversation-id", attachment.id]);
  const attachmentLock = commands.findIndex(command => command.statement.startsWith("SELECT id,content_type,byte_length,created_at FROM nanoduck_attachments"));
  const messageInsert = commands.findIndex(command => command.statement.startsWith("INSERT INTO nanoduck_messages"));
  const attachmentLink = commands.findIndex(command => command.statement.startsWith("UPDATE nanoduck_attachments SET message_id"));
  assert.ok(attachmentLock >= 0 && messageInsert > attachmentLock && attachmentLink > messageInsert);
});

test("settings and message validation reject unsupported model values and malformed ids", () => {
  assert.deepEqual(parseSettings({ ...defaultSettings, specialistCount: "1", discussionDepth: "1" }), { ...defaultSettings, specialistCount: "1", discussionDepth: "1" });
  assert.deepEqual(parseSettings({ ...defaultSettings, specialistCount: "auto", discussionDepth: "auto" }), { ...defaultSettings, specialistCount: "auto", discussionDepth: "auto" });
  assert.equal(parseSettings({ ...defaultSettings, specialistCount: "4" }), undefined);
  assert.equal(parseSettings({ ...defaultSettings, discussionDepth: "2" }), undefined);
  assert.equal(parseSettings({ ...defaultSettings, criticCodexModel: "another-model" }), undefined);
  const claudeCatalog = { codex: { models: [{ id: "gpt-6-astra", efforts: ["xhigh", "ultra"] }] }, claude_code: { models: [{ id: "claude-opus-5", efforts: ["low", "medium", "high", "extra", "max"] }] } };
  assert.deepEqual(parseSettings({ ...defaultSettings, criticProvider: "claude_code", criticModel: "claude-opus-5", criticReasoning: "high", criticClaudeReasoning: "high" }, claudeCatalog), { ...defaultSettings, criticProvider: "claude_code", criticModel: "claude-opus-5", criticReasoning: "high", criticClaudeReasoning: "high" });
  assert.equal(parseSettings({ ...defaultSettings, criticProvider: "claude_code", criticModel: "claude-opus-5", criticReasoning: "extreme", criticClaudeReasoning: "extreme" }, claudeCatalog), undefined);
  assert.deepEqual(parseSettings({ ...defaultSettings, criticProvider: "claude_code", criticModel: "claude-code-default", criticReasoning: "default", criticClaudeModel: "claude-code-default", criticClaudeReasoning: "default" }, claudeCatalog), { ...defaultSettings, criticProvider: "claude_code", criticModel: "claude-opus-5", criticReasoning: "high" });
  assert.equal(parseSettings({ ...defaultSettings, criticProvider: "claude_code" }, { codex: { models: [{ id: "gpt-6-astra", efforts: ["xhigh", "ultra"] }] }, claude_code: { models: [] } }), undefined);
  assert.deepEqual(parseSettings({ ...defaultSettings, notificationSound: "ripple" }), { ...defaultSettings, notificationSound: "ripple" });
  assert.equal(parseSettings({ ...defaultSettings, notificationSound: "loud" }), undefined);
  assert.equal(parseMessage({ body: "Question", clientRequestId: "short" }), undefined);
  assert.deepEqual(parseMessage({ body: " Question ", clientRequestId: "request-identifier-0002" }), { body: "Question", clientRequestId: "request-identifier-0002", attachmentIds: [] });
  assert.equal(parseMessage({ body: "Question", clientRequestId: "request-identifier-0002", attachmentIds: ["short"] }), undefined);
  assert.equal(parseMessage({ body: "Question", clientRequestId: "request-identifier-0002", attachmentIds: Array(5).fill("attachment-identifier-0001") }), undefined);
  assert.equal(parseMessage({ body: "Как это работает?", clientRequestId: "language-policy-request-0001" }), undefined);
  assert.equal(parseMessage({ body: "Як гэта працуе?", clientRequestId: "language-policy-request-0002" }), undefined);
  assert.equal(parseMessage({ body: "Read https://example.su/report", clientRequestId: "url-policy-request-0003" }), undefined);
  const maximumBody = "a".repeat(maximumMessageBytes);
  assert.equal(parseMessage({ body: maximumBody, clientRequestId: "maximum-message-request-0001" })?.body.length, maximumMessageBytes);
  assert.equal(parseMessage({ body: `${maximumBody}a`, clientRequestId: "oversize-message-request-0001" }), undefined);
  assert.equal(parseMessage({ body: "ї".repeat(maximumMessageBytes / 2 + 1), clientRequestId: "oversize-message-request-0002" }), undefined, "The storage ceiling is measured in UTF-8 bytes");
  assert.deepEqual(parseConversationIds({ conversationIds: ["conversation-identifier-0001", "conversation-identifier-0002"] }), ["conversation-identifier-0001", "conversation-identifier-0002"]);
  assert.equal(parseConversationIds({ conversationIds: ["conversation-identifier-0001", "conversation-identifier-0001"] }), undefined);
});

test("Ukrainian shared words are allowed without permitting distinctive prohibited language", () => {
  for (const body of ["Які умови вступу?", "Перевірте курси, які викладають англійською.", "Уточніть, які саме дані потрібно надати."]) {
    assert.equal(hasProhibitedLanguage(body), false, body);
    assert.equal(parseMessage({ body, clientRequestId: "ukrainian-word-check-0001" })?.body, body);
  }
  for (const body of ["Как это работает?", "Які гэта мае вынікі?", "Якія сёння ўмовы?", "Якая крыніца?"]) assert.equal(hasProhibitedLanguage(body), true);
  for (const suffix of ["ru", "by", "su"]) assert.equal(safeExternalUrl(`https://example.${suffix}/report`), undefined);
});

test("source links accept only public HTTPS destinations", () => {
  assert.equal(safeExternalUrl("https://example.com/report"), "https://example.com/report");
  assert.equal(safeExternalUrl("http://example.com/report"), undefined);
  assert.equal(safeExternalUrl("https://127.0.0.1/private"), undefined);
  assert.equal(safeExternalUrl("https://169.254.169.254/latest"), undefined);
  assert.equal(safeExternalUrl("https://localhost/private"), undefined);
  assert.equal(safeExternalUrl("https://[::1]/private"), undefined);
  assert.equal(safeExternalUrl("https://[fd00::1]/private"), undefined);
  for (const blocked of ["https://[::]/private", "https://[::ffff:127.0.0.1]/private", "https://[::ffff:10.0.0.1]/private", "https://[fe90::1]/private", "https://[febf::1]/private", "https://[fc00::1]/private", "https://[fec0::1]/private", "https://[ff02::1]/private", "https://100.64.0.1/private", "https://198.18.0.1/private", "https://224.0.0.1/private"]) assert.equal(safeExternalUrl(blocked), undefined, blocked);
  assert.equal(safeExternalUrl("https://[2606:4700:4700::1111]/public"), "https://[2606:4700:4700::1111]/public");
  assert.equal(safeExternalUrl("https://example.ru/report"), undefined);
  assert.equal(safeExternalUrl("https://example.by/report"), undefined);
  assert.equal(safeExternalUrl("https://example.su/report"), undefined);
  assert.equal(safeExternalUrl("https://example.рф/report"), undefined);
  assert.equal(safeExternalUrl("https://example.бел/report"), undefined);
});

test("development cookies remain usable on localhost while production uses host-only secure cookies", async () => {
  const developmentStore = createMemoryStore();
  const development = createAuth({ config: loadConfig({ NODE_ENV: "development", DEV_OWNER_EMAIL: "owner@local.test" }), store: developmentStore });
  const localSession = await development.developmentSignIn();
  assert.match(development.sessionCookie(localSession), /^nanoduck-session=/u);
  assert.doesNotMatch(development.sessionCookie(localSession), /; Secure/u);
  assert.match(development.sessionCookie(localSession), /Max-Age=86400/u);

  const productionEnvironment = { NODE_ENV: "production", APP_ORIGIN: "https://consulting.example.com", DATABASE_URL: "mysql://user:password@host/database", DATABASE_SSL_CA_PATH: "/run/secrets/mysql-ca.pem", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64url"), RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64url"), SESSION_SIGNING_KEY: Buffer.alloc(32, 3).toString("base64url"), OWNER_GOOGLE_SUBJECT: "owner-subject", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", CODEX_APP_SERVER_AUTH_PATH: "/run/secrets/codex-auth.json" };
  assert.equal(loadConfig({ ...productionEnvironment, NODE_ENV: "development", NANODUCK_RUNTIME_MODE: "production" }).mode, "production");
  assert.throws(() => loadConfig({ ...productionEnvironment, DATABASE_URL: "", DB_HOST: "host", DB_PORT: "not-a-port", DB_NAME: "database", DB_USER: "user", DB_PASSWORD: "password" }), /managed database/u);
  assert.throws(() => loadConfig({ ...productionEnvironment, RECOVERY_ENCRYPTION_KEY: productionEnvironment.DATA_ENCRYPTION_KEY }), /must differ/u);
  assert.throws(() => loadConfig({ ...productionEnvironment, MAX_ATTACHMENT_BYTES: String(8 * 1024 * 1024 + 1) }), /cannot exceed 8 MiB/u);
  const production = createAuth({ config: loadConfig(productionEnvironment), store: createMemoryStore() });
  const productionSession = await production.developmentSignIn();
  assert.equal(productionSession, undefined);
  const standardBase64Keys = loadConfig({
    ...productionEnvironment,
    DATA_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("hex"),
    SESSION_SIGNING_KEY: "0123456789abcdefghijklmnopqrstuv"
  });
  assert.deepEqual(standardBase64Keys.dataKey, Buffer.alloc(32, 2));
  assert.deepEqual(standardBase64Keys.recoveryKey, Buffer.alloc(32, 6));
  assert.deepEqual(standardBase64Keys.sessionKey, Buffer.from("0123456789abcdefghijklmnopqrstuv", "utf8"));
  const paddedBase64urlKey = Buffer.concat([Buffer.from([251, 255]), Buffer.alloc(30, 9)]).toString("base64url");
  const base64UrlCompatibility = loadConfig({
    ...productionEnvironment,
    DATA_ENCRYPTION_KEY: `${paddedBase64urlKey}=`,
    RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 8).toString("base64").replace(/=+$/u, "")
  });
  assert.deepEqual(base64UrlCompatibility.dataKey, Buffer.concat([Buffer.from([251, 255]), Buffer.alloc(30, 9)]));
  assert.deepEqual(base64UrlCompatibility.recoveryKey, Buffer.alloc(32, 8));
  const quotedSecretCompatibility = loadConfig({
    ...productionEnvironment,
    DATA_ENCRYPTION_KEY: `"${paddedBase64urlKey}="`,
    RECOVERY_ENCRYPTION_KEY: `'${Buffer.alloc(32, 7).toString("hex")}'`,
    SESSION_SIGNING_KEY: `"${Buffer.alloc(32, 5).toString("base64")}"`
  });
  assert.deepEqual(quotedSecretCompatibility.dataKey, Buffer.concat([Buffer.from([251, 255]), Buffer.alloc(30, 9)]));
  assert.deepEqual(quotedSecretCompatibility.recoveryKey, Buffer.alloc(32, 7));
  assert.deepEqual(quotedSecretCompatibility.sessionKey, Buffer.alloc(32, 5));
  const literalQuotedKeys = loadConfig({
    ...productionEnvironment,
    DATA_ENCRYPTION_KEY: `"${"a".repeat(30)}"`,
    RECOVERY_ENCRYPTION_KEY: `"${"b".repeat(30)}"`
  });
  assert.deepEqual(literalQuotedKeys.dataKey, Buffer.from(`"${"a".repeat(30)}"`, "utf8"));
  assert.deepEqual(literalQuotedKeys.recoveryKey, Buffer.from(`"${"b".repeat(30)}"`, "utf8"));
  const dotenvAssignmentCompatibility = loadConfig({
    ...productionEnvironment,
    DATA_ENCRYPTION_KEY: `export DATA_ENCRYPTION_KEY = "${paddedBase64urlKey}="`,
    RECOVERY_ENCRYPTION_KEY: `RECOVERY_ENCRYPTION_KEY=${Buffer.alloc(32, 7).toString("hex")}`,
    SESSION_SIGNING_KEY: `SESSION_SIGNING_KEY=${Buffer.alloc(32, 5).toString("base64")}`
  });
  assert.deepEqual(dotenvAssignmentCompatibility.dataKey, Buffer.concat([Buffer.from([251, 255]), Buffer.alloc(30, 9)]));
  assert.deepEqual(dotenvAssignmentCompatibility.recoveryKey, Buffer.alloc(32, 7));
  assert.deepEqual(dotenvAssignmentCompatibility.sessionKey, Buffer.alloc(32, 5));
  assert.throws(() => loadConfig({ ...productionEnvironment, DATA_ENCRYPTION_KEY: `OTHER_KEY=${productionEnvironment.DATA_ENCRYPTION_KEY}` }), /unsupported encoding or byte length/u);
  const literalKeys = loadConfig({
    ...productionEnvironment,
    DATA_ENCRYPTION_KEY: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    RECOVERY_ENCRYPTION_KEY: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  });
  assert.deepEqual(literalKeys.dataKey, Buffer.from("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "utf8"));
  assert.deepEqual(literalKeys.recoveryKey, Buffer.from("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "utf8"));
  assert.throws(() => loadConfig({ ...productionEnvironment, DATA_ENCRYPTION_KEY: Buffer.alloc(31, 2).toString("hex") }), /unsupported encoding or byte length/u);
  const encodedAuth = Buffer.from('{"test":"owned-auth-state"}').toString("base64url");
  const secretStoreConfig = loadConfig({ ...productionEnvironment, CODEX_APP_SERVER_AUTH_PATH: "", CODEX_APP_SERVER_AUTH_B64: encodedAuth });
  assert.deepEqual(secretStoreConfig.codexAuthBytes, Buffer.from('{"test":"owned-auth-state"}'));
  assert.equal(secretStoreConfig.readyForProvider, true);
  const compressedAuth = gzipSync(Buffer.from('{"test":"owned-auth-state"}', "utf8")).toString("base64url");
  assert.deepEqual(loadConfig({ ...productionEnvironment, CODEX_APP_SERVER_AUTH_PATH: "", CODEX_APP_SERVER_AUTH_GZIP_B64: compressedAuth }).codexAuthBytes, Buffer.from('{"test":"owned-auth-state"}'));
  assert.throws(() => loadConfig({ ...productionEnvironment, CODEX_APP_SERVER_AUTH_B64: encodedAuth, CODEX_APP_SERVER_AUTH_GZIP_B64: compressedAuth }), /only one Codex app-server auth secret/u);
  assert.throws(() => loadConfig({ ...productionEnvironment, CODEX_APP_SERVER_AUTH_PATH: "", CODEX_APP_SERVER_AUTH_B64: "not+base64url" }), /base64url/u);
  assert.equal(loadConfig({ ...productionEnvironment, RUNTIME_INSTRUCTIONS_BOOTSTRAP_B64: "obsolete" }).runtimeInstructionsBootstrap, undefined);
  const managedDatabaseConfig = loadConfig({ ...productionEnvironment, DATABASE_URL: "", DATABASE_SSL_CA_PATH: "", DB_HOST: "mysql.internal", DB_PORT: "3306", DB_NAME: "owned", DB_USER: "owner", DB_PASSWORD: "contains:a/slash", OWNER_GOOGLE_SUBJECT: "", SETTINGS_OWNER_GOOGLE_EMAIL: "OWNER@EXAMPLE.COM" });
  assert.equal(managedDatabaseConfig.databaseUrl, "mysql://owner:contains%3Aa%2Fslash@mysql.internal:3306/owned");
  assert.equal(managedDatabaseConfig.google.ownerEmail, "owner@example.com");
  const manuallyCreated = { id: "session-id", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  assert.match(production.sessionCookie(manuallyCreated), /^__Host-nanoduck-session=/u);
  assert.match(production.sessionCookie(manuallyCreated), /; Secure$/u);
});

test("sessions have a fixed 24-hour lifetime that consent activity cannot extend", async () => {
  const store = createMemoryStore();
  const auth = createAuth({ config: loadConfig({ NODE_ENV: "development", DEV_OWNER_EMAIL: "owner@local.test" }), store });
  const active = await auth.developmentSignIn();
  const beforeConsent = await store.session(active.id);
  await auth.consent({ headers: { cookie: auth.sessionCookie(active).split(";", 1)[0], "x-csrf-token": active.csrfToken } });
  const afterConsent = await store.session(active.id);
  assert.equal(afterConsent.expiresAt, beforeConsent.expiresAt);

  const expired = { id: "expired-session-id", ownerSubject: "development:owner@local.test", csrfToken: "expired-csrf-token", consentedAt: new Date().toISOString(), issuedAt: new Date(Date.now() - 86_400_000).toISOString(), expiresAt: new Date(Date.now() - 1).toISOString() };
  await store.createSession(expired);
  const expiredCookie = auth.sessionCookie(expired).split(";", 1)[0];
  assert.equal(await auth.session({ headers: { cookie: expiredCookie } }), undefined);
  assert.equal(await auth.require({ headers: { cookie: expiredCookie } }), undefined);
});

test("Google callback requires the nonce bound to its signed OAuth flow", async () => {
  const config = loadConfig({ NODE_ENV: "production", APP_ORIGIN: "https://consulting.example.com", DATABASE_URL: "mysql://user:password@host/database", DATABASE_SSL_CA_PATH: "/run/secrets/mysql-ca.pem", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64url"), RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64url"), SESSION_SIGNING_KEY: Buffer.alloc(32, 5).toString("base64url"), OWNER_GOOGLE_SUBJECT: "owner-subject", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", CODEX_APP_SERVER_AUTH_PATH: "/run/secrets/codex-auth.json" });
  const establish = async nonce => {
    let authorization;
    const auth = createAuth({
      config,
      store: createMemoryStore(),
      createOAuthClient: () => ({
        generateAuthUrl(options) { authorization = options; return `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(options.state)}`; },
        async getToken() { return { tokens: { id_token: "test-id-token" } }; },
        async verifyIdToken() { return { getPayload: () => ({ sub: "owner-subject", email_verified: true, iss: "https://accounts.google.com", nonce }) }; }
      })
    });
    const flow = await auth.beginGoogle();
    const state = new URL(flow.location).searchParams.get("state");
    return { result: auth.finishGoogle(`https://consulting.example.com/auth/google/callback?code=one-time-code&state=${encodeURIComponent(state)}`, { headers: { cookie: flow.cookie } }), authorization };
  };

  const mismatched = await establish(undefined);
  assert.equal(typeof mismatched.authorization.nonce, "string");
  assert.equal(await mismatched.result, undefined);

  let authorization;
  const auth = createAuth({
    config,
    store: createMemoryStore(),
    createOAuthClient: () => ({
      generateAuthUrl(options) { authorization = options; return `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(options.state)}`; },
      async getToken() { return { tokens: { id_token: "test-id-token" } }; },
      async verifyIdToken() { return { getPayload: () => ({ sub: "owner-subject", email_verified: true, iss: "https://accounts.google.com", nonce: authorization.nonce }) }; }
    })
  });
  const flow = await auth.beginGoogle();
  const state = new URL(flow.location).searchParams.get("state");
  assert.ok(await auth.finishGoogle(`https://consulting.example.com/auth/google/callback?code=one-time-code&state=${encodeURIComponent(state)}`, { headers: { cookie: flow.cookie } }));

  let emailAuthorization;
  const emailConfig = loadConfig({ NODE_ENV: "production", APP_ORIGIN: "https://consulting.example.com", DATABASE_URL: "mysql://user:password@host/database", DATA_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64url"), RECOVERY_ENCRYPTION_KEY: Buffer.alloc(32, 6).toString("base64url"), SESSION_SIGNING_KEY: Buffer.alloc(32, 5).toString("base64url"), OWNER_GOOGLE_EMAIL: "owner@example.com", GOOGLE_CLIENT_ID: "client", GOOGLE_CLIENT_SECRET: "secret", CODEX_APP_SERVER_AUTH_PATH: "/run/secrets/codex-auth.json" });
  const emailAuth = createAuth({
    config: emailConfig,
    store: createMemoryStore(),
    createOAuthClient: () => ({
      generateAuthUrl(options) { emailAuthorization = options; return `https://accounts.google.com/o/oauth2/auth?state=${encodeURIComponent(options.state)}`; },
      async getToken() { return { tokens: { id_token: "test-id-token" } }; },
      async verifyIdToken() { return { getPayload: () => ({ sub: "stable-subject", email: "OWNER@example.com", email_verified: true, iss: "https://accounts.google.com", nonce: emailAuthorization.nonce }) }; }
    })
  });
  const emailFlow = await emailAuth.beginGoogle();
  const emailState = new URL(emailFlow.location).searchParams.get("state");
  assert.equal((await emailAuth.finishGoogle(`https://consulting.example.com/auth/google/callback?code=one-time-code&state=${encodeURIComponent(emailState)}`, { headers: { cookie: emailFlow.cookie } })).session.ownerSubject, "stable-subject");
});

test("MySQL retry preserves the snapshot and serializes failed-run recovery with active work", async t => {
  for (const scenario of [
    { status: "failed", busy: false, affectedRows: 1, allowed: true },
    { status: "stopped", busy: false, affectedRows: 1, allowed: true },
    { status: "failed", busy: true, affectedRows: 1, allowed: false },
    { status: "failed", busy: false, affectedRows: 0, allowed: false },
    { status: "complete", busy: false, affectedRows: 1, allowed: false }
  ]) await t.test(JSON.stringify(scenario), async () => {
    const commands = []; const snapshot = { ...defaultSettings };
    const connection = {
      async beginTransaction() { commands.push({ statement: "BEGIN" }); },
      async commit() { commands.push({ statement: "COMMIT" }); },
      async rollback() { commands.push({ statement: "ROLLBACK" }); },
      release() {},
      async execute(statement, values = []) {
        commands.push({ statement, values });
        if (statement.startsWith("SELECT owner_id")) return [[{ owner_id: "owner" }]];
        if (statement.startsWith("SELECT id,conversation_id,status")) return [[{ id: "run", conversation_id: "conversation", status: scenario.status, generation: 4, snapshot_json: snapshot, created_at: "2026-09-18T00:00:00.000Z" }]];
        if (statement.startsWith("SELECT id FROM nanoduck_runs")) return [scenario.busy ? [{ id: "another-run" }] : []];
        if (statement.startsWith("UPDATE nanoduck_runs")) return [{ affectedRows: scenario.affectedRows }];
        throw new Error(`Unexpected query: ${statement}`);
      }
    };
    const store = await createMySqlStore("mysql://unused", key, undefined, { createPool: () => ({ getConnection: async () => connection, end: async () => {} }) });
    const run = await store.continueRun("conversation");
    assert.equal(Boolean(run), scenario.allowed);
    assert.equal(commands[1].statement, "SELECT owner_id FROM nanoduck_owner_locks WHERE owner_id='owner' FOR UPDATE");
    if (run) { assert.equal(run.generation, 5); assert.deepEqual(run.snapshot, snapshot); }
    const update = commands.find(item => item.statement.startsWith("UPDATE"));
    if (update) { assert.match(update.statement, /generation=\? AND status=\?/u); assert.deepEqual(update.values.slice(1), ["run", 4, scenario.status]); }
    assert.equal(commands.at(-1).statement, scenario.allowed ? "COMMIT" : "ROLLBACK");
  });
});

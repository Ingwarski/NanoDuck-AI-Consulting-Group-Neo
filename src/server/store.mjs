import { readConfiguration, replaceConfiguration } from "./configuration-recovery.mjs";
import { databaseLockName } from "./database-lock.mjs";
import { createMemoryDocuments, createMySqlDocuments } from "./instruction-documents.mjs";
import { sealRunSnapshot, openRunSnapshot } from "./run-snapshot.mjs";
import { randomId, encryptText, decryptText, encryptBytes, decryptBytes } from "./crypto.mjs";
import { normalizeRecoverySnapshot } from "./recovery.mjs";
import { normalizeUsageAttempt, summarizeUsage, usageWithSavedEffort } from "./usage.mjs";
import { validateLocalState } from "./local-state.mjs";
import { validateParallelTransition } from "./parallel-contract.mjs";
import { maximumMessageBytes } from "./validation.mjs";

const defaults = Object.freeze({
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

const now = () => new Date().toISOString();
const idForMessage = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
const storableMessageBody = value => typeof value === "string" && value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= maximumMessageBytes;
const databaseConnectionErrorCodes = new Set(["PROTOCOL_CONNECTION_LOST", "PROTOCOL_SEQUENCE_TIMEOUT", "PROTOCOL_PACKETS_OUT_OF_ORDER", "ECONNRESET", "ECONNREFUSED", "EPIPE", "ETIMEDOUT", "ER_CLIENT_INTERACTION_TIMEOUT", "ER_SERVER_SHUTDOWN", "ER_CONNECTION_KILLED", "ER_UNKNOWN_ERROR", "LEADERSHIP_HEARTBEAT_TIMEOUT", "LEADERSHIP_OWNERSHIP_LOST"]);
const safeDatabaseErrorCode = error => error?.code === 4031 ? "ER_CLIENT_INTERACTION_TIMEOUT" : databaseConnectionErrorCodes.has(error?.code) ? error.code : "UNKNOWN_DATABASE_ERROR";
const safeDatabaseErrorNumber = error => error?.code === 4031 ? 4031 : Number.isInteger(error?.errno) && error.errno >= 0 && error.errno <= 65_535 ? error.errno : undefined;
const publicAttachment = attachment => Object.freeze({ id: attachment.id, contentType: attachment.contentType, byteLength: attachment.byteLength, createdAt: attachment.createdAt });
const publicMessage = message => Object.freeze({ id: message.id, role: message.role, recipient: message.recipient ?? null, body: message.body, sequence: message.sequence, createdAt: message.createdAt, sources: message.sources ?? [], attachments: message.attachments ?? [] });
const recoverySnapshot = (conversations, configuration) => normalizeRecoverySnapshot({ schemaVersion: 1, kind: "nanoduck-owner-records", createdAt: now(), conversations, ...(configuration ? { configuration } : {}) });
const storedJson = (value, kind) => {
  const source = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  try {
    const parsed = typeof source === "string" ? JSON.parse(source) : source;
    if (parsed === null || typeof parsed !== "object") throw new Error("invalid_stored_json");
    return parsed;
  } catch {
    throw new Error(`stored_${kind}_invalid`);
  }
};
const storedObject = (value, kind) => {
  const parsed = storedJson(value, kind);
  if (Array.isArray(parsed)) throw new Error(`stored_${kind}_invalid`);
  return parsed;
};
const storedArray = (value, kind) => {
  const parsed = storedJson(value, kind);
  if (!Array.isArray(parsed)) throw new Error(`stored_${kind}_invalid`);
  return parsed;
};

export function createMemoryStore(initialState = undefined) {
  const conversations = new Map();
  const usage = new Map();
  const messages = new Map();
  const attachments = new Map();
  const runs = new Map();
  const requests = new Map();
  const sessions = new Map();
  const documents = createMemoryDocuments();
  let settings = { ...defaults };
  let runtimeInstructions;
  const runtimeInstructionHistory = new Map();

  const runtimeVersion = (contract, action, restoredFromId = null) => {
    const createdAt = now();
    const record = { id: randomId(), markdown: contract.markdown, contentHash: contract.revision, action, restoredFromId, createdAt };
    runtimeInstructionHistory.set(record.id, record);
    return Object.freeze({ markdown: record.markdown, revision: record.id, contentHash: record.contentHash, updatedAt: createdAt });
  };
  const historySummary = record => Object.freeze({ id: record.id, contentHash: record.contentHash, action: record.action, restoredFromId: record.restoredFromId, createdAt: record.createdAt });

  const snapshotState = () => structuredClone({
    schemaVersion: 1, kind: "nanoduck-local-state",
    conversations: [...conversations], messages: [...messages], usage: [...usage],
    attachments: [...attachments].map(([id, item]) => [id, { ...item, content: item.content.toString("base64url") }]),
    runs: [...runs], requests: [...requests], sessions: [...sessions], settings,
    runtimeInstructions: runtimeInstructions ?? null, runtimeInstructionHistory: [...runtimeInstructionHistory],
    documents: documents.exportDocuments()
  });
  const restoreState = input => {
    const state = validateLocalState(input);
    for (const [target, records] of [[usage, state.usage ?? []], [conversations, state.conversations], [messages, state.messages], [runs, state.runs], [requests, state.requests], [sessions, state.sessions], [runtimeInstructionHistory, state.runtimeInstructionHistory]]) {
      target.clear(); for (const [key, value] of records) target.set(key, value);
    }
    attachments.clear(); for (const [key, value] of state.attachments) attachments.set(key, { ...value, content: Buffer.from(value.content, "base64url") });
    settings = state.settings; runtimeInstructions = state.runtimeInstructions ?? undefined;
    for (const request of requests.values()) {
      const current = runs.get(request.run?.conversationId);
      if (current?.id === request.runId) request.run = current;
    }
    documents.replaceDocuments(state.documents);
  };
  if (initialState !== undefined) restoreState(initialState);
  const hasActiveRun = () => [...runs.values()].some(run => run.status === "active");
  const forgetRequests = conversationId => { for (const key of requests.keys()) if (key.startsWith(`${conversationId}:`)) requests.delete(key); };
  return Object.freeze({
    kind: "memory",
    snapshotState, restoreState,
    ...documents,
    async recordUsage(conversationId, input) {
      const conversation = conversations.get(conversationId);
      if (!conversation || conversation.deletedAt) return false;
      const attempt = normalizeUsageAttempt(input);
      if (!attempt) throw new Error("invalid_usage");
      const entries = usage.get(conversationId) ?? [];
      const index = entries.findIndex(item => item.id === attempt.id);
      if (index >= 0) {
        const prior = entries[index];
        if (["provider", "model", "startedAt"].some(key => prior[key] !== attempt[key]) || (prior.attribution && JSON.stringify(prior.attribution) !== JSON.stringify(attempt.attribution))) throw new Error("invalid_usage");
        if (!["running", "interrupted"].includes(prior.status)) return false;
        entries[index] = attempt;
      } else entries.push(attempt);
      usage.set(conversationId, entries); return true;
    },
    async interruptUsage() {
      for (const entries of usage.values()) for (const attempt of entries) if (attempt.status === "running") attempt.status = "interrupted";
    },
    async usageSummary(conversationId = undefined) {
      if (conversationId && (!conversations.has(conversationId) || conversations.get(conversationId).deletedAt)) return undefined;
      return summarizeUsage([...conversations.values()].filter(item => !item.deletedAt && (!conversationId || item.id === conversationId)).map(item => {
        const snapshot = runs.get(item.id)?.snapshot;
        const owners = (messages.get(item.id) ?? []).filter(message => message.role === "owner");
        const work = snapshot?.parallelWork;
        return { conversationId: item.id, hasMessages: owners.length > 0, activity: work ? { consultants: work.assignments.length, reviewRounds: work.rounds.length, correctionOrders: work.orders.length, partial: owners.some(owner => !work.ownerMessageIds.includes(owner.id)) } : null,
          usage: (usage.get(item.id) ?? []).map(attempt => usageWithSavedEffort(attempt, snapshot, owners)) };
      }));
    },
    async createSession(input) { sessions.set(input.id, { ...input }); return { ...input }; },
    async session(id) { const item = sessions.get(id); return item ? { ...item } : undefined; },
    async updateSession(id, patch) { const item = sessions.get(id); if (!item || item.revokedAt) return undefined; Object.assign(item, patch); return { ...item }; },
    async revokeSession(id) { const item = sessions.get(id); if (!item) return false; item.revokedAt = now(); return true; },
    async settings() { return Object.freeze({ ...settings }); },
    async saveSettings(next) { settings = { ...next }; return Object.freeze({ ...settings }); },
    async runtimeInstructions() { return runtimeInstructions ? Object.freeze({ ...runtimeInstructions }) : undefined; },
    async bootstrapRuntimeInstructions(contract) {
      if (!runtimeInstructions) runtimeInstructions = runtimeVersion(contract, "bootstrap");
      return Object.freeze({ ...runtimeInstructions });
    },
    async migrateRuntimeInstructions(transform) {
      if (!runtimeInstructions) return undefined;
      const next = transform(runtimeInstructions.markdown);
      if (!next || next.revision === runtimeInstructions.contentHash) return Object.freeze({ ...runtimeInstructions });
      runtimeInstructions = runtimeVersion(next, "routing_migration", runtimeInstructions.revision);
      return Object.freeze({ ...runtimeInstructions });
    },
    async saveRuntimeInstructions(next, expectedRevision) {
      if (!runtimeInstructions || runtimeInstructions.revision !== expectedRevision) return undefined;
      runtimeInstructions = runtimeVersion(next, "save");
      return Object.freeze({ ...runtimeInstructions });
    },
    async listRuntimeInstructionHistory() { return [...runtimeInstructionHistory.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(historySummary); },
    async runtimeInstructionVersion(id) {
      const record = runtimeInstructionHistory.get(id);
      return record ? Object.freeze({ ...historySummary(record), markdown: record.markdown }) : undefined;
    },
    async restoreRuntimeInstructions(next, expectedRevision, restoredFromId) {
      if (!runtimeInstructions || runtimeInstructions.revision !== expectedRevision || !runtimeInstructionHistory.has(restoredFromId)) return undefined;
      runtimeInstructions = runtimeVersion(next, "restore", restoredFromId);
      return Object.freeze({ ...runtimeInstructions });
    },
    async listConversations() {
      return [...conversations.values()].filter(item => !item.deletedAt).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(item => ({ ...item }));
    },
    async createConversation() {
      const item = { id: randomId(), title: "New consultation", createdAt: now(), updatedAt: now(), deletedAt: null };
      conversations.set(item.id, item); messages.set(item.id, []); return { ...item };
    },
    async getConversation(conversationId) {
      const item = conversations.get(conversationId);
      return item && !item.deletedAt ? { ...item } : undefined;
    },
    async events(conversationId, after = 0) {
      return (messages.get(conversationId) ?? []).filter(message => message.sequence > after).map(publicMessage);
    },
    async createAttachment(conversationId, input) {
      const conversation = conversations.get(conversationId);
      if (!conversation || conversation.deletedAt || hasActiveRun()) return undefined;
      const attachment = { id: randomId(), conversationId, messageId: null, contentType: input.contentType, byteLength: input.byteLength, content: Buffer.from(input.content), createdAt: now() };
      attachments.set(attachment.id, attachment); return publicAttachment(attachment);
    },
    async attachment(conversationId, attachmentId) {
      const attachment = attachments.get(attachmentId);
      if (!attachment || attachment.conversationId !== conversationId || !attachment.messageId || conversations.get(conversationId)?.deletedAt) return undefined;
      return Object.freeze({ ...publicAttachment(attachment), content: Buffer.from(attachment.content) });
    },
    async deletePendingAttachment(conversationId, attachmentId) {
      const attachment = attachments.get(attachmentId);
      if (!attachment || attachment.conversationId !== conversationId || attachment.messageId) return false;
      attachments.delete(attachmentId); return true;
    },
    async acceptMessage(conversationId, input, snapshot) {
      if (!storableMessageBody(input?.body)) return undefined;
      const conversation = conversations.get(conversationId);
      if (!conversation || conversation.deletedAt) return undefined;
      const requestKey = `${conversationId}:${input.clientRequestId}`;
      const existing = requests.get(requestKey);
      if (existing) {
        const message = (messages.get(conversationId) ?? []).find(item => item.id === existing.messageId);
        const current = runs.get(conversationId);
        const run = existing.run ?? (current?.id === existing.runId ? current : undefined);
        if (!message || run?.id !== existing.runId || message.body !== input.body || JSON.stringify(message.attachments.map(a => a.id).sort()) !== JSON.stringify([...(input.attachmentIds ?? [])].sort())) return undefined;
        return structuredClone({ message: publicMessage(message), run, replayed: true });
      }
      if (hasActiveRun()) return undefined;
      const linked = (input.attachmentIds ?? []).map(attachmentId => attachments.get(attachmentId));
      if (linked.some(attachment => !attachment || attachment.conversationId !== conversationId || attachment.messageId)) return undefined;
      const stream = messages.get(conversationId) ?? [];
      const message = { id: randomId(), role: "owner", body: input.body, sequence: stream.length + 1, createdAt: now(), sources: [], attachments: linked.map(publicAttachment) };
      linked.forEach(attachment => { attachment.messageId = message.id; });
      stream.push(message); messages.set(conversationId, stream);
      const run = { id: randomId(), conversationId, status: "active", generation: (runs.get(conversationId)?.generation ?? 0) + 1, snapshot: { ...structuredClone(snapshot), requestMessageId: message.id }, createdAt: now(), updatedAt: now() };
      runs.set(conversationId, run); conversation.updatedAt = now();
      const result = { message: publicMessage(message), run: { ...run }, replayed: false }; requests.set(requestKey, { messageId: message.id, runId: run.id, run }); return result;
    },
    async run(conversationId) { const run = runs.get(conversationId); return run ? { ...run } : undefined; },
    async activeRuns() { return [...runs.values()].filter(run => run.status === "active").map(run => ({ ...run })); },
    async appendAgentMessage(conversationId, generation, item) {
      if (!storableMessageBody(item?.body)) return undefined;
      const run = runs.get(conversationId); const conversation = conversations.get(conversationId);
      if (!run || run.status !== "active" || run.generation !== generation || !conversation || conversation.deletedAt) return undefined;
      const stream = messages.get(conversationId) ?? [];
      const message = { id: randomId(), role: item.role, recipient: item.recipient, body: item.body, sources: item.sources ?? [], sequence: stream.length + 1, createdAt: now() };
      stream.push(message); messages.set(conversationId, stream); conversation.updatedAt = now(); run.updatedAt = now(); return publicMessage(message);
    },
    async updateRunSnapshot(conversationId, generation, snapshot) {
      const run = runs.get(conversationId);
      if (!run || run.status !== "active" || run.generation !== generation) return undefined;
      if (snapshot.requestMessageId !== run.snapshot.requestMessageId) return undefined;
      run.snapshot = Object.freeze({ ...snapshot }); run.updatedAt = now(); return { ...run };
    },
    async commitParallelWork(conversationId, generation, expectedRevision, work, additions = []) {
      const run = runs.get(conversationId); const conversation = conversations.get(conversationId);
      if (!run || run.status !== "active" || run.generation !== generation || run.snapshot?.contractVersion !== "parallel-v1" || !conversation || conversation.deletedAt) return undefined;
      if (run.snapshot.requestMessageId && JSON.stringify(work.ownerMessageIds) !== JSON.stringify([run.snapshot.requestMessageId])) return undefined;
      const before = run.snapshot.parallelWork;
      if ((before?.revision ?? -1) !== expectedRevision || !Array.isArray(additions)) return undefined;
      const stream = messages.get(conversationId) ?? [];
      const ids = new Set(stream.map(item => item.id));
      if (additions.some(item => !item || !idForMessage(item.id) || ids.has(item.id) || typeof item.role !== "string" || !item.role || !storableMessageBody(item.body) || !Array.isArray(item.sources ?? []))) return undefined;
      for (const item of additions) ids.add(item.id);
      if (ids.size !== stream.length + additions.length || !validateParallelTransition(before, work, additions, stream)) return undefined;
      const committed = additions.map((item, index) => ({ id: item.id, role: item.role, recipient: item.recipient, body: item.body, sources: item.sources ?? [], sequence: stream.length + index + 1, createdAt: now() }));
      stream.push(...committed); messages.set(conversationId, stream);
      run.snapshot = { ...run.snapshot, parallelWork: structuredClone(work) }; run.updatedAt = now(); conversation.updatedAt = now();
      return { revision: work.revision, messages: committed.map(publicMessage) };
    },
    async finishRun(conversationId, generation, status, completedTitle = undefined) {
      const run = runs.get(conversationId); if (!run || run.generation !== generation || run.status !== "active") return false;
      run.status = status; run.updatedAt = now();
      const conversation = conversations.get(conversationId);
      if (status === "complete" && conversation && conversation.title === "New consultation" && typeof completedTitle === "string" && completedTitle.trim()) conversation.title = completedTitle.trim();
      if (conversation) conversation.updatedAt = now();
      return true;
    },
    async stop(conversationId) {
      const run = runs.get(conversationId); if (!run || run.status !== "active") return undefined;
      run.generation += 1; run.status = "stopped"; run.updatedAt = now(); return { ...run };
    },
    async continueRun(conversationId) {
      const run = runs.get(conversationId); if (!run || !["stopped", "failed"].includes(run.status) || hasActiveRun()) return undefined;
      run.generation += 1; run.status = "active"; run.updatedAt = now(); return { ...run };
    },
    async exportConversation(conversationId) {
      const conversation = conversations.get(conversationId); if (!conversation || conversation.deletedAt) return undefined;
      return Object.freeze({ conversation: { ...conversation }, messages: (messages.get(conversationId) ?? []).map(publicMessage) });
    },
    async recoverySnapshot() {
      return recoverySnapshot([...conversations.values()].map(conversation => ({ conversation: { ...conversation }, usage: conversation.deletedAt ? [] : structuredClone(usage.get(conversation.id) ?? []), messages: conversation.deletedAt ? [] : (messages.get(conversation.id) ?? []).map(publicMessage), attachments: conversation.deletedAt ? [] : [...attachments.values()].filter(attachment => attachment.conversationId === conversation.id && attachment.messageId).map(attachment => ({ ...publicAttachment(attachment), messageId: attachment.messageId, content: attachment.content.toString("base64url") })) })), { settings, runtimeInstructions, runtimeHistory: [...runtimeInstructionHistory.values()], documents: documents.exportDocuments() });
    },
    async restoreRecovery(snapshot, { restoreConfiguration = false } = {}) {
      const recovered = normalizeRecoverySnapshot(snapshot); if (!recovered) return undefined;
      if (restoreConfiguration && recovered.configuration) {
        settings = structuredClone(recovered.configuration.settings);
        runtimeInstructions = structuredClone(recovered.configuration.runtimeInstructions);
        runtimeInstructionHistory.clear();
        for (const item of recovered.configuration.runtimeHistory) runtimeInstructionHistory.set(item.id, structuredClone(item));
        documents.replaceDocuments(recovered.configuration.documents);
        for (const session of sessions.values()) session.revokedAt = now();
      }
      let restored = 0; let tombstones = 0; let preservedTombstones = 0;
      for (const record of [...recovered.conversations.filter(item => item.conversation.deletedAt), ...recovered.conversations.filter(item => !item.conversation.deletedAt)]) {
        const id = record.conversation.id; const existing = conversations.get(id);
        if (existing?.deletedAt) { preservedTombstones += 1; continue; }
        if (record.conversation.deletedAt) {
          conversations.set(id, { ...record.conversation, title: "Deleted consultation" }); messages.set(id, []); for (const attachment of [...attachments.values()].filter(item => item.conversationId === id)) attachments.delete(attachment.id); const run = runs.get(id); if (run) { run.generation += 1; run.status = "deleted"; run.snapshot = {}; run.updatedAt = record.conversation.deletedAt; }
          usage.delete(id); forgetRequests(id); tombstones += 1; continue;
        }
        if (existing) continue;
        usage.set(id, structuredClone(record.usage ?? []));
        conversations.set(id, { ...record.conversation }); messages.set(id, record.messages.map(item => ({ ...item, sources: [...item.sources], attachments: [...item.attachments] }))); for (const attachment of record.attachments) attachments.set(attachment.id, { ...attachment, conversationId: id, content: Buffer.from(attachment.content, "base64url") }); restored += 1;
      }
      return Object.freeze({ restored, tombstones, preservedTombstones });
    },
    async deleteConversation(conversationId) {
      const conversation = conversations.get(conversationId); if (!conversation || conversation.deletedAt) return false;
      forgetRequests(conversationId); usage.delete(conversationId);
      conversation.title = "Deleted consultation"; conversation.deletedAt = now(); conversation.updatedAt = conversation.deletedAt; messages.set(conversationId, []); for (const attachment of [...attachments.values()].filter(item => item.conversationId === conversationId)) attachments.delete(attachment.id); const run = runs.get(conversationId); if (run) { run.generation += 1; run.status = "deleted"; run.snapshot = {}; } return true;
    },
    async deleteConversations(conversationIds) {
      const deleted = [];
      for (const conversationId of conversationIds) if (await this.deleteConversation(conversationId)) deleted.push(conversationId);
      return Object.freeze(deleted);
    }
  });
}

export async function createMySqlStore(databaseUrl, dataKey, databaseSsl = { rejectUnauthorized: true }, driver = undefined) {
  if (!databaseSsl || typeof databaseSsl !== "object" || databaseSsl.rejectUnauthorized !== true) {
    throw new Error("MySQL TLS must verify the server certificate.");
  }
  const mutableDatabaseSsl = { ...databaseSsl, rejectUnauthorized: true };
  const { createPool } = driver ?? await import("mysql2/promise");
  const pool = createPool({ uri: databaseUrl, ssl: mutableDatabaseSsl, connectionLimit: 8, waitForConnections: true, queueLimit: 32, connectTimeout: 10_000 });
  const query = (statement, values = []) => pool.execute(statement, values);
  const runtimeDocument = row => Object.freeze({ markdown: decryptText({ iv: row.iv, ciphertext: row.ciphertext, tag: row.tag }, dataKey), revision: row.revision, contentHash: row.content_hash, updatedAt: row.updated_at });
  const runtimeHistorySummary = row => Object.freeze({ id: row.id, contentHash: row.content_hash, action: row.action, restoredFromId: row.restored_from_id, createdAt: row.created_at });
  const nextRuntimeRecord = (contract, action, restoredFromId = null) => {
    const createdAt = now(); const encrypted = encryptText(contract.markdown, dataKey);
    return Object.freeze({ id: randomId(), action, restoredFromId, contentHash: contract.revision, createdAt, ...encrypted });
  };
  const insertRuntimeHistory = (connection, record) => connection.execute("INSERT INTO nanoduck_runtime_instruction_history (id,owner_id,action,restored_from_id,ciphertext,iv,tag,content_hash,created_at) VALUES (?,'owner',?,?,?,?,?,?,?)", [record.id,record.action,record.restoredFromId,record.ciphertext,record.iv,record.tag,record.contentHash,record.createdAt]);
  const decode = (row, attachments = []) => ({ id: row.id, role: row.role, recipient: row.recipient, body: decryptText({ iv: row.iv, ciphertext: row.ciphertext, tag: row.tag }, dataKey), sequence: row.sequence, createdAt: row.created_at, sources: storedArray(row.sources_json, "sources"), attachments });
  const decodeUsage = row => {
    let attempt;
    try { attempt = normalizeUsageAttempt(JSON.parse(decryptText({ iv: row.iv, ciphertext: row.ciphertext, tag: row.tag }, dataKey))); }
    catch { throw new Error("stored_usage_invalid"); }
    if (!attempt || attempt.id !== row.id || attempt.provider !== row.provider || attempt.model !== row.model || attempt.status !== row.status || attempt.startedAt !== row.started_at || (attempt.finishedAt ?? null) !== (row.finished_at ?? null)) throw new Error("stored_usage_invalid");
    return attempt;
  };
  const encodeUsage = attempt => encryptText(JSON.stringify(attempt), dataKey);
  const attachmentMetadata = row => publicAttachment({ id: row.id, contentType: row.content_type, byteLength: Number(row.byte_length), createdAt: row.created_at });
  const validRunBinding = async (execute, conversationId, runId, snapshot) => {
    if (snapshot?.requestMessageId === undefined) return snapshot?.contractVersion !== "parallel-v1" && snapshot?.parallelWork === undefined;
    if (!idForMessage(snapshot.requestMessageId)) return false;
    if (snapshot.parallelWork && JSON.stringify(snapshot.parallelWork.ownerMessageIds) !== JSON.stringify([snapshot.requestMessageId])) return false;
    const [rows] = await execute("SELECT m.id FROM nanoduck_messages m JOIN nanoduck_requests r ON r.conversation_id=m.conversation_id AND r.message_id=m.id WHERE m.conversation_id=? AND m.id=? AND m.role='owner' AND m.recipient IS NULL AND r.run_id=? LIMIT 1", [conversationId, snapshot.requestMessageId, runId]);
    return rows.length === 1;
  };
  const attachmentsByMessage = async conversationId => {
    const [rows] = await query("SELECT id,message_id,content_type,byte_length,created_at FROM nanoduck_attachments WHERE conversation_id=? AND message_id IS NOT NULL ORDER BY created_at", [conversationId]);
    return rows.reduce((grouped, row) => {
      const values = grouped.get(row.message_id) ?? [];
      values.push(attachmentMetadata(row)); grouped.set(row.message_id, values); return grouped;
    }, new Map());
  };
  const lockOwner = async connection => {
    const [rows] = await connection.execute("SELECT owner_id FROM nanoduck_owner_locks WHERE owner_id='owner' FOR UPDATE");
    if (rows.length !== 1) throw new Error("owner_lock_missing");
  };
  let leadership;
  let leadershipLost = () => {};
  let leadershipAcquired = () => {};
  let heartbeatTimer;
  let heartbeatDeadline;
  let heartbeatPending = false;
  let leadershipFailed = false;
  let closed = false;
  const timers = driver?.leadershipTimers ?? { setTimeout, clearTimeout };
  const clearHeartbeat = () => {
    timers.clearTimeout(heartbeatTimer); timers.clearTimeout(heartbeatDeadline);
    heartbeatTimer = undefined; heartbeatDeadline = undefined;
  };
  const loseLeadership = (connection, error) => {
    if (leadership !== connection) return;
    leadership = undefined; leadershipFailed = true; clearHeartbeat();
    connection.destroy();
    leadershipLost(safeDatabaseErrorCode(error), safeDatabaseErrorNumber(error));
  };
  const lockName = databaseLockName(databaseUrl);
  const scheduleHeartbeat = (connection, intervalMs) => {
    if (leadership !== connection) return;
    heartbeatTimer = timers.setTimeout(() => {
      heartbeatTimer = undefined;
      if (leadership !== connection) return;
      heartbeatPending = true;
      const timeout = Math.min(10_000, intervalMs);
      heartbeatDeadline = timers.setTimeout(() => loseLeadership(connection, { code: "LEADERSHIP_HEARTBEAT_TIMEOUT" }), timeout);
      heartbeatDeadline.unref?.();
      void Promise.resolve().then(() => connection.execute({ sql: "SELECT IS_USED_LOCK(?) = CONNECTION_ID() AS owned", timeout }, [lockName])).then(([rows]) => {
        if (leadership !== connection) return;
        if (Number(rows[0]?.owned) !== 1) return loseLeadership(connection, { code: "LEADERSHIP_OWNERSHIP_LOST" });
        timers.clearTimeout(heartbeatDeadline); heartbeatDeadline = undefined;
        scheduleHeartbeat(connection, intervalMs);
      }).catch(error => loseLeadership(connection, error)).finally(() => { heartbeatPending = false; });
    }, intervalMs);
    heartbeatTimer.unref?.();
  };
  return Object.freeze({
    onLeadershipLost(callback) { leadershipLost = callback; },
    onLeadershipAcquired(callback) { leadershipAcquired = callback; },
    async acquireLeadership() {
      if (leadership) return true;
      if (closed || leadershipFailed) return false;
      const connection = await pool.getConnection();
      try {
        const [rows] = await connection.execute({ sql: "SELECT GET_LOCK(?, 0) AS acquired, @@SESSION.wait_timeout AS idleTimeoutSeconds", timeout: 10_000 }, [lockName]);
        if (Number(rows[0]?.acquired) !== 1) { connection.release(); return false; }
        const idleTimeoutSeconds = Number(rows[0]?.idleTimeoutSeconds);
        if (!Number.isSafeInteger(idleTimeoutSeconds) || idleTimeoutSeconds < 1) throw new Error("Database session idle timeout is invalid.");
        const intervalMs = Math.max(100, Math.min(15_000, Math.floor(idleTimeoutSeconds * 1000 / 3)));
        leadership = connection;
        connection.on?.("error", error => loseLeadership(connection, error));
        scheduleHeartbeat(connection, intervalMs);
        leadershipAcquired({ idleTimeoutSeconds, heartbeatIntervalMs: intervalMs });
        return true;
      } catch (error) { if (leadership === connection) { leadership = undefined; clearHeartbeat(); } connection.destroy(); throw error; }
    },
    kind: "mysql",
    ...createMySqlDocuments(pool, dataKey),
    async recordUsage(conversationId, input) {
      const attempt = normalizeUsageAttempt(input);
      if (!attempt) throw new Error("invalid_usage");
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [conversationRows] = await connection.execute("SELECT id FROM nanoduck_conversations WHERE id=? AND deleted_at IS NULL FOR UPDATE", [conversationId]);
        if (!conversationRows.length) { await connection.rollback(); return false; }
        const [rows] = await connection.execute("SELECT id,provider,model,status,started_at,finished_at,ciphertext,iv,tag FROM nanoduck_usage WHERE id=? AND conversation_id=? FOR UPDATE", [attempt.id, conversationId]);
        if (rows.length) {
          const prior = decodeUsage(rows[0]);
          if (["provider", "model", "startedAt"].some(key => prior[key] !== attempt[key]) || JSON.stringify(prior.attribution) !== JSON.stringify(attempt.attribution)) throw new Error("invalid_usage");
          if (!["running", "interrupted"].includes(prior.status)) { await connection.rollback(); return false; }
          const sealed = encodeUsage(attempt);
          await connection.execute("UPDATE nanoduck_usage SET status=?,finished_at=?,ciphertext=?,iv=?,tag=? WHERE id=? AND conversation_id=?", [attempt.status,attempt.finishedAt,sealed.ciphertext,sealed.iv,sealed.tag,attempt.id,conversationId]);
        } else {
          const sealed = encodeUsage(attempt);
          await connection.execute("INSERT INTO nanoduck_usage (id,conversation_id,provider,model,status,started_at,finished_at,ciphertext,iv,tag) VALUES (?,?,?,?,?,?,?,?,?,?)", [attempt.id,conversationId,attempt.provider,attempt.model,attempt.status,attempt.startedAt,attempt.finishedAt,sealed.ciphertext,sealed.iv,sealed.tag]);
        }
        await connection.commit(); return true;
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async interruptUsage() {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [rows] = await connection.execute("SELECT id,conversation_id,provider,model,status,started_at,finished_at,ciphertext,iv,tag FROM nanoduck_usage WHERE status='running' FOR UPDATE");
        for (const row of rows) {
          const attempt = { ...decodeUsage(row), status: "interrupted", finishedAt: now() };
          const sealed = encodeUsage(attempt);
          await connection.execute("UPDATE nanoduck_usage SET status='interrupted',finished_at=?,ciphertext=?,iv=?,tag=? WHERE id=? AND conversation_id=? AND status='running'", [attempt.finishedAt,sealed.ciphertext,sealed.iv,sealed.tag,attempt.id,row.conversation_id]);
        }
        await connection.commit(); return rows.length;
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async usageSummary(conversationId = undefined) {
      if (conversationId && !await this.getConversation(conversationId)) return undefined;
      const [conversationRows] = await query(`SELECT id FROM nanoduck_conversations WHERE deleted_at IS NULL${conversationId ? " AND id=?" : ""} ORDER BY id`, conversationId ? [conversationId] : []);
      const entries = [];
      for (const conversation of conversationRows) {
        const [[usageRows], [ownerRows], [runRows]] = await Promise.all([
          query("SELECT id,provider,model,status,started_at,finished_at,ciphertext,iv,tag FROM nanoduck_usage WHERE conversation_id=? ORDER BY started_at,id", [conversation.id]),
          query("SELECT id,created_at FROM nanoduck_messages WHERE conversation_id=? AND role='owner' ORDER BY sequence", [conversation.id]),
          query("SELECT snapshot_json FROM nanoduck_runs WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1", [conversation.id])
        ]);
        const snapshot = runRows.length ? openRunSnapshot(runRows[0].snapshot_json, dataKey) : undefined;
        const work = snapshot?.parallelWork;
        const owners = ownerRows.map(row => ({ id: row.id, createdAt: row.created_at }));
        entries.push({ conversationId: conversation.id, hasMessages: owners.length > 0,
          activity: work ? { consultants: work.assignments.length, reviewRounds: work.rounds.length, correctionOrders: work.orders.length, partial: owners.some(owner => !work.ownerMessageIds.includes(owner.id)) } : null,
          usage: usageRows.map(decodeUsage).map(attempt => usageWithSavedEffort(attempt, snapshot, owners)) });
      }
      return summarizeUsage(entries);
    },
    async createSession(input) { await query("INSERT INTO nanoduck_sessions (id,owner_subject,csrf_token,consented_at,issued_at,expires_at) VALUES (?,?,?,?,?,?)", [input.id,input.ownerSubject,input.csrfToken,input.consentedAt ?? null,input.issuedAt,input.expiresAt]); return { ...input, revokedAt: null }; },
    async session(id) { const [rows] = await query("SELECT id,owner_subject,csrf_token,consented_at,issued_at,expires_at,revoked_at FROM nanoduck_sessions WHERE id=? LIMIT 1", [id]); return rows.length ? { id: rows[0].id, ownerSubject: rows[0].owner_subject, csrfToken: rows[0].csrf_token, consentedAt: rows[0].consented_at, issuedAt: rows[0].issued_at, expiresAt: rows[0].expires_at, revokedAt: rows[0].revoked_at } : undefined; },
    async updateSession(id, patch) { const [result] = await query("UPDATE nanoduck_sessions SET consented_at=COALESCE(?, consented_at) WHERE id=? AND revoked_at IS NULL", [patch.consentedAt ?? null,id]); return result.affectedRows ? this.session(id) : undefined; },
    async revokeSession(id) { const [result] = await query("UPDATE nanoduck_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL", [now(),id]); return result.affectedRows === 1; },
    async settings() { const [rows] = await query("SELECT settings_json FROM nanoduck_settings WHERE owner_id = 'owner' LIMIT 1"); return rows.length ? Object.freeze({ ...defaults, ...storedObject(rows[0].settings_json, "settings") }) : Object.freeze({ ...defaults }); },
    async saveSettings(next) { await query("INSERT INTO nanoduck_settings (owner_id, settings_json) VALUES ('owner', ?) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json)", [JSON.stringify(next)]); return Object.freeze({ ...next }); },
    async runtimeInstructions() {
      const [rows] = await query("SELECT ciphertext,iv,tag,revision,content_hash,created_at,updated_at FROM nanoduck_runtime_instructions WHERE owner_id = 'owner' LIMIT 1");
      return rows.length ? runtimeDocument(rows[0]) : undefined;
    },
    async bootstrapRuntimeInstructions(contract) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [rows] = await connection.execute("SELECT ciphertext,iv,tag,revision,content_hash,created_at,updated_at FROM nanoduck_runtime_instructions WHERE owner_id='owner' FOR UPDATE");
        if (rows.length) { await connection.commit(); return runtimeDocument(rows[0]); }
        const record = nextRuntimeRecord(contract, "bootstrap");
        await connection.execute("INSERT INTO nanoduck_runtime_instructions (owner_id,ciphertext,iv,tag,revision,content_hash,created_at,updated_at) VALUES ('owner',?,?,?,?,?,?,?)", [record.ciphertext,record.iv,record.tag,record.id,record.contentHash,record.createdAt,record.createdAt]);
        await insertRuntimeHistory(connection, record); await connection.commit();
        return Object.freeze({ markdown: contract.markdown, revision: record.id, contentHash: record.contentHash, updatedAt: record.createdAt });
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async migrateRuntimeInstructions(transform) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [rows] = await connection.execute("SELECT ciphertext,iv,tag,revision,content_hash,created_at,updated_at FROM nanoduck_runtime_instructions WHERE owner_id='owner' FOR UPDATE");
        if (!rows.length) { await connection.commit(); return undefined; }
        const current = runtimeDocument(rows[0]); const next = transform(current.markdown);
        if (!next || next.revision === current.contentHash) { await connection.commit(); return current; }
        const record = nextRuntimeRecord(next, "routing_migration", current.revision);
        await connection.execute("UPDATE nanoduck_runtime_instructions SET ciphertext=?,iv=?,tag=?,revision=?,content_hash=?,updated_at=? WHERE owner_id='owner'", [record.ciphertext,record.iv,record.tag,record.id,record.contentHash,record.createdAt]);
        await insertRuntimeHistory(connection, record); await connection.commit();
        return Object.freeze({ markdown: next.markdown, revision: record.id, contentHash: record.contentHash, updatedAt: record.createdAt });
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async saveRuntimeInstructions(next, expectedRevision) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [rows] = await connection.execute("SELECT revision FROM nanoduck_runtime_instructions WHERE owner_id='owner' FOR UPDATE");
        if (!rows.length || rows[0].revision !== expectedRevision) { await connection.rollback(); return undefined; }
        const record = nextRuntimeRecord(next, "save");
        await connection.execute("UPDATE nanoduck_runtime_instructions SET ciphertext=?,iv=?,tag=?,revision=?,content_hash=?,updated_at=? WHERE owner_id='owner'", [record.ciphertext,record.iv,record.tag,record.id,record.contentHash,record.createdAt]);
        await insertRuntimeHistory(connection, record); await connection.commit();
        return Object.freeze({ markdown: next.markdown, revision: record.id, contentHash: record.contentHash, updatedAt: record.createdAt });
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async listRuntimeInstructionHistory() {
      const [rows] = await query("SELECT id,action,restored_from_id,content_hash,created_at FROM nanoduck_runtime_instruction_history WHERE owner_id='owner' ORDER BY created_at DESC, id DESC");
      return rows.map(runtimeHistorySummary);
    },
    async runtimeInstructionVersion(id) {
      const [rows] = await query("SELECT id,action,restored_from_id,ciphertext,iv,tag,content_hash,created_at FROM nanoduck_runtime_instruction_history WHERE owner_id='owner' AND id=? LIMIT 1", [id]);
      return rows.length ? Object.freeze({ ...runtimeHistorySummary(rows[0]), markdown: decryptText({ iv: rows[0].iv, ciphertext: rows[0].ciphertext, tag: rows[0].tag }, dataKey) }) : undefined;
    },
    async restoreRuntimeInstructions(next, expectedRevision, restoredFromId) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [[current], [history]] = await Promise.all([
          connection.execute("SELECT revision FROM nanoduck_runtime_instructions WHERE owner_id='owner' FOR UPDATE"),
          connection.execute("SELECT id FROM nanoduck_runtime_instruction_history WHERE owner_id='owner' AND id=? FOR UPDATE", [restoredFromId])
        ]);
        if (!current.length || current[0].revision !== expectedRevision || !history.length) { await connection.rollback(); return undefined; }
        const record = nextRuntimeRecord(next, "restore", restoredFromId);
        await connection.execute("UPDATE nanoduck_runtime_instructions SET ciphertext=?,iv=?,tag=?,revision=?,content_hash=?,updated_at=? WHERE owner_id='owner'", [record.ciphertext,record.iv,record.tag,record.id,record.contentHash,record.createdAt]);
        await insertRuntimeHistory(connection, record); await connection.commit();
        return Object.freeze({ markdown: next.markdown, revision: record.id, contentHash: record.contentHash, updatedAt: record.createdAt });
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async listConversations() { const [rows] = await query("SELECT id,title,created_at,updated_at,deleted_at FROM nanoduck_conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC"); return rows.map(row => ({ id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at })); },
    async createConversation() { const item = { id: randomId(), title: "New consultation", createdAt: now(), updatedAt: now() }; await query("INSERT INTO nanoduck_conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)", [item.id, item.title, item.createdAt, item.updatedAt]); return { ...item, deletedAt: null }; },
    async getConversation(id) { const [rows] = await query("SELECT id,title,created_at,updated_at,deleted_at FROM nanoduck_conversations WHERE id=? AND deleted_at IS NULL LIMIT 1", [id]); return rows.length ? { id: rows[0].id, title: rows[0].title, createdAt: rows[0].created_at, updatedAt: rows[0].updated_at, deletedAt: rows[0].deleted_at } : undefined; },
    async events(id, after = 0) { const [[messageRows], attachments] = await Promise.all([query("SELECT id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json FROM nanoduck_messages WHERE conversation_id=? AND sequence>? ORDER BY sequence", [id, after]), attachmentsByMessage(id)]); return messageRows.map(row => decode(row, attachments.get(row.id) ?? [])); },
    async createAttachment(id, input) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [conversationRows] = await connection.execute("SELECT id FROM nanoduck_conversations WHERE id=? AND deleted_at IS NULL FOR UPDATE", [id]);
        if (!conversationRows.length) { await connection.rollback(); return undefined; }
        const [activeRows] = await connection.execute("SELECT id FROM nanoduck_runs WHERE status='active' LIMIT 1");
        if (activeRows.length) { await connection.rollback(); return undefined; }
        const attachment = { id: randomId(), conversationId: id, contentType: input.contentType, byteLength: input.byteLength, createdAt: now() };
        const encrypted = encryptBytes(input.content, dataKey);
        await connection.execute("INSERT INTO nanoduck_attachments (id,conversation_id,message_id,content_type,byte_length,ciphertext,iv,tag,created_at) VALUES (?,?,?,?,?,?,?,?,?)", [attachment.id, id, null, attachment.contentType, attachment.byteLength, encrypted.ciphertext, encrypted.iv, encrypted.tag, attachment.createdAt]);
        await connection.commit(); return publicAttachment(attachment);
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async attachment(conversationId, attachmentId) {
      const [rows] = await query("SELECT a.id,a.content_type,a.byte_length,a.ciphertext,a.iv,a.tag,a.created_at FROM nanoduck_attachments a JOIN nanoduck_conversations c ON c.id=a.conversation_id WHERE a.conversation_id=? AND a.id=? AND a.message_id IS NOT NULL AND c.deleted_at IS NULL LIMIT 1", [conversationId, attachmentId]);
      if (!rows.length) return undefined;
      const attachment = attachmentMetadata(rows[0]);
      return Object.freeze({ ...attachment, content: decryptBytes({ iv: rows[0].iv, ciphertext: rows[0].ciphertext, tag: rows[0].tag }, dataKey) });
    },
    async deletePendingAttachment(conversationId, attachmentId) {
      const [result] = await query("DELETE FROM nanoduck_attachments WHERE conversation_id=? AND id=? AND message_id IS NULL", [conversationId, attachmentId]);
      return result.affectedRows === 1;
    },
    async acceptMessage(id, input, snapshot) {
      if (!storableMessageBody(input?.body)) return undefined;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await lockOwner(connection);
        const [conversationRows] = await connection.execute("SELECT id,title FROM nanoduck_conversations WHERE id=? AND deleted_at IS NULL FOR UPDATE", [id]);
        if (!conversationRows.length) { await connection.rollback(); return undefined; }
        const [requestRows] = await connection.execute("SELECT message_id,run_id FROM nanoduck_requests WHERE conversation_id=? AND request_id=?", [id, input.clientRequestId]);
        if (requestRows.length) {
          const request = requestRows[0];
          const [messageRows] = await connection.execute("SELECT id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json FROM nanoduck_messages WHERE conversation_id=? AND id=? LIMIT 1", [id, request.message_id]);
          const [attachmentRows] = await connection.execute("SELECT id,message_id,content_type,byte_length,created_at FROM nanoduck_attachments WHERE conversation_id=? AND message_id=? ORDER BY created_at", [id, request.message_id]);
          const [runRows] = await connection.execute("SELECT id,conversation_id,status,generation,snapshot_json,created_at,updated_at FROM nanoduck_runs WHERE conversation_id=? AND id=? LIMIT 1", [id, request.run_id]);
          const message = messageRows.length ? decode(messageRows[0], attachmentRows.map(attachmentMetadata)) : undefined;
          const runRow = runRows[0]; const runSnapshot = runRow ? openRunSnapshot(runRow.snapshot_json, dataKey) : undefined;
          const bindingValid = runRow ? await validRunBinding(connection.execute.bind(connection), id, runRow.id, runSnapshot) : false;
          const run = runRow && bindingValid ? { id: runRow.id, conversationId: runRow.conversation_id, status: runRow.status, generation: runRow.generation, snapshot: runSnapshot, createdAt: runRow.created_at, updatedAt: runRow.updated_at } : undefined;
          await connection.rollback();
          if (!message || message.body !== input.body || JSON.stringify(message.attachments.map(a => a.id).sort()) !== JSON.stringify([...(input.attachmentIds ?? [])].sort()) || run?.id !== request.run_id) return undefined;
          return { message, run, replayed: true };
        }
        const [activeRows] = await connection.execute("SELECT id FROM nanoduck_runs WHERE status='active' LIMIT 1");
        if (activeRows.length) { await connection.rollback(); return undefined; }
        const attachmentIds = input.attachmentIds ?? [];
        let linked = [];
        if (attachmentIds.length) {
          const placeholders = attachmentIds.map(() => "?").join(",");
          const [attachmentRows] = await connection.execute(`SELECT id,content_type,byte_length,created_at FROM nanoduck_attachments WHERE conversation_id=? AND message_id IS NULL AND id IN (${placeholders}) FOR UPDATE`, [id, ...attachmentIds]);
          if (attachmentRows.length !== attachmentIds.length) { await connection.rollback(); return undefined; }
          const byId = new Map(attachmentRows.map(row => [row.id, attachmentMetadata(row)]));
          linked = attachmentIds.map(attachmentId => byId.get(attachmentId));
        }
        const [sequenceRows] = await connection.execute("SELECT COALESCE(MAX(sequence), 0) AS max_sequence FROM nanoduck_messages WHERE conversation_id=? FOR UPDATE", [id]);
        const encrypted = encryptText(input.body, dataKey); const message = { id: randomId(), role: "owner", body: input.body, sequence: Number(sequenceRows[0].max_sequence) + 1, createdAt: now(), sources: [], attachments: linked };
        const requestSnapshot = { ...structuredClone(snapshot), requestMessageId: message.id };
        const generation = Number((await connection.execute("SELECT COALESCE(MAX(generation), 0) AS max_generation FROM nanoduck_runs WHERE conversation_id=? FOR UPDATE", [id]))[0][0].max_generation) + 1;
        const run = { id: randomId(), conversationId: id, status: "active", generation, snapshot: requestSnapshot, createdAt: now(), updatedAt: now() };
        await connection.execute("INSERT INTO nanoduck_messages (id,conversation_id,role,ciphertext,iv,tag,sequence,created_at,sources_json) VALUES (?,?,?,?,?,?,?,?,?)", [message.id, id, message.role, encrypted.ciphertext, encrypted.iv, encrypted.tag, message.sequence, message.createdAt, "[]"]);
        if (attachmentIds.length) {
          const placeholders = attachmentIds.map(() => "?").join(",");
          const [attachmentResult] = await connection.execute(`UPDATE nanoduck_attachments SET message_id=? WHERE conversation_id=? AND message_id IS NULL AND id IN (${placeholders})`, [message.id, id, ...attachmentIds]);
          if (attachmentResult.affectedRows !== attachmentIds.length) throw new Error("attachment_link_failed");
        }
        await connection.execute("INSERT INTO nanoduck_runs (id,conversation_id,status,generation,snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", [run.id, id, run.status, run.generation, JSON.stringify(sealRunSnapshot(requestSnapshot, dataKey)), run.createdAt, run.updatedAt]);
        await connection.execute("INSERT INTO nanoduck_requests (conversation_id,request_id,message_id,run_id) VALUES (?,?,?,?)", [id, input.clientRequestId, message.id, run.id]);
        await connection.execute("UPDATE nanoduck_conversations SET updated_at=? WHERE id=?", [now(), id]);
        await connection.commit(); return { message: publicMessage(message), run, replayed: false };
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async run(id) {
      const [rows] = await query("SELECT id,conversation_id,status,generation,snapshot_json,created_at,updated_at FROM nanoduck_runs WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1", [id]);
      if (!rows.length) return undefined;
      const row = rows[0]; const snapshot = openRunSnapshot(row.snapshot_json, dataKey);
      if (!await validRunBinding(query, id, row.id, snapshot)) return undefined;
      return { id: row.id, conversationId: row.conversation_id, status: row.status, generation: row.generation, snapshot, createdAt: row.created_at, updatedAt: row.updated_at };
    },
    async activeRuns() {
      const [rows] = await query("SELECT id,conversation_id,status,generation,snapshot_json,created_at,updated_at FROM nanoduck_runs WHERE status='active' ORDER BY created_at"); const runs = [];
      for (const row of rows) {
        const snapshot = openRunSnapshot(row.snapshot_json, dataKey);
        if (await validRunBinding(query, row.conversation_id, row.id, snapshot)) runs.push({ id: row.id, conversationId: row.conversation_id, status: row.status, generation: row.generation, snapshot, createdAt: row.created_at, updatedAt: row.updated_at });
      }
      return runs;
    },
    async appendAgentMessage(id, generation, item) {
      if (!storableMessageBody(item?.body)) return undefined;
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [conversationRows] = await connection.execute("SELECT id FROM nanoduck_conversations WHERE id=? AND deleted_at IS NULL FOR UPDATE", [id]);
        if (!conversationRows.length) { await connection.rollback(); return undefined; }
        const [runRows] = await connection.execute("SELECT id,status,generation FROM nanoduck_runs WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [id]);
        const run = runRows[0];
        if (!run || run.status !== "active" || Number(run.generation) !== generation) { await connection.rollback(); return undefined; }
        const [sequenceRows] = await connection.execute("SELECT COALESCE(MAX(sequence), 0) AS max_sequence FROM nanoduck_messages WHERE conversation_id=? FOR UPDATE", [id]);
        const encrypted = encryptText(item.body, dataKey); const message = { id: randomId(), role: item.role, recipient: item.recipient, body: item.body, sources: item.sources ?? [], sequence: Number(sequenceRows[0].max_sequence) + 1, createdAt: now() };
        await connection.execute("INSERT INTO nanoduck_messages (id,conversation_id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json) VALUES (?,?,?,?,?,?,?,?,?,?)", [message.id,id,message.role,message.recipient ?? null,encrypted.ciphertext,encrypted.iv,encrypted.tag,message.sequence,message.createdAt,JSON.stringify(message.sources)]);
        await connection.execute("UPDATE nanoduck_conversations SET updated_at=? WHERE id=? AND deleted_at IS NULL", [message.createdAt,id]);
        await connection.execute("UPDATE nanoduck_runs SET updated_at=? WHERE id=? AND status='active' AND generation=?", [message.createdAt,run.id,generation]);
        await connection.commit(); return publicMessage(message);
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async updateRunSnapshot(id, generation, snapshot) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.execute("SELECT id,snapshot_json FROM nanoduck_runs WHERE conversation_id=? AND generation=? AND status='active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [id,generation]);
        if (!rows.length) { await connection.rollback(); return undefined; }
        const previous = openRunSnapshot(rows[0].snapshot_json, dataKey);
        if (snapshot.requestMessageId !== previous.requestMessageId) { await connection.rollback(); return undefined; }
        if (!await validRunBinding(connection.execute.bind(connection), id, rows[0].id, snapshot)) { await connection.rollback(); return undefined; }
        const updatedAt = now();
        const [result] = await connection.execute("UPDATE nanoduck_runs SET snapshot_json=?, updated_at=? WHERE id=? AND generation=? AND status='active'", [JSON.stringify(sealRunSnapshot(snapshot, dataKey)),updatedAt,rows[0].id,generation]);
        if (result.affectedRows !== 1) { await connection.rollback(); return undefined; }
        await connection.commit(); return { ...snapshot, updatedAt };
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async commitParallelWork(id, generation, expectedRevision, work, additions = []) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [conversationRows] = await connection.execute("SELECT id FROM nanoduck_conversations WHERE id=? AND deleted_at IS NULL FOR UPDATE", [id]);
        if (!conversationRows.length) { await connection.rollback(); return undefined; }
        const [runRows] = await connection.execute("SELECT id,snapshot_json FROM nanoduck_runs WHERE conversation_id=? AND generation=? AND status='active' ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [id,generation]);
        if (!runRows.length || !Array.isArray(additions)) { await connection.rollback(); return undefined; }
        const snapshot = openRunSnapshot(runRows[0].snapshot_json, dataKey);
        if (snapshot?.contractVersion !== "parallel-v1" || (snapshot.requestMessageId && JSON.stringify(work.ownerMessageIds) !== JSON.stringify([snapshot.requestMessageId]))) { await connection.rollback(); return undefined; }
        const before = snapshot.parallelWork;
        if ((before?.revision ?? -1) !== expectedRevision) { await connection.rollback(); return undefined; }
        const [messageRows] = await connection.execute("SELECT id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json FROM nanoduck_messages WHERE conversation_id=? ORDER BY sequence FOR UPDATE", [id]);
        const stream = messageRows.map(row => decode(row, []));
        const ids = new Set(stream.map(item => item.id));
        if (additions.some(item => !item || !idForMessage(item.id) || ids.has(item.id) || typeof item.role !== "string" || !item.role || !storableMessageBody(item.body) || !Array.isArray(item.sources ?? []))) { await connection.rollback(); return undefined; }
        for (const item of additions) ids.add(item.id);
        if (ids.size !== stream.length + additions.length || !validateParallelTransition(before, work, additions, stream)) { await connection.rollback(); return undefined; }
        const createdAt = now();
        const committed = [];
        for (const [index, item] of additions.entries()) {
          const message = { id: item.id, role: item.role, recipient: item.recipient, body: item.body, sources: item.sources ?? [], sequence: stream.length + index + 1, createdAt };
          const encrypted = encryptText(message.body, dataKey);
          await connection.execute("INSERT INTO nanoduck_messages (id,conversation_id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json) VALUES (?,?,?,?,?,?,?,?,?,?)", [message.id,id,message.role,message.recipient ?? null,encrypted.ciphertext,encrypted.iv,encrypted.tag,message.sequence,message.createdAt,JSON.stringify(message.sources)]);
          committed.push(message);
        }
        const updatedSnapshot = { ...snapshot, parallelWork: structuredClone(work) };
        const [updated] = await connection.execute("UPDATE nanoduck_runs SET snapshot_json=?,updated_at=? WHERE id=? AND generation=? AND status='active'", [JSON.stringify(sealRunSnapshot(updatedSnapshot, dataKey)),createdAt,runRows[0].id,generation]);
        if (updated.affectedRows !== 1) { await connection.rollback(); return undefined; }
        await connection.execute("UPDATE nanoduck_conversations SET updated_at=? WHERE id=? AND deleted_at IS NULL", [createdAt,id]);
        await connection.commit(); return { revision: work.revision, messages: committed.map(publicMessage) };
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async finishRun(id, generation, status, completedTitle = undefined) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [result] = await connection.execute("UPDATE nanoduck_runs SET status=?, updated_at=? WHERE conversation_id=? AND generation=? AND status='active'", [status, now(), id, generation]);
        if (result.affectedRows !== 1) { await connection.rollback(); return false; }
        if (status === "complete" && typeof completedTitle === "string" && completedTitle.trim()) {
          await connection.execute("UPDATE nanoduck_conversations SET title=IF(title='New consultation', ?, title), updated_at=? WHERE id=?", [completedTitle.trim(), now(), id]);
        } else await connection.execute("UPDATE nanoduck_conversations SET updated_at=? WHERE id=?", [now(), id]);
        await connection.commit(); return true;
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async stop(id) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [rows] = await connection.execute("SELECT id,conversation_id,status,generation,snapshot_json,created_at,updated_at FROM nanoduck_runs WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [id]);
        const run = rows[0]; if (!run || run.status !== "active") { await connection.rollback(); return undefined; }
        const updatedAt = now(); const [result] = await connection.execute("UPDATE nanoduck_runs SET generation=generation+1,status='stopped',updated_at=? WHERE id=? AND generation=? AND status='active'", [updatedAt,run.id,run.generation]);
        if (result.affectedRows !== 1) { await connection.rollback(); return undefined; }
        await connection.commit(); return { id: run.id, conversationId: run.conversation_id, status: "stopped", generation: Number(run.generation) + 1, snapshot: openRunSnapshot(run.snapshot_json, dataKey), createdAt: run.created_at, updatedAt };
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async continueRun(id) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [rows] = await connection.execute("SELECT id,conversation_id,status,generation,snapshot_json,created_at,updated_at FROM nanoduck_runs WHERE conversation_id=? ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [id]);
        const run = rows[0]; if (!run || !["stopped", "failed"].includes(run.status)) { await connection.rollback(); return undefined; }
        const snapshot = openRunSnapshot(run.snapshot_json, dataKey);
        if (!await validRunBinding(connection.execute.bind(connection), id, run.id, snapshot)) { await connection.rollback(); return undefined; }
        const [activeRows] = await connection.execute("SELECT id FROM nanoduck_runs WHERE status='active' LIMIT 1");
        if (activeRows.length) { await connection.rollback(); return undefined; }
        const updatedAt = now(); const [result] = await connection.execute("UPDATE nanoduck_runs SET generation=generation+1,status='active',updated_at=? WHERE id=? AND generation=? AND status=?", [updatedAt,run.id,run.generation,run.status]);
        if (result.affectedRows !== 1) { await connection.rollback(); return undefined; }
        await connection.commit(); return { id: run.id, conversationId: run.conversation_id, status: "active", generation: Number(run.generation) + 1, snapshot, createdAt: run.created_at, updatedAt };
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async exportConversation(id) { const conversation = await this.getConversation(id); return conversation ? { conversation, messages: await this.events(id) } : undefined; },
    async recoverySnapshot() {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        const [conversationRows] = await connection.execute("SELECT id,title,created_at,updated_at,deleted_at FROM nanoduck_conversations ORDER BY created_at");
        const records = [];
        for (const row of conversationRows) {
          const conversation = { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at };
          if (conversation.deletedAt) { records.push({ conversation, usage: [], messages: [], attachments: [] }); continue; }
          const [messageRows] = await connection.execute("SELECT id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json FROM nanoduck_messages WHERE conversation_id=? ORDER BY sequence", [conversation.id]);
          const [attachmentRows] = await connection.execute("SELECT id,message_id,content_type,byte_length,ciphertext,iv,tag,created_at FROM nanoduck_attachments WHERE conversation_id=? AND message_id IS NOT NULL ORDER BY created_at", [conversation.id]);
          const [usageRows] = await connection.execute("SELECT id,provider,model,status,started_at,finished_at,ciphertext,iv,tag FROM nanoduck_usage WHERE conversation_id=? ORDER BY started_at,id", [conversation.id]);
          const metadata = attachmentRows.reduce((grouped, row) => {
            const values = grouped.get(row.message_id) ?? [];
            values.push(attachmentMetadata(row)); grouped.set(row.message_id, values); return grouped;
          }, new Map());
          records.push({ conversation, usage: usageRows.map(decodeUsage), messages: messageRows.map(row => decode(row, metadata.get(row.id) ?? [])), attachments: attachmentRows.map(row => ({ ...attachmentMetadata(row), messageId: row.message_id, content: decryptBytes({ iv: row.iv, ciphertext: row.ciphertext, tag: row.tag }, dataKey).toString("base64url") })) });
        }
        const configuration = await readConfiguration(connection, dataKey, defaults);
        await connection.commit(); return recoverySnapshot(records, configuration);
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async restoreRecovery(snapshot, { restoreConfiguration = false } = {}) {
      const recovered = normalizeRecoverySnapshot(snapshot); if (!recovered) return undefined;
      const connection = await pool.getConnection(); let restored = 0; let tombstones = 0; let preservedTombstones = 0;
      try {
        await connection.beginTransaction(); await lockOwner(connection);
        if (restoreConfiguration && recovered.configuration) await replaceConfiguration(connection, dataKey, recovered.configuration);
        for (const record of [...recovered.conversations.filter(item => item.conversation.deletedAt), ...recovered.conversations.filter(item => !item.conversation.deletedAt)]) {
          const conversation = record.conversation;
          const [existingRows] = await connection.execute("SELECT id,deleted_at FROM nanoduck_conversations WHERE id=? FOR UPDATE", [conversation.id]);
          const existing = existingRows[0];
          if (existing?.deleted_at) { preservedTombstones += 1; continue; }
          if (conversation.deletedAt) {
            if (existing) await connection.execute("UPDATE nanoduck_conversations SET deleted_at=?, updated_at=?,title='Deleted consultation' WHERE id=? AND deleted_at IS NULL", [conversation.deletedAt, conversation.deletedAt, conversation.id]);
            else await connection.execute("INSERT INTO nanoduck_conversations (id,title,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?)", [conversation.id, "Deleted consultation", conversation.createdAt, conversation.deletedAt, conversation.deletedAt]);
            await connection.execute("DELETE FROM nanoduck_attachments WHERE conversation_id=?", [conversation.id]);
            await connection.execute("DELETE FROM nanoduck_messages WHERE conversation_id=?", [conversation.id]);
            await connection.execute("DELETE FROM nanoduck_requests WHERE conversation_id=?", [conversation.id]);
            await connection.execute("DELETE FROM nanoduck_usage WHERE conversation_id=?", [conversation.id]);
            await connection.execute("UPDATE nanoduck_runs SET snapshot_json=JSON_OBJECT(),generation=generation+1,status='deleted',updated_at=? WHERE conversation_id=?", [conversation.deletedAt, conversation.id]);
            tombstones += 1; continue;
          }
          if (existing) continue;
          await connection.execute("INSERT INTO nanoduck_conversations (id,title,created_at,updated_at) VALUES (?,?,?,?)", [conversation.id, conversation.title, conversation.createdAt, conversation.updatedAt]);
          for (const item of record.messages) {
            const encrypted = encryptText(item.body, dataKey);
            await connection.execute("INSERT INTO nanoduck_messages (id,conversation_id,role,recipient,ciphertext,iv,tag,sequence,created_at,sources_json) VALUES (?,?,?,?,?,?,?,?,?,?)", [item.id,conversation.id,item.role,item.recipient,encrypted.ciphertext,encrypted.iv,encrypted.tag,item.sequence,item.createdAt,JSON.stringify(item.sources)]);
          }
          for (const item of record.attachments) {
            const encrypted = encryptBytes(Buffer.from(item.content, "base64url"), dataKey);
            await connection.execute("INSERT INTO nanoduck_attachments (id,conversation_id,message_id,content_type,byte_length,ciphertext,iv,tag,created_at) VALUES (?,?,?,?,?,?,?,?,?)", [item.id,conversation.id,item.messageId,item.contentType,item.byteLength,encrypted.ciphertext,encrypted.iv,encrypted.tag,item.createdAt]);
          }
          for (const item of record.usage ?? []) {
            const sealed = encodeUsage(item);
            await connection.execute("INSERT INTO nanoduck_usage (id,conversation_id,provider,model,status,started_at,finished_at,ciphertext,iv,tag) VALUES (?,?,?,?,?,?,?,?,?,?)", [item.id,conversation.id,item.provider,item.model,item.status,item.startedAt,item.finishedAt,sealed.ciphertext,sealed.iv,sealed.tag]);
          }
          restored += 1;
        }
        await connection.commit(); return Object.freeze({ restored, tombstones, preservedTombstones });
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async deleteConversation(id) {
      const connection = await pool.getConnection(); const deletedAt = now();
      try {
        await connection.beginTransaction();
        await lockOwner(connection);
        const [result] = await connection.execute("UPDATE nanoduck_conversations SET deleted_at=?, updated_at=?,title='Deleted consultation' WHERE id=? AND deleted_at IS NULL", [deletedAt, deletedAt, id]);
        if (result.affectedRows !== 1) { await connection.rollback(); return false; }
        await connection.execute("DELETE FROM nanoduck_attachments WHERE conversation_id=?", [id]);
        await connection.execute("DELETE FROM nanoduck_messages WHERE conversation_id=?", [id]);
        await connection.execute("DELETE FROM nanoduck_requests WHERE conversation_id=?", [id]);
        await connection.execute("DELETE FROM nanoduck_usage WHERE conversation_id=?", [id]);
        await connection.execute("UPDATE nanoduck_runs SET snapshot_json=JSON_OBJECT(),generation=generation+1,status='deleted',updated_at=? WHERE conversation_id=?", [deletedAt,id]);
        await connection.commit(); return true;
      } catch (error) { await connection.rollback().catch(() => {}); throw error; } finally { connection.release(); }
    },
    async deleteConversations(conversationIds) {
      const deleted = [];
      for (const conversationId of conversationIds) if (await this.deleteConversation(conversationId)) deleted.push(conversationId);
      return Object.freeze(deleted);
    },
    async close() {
      closed = true; clearHeartbeat();
      if (leadership) {
        const connection = leadership; leadership = undefined;
        if (heartbeatPending) connection.destroy();
        else {
          try { await connection.execute({ sql: "SELECT RELEASE_LOCK(?)", timeout: 10_000 }, [lockName]); connection.release(); }
          catch { connection.destroy(); }
        }
      }
      await pool.end();
    }
  });
}

export { defaults as defaultSettings };

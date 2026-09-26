import { normalizeUsageAttempt } from "./usage.mjs";
import { normalizeConfiguration } from "./configuration-recovery.mjs";
import { normalizeRecoverySnapshot } from "./recovery.mjs";
import { inspectImageAttachment } from "./attachments.mjs";
import { validateParallelWork } from "./parallel-contract.mjs";

const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
const date = value => typeof value === "string" && Number.isFinite(Date.parse(value));
const fail = () => { throw new Error("local_state_invalid"); };
const pairs = (value, validKey = id) => {
  if (!Array.isArray(value) || value.some(item => !Array.isArray(item) || item.length !== 2 || !validKey(item[0])) || new Set(value.map(item => item[0])).size !== value.length) fail();
  return new Map(value);
};

// This is the durable state contract, not the deliberately narrower recovery export.
export function validateLocalState(input) {
  if (!object(input) || input.schemaVersion !== 1 || input.kind !== "nanoduck-local-state") fail();
  const state = structuredClone(input);
  const conversations = pairs(state.conversations);
  const messages = pairs(state.messages);
  const usage = pairs(state.usage ?? []);
  for (const [key, entries] of usage) {
    if (!conversations.has(key) || conversations.get(key).deletedAt || !Array.isArray(entries) || entries.some(item => !normalizeUsageAttempt(item)) || new Set(entries.map(item => item.id)).size !== entries.length) fail();
  }
  state.usage = [...usage];
  const attachments = pairs(state.attachments);
  const runs = pairs(state.runs);
  const requests = pairs(state.requests, key => typeof key === "string" && key.split(":").length === 2 && key.split(":").every(id));
  const sessions = pairs(state.sessions);
  const runtimeHistory = pairs(state.runtimeInstructionHistory);
  if ([...conversations].some(([key, item]) => !object(item) || item.id !== key) || [...messages].some(([key, items]) => !conversations.has(key) || !Array.isArray(items)) || [...conversations.keys()].some(key => !messages.has(key))) fail();
  if ([...runtimeHistory].some(([key, item]) => !object(item) || item.id !== key)) fail();
  if (!normalizeConfiguration({ settings: state.settings, runtimeInstructions: state.runtimeInstructions, runtimeHistory: [...runtimeHistory.values()], documents: state.documents })) fail();
  const allMessageIds = new Set();
  for (const [conversationId, items] of messages) {
    for (const item of items) {
      if (!object(item) || allMessageIds.has(item.id)) fail();
      allMessageIds.add(item.id);
      const expected = [...attachments.values()].filter(attachment => attachment.conversationId === conversationId && attachment.messageId === item.id).map(attachment => attachment.id).sort();
      if (!Array.isArray(item.attachments ?? []) || JSON.stringify((item.attachments ?? []).map(attachment => attachment.id).sort()) !== JSON.stringify(expected)) fail();
    }
  }
  for (const [key, item] of attachments) {
    if (!object(item) || item.id !== key || !conversations.has(item.conversationId) || conversations.get(item.conversationId).deletedAt || (item.messageId !== null && !messages.get(item.conversationId).some(message => message.id === item.messageId)) || typeof item.content !== "string" || !/^[A-Za-z0-9_-]+$/u.test(item.content) || !Number.isSafeInteger(item.byteLength) || item.byteLength < 1 || item.byteLength > 8 * 1024 * 1024 || !date(item.createdAt)) fail();
    const content = Buffer.from(item.content, "base64url");
    if (content.toString("base64url") !== item.content || content.byteLength !== item.byteLength || inspectImageAttachment(content) !== item.contentType) fail();
  }
  const recovery = {
    schemaVersion: 1, kind: "nanoduck-owner-records", createdAt: new Date().toISOString(),
    conversations: [...conversations.values()].map(conversation => ({ conversation, messages: messages.get(conversation.id), attachments: [...attachments.values()].filter(item => item.conversationId === conversation.id && item.messageId) }))
  };
  if (!normalizeRecoverySnapshot(recovery)) fail();
  let active = 0;
  for (const [key, run] of runs) {
    const conversation = conversations.get(key);
    if (!conversation || !object(run) || !id(run.id) || run.conversationId !== key || !["active", "stopped", "failed", "complete", "deleted"].includes(run.status) || !Number.isSafeInteger(run.generation) || run.generation < 1 || !object(run.snapshot) || !date(run.createdAt) || !date(run.updatedAt)) fail();
    if (Boolean(conversation.deletedAt) !== (run.status === "deleted") || (run.status === "deleted" && Object.keys(run.snapshot).length)) fail();
    if (run.snapshot.requestMessageId !== undefined) {
      const accepted = messages.get(key)?.find(item => item.id === run.snapshot.requestMessageId);
      if (!accepted || accepted.role !== "owner" || accepted.recipient) fail();
      if (run.snapshot.parallelWork && JSON.stringify(run.snapshot.parallelWork.ownerMessageIds) !== JSON.stringify([accepted.id])) fail();
    }
    if (run.snapshot.contractVersion === "parallel-v1" && run.snapshot.parallelWork && !validateParallelWork(run.snapshot.parallelWork, messages.get(key))) fail();
    if (run.snapshot.contractVersion && !["parallel-v1"].includes(run.snapshot.contractVersion)) fail();
    if (run.status === "active") active += 1;
  }
  if (active > 1) fail();
  for (const [key, request] of requests) {
    const [conversationId] = key.split(":");
    if (!object(request) || !id(request.messageId) || !id(request.runId) || !conversations.has(conversationId) || conversations.get(conversationId).deletedAt || !messages.get(conversationId).some(item => item.id === request.messageId && item.role === "owner")) fail();
    if (request.run !== undefined && (!object(request.run) || request.run.id !== request.runId || request.run.conversationId !== conversationId || !["active", "stopped", "failed", "complete"].includes(request.run.status) || !Number.isSafeInteger(request.run.generation) || request.run.generation < 1 || !object(request.run.snapshot) || !date(request.run.createdAt) || !date(request.run.updatedAt))) fail();
  }
  for (const [key, session] of sessions) {
    if (!object(session) || session.id !== key || !id(session.csrfToken) || typeof session.ownerSubject !== "string" || !session.ownerSubject || !date(session.issuedAt) || !date(session.expiresAt) || Date.parse(session.expiresAt) <= Date.parse(session.issuedAt) || (session.consentedAt != null && !date(session.consentedAt)) || (session.revokedAt != null && !date(session.revokedAt))) fail();
  }
  return state;
}

import { normalizeUsageAttempt } from "./usage.mjs";
import { normalizeConfiguration } from "./configuration-recovery.mjs";
import { decryptText, encryptText } from "./crypto.mjs";
import { hasProhibitedLanguage, maximumMessageBytes, safeExternalUrl } from "./validation.mjs";

export const maximumRecoveryBytes = 32 * 1024 * 1024;
const schemaVersion = 1;
const maximumAttachmentBytes = 8 * 1024 * 1024;
const identifier = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
const date = value => typeof value === "string" && !Number.isNaN(Date.parse(value));
const text = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum && !hasProhibitedLanguage(value);
const record = value => typeof value === "object" && value !== null && !Array.isArray(value);

const source = value => {
  if (!record(value) || !text(value.title, 16 * 1024 * 1024) || !text(value.claim, 16 * 1024 * 1024) || !date(value.retrievedAt)) return undefined;
  const url = safeExternalUrl(value.url);
  if (!url || (value.publishedAt !== undefined && !date(value.publishedAt))) return undefined;
  return Object.freeze({ url, title: value.title.trim(), claim: value.claim.trim(), retrievedAt: value.retrievedAt, ...(value.publishedAt ? { publishedAt: value.publishedAt } : {}) });
};

const message = value => {
  if (!record(value) || !identifier(value.id) || !text(value.role, 64) || !text(value.body, 16 * 1024 * 1024) || Buffer.byteLength(value.body.trim(), "utf8") > maximumMessageBytes || !Number.isInteger(value.sequence) || value.sequence < 1 || !date(value.createdAt) || (value.recipient !== null && value.recipient !== undefined && !text(value.recipient, 64)) || !Array.isArray(value.sources)) return undefined;
  const sources = value.sources.map(source);
  if (sources.some(item => !item)) return undefined;
  return Object.freeze({ id: value.id, role: value.role.trim(), recipient: value.recipient ? value.recipient.trim() : null, body: value.body.trim(), sequence: value.sequence, createdAt: value.createdAt, sources: Object.freeze(sources) });
};

const attachment = value => {
  if (!record(value) || !identifier(value.id) || !identifier(value.messageId) || !["image/jpeg", "image/png", "image/webp"].includes(value.contentType) || !Number.isInteger(value.byteLength) || value.byteLength < 1 || value.byteLength > maximumAttachmentBytes || !date(value.createdAt) || typeof value.content !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value.content)) return undefined;
  const content = Buffer.from(value.content, "base64url");
  if (content.byteLength !== value.byteLength) return undefined;
  return Object.freeze({ id: value.id, messageId: value.messageId, contentType: value.contentType, byteLength: value.byteLength, createdAt: value.createdAt, content: value.content });
};

const conversation = value => {
  if (!record(value) || !identifier(value.id) || !text(value.title, 255) || !date(value.createdAt) || !date(value.updatedAt) || (value.deletedAt !== null && value.deletedAt !== undefined && !date(value.deletedAt))) return undefined;
  return Object.freeze({ id: value.id, title: value.deletedAt ? "Deleted consultation" : value.title.trim(), createdAt: value.createdAt, updatedAt: value.updatedAt, deletedAt: value.deletedAt ?? null });
};

const entry = value => {
  if (!record(value) || !Array.isArray(value.messages) || (value.attachments !== undefined && !Array.isArray(value.attachments))) return undefined;
  const item = conversation(value.conversation);
  if (!item) return undefined;
  if (value.usage !== undefined && !Array.isArray(value.usage)) return undefined;
  const usage = (value.usage ?? []).map(normalizeUsageAttempt);
  if (usage.some(item => !item) || new Set(usage.map(item => item.id)).size !== usage.length) return undefined;
  const messages = value.messages.map(message);
  const attachments = (value.attachments ?? []).map(attachment);
  if (messages.some(item => !item) || new Set(messages.map(item => item.id)).size !== messages.length || messages.some((item, index) => item.sequence !== index + 1)) return undefined;
  if (attachments.some(item => !item) || new Set(attachments.map(item => item.id)).size !== attachments.length || attachments.some(item => !messages.some(message => message.id === item.messageId))) return undefined;
  if (item.deletedAt && (messages.length || attachments.length || usage.length)) return undefined;
  return Object.freeze({ conversation: item, usage: Object.freeze(usage), messages: Object.freeze(messages.map(message => Object.freeze({ ...message, attachments: Object.freeze(attachments.filter(item => item.messageId === message.id).map(item => Object.freeze({ id: item.id, contentType: item.contentType, byteLength: item.byteLength, createdAt: item.createdAt }))) }))), attachments: Object.freeze(attachments) });
};

export function normalizeRecoverySnapshot(value) {
  if (!record(value) || value.schemaVersion !== schemaVersion || value.kind !== "nanoduck-owner-records" || !date(value.createdAt) || !Array.isArray(value.conversations)) return undefined;
  const conversations = value.conversations.map(entry);
  if (conversations.some(item => !item) || new Set(conversations.map(item => item.conversation.id)).size !== conversations.length) return undefined;
  const configuration = value.configuration === undefined ? undefined : normalizeConfiguration(value.configuration);
  if (value.configuration !== undefined && !configuration) return undefined;
  return Object.freeze({ schemaVersion, kind: "nanoduck-owner-records", createdAt: value.createdAt, conversations: Object.freeze(conversations), ...(configuration ? { configuration } : {}) });
}

export function sealRecoverySnapshot(snapshot, key) {
  const normalized = normalizeRecoverySnapshot(snapshot);
  if (!normalized || !Buffer.isBuffer(key) || key.byteLength !== 32) throw new Error("invalid_recovery_snapshot");
  const envelope = Object.freeze({ schemaVersion, kind: "nanoduck-owner-backup", payload: encryptText(JSON.stringify(normalized), key) });
  if (Buffer.byteLength(JSON.stringify(envelope)) > maximumRecoveryBytes) throw new Error("recovery_backup_exceeds_32_mib");
  return envelope;
}

export function openRecoveryEnvelope(value, key) {
  if (!record(value) || value.schemaVersion !== schemaVersion || value.kind !== "nanoduck-owner-backup" || !record(value.payload) || !Buffer.isBuffer(key) || key.byteLength !== 32) return undefined;
  try { return normalizeRecoverySnapshot(JSON.parse(decryptText(value.payload, key))); } catch { return undefined; }
}

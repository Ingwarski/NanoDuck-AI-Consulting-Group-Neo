import { createHash } from "node:crypto";
import { documentNames, validDocument } from "./instruction-documents.mjs";
import { decryptText, encryptText } from "./crypto.mjs";

const object = value => value && typeof value === "object" && !Array.isArray(value);
const hash = text => createHash("sha256").update(text).digest("hex");
const id = value => typeof value === "string" && /^[A-Za-z0-9_-]{16,128}$/u.test(value);
const date = value => typeof value === "string" && Number.isFinite(Date.parse(value));
export function normalizeConfiguration(value) {
  if (!object(value) || !object(value.settings) || !Array.isArray(value.runtimeHistory) || !Array.isArray(value.documents)) return undefined;
  if (Object.entries(value.settings).some(([key, val]) => !/^[a-zA-Z]{1,64}$/u.test(key) || typeof val !== "string" || val.length > 128)) return undefined;
  const validRuntime = item => object(item) && id(item.id) && validDocument(item.markdown) && hash(item.markdown) === item.contentHash && date(item.createdAt) && typeof item.action === "string" && item.action.length <= 32 && (item.restoredFromId == null || id(item.restoredFromId));
  if (!value.runtimeHistory.every(validRuntime) || new Set(value.runtimeHistory.map(v => v.id)).size !== value.runtimeHistory.length) return undefined;
  if (value.runtimeInstructions != null && (!object(value.runtimeInstructions) || !value.runtimeHistory.some(item => item.id === value.runtimeInstructions.revision && item.contentHash === value.runtimeInstructions.contentHash && item.markdown === value.runtimeInstructions.markdown))) return undefined;
  if (!value.documents.every(item => object(item) && documentNames.includes(item.name) && Number.isSafeInteger(item.revision) && item.revision > 0 && item.revision <= 0xffffffff && validDocument(item.markdown) && hash(item.markdown) === item.sha256 && date(item.createdAt))) return undefined;
  if (new Set(value.documents.map(item => `${item.name}:${item.revision}`)).size !== value.documents.length) return undefined;
  return structuredClone({ settings: value.settings, runtimeInstructions: value.runtimeInstructions ?? null, runtimeHistory: value.runtimeHistory, documents: value.documents });
}

export async function readConfiguration(connection, key, defaults) {
  const [settings] = await connection.execute("SELECT settings_json FROM nanoduck_settings WHERE owner_id='owner'");
  const [current] = await connection.execute("SELECT ciphertext,iv,tag,revision,content_hash,updated_at FROM nanoduck_runtime_instructions WHERE owner_id='owner'");
  const [history] = await connection.execute("SELECT id,action,restored_from_id,ciphertext,iv,tag,content_hash,created_at FROM nanoduck_runtime_instruction_history WHERE owner_id='owner' ORDER BY created_at,id");
  const [documents] = await connection.execute("SELECT document_id,revision,ciphertext,iv,tag FROM nanoduck_instruction_documents ORDER BY document_id,revision");
  const setting = settings[0]?.settings_json;
  const configuration = normalizeConfiguration({
    settings: { ...defaults, ...(typeof setting === "string" ? JSON.parse(setting) : setting) },
    runtimeInstructions: current.length ? { markdown: decryptText(current[0], key), revision: current[0].revision, contentHash: current[0].content_hash, updatedAt: current[0].updated_at } : null,
    runtimeHistory: history.map(row => ({ id: row.id, action: row.action, restoredFromId: row.restored_from_id, markdown: decryptText(row, key), contentHash: row.content_hash, createdAt: row.created_at })),
    documents: documents.map(row => {
      const item = JSON.parse(decryptText(row, key));
      if (item.name !== row.document_id || item.revision !== Number(row.revision)) throw new Error("instruction_integrity_failed");
      return item;
    })
  });
  if (!configuration) throw new Error("invalid_configuration_backup");
  return configuration;
}

// Explicit disaster recovery replaces configuration atomically. Normal record restore
// preserves current configuration. Session cookies and provider credentials are excluded.
export async function replaceConfiguration(connection, key, input) {
  const config = normalizeConfiguration(input);
  if (!config) throw new Error("invalid_configuration_backup");
  await connection.execute("DELETE FROM nanoduck_instruction_documents");
  await connection.execute("DELETE FROM nanoduck_runtime_instruction_history WHERE owner_id='owner'");
  await connection.execute("DELETE FROM nanoduck_runtime_instructions WHERE owner_id='owner'");
  await connection.execute("INSERT INTO nanoduck_settings (owner_id,settings_json) VALUES ('owner',?) ON DUPLICATE KEY UPDATE settings_json=VALUES(settings_json)", [JSON.stringify(config.settings)]);
  for (const item of config.runtimeHistory) {
    const sealed = encryptText(item.markdown, key);
    await connection.execute("INSERT INTO nanoduck_runtime_instruction_history (id,owner_id,action,restored_from_id,ciphertext,iv,tag,content_hash,created_at) VALUES (?,'owner',?,?,?,?,?,?,?)", [item.id,item.action,item.restoredFromId ?? null,sealed.ciphertext,sealed.iv,sealed.tag,item.contentHash,item.createdAt]);
  }
  if (config.runtimeInstructions) {
    const item = config.runtimeInstructions; const sealed = encryptText(item.markdown, key);
    const createdAt = config.runtimeHistory.find(version => version.id === item.revision).createdAt;
    await connection.execute("INSERT INTO nanoduck_runtime_instructions (owner_id,ciphertext,iv,tag,revision,content_hash,created_at,updated_at) VALUES ('owner',?,?,?,?,?,?,?)", [sealed.ciphertext,sealed.iv,sealed.tag,item.revision,item.contentHash,createdAt,createdAt]);
  }
  for (const item of config.documents) {
    const sealed = encryptText(JSON.stringify(item), key);
    await connection.execute("INSERT INTO nanoduck_instruction_documents (document_id,revision,ciphertext,iv,tag) VALUES (?,?,?,?,?)", [item.name,item.revision,sealed.ciphertext,sealed.iv,sealed.tag]);
  }
  // Restored revisions must not be editable through an old authenticated browser.
  await connection.execute("UPDATE nanoduck_sessions SET revoked_at=? WHERE revoked_at IS NULL", [new Date().toISOString()]);
}

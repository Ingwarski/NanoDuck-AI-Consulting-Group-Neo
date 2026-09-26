import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { encryptText, decryptText } from "./crypto.mjs";

export const documentNames = Object.freeze(["AGENTS.md", "CONSILIUM.md", "CONSULTING_PLAYBOOK.md", "WORKING_CONTEXT.md"]);
const retiredDefaults = Object.freeze({
  "AGENTS.md": "34ca8b01845a9c6a292cc93aa3ba2ce2656814c52d4391a10878e823106d6d62",
  "CONSILIUM.md": "2a889fff9fc209348c4057dbebb89a6550f5f3dcd2a3d697eda607d4f9cc0c62"
});
const validName = name => documentNames.includes(name);
const digest = markdown => createHash("sha256").update(markdown).digest("hex");
export const validDocument = markdown => typeof markdown === "string" && markdown.trim().length > 0 && Buffer.byteLength(markdown, "utf8") <= 64 * 1024 && !markdown.includes("\0");
export const readDocumentDefault = async name => {
  if (!validName(name)) throw new Error("invalid_instruction_document");
  const markdown = await readFile(new URL(`../../instructions/${name}`, import.meta.url), "utf8");
  if (!validDocument(markdown)) throw new Error("invalid_instruction_default");
  return markdown;
};
const version = (name, revision, markdown, action) => ({ name, revision, markdown, action, sha256: digest(markdown), createdAt: new Date().toISOString() });
const summary = ({ markdown, ...metadata }) => metadata;

export function createMemoryDocuments() {
  const documents = new Map();
  return {
    exportDocuments() { return structuredClone([...documents.values()].flat()); },
    replaceDocuments(records) { documents.clear(); for (const name of documentNames) { const versions = records.filter(item => item.name === name).sort((a,b) => a.revision - b.revision); if (versions.length) documents.set(name, structuredClone(versions)); } },
    async initializeDocuments() {
      const defaults = await Promise.all(documentNames.map(readDocumentDefault));
      documentNames.forEach((name, index) => { if (!documents.has(name)) documents.set(name, [version(name, 1, defaults[index], "bootstrap")]); });
    },
    async migrateDefaultDocuments() {
      const migrated = [];
      for (const [name, oldHash] of Object.entries(retiredDefaults)) {
        const versions = documents.get(name);
        if (!versions?.length || versions.at(-1).sha256 !== oldHash) continue;
        const markdown = await readDocumentDefault(name);
        if (digest(markdown) === oldHash) continue;
        versions.push(version(name, versions.at(-1).revision + 1, markdown, "parallel_protocol_migration"));
        migrated.push(name);
      }
      return migrated;
    },
    async instructionDocuments() { return documentNames.map(name => structuredClone(documents.get(name)?.at(-1))); },
    async instructionHistory(name) { return (documents.get(name) ?? []).slice(-100).reverse().map(summary); },
    async instructionVersion(name, revision) { return structuredClone(documents.get(name)?.find(item => item.revision === revision)); },
    async saveInstructionDocument(name, revision, markdown, action = "save") {
      const versions = documents.get(name);
      if (!versions || !validDocument(markdown) || !Number.isSafeInteger(revision) || revision < 1 || revision >= 0xffffffff || versions.at(-1).revision !== revision) return undefined;
      const next = version(name, revision + 1, markdown, action); versions.push(next); return structuredClone(next);
    }
  };
}

export function createMySqlDocuments(pool, key) {
  const decode = row => {
    if (!row) return undefined;
    const value = JSON.parse(decryptText(row, key));
    if (!validName(value.name) || value.name !== row.document_id || value.revision !== row.revision || !validDocument(value.markdown) || digest(value.markdown) !== value.sha256) throw new Error("instruction_integrity_failed");
    return value;
  };
  const current = async (executor, name) => {
    const [rows] = await executor.execute("SELECT document_id,revision,ciphertext,iv,tag FROM nanoduck_instruction_documents WHERE document_id=? ORDER BY revision DESC LIMIT 1", [name]);
    return decode(rows[0]);
  };
  const transaction = async operation => {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [lock] = await connection.execute("SELECT owner_id FROM nanoduck_owner_locks WHERE owner_id='owner' FOR UPDATE");
      if (lock.length !== 1) throw new Error("owner_lock_missing");
      const result = await operation(connection); await connection.commit(); return result;
    } catch (error) { await connection.rollback().catch(() => {}); throw error; }
    finally { connection.release(); }
  };
  const insert = async (connection, record) => {
    const sealed = encryptText(JSON.stringify(record), key);
    await connection.execute("INSERT INTO nanoduck_instruction_documents (document_id,revision,ciphertext,iv,tag) VALUES (?,?,?,?,?)", [record.name, record.revision, sealed.ciphertext, sealed.iv, sealed.tag]);
    return record;
  };
  return {
    async initializeDocuments() {
      const defaults = await Promise.all(documentNames.map(readDocumentDefault));
      await transaction(async connection => {
        for (const [index, name] of documentNames.entries()) if (!await current(connection, name)) await insert(connection, version(name, 1, defaults[index], "bootstrap"));
      });
    },
    async migrateDefaultDocuments() {
      const defaults = Object.fromEntries(await Promise.all(Object.keys(retiredDefaults).map(async name => [name, await readDocumentDefault(name)])));
      return transaction(async connection => {
        const migrated = [];
        for (const [name, oldHash] of Object.entries(retiredDefaults)) {
          const previous = await current(connection, name);
          if (!previous || previous.sha256 !== oldHash || digest(defaults[name]) === oldHash) continue;
          await insert(connection, version(name, previous.revision + 1, defaults[name], "parallel_protocol_migration"));
          migrated.push(name);
        }
        return migrated;
      });
    },
    async instructionDocuments() { return transaction(connection => Promise.all(documentNames.map(name => current(connection, name)))); },
    async instructionHistory(name) {
      if (!validName(name)) return [];
      const [rows] = await pool.execute("SELECT document_id,revision,ciphertext,iv,tag FROM nanoduck_instruction_documents WHERE document_id=? ORDER BY revision DESC LIMIT 100", [name]);
      return rows.map(row => summary(decode(row)));
    },
    async instructionVersion(name, revision) {
      if (!validName(name) || !Number.isSafeInteger(revision) || revision < 1) return undefined;
      const [rows] = await pool.execute("SELECT document_id,revision,ciphertext,iv,tag FROM nanoduck_instruction_documents WHERE document_id=? AND revision=?", [name, revision]);
      return decode(rows[0]);
    },
    async saveInstructionDocument(name, revision, markdown, action = "save") {
      if (!validName(name) || !validDocument(markdown) || !Number.isSafeInteger(revision) || revision < 1 || revision >= 0xffffffff) return undefined;
      return transaction(async connection => {
        const previous = await current(connection, name);
        return previous?.revision === revision ? insert(connection, version(name, revision + 1, markdown, action)) : undefined;
      });
    }
  };
}

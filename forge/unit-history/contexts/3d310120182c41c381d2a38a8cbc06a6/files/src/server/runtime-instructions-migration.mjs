import { encryptText, randomId } from "./crypto.mjs";
import { parseRuntimeInstructions, upgradeRuntimeInstructionMarkdown } from "./prompt-contracts.mjs";

const columnsFor = async connection => {
  const [rows] = await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='nanoduck_runtime_instructions'");
  return new Set(rows.map(row => row.COLUMN_NAME));
};

const addColumn = (connection, definition) => connection.query(`ALTER TABLE nanoduck_runtime_instructions ADD COLUMN ${definition}`);

const insertHistory = (connection, record) => connection.query(
  "INSERT IGNORE INTO nanoduck_runtime_instruction_history (id,owner_id,action,restored_from_id,ciphertext,iv,tag,content_hash,created_at) VALUES (?,'owner',?,?,?,?,?,?,?)",
  [record.id,record.action,record.restoredFromId ?? null,record.ciphertext,record.iv,record.tag,record.contentHash,record.createdAt]
);

const recordFor = (contract, key, action, createdAt) => ({
  id: randomId(), action, contentHash: contract.revision, createdAt, ...encryptText(contract.markdown, key)
});

export async function migrateRuntimeInstructionStorage(connection, dataKey, bootstrapMarkdown = undefined) {
  let columns = await columnsFor(connection);
  if (!columns.has("ciphertext")) await addColumn(connection, "ciphertext MEDIUMTEXT NULL");
  if (!columns.has("iv")) await addColumn(connection, "iv VARCHAR(64) NULL");
  if (!columns.has("tag")) await addColumn(connection, "tag VARCHAR(64) NULL");
  if (!columns.has("content_hash")) await addColumn(connection, "content_hash CHAR(64) NULL");
  if (!columns.has("created_at")) await addColumn(connection, "created_at VARCHAR(40) NULL");
  columns = await columnsFor(connection);

  if (columns.has("markdown")) {
    const [legacyRows] = await connection.query("SELECT owner_id,markdown,updated_at FROM nanoduck_runtime_instructions WHERE markdown IS NOT NULL");
    for (const row of legacyRows) {
      const contract = parseRuntimeInstructions(upgradeRuntimeInstructionMarkdown(row.markdown));
      const record = recordFor(contract, dataKey, "migrated", row.updated_at);
      await connection.query("UPDATE nanoduck_runtime_instructions SET ciphertext=?,iv=?,tag=?,revision=?,content_hash=?,created_at=COALESCE(created_at, ?),updated_at=? WHERE owner_id=?", [record.ciphertext,record.iv,record.tag,record.id,record.contentHash,record.createdAt,record.createdAt,row.owner_id]);
      if (row.owner_id === "owner") await insertHistory(connection, record);
    }
  }

  const [incomplete] = await connection.query("SELECT owner_id FROM nanoduck_runtime_instructions WHERE ciphertext IS NULL OR iv IS NULL OR tag IS NULL OR content_hash IS NULL OR created_at IS NULL");
  if (incomplete.length) throw new Error("Runtime-instructions migration found an incomplete record.");
  await connection.query("ALTER TABLE nanoduck_runtime_instructions MODIFY COLUMN ciphertext MEDIUMTEXT NOT NULL, MODIFY COLUMN iv VARCHAR(64) NOT NULL, MODIFY COLUMN tag VARCHAR(64) NOT NULL, MODIFY COLUMN revision VARCHAR(128) NOT NULL, MODIFY COLUMN content_hash CHAR(64) NOT NULL, MODIFY COLUMN created_at VARCHAR(40) NOT NULL");
  if (columns.has("markdown")) await connection.query("ALTER TABLE nanoduck_runtime_instructions DROP COLUMN markdown");

  const [current] = await connection.query("SELECT owner_id FROM nanoduck_runtime_instructions WHERE owner_id='owner' LIMIT 1");
  if (current.length || !bootstrapMarkdown) return { bootstrapped: false, migrated: true };
  const record = recordFor(parseRuntimeInstructions(upgradeRuntimeInstructionMarkdown(bootstrapMarkdown)), dataKey, "bootstrap", new Date().toISOString());
  await connection.query("INSERT INTO nanoduck_runtime_instructions (owner_id,ciphertext,iv,tag,revision,content_hash,created_at,updated_at) VALUES ('owner',?,?,?,?,?,?,?)", [record.ciphertext,record.iv,record.tag,record.id,record.contentHash,record.createdAt,record.createdAt]);
  await insertHistory(connection, record);
  return { bootstrapped: true, migrated: true };
}

import { databaseLockName } from "./database-lock.mjs";
import { createDatabaseSslOptions } from "./database-tls.mjs";
import { readPromptDefault } from "./instruction-bootstrap.mjs";
import { sealRunSnapshot, openRunSnapshot } from "./run-snapshot.mjs";
import { readFile } from "node:fs/promises";
import { createConnection } from "mysql2/promise";
import { loadConfig } from "./config.mjs";
import { migrateRuntimeInstructionStorage } from "./runtime-instructions-migration.mjs";

const config = loadConfig();
if (!config.databaseUrl) throw new Error("DATABASE_URL is required to run migrations.");
const ssl = await createDatabaseSslOptions(config);
const connection = await createConnection({ uri: config.databaseUrl, ssl, connectTimeout: 10_000 });
try {
  const [lease] = await connection.execute("SELECT GET_LOCK(?, 0) AS acquired", [databaseLockName(config.databaseUrl)]);
  if (Number(lease[0]?.acquired) !== 1) throw new Error("Stop the application before migrating its database.");
  const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  for (const statement of schema.split(/;\s*$/mu).map(value => value.trim()).filter(Boolean)) await connection.query(statement);
  const runtimeInstructions = await migrateRuntimeInstructionStorage(connection, config.dataKey, (await readPromptDefault()).markdown);
  // Convert existing plaintext instruction snapshots in bounded batches; repeat-safe.
  let lastId = "";
  while (true) {
    await connection.beginTransaction();
    try {
      const [rows] = await connection.execute("SELECT id,snapshot_json FROM nanoduck_runs WHERE id>? ORDER BY id LIMIT 100 FOR UPDATE", [lastId]);
      for (const row of rows) {
        const stored = typeof row.snapshot_json === "string" ? JSON.parse(row.snapshot_json) : row.snapshot_json;
        if (!stored.format) await connection.execute("UPDATE nanoduck_runs SET snapshot_json=? WHERE id=?", [JSON.stringify(sealRunSnapshot(openRunSnapshot(stored, config.dataKey), config.dataKey)), row.id]);
      }
      await connection.commit();
      if (!rows.length) break;
      lastId = rows.at(-1).id;
    } catch (error) { await connection.rollback(); throw error; }
  }
  process.stdout.write(`NanoDuck schema applied. Runtime instructions ${runtimeInstructions.bootstrapped ? "bootstrapped into encrypted database storage" : "left in encrypted database storage"}.\n`);
} finally {
  await connection.end();
}

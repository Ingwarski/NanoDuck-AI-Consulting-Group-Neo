import { open } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "./config.mjs";
import { createDatabaseSslOptions } from "./database-tls.mjs";
import { createMySqlStore } from "./store.mjs";
import { openRecoveryEnvelope, sealRecoverySnapshot, maximumRecoveryBytes } from "./recovery.mjs";
import { readRegularFile } from "./read-regular-file.mjs";

const [command, requestedPath, confirmation, configurationConfirmation, ...extra] = process.argv.slice(2);
const usage = () => { throw new Error("Usage: npm run recovery -- backup <new-encrypted-file> | restore <encrypted-file> --confirm-restore [--replace-configuration]"); };
if (!requestedPath || !["backup", "restore"].includes(command)) usage();
if (command === "restore" && confirmation !== "--confirm-restore") usage();
if (extra.length || (configurationConfirmation !== undefined && configurationConfirmation !== "--replace-configuration") || (command === "backup" && confirmation !== undefined)) usage();

const config = loadConfig();
if (!config.databaseUrl) throw new Error("A verified MySQL target is required for recovery operations.");
const store = await createMySqlStore(config.databaseUrl, config.dataKey, await createDatabaseSslOptions(config));
const target = resolve(requestedPath);
try {
  if (command === "restore" && !await store.acquireLeadership()) throw new Error("Stop the application before restoring this database.");
  if (command === "backup") {
    const snapshot = await store.recoverySnapshot();
    const output = JSON.stringify(sealRecoverySnapshot(snapshot, config.recoveryKey));
    const file = await open(target, "wx", 0o600);
    try { await file.writeFile(output, "utf8"); await file.sync(); } finally { await file.close(); }
    process.stdout.write(`${JSON.stringify({ result: "backup_created", createdAt: snapshot.createdAt, conversations: snapshot.conversations.length })}\n`);
  } else {
    const input = await readRegularFile(target, maximumRecoveryBytes).catch(error => {
      if (error instanceof RangeError && error.message === "file_too_large") throw new Error("Recovery input exceeds 32 MiB.");
      throw error;
    });
    const envelope = JSON.parse(input.toString("utf8"));
    const snapshot = openRecoveryEnvelope(envelope, config.recoveryKey); if (!snapshot) throw new Error("Recovery input is invalid or cannot be authenticated.");
    const result = await store.restoreRecovery(snapshot, { restoreConfiguration: configurationConfirmation === "--replace-configuration" }); if (!result) throw new Error("Recovery input is invalid.");
    process.stdout.write(`${JSON.stringify({ result: "restore_completed", configurationRestored: configurationConfirmation === "--replace-configuration" && Boolean(snapshot.configuration), ...result })}\n`);
  }
} finally { await store.close(); }

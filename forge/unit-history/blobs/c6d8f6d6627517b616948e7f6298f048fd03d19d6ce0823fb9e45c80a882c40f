import { loadConfig } from "./config.mjs";
import { createDatabaseSslOptions } from "./database-tls.mjs";
import { createCodexProvider } from "./codex-provider.mjs";
import { createMySqlStore } from "./store.mjs";
import { readRegularFile } from "./read-regular-file.mjs";
import { fileURLToPath } from "node:url";

const config = loadConfig();
const syntheticCommand = fileURLToPath(new URL("../../test/fixtures/fake-codex.mjs", import.meta.url));
if (!config.databaseUrl && !(config.mode === "test" && config.codexCommand === syntheticCommand)) {
  throw new Error("Persistent database leadership is required for managed Codex preflight.");
}

const observedAt = new Date().toISOString();
let store; let provider; let capability;
try {
  if (config.databaseUrl) {
    store = await createMySqlStore(config.databaseUrl, config.dataKey, await createDatabaseSslOptions(config));
    if (!await store.acquireLeadership()) capability = Object.freeze({ status: "busy", models: Object.freeze([]) });
    else {
      if (config.readyForProvider) {
        let seed;
        try {
          seed = config.codexAuthPath ? await readRegularFile(config.codexAuthPath, 64 * 1024) : config.codexAuthBytes;
          await store.seedCodexGrant(seed);
        } catch (error) {
          if (error?.message !== "codex_grant_invalid") throw error;
          process.stderr.write("NanoDuck Codex bootstrap grant is invalid; any previously stored managed grant remains in use.\n");
        } finally { seed?.fill(0); }
      }
      provider = createCodexProvider(config, undefined, store);
      capability = await provider.inspect();
    }
  } else {
    provider = createCodexProvider(config);
    capability = await provider.inspect();
  }
} finally {
  try { await provider?.close(); }
  finally { await store?.close(); }
}
const report = Object.freeze({
  schema_version: 1,
  observed_at: observedAt,
  scope: config.databaseUrl
    ? "Codex account/catalog/rate-limit inspection with exclusive access to the owned encrypted provider grant; it may update that grant in private MySQL, but starts no model turn or conversation. Busy while the application owns database leadership."
    : "Synthetic test-only Codex account/catalog/rate-limit inspection; no model turn, conversation or database access.",
  codex: capability
});
process.stdout.write(`${JSON.stringify(report)}\n`);
if (capability.status !== "ready") process.exitCode = 2;

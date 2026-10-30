import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

const authPath = join(process.env.CODEX_HOME ?? "", "auth.json");
const configuration = await readFile(join(process.env.CODEX_HOME ?? "", "config.toml"), "utf8");
if (!configuration.includes('cli_auth_credentials_store = "file"')) process.exit(1);
const send = value => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...value })}\n`);
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", async line => {
  const request = JSON.parse(line);
  if (request.method === "initialized" || request.id === undefined) return;
  if (request.method === "initialize") return send({ id: request.id, result: {} });
  if (request.method === "account/read") {
    const grant = JSON.parse(await readFile(authPath, "utf8"));
    const initial = grant?.tokens?.refresh_token;
    if (["synthetic-initial", "synthetic-divergent", "synthetic-malformed-refresh"].includes(initial)) {
      grant.tokens.refresh_token = initial === "synthetic-divergent" ? `synthetic-rotated-${process.pid}` : initial === "synthetic-malformed-refresh" ? "" : "synthetic-rotated";
      grant.tokens.access_token = "synthetic-access-updated";
      await writeFile(authPath, JSON.stringify(grant), { mode: 0o600 });
    } else if (grant?.tokens?.refresh_token !== "synthetic-rotated" && !grant?.tokens?.refresh_token?.startsWith("synthetic-rotated-")) return send({ id: request.id, result: { account: null } });
    return send({ id: request.id, result: { account: { type: "chatgpt" } } });
  }
  if (request.method === "model/list") return send({ id: request.id, result: { data: [{ id: "astra", model: "gpt-6-astra", supportedReasoningEfforts: [{ reasoningEffort: "xhigh" }] }], nextCursor: null } });
  if (request.method === "account/rateLimits/read") return send({ id: request.id, result: { rateLimits: { rateLimitReachedType: null } } });
  send({ id: request.id, error: { message: "unknown_method" } });
});

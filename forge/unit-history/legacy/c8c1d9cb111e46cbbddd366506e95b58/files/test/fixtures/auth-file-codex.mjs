#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

const authPath = join(process.env.CODEX_HOME ?? "", "auth.json");
const auth = await readFile(authPath, "utf8").catch(() => undefined);
const metadata = await stat(authPath).catch(() => undefined);
if (auth !== '{"test":"owned-auth-state"}' || !metadata || (metadata.mode & 0o777) !== 0o600) process.exit(1);

const send = value => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...value })}\n`);
createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", line => {
  const request = JSON.parse(line);
  if (request.method === "initialized" || request.id === undefined) return;
  if (request.method === "initialize") return send({ id: request.id, result: {} });
  if (request.method === "account/read") return send({ id: request.id, result: { account: { type: "chatgpt" } } });
  if (request.method === "model/list") return send({ id: request.id, result: { data: [{ id: "astra", model: "gpt-6-astra", supportedReasoningEfforts: [{ reasoningEffort: "xhigh" }] }], nextCursor: null } });
  if (request.method === "account/rateLimits/read") return send({ id: request.id, result: { rateLimits: { rateLimitReachedType: null } } });
  send({ id: request.id, error: { message: "unknown_method" } });
});

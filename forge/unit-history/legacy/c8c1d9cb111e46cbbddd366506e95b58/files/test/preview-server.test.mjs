import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";

const reservePort = async () => {
  const server = createServer(); server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
};
const launch = (overrides = {}) => {
  const child = spawn(process.execPath, ["src/server/start.mjs"], {
    cwd: process.cwd(),
    env: { NODE_ENV: "production", NANODUCK_RUNTIME_MODE: "production", NANODUCK_DEPLOYMENT_ROLE: "preview", APP_ORIGIN: "https://synthetic.preview.c35.airoapp.ai", PORT: "3000", DATABASE_URL: "invalid-database-url", DATA_ENCRYPTION_KEY: "invalid", OPENAI_API_KEY: "synthetic-forbidden-configuration", ...overrides },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = { stdout: "", stderr: "" };
  child.stdout.on("data", chunk => { output.stdout += chunk; });
  child.stderr.on("data", chunk => { output.stderr += chunk; });
  return { child, output, exited: once(child, "close") };
};
const waitFor = async predicate => {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error("preview_startup_timed_out");
};

test("Preview starts independently of invalid production secrets and never exposes the application backend", { timeout: 10_000 }, async () => {
  const port = await reservePort();
  const { child, output, exited } = launch({ PORT: String(port) });
  try {
    await waitFor(() => output.stdout.includes(`listening on 0.0.0.0:${port}`));
    const origin = `http://127.0.0.1:${port}`;
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "preview", store: "disabled" });
    const head = await fetch(`${origin}/healthz`, { method: "HEAD" });
    assert.equal(head.status, 200); assert.equal(await head.text(), "");
    const page = await (await fetch(origin)).text();
    assert.match(page, /NanoDuck deployment preview/u);
    assert.match(page, /application backend is disabled/u);
    assert.doesNotMatch(page, /<script|<form/iu);
    for (const [path, method] of [["/api/session", "GET"], ["/api/conversations", "POST"], ["/auth/google/start", "POST"], ["/auth/google/callback", "GET"]]) {
      const response = await fetch(`${origin}${path}`, { method });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "preview_backend_disabled" });
    }
    assert.equal((await fetch(`${origin}/client/app.js`)).status, 404);
    assert.doesNotMatch(output.stdout + output.stderr, /schema applied|Runtime instructions|Consulting Group listening/u);
    assert.equal(output.stderr, "");
  } finally {
    child.kill("SIGTERM");
    const [code, signal] = await exited;
    assert.equal(code, 0); assert.equal(signal, null);
  }
});

test("Preview rejects unknown roles, Published origins and invalid ports before listening", { timeout: 10_000 }, async () => {
  for (const [overrides, error] of [
    [{ NANODUCK_DEPLOYMENT_ROLE: "unknown" }, /NANODUCK_DEPLOYMENT_ROLE must be application or preview/u],
    [{ APP_ORIGIN: "https://synthetic.c35.airoapp.ai" }, /requires a GoDaddy Preview APP_ORIGIN/u],
    [{ APP_ORIGIN: "https://synthetic.preview.c35.airoapp.ai.evil.example" }, /requires a GoDaddy Preview APP_ORIGIN/u],
    [{ APP_ORIGIN: undefined }, /requires a GoDaddy Preview APP_ORIGIN/u],
    [{ PORT: "0" }, /PORT must be an integer/u],
    [{ PORT: "65536" }, /PORT must be an integer/u],
    [{ PORT: "3000invalid" }, /PORT must be an integer/u],
    [{ PORT: undefined }, /PORT must be an integer/u]
  ]) {
    const { output, exited } = launch(overrides);
    const [code] = await exited;
    assert.notEqual(code, 0);
    assert.match(output.stderr, error);
    assert.equal(output.stdout, "");
  }
});

test("the default and explicit application roles retain production configuration validation", async () => {
  for (const role of [undefined, "application"]) {
    const { output, exited } = launch({ NANODUCK_DEPLOYMENT_ROLE: role });
    const [code] = await exited;
    assert.notEqual(code, 0);
    assert.match(output.stderr, /Unsupported provider environment/u);
    assert.doesNotMatch(output.stdout, /deployment preview/u);
  }
});

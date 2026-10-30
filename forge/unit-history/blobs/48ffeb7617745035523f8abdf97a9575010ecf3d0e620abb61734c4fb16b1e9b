import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

const run = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, options);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  child.once("error", reject);
  child.once("exit", code => resolve({ code, stdout, stderr }));
});

test("the preflight inspects the managed catalog without starting a model turn", async () => {
  const directory = await mkdtemp(`${tmpdir()}/nanoduck-preflight-`);
  const authPath = `${directory}/auth.json`;
  const codexCommand = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  await writeFile(authPath, "{}", { mode: 0o600 });
  try {
    const result = await run(globalThis.process.execPath, ["src/server/preflight.mjs"], {
      cwd: process.cwd(),
      env: {
        ...globalThis.process.env,
        NODE_ENV: "test",
        CODEX_APP_SERVER_AUTH_PATH: authPath,
        CODEX_APP_SERVER_COMMAND: codexCommand
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    assert.equal(result.code, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.schema_version, 1);
    assert.equal(report.codex.status, "ready");
    assert.deepEqual(report.codex.models, [
      { id: "gpt-6-astra", efforts: ["xhigh", "ultra"] },
      { id: "gpt-6-sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }
    ]);
    assert.match(report.scope, /no model turn/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

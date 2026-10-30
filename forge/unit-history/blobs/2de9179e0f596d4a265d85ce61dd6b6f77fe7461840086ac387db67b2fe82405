import { mkdtemp, writeFile, readFile, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCodexProvider } from "../src/server/codex-provider.mjs";
import { testRuntimeInstructions as initialRuntimeInstructions } from "./fixtures/runtime-instructions.mjs";

test("Codex allows a progressing answer past its idle budget, but bounds silence and total duration", async () => {
  for (const [suffix, expected] of [["", { ok: true, body: "A bounded answer.", sources: [] }], [" wrong turn", { ok: false, code: "provider_idle_timeout" }], [" never completes", { ok: false, code: "provider_timeout" }]]) {
    const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] }, { idleMs: 300, maximumMs: suffix.includes("never") ? 550 : 2_000 });
    assert.deepEqual(await provider.invoke({ assignment: `Exercise progress deadline${suffix}`, model: "gpt-6-sol", effort: "max", evidence: { owner: "Synthetic question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions }), expected);
  }
});

test("Codex turns use an owned workspace and deny local tool channels", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command], codexAuthPath: undefined });
  assert.deepEqual(await provider.inspect(), { status: "ready", models: [{ id: "gpt-6-astra", efforts: ["xhigh", "ultra"] }, { id: "gpt-6-sol", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"] }] });
  const result = await provider.invoke({ assignment: "Give a practical answer.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(result, { ok: true, body: "A bounded answer.", sources: [] });
});

test("Codex rejects complete oversized context without truncation and maps upstream context errors", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command] });
  const base = { assignment: "Give a practical answer.", model: "gpt-6-sol", effort: "high", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions };
  assert.deepEqual(await provider.invoke({ ...base, assignment: "x".repeat(8 * 1024 * 1024 + 1) }), { ok: false, code: "context_too_large" });
  assert.deepEqual(await provider.invoke({ ...base, evidence: { owner: "x".repeat(8 * 1024 * 1024), discussion: "" } }), { ok: false, code: "context_too_large" });
  assert.deepEqual(await provider.invoke({ ...base, assignment: "Fail because context window" }), { ok: false, code: "context_too_large" });
});

test("Codex lists only exact supported models and their reported efforts", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  for (const [flags, models] of [
    [["--without-sol"], [{ id: "gpt-6-astra", efforts: ["xhigh", "ultra"] }]],
    [["--sol-only", "--limited-sol"], [{ id: "gpt-6-sol", efforts: ["medium"] }]]
  ]) {
    const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command, ...flags] });
    assert.deepEqual(await provider.inspect(), { status: "ready", models });
  }
  const absent = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command, "--sol-only", "--without-sol"] });
  assert.deepEqual(await absent.inspect(), { status: "incompatible", models: [] });
});

test("Codex forwards the exact Sol model and selected effort without substituting Astra", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command] });
  const result = await provider.invoke({ assignment: "Report selected model and effort.", model: "gpt-6-sol", effort: "medium", evidence: { owner: "Synthetic question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions });
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.body), { threadModel: "gpt-6-sol", turnModel: "gpt-6-sol", effort: "medium" });
});

test("Codex local auth input exists only in the private app-server home", async () => {
  const command = fileURLToPath(new URL("./fixtures/auth-file-codex.mjs", import.meta.url));
  const provider = createCodexProvider({
    readyForProvider: true,
    codexCommand: process.execPath, codexCommandArgs: [command],
    codexAuthPath: undefined,
    codexAuthBytes: Buffer.from('{"test":"owned-auth-state"}')
  });
  assert.deepEqual(await provider.inspect(), { status: "ready", models: [{ id: "gpt-6-astra", efforts: ["xhigh"] }] });
});

test("live research keeps source metadata out of natural agent prose", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command], codexAuthPath: undefined });
  const result = await provider.invoke({ assignment: "Give a practical answer.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "What is the current market evidence?", discussion: "" }, research: true, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.equal(result.ok, true);
  assert.equal(result.body, "A bounded answer.");
  assert.deepEqual(result.sources, [{ url: "https://example.com/buyer-evidence", title: "Buyer evidence", claim: "Buyer willingness must be measured before positioning.", retrievedAt: result.sources[0].retrievedAt, publishedAt: "2026-09-01" }]);
  assert.match(result.sources[0].retrievedAt, /^\d{4}-\d{2}-\d{2}T/u);
});

test("research diagnostics count matching completed tool calls without logging queries", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command] });
  const originalWrite = process.stdout.write;
  let logs = ""; const attempts = [];
  process.stdout.write = function (chunk, ...args) {
    if (typeof chunk === "string" && chunk.startsWith('{"event":"nanoduck.provider.')) { logs += chunk; return true; }
    return originalWrite.call(this, chunk, ...args);
  };
  try {
    const result = await provider.invoke({ onUsage: attempt => attempts.push(attempt), assignment: "Report completed research diagnostics.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Check public rules dated 04.11.2026.", discussion: "" }, research: true, runtimeInstructions: initialRuntimeInstructions });
    assert.deepEqual(result, { ok: true, body: "A bounded answer.", sources: [] });
  } finally { process.stdout.write = originalWrite; }
  const completion = logs.trim().split("\n").map(line => JSON.parse(line)).find(item => item.event === "nanoduck.provider.turn_completed");
  assert.equal(completion.webSearchCount, 2);
  const steps = attempts.at(-1).diagnostics.researchSteps;
  assert.equal(steps.length, 2); assert.equal(steps[0].action, "search"); assert.equal(steps[1].repeatOf, 1);
  assert.doesNotMatch(JSON.stringify(attempts), /synthetic-query-do-not-log|wrong-thread|wrong-turn|fingerprint/);
  assert.doesNotMatch(logs, /synthetic-query-do-not-log|public rules dated|wrong-thread|wrong-turn/u);
});

test("prohibited sources and isolated language fragments are withheld without losing useful advice", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command], codexAuthPath: undefined });
  const source = await provider.invoke({ assignment: "Return a prohibited source.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: true, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(source, { ok: true, body: "A bounded answer.", sources: [] });
  const prose = await provider.invoke({ assignment: "Return prohibited prose.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(prose, { ok: false, code: "language_policy" });
  const mixed = await provider.invoke({ assignment: "Return mixed-language prose.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(mixed, { ok: true, body: "The buyer test should run for two weeks. [prohibited-language fragment omitted] Measure qualified replies and conversion.", sources: [] });
  const bodyUrl = await provider.invoke({ assignment: "Return prohibited body URL.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(bodyUrl, { ok: true, body: "Read blocked (source link omitted: unapproved URL).", sources: [] });
  const onlyUrl = await provider.invoke({ assignment: "Return only a prohibited body URL.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(onlyUrl, { ok: false, code: "output_policy" });
});

test("a completed provider notification clears its deadline waiter", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command], codexAuthPath: undefined });
  const result = await provider.invoke({ assignment: "Wait for the notification.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(result, { ok: true, body: "A bounded answer.", sources: [] });
});

test("valid Ukrainian prose and source metadata survive Codex output validation", async () => {
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] });
  const result = await provider.invoke({ assignment: "Return a Ukrainian relative-pronoun example.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Які умови вступу?", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions });
  assert.equal(result.ok, true);
  assert.equal(result.body, "Уточніть, які умови потрібно виконати.");
  assert.equal(result.sources[0].title, "Курси, які доступні");
  assert.equal(result.sources[0].claim, "Вимоги, які підтверджує програма.");
});

test("a slow ephemeral turn uses matching completed items and terminal events without reading stored history", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command], codexAuthPath: undefined });
  const result = await provider.invoke({ assignment: "Wait for a slow ephemeral turn.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
  assert.deepEqual(result, { ok: true, body: "A bounded answer.", sources: [] });
});

test("a completion received before the start response is retained", async () => {
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] });
  const result = await provider.invoke({ assignment: "Complete before the start response.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions });
  assert.deepEqual(result, { ok: true, body: "A bounded answer.", sources: [] });
});

test("a failed turn never accepts a previously completed message item", async () => {
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] });
  const result = await provider.invoke({ assignment: "Fail after a completed item.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions });
  assert.deepEqual(result, { ok: false, code: "quota_blocked" });
});

test("a provider connection closing without completion releases the invocation", { timeout: 30_000 }, async () => {
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] });
  const result = await provider.invoke({ assignment: "Close without completion.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions });
  assert.deepEqual(result, { ok: false, code: "provider_unavailable" });
});

test("Stop cancels an unresolved ephemeral turn", { timeout: 30_000 }, async () => {
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    const result = await provider.invoke({ assignment: "Wait until cancelled.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: controller.signal });
    assert.deepEqual(result, { ok: false, code: "cancelled" });
  } finally { clearTimeout(timer); }
});

test("provider RPC failures retain a safe category and failed operation without logging the raw response", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command], codexAuthPath: undefined });
  const originalWrite = process.stdout.write;
  let logs = "";
  process.stdout.write = chunk => {
    logs += String(chunk);
    return true;
  };
  try {
    const result = await provider.invoke({ assignment: "Fail the turn RPC.", model: "gpt-6-astra", effort: "xhigh", evidence: { owner: "Question", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: new AbortController().signal });
    assert.deepEqual(result, { ok: false, code: "method_unavailable" });
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.match(logs, /"code":"rpc_-32601"/u);
  assert.match(logs, /"category":"method_unavailable"/u);
  assert.match(logs, /"request":"turn\/start"/u);
  assert.doesNotMatch(logs, /authentication material/u);
});

 test("failed initialization kills the child and removes its private credential directory", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "nanoduck-provider-test-"));
  const command = join(root, "reject-init.mjs"); const evidence = join(root, "started.json");
  try {
    await writeFile(command, `import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
writeFileSync(${JSON.stringify(evidence)}, JSON.stringify({ pid: process.pid, cwd: process.cwd() }));
createInterface({ input: process.stdin }).on('line', line => { const message = JSON.parse(line); process.stdout.write(JSON.stringify({ id: message.id, error: { code: -32601, message: 'initialize unsupported' } }) + '\\n'); });
`, { mode: 0o600 });
    const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command], codexAuthBytes: Buffer.from('{"test":"fake-grant"}') });
    assert.equal((await provider.inspect()).status, "unavailable");
    const observed = JSON.parse(await readFile(evidence,"utf8"));
    await assert.rejects(access(observed.cwd));
    assert.throws(() => process.kill(observed.pid,0), { code: "ESRCH" });
  } finally { await rm(root, { recursive: true, force: true }); }
 });

test("Codex usage captures cumulative matching-turn counts once, including failed and cancelled turns", async () => {
  for (const assignment of ["Give a practical answer.", "Fail after a completed item", "Wait until cancelled", "Without token usage"]) {
    const records = []; const controller = new AbortController();
    const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url))] });
    const timer = assignment === "Wait until cancelled" ? setTimeout(() => controller.abort(), 200) : null;
    try {
      await provider.invoke({ assignment, model: "gpt-6-sol", effort: "medium", evidence: { owner: "Synthetic usage check", discussion: "" }, research: false, runtimeInstructions: initialRuntimeInstructions, signal: controller.signal, onUsage: value => records.push(value) });
      assert.equal(records.length, 2); assert.equal(records[0].id, records[1].id);
      assert.equal(records[0].status, "running");
      if (assignment === "Without token usage") assert.deepEqual(records[1].usage, []);
      else assert.equal(records[1].usage[0].tokens.total, 140, "Do not sum total+last, duplicate events or other turns");
      assert.equal(records[1].status, assignment.includes("cancelled") ? "cancelled" : assignment.startsWith("Fail") ? "failed" : "completed");
    } finally { clearTimeout(timer); }
  }
});

test("request workspaces are stable within one request, distinct between requests and removed after release", async () => {
  const { access } = await import('node:fs/promises');
  const command = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command] });
  const invoke = async contextScope => {
    const result = await provider.invoke({ contextScope, assignment: 'Report request workspace.', model: 'gpt-6-sol', effort: 'high', evidence: { owner: 'Synthetic test', discussion: '' }, research: false, runtimeInstructions: initialRuntimeInstructions });
    assert.equal(result.ok, true); return JSON.parse(result.body).workspace;
  };
  try {
    const [a, b] = await Promise.all([invoke('request-A'), invoke('request-A')]);
    const c = await invoke('request-B');
    assert.equal(a, b); assert.notEqual(a, c); await access(a); await access(c);
    await provider.releaseScope('request-A'); await assert.rejects(access(a)); await access(c);
    await provider.releaseScope('request-B'); await assert.rejects(access(c));
  } finally { await provider.releaseScope('request-A'); await provider.releaseScope('request-B'); }
});

test("Codex preserves distinct claims from one source URL", async () => {
 const provider=createCodexProvider({readyForProvider:true,codexCommand:process.execPath,codexCommandArgs:[fileURLToPath(new URL("./fixtures/fake-codex.mjs",import.meta.url))]});
 const result=await provider.invoke({assignment:"Exercise distinct claims on one URL",model:"gpt-6-sol",effort:"high",evidence:{owner:"Synthetic",discussion:""},research:false,runtimeInstructions:initialRuntimeInstructions});
 assert.equal(result.ok,true);assert.deepEqual(result.sources.map(s=>s.claim),["First supported fact.","Second supported fact."]);
});

test('upstream response accounting preserves explicit cache writes, zero and missing fields without duplicate events or payloads',async()=>{
 for(const [suffix,writes] of [['',20],[' explicit zero',0],[' missing write',null],[' partial raw',null]]){
  const records=[];const provider=createCodexProvider({readyForProvider:true,codexCommand:process.execPath,codexCommandArgs:[fileURLToPath(new URL('./fixtures/fake-codex.mjs',import.meta.url))]});
  const result=await provider.invoke({assignment:`Exercise upstream usage${suffix}`,model:'gpt-6-sol',effort:'high',evidence:{owner:'Synthetic public fixture',discussion:''},research:false,runtimeInstructions:initialRuntimeInstructions,onUsage:value=>records.push(value)});
  assert.equal(result.ok,true);const final=records.at(-1);assert.equal(final.usage[0].tokens.total,140);assert.equal(final.usage[0].tokens.cacheWriteInput,writes);assert.equal(final.diagnostics.usageSource,suffix.includes('partial')?'codex_normalized':'upstream_responses');assert.equal(final.diagnostics.responseCount,suffix.includes('partial')?1:2);assert.doesNotMatch(JSON.stringify(records),/DO_NOT_STORE|response-1/);
 }
});

test('raw usage survives a failed turn without cumulative counters and is explicitly partial',async()=>{
 const {summarizeUsage}=await import('../src/server/usage.mjs');const records=[];const provider=createCodexProvider({readyForProvider:true,codexCommand:process.execPath,codexCommandArgs:[fileURLToPath(new URL('./fixtures/fake-codex.mjs',import.meta.url))]});
 await provider.invoke({assignment:'Exercise upstream usage raw only partial raw Fail after a completed item',model:'gpt-6-sol',effort:'high',evidence:{owner:'Synthetic test',discussion:''},research:false,runtimeInstructions:initialRuntimeInstructions,onUsage:value=>records.push(value)});
 const final=records.at(-1);assert.equal(final.status,'failed');assert.equal(final.usage[0].tokens.total,70);assert.equal(final.diagnostics.usageCoverage,'partial');const summary=summarizeUsage([{usage:[final]}]);assert.equal(summary.total,70);assert.equal(summary.incomplete,1);
});


test("Codex account allowance read does not start a model turn", async () => {
  const command = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  const provider = createCodexProvider({ readyForProvider: true, codexCommand: process.execPath, codexCommandArgs: [command] });
  assert.deepEqual(await provider.accountUsage(), []);
});

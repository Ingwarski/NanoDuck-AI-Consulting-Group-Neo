import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { access, readFile, stat } from "node:fs/promises";
import { createClaudeProvider } from "../src/server/claude-provider.mjs";
import { buildProviderContext } from "../src/server/provider-context.mjs";
import { testRuntimeInstructions } from "./fixtures/runtime-instructions.mjs";

const criticInput = Object.freeze({
  model: "claude-opus-5",
  effort: "extra",
  assignment: "Challenge the stated financial assumption.",
  evidence: Object.freeze({
    owner: "Should we fund the expansion?",
    discussion: "Finance Consultant → Critic: The cash buffer is only two months."
  }),
  research: false,
  outputKind: "critic_challenge",
  maximumCharacters: 1_000,
  runtimeInstructions: testRuntimeInstructions,
  signal: new AbortController().signal
});

test("Claude transports accepted multilingual context above 128 KiB intact through stdin, never argv", async () => {
  const calls = [];
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, {
    run: async input => {
      calls.push(input);
      return input.args.includes("auth")
        ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
        : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5-5": {} }, result: "The full context was received." }), stderr: "" };
    }
  });
  const input = {
    ...criticInput, model: "claude-opus-5-5", effort: "high",
    evidence: { owner: "П".repeat(32_000), discussion: "У".repeat(80_000) },
    runtimeInstructions: { ...testRuntimeInstructions, documents: ["AGENTS.md", "CONSILIUM.md", "CONSULTING_PLAYBOOK.md", "WORKING_CONTEXT.md"].map(name => ({ name, revision: 1, markdown: "D".repeat(64 * 1024) })) }
  };
  const expected = buildProviderContext(input).prompt;
  assert.ok(Buffer.byteLength(expected) > 128 * 1024);
  assert.equal((await provider.invoke(input)).ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].stdinText, undefined);
  const completion = calls[1];
  assert.equal(completion.stdinText, expected, "No truncation, replacement or dropped guidance");
  assert.equal(completion.args.includes(expected), false);
  assert.ok(completion.args.every(arg => !arg.includes(input.evidence.owner) && !arg.includes(input.evidence.discussion)));
  assert.equal(completion.args[completion.args.indexOf("--input-format") + 1], "text");
  assert.equal(completion.args[completion.args.indexOf("--model") + 1], input.model);
  assert.equal(completion.args[completion.args.indexOf("--effort") + 1], input.effort);
});

test("Claude reports its bounded context limit separately from model incompatibility before launching", async () => {
  let calls = 0;
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, { run: async () => { calls += 1; throw new Error("must not launch"); } });
  for (const input of [
    { ...criticInput, assignment: "A".repeat(8 * 1024 * 1024 + 1) },
    { ...criticInput, evidence: { ...criticInput.evidence, discussion: "У".repeat(4_500_000) } }
  ]) assert.deepEqual(await provider.invoke(input), { ok: false, code: "context_too_large" });
  assert.equal(calls, 0);
});

test("Claude maps an upstream context-window rejection to the saved-context capacity error", async () => {
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, {
    run: async input => input.args.includes("auth")
      ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "Error: prompt is too long for the model context window" }
  });
  assert.deepEqual(await provider.invoke(criticInput), { ok: false, code: "context_too_large" });
});

test("the text-only retry cannot exceed the same context byte bound", async () => {
  let completions = 0;
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, {
    run: async input => {
      if (input.args.includes("auth")) return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" };
      completions += 1;
      assert.ok(Buffer.byteLength(input.stdinText) <= 8 * 1024 * 1024);
      return { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: '<invoke name="Bash">pwd</invoke>' }), stderr: "" };
    }
  });
  const empty = buildProviderContext({ ...criticInput, evidence: { ...criticInput.evidence, discussion: "" } }).prompt;
  const discussion = "A".repeat(8 * 1024 * 1024 - Buffer.byteLength(empty) - 10);
  assert.deepEqual(await provider.invoke({ ...criticInput, evidence: { ...criticInput.evidence, discussion } }), { ok: false, code: "context_too_large" });
  assert.equal(completions, 1);
});

test("Claude Code exposes only authenticated configured models and returns safe completion text", async () => {
  const calls = [];
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token", claudeModelCandidates: ["claude-sonnet"] }, {
    run: async input => {
      calls.push(input);
      if (input.args.includes("auth")) return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" };
      return { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: "A bounded Critic reply.\n\n[Primary source](https://example.com/evidence)" }), stderr: "" };
    }
  });
  assert.deepEqual(await provider.inspect(), { status: "ready", models: [{ id: "claude-opus-5", label: "Opus 5", efforts: ["low", "medium", "high", "extra", "max"] }, { id: "claude-opus-5-5", label: "Opus 5.5", efforts: ["low", "medium", "high", "extra", "max"] }, { id: "claude-sonnet", label: "claude-sonnet", efforts: ["low", "medium", "high", "extra", "max"] }] });
  const result = await provider.invoke(criticInput);
  assert.equal(result.ok, true);
  assert.equal(result.body, "A bounded Critic reply.\n\n[Primary source](https://example.com/evidence)");
  assert.deepEqual(result.sources.map(source => ({ title: source.title, url: source.url })), [{ title: "Primary source", url: "https://example.com/evidence" }]);
  assert.equal(calls.at(-1).args.includes("--model"), true);
  assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf("--model") + 1], "claude-opus-5");
  assert.equal(calls.at(-1).args.includes("opus"), false);
  assert.equal(calls.at(-1).args.includes("--effort"), true);
  assert.equal(calls.at(-1).args.includes("xhigh"), true);
  assert.equal(calls.at(-1).args.includes("--disallowedTools"), true);
  assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf("--tools") + 1], "");
  assert.equal(calls.at(-1).args.includes("--disable-slash-commands"), true);
  assert.equal(calls.at(-1).args.includes("Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch,Task,TaskOutput,Skill,TodoWrite,NotebookEdit,AskUserQuestion,EnterPlanMode,ExitPlanMode,mcp__*"), true);
  assert.equal(calls.at(-1).args.includes("--max-turns"), true);
  assert.equal(calls.at(-1).args.includes("1"), true);
  assert.equal(calls.at(-1).args.includes("--system-prompt"), true);
  assert.equal(calls.at(-1).environment.CLAUDE_CODE_OAUTH_TOKEN, "managed-token");
  const prompt = calls.at(-1).stdinText;
  assert.equal(calls.at(-1).args.includes(prompt), false);
  assert.match(prompt, /Owner question:\nShould we fund the expansion\?/u);
  assert.match(prompt, /Prior confirmed discussion:\nFinance Consultant → Critic: The cash buffer is only two months\./u);
  assert.match(prompt, /Write a complete critic challenge/u);
  assert.match(prompt, /Do not claim research that was not performed\./u);
});

test("Claude Critic can return structured team review without file tools", async () => {
  const calls = [];
  const expected = JSON.stringify({ summary: "The demand answer lacks evidence.", findings: [{ assignment: 1, issue: "A count is unsupported.", correction: "Remove it or cite a direct source." }] });
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, { run: async input => {
    calls.push(input);
    return input.args.includes("auth")
      ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
      : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: expected }), stderr: "" };
  } });
  const result = await provider.invoke({ ...criticInput, outputKind: "team_review", assignment: "Return only JSON with summary and findings." });
  assert.equal(result.ok, true);
  assert.equal(result.body, expected);
  assert.match(calls.at(-1).args[calls.at(-1).args.indexOf("--system-prompt") + 1], /JSON is allowed/u);
  assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf("--tools") + 1], "");
});

test("Claude keeps English criticism when an unsuitable citation must be omitted", async () => {
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, { run: async input => input.args.includes("auth")
    ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
    : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: "The Russian market claim needs evidence from [this source](https://example.su/claim)." }), stderr: "" } });
  const result = await provider.invoke(criticInput);
  assert.equal(result.ok, true);
  assert.equal(result.body, "The Russian market claim needs evidence from this source (source link omitted: unapproved URL).");
  assert.deepEqual(result.sources, []);
});

test("Claude withholds a prohibited-language fragment while preserving the Critic's specific objection", async () => {
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, { run: async input => input.args.includes("auth")
    ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
    : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: "The margin estimate lacks its cost basis. Как это работает? Rework it using the stated unit costs." }), stderr: "" } });
  const result = await provider.invoke(criticInput);
  assert.equal(result.ok, true);
  assert.match(result.body, /margin estimate lacks its cost basis/u);
  assert.match(result.body, /Rework it using the stated unit costs/u);
  assert.doesNotMatch(result.body, /Как|это/u);
});

test("Claude Code withholds an internal tool trace and retries once for text-only output", async () => {
  let completions = 0;
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token", claudeModelCandidates: [] }, {
    run: async input => {
      if (input.args.includes("auth")) return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" };
      completions += 1;
      return completions === 1
        ? { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: '<invoke name="Bash">\\n<parameter name="command">ls -la /tmp</parameter>\\n</invoke>\\n\\ntotal 0' }), stderr: "" }
        : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: "The evidence does not support that assumption without a margin calculation." }), stderr: "" };
    }
  });
  const result = await provider.invoke({ ...criticInput, effort: "high" });
  assert.deepEqual(result, { ok: true, body: "The evidence does not support that assumption without a margin calculation.", sources: [] });
  assert.equal(completions, 2);
});

test("Claude Code never returns an internal tool trace after its bounded retry", async () => {
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token", claudeModelCandidates: [] }, {
    run: async input => input.args.includes("auth")
      ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
      : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: '<invoke name="Bash"><parameter name="command">pwd</parameter></invoke>' }), stderr: "" }
  });
  assert.deepEqual(await provider.invoke({ ...criticInput, effort: "high", assignment: "Challenge the premise." }), { ok: false, code: "provider_unavailable" });
});

test("Claude Code cannot be selected without a configured credential location", async () => {
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeModelCandidates: [] });
  assert.deepEqual(await provider.inspect(), { status: "auth_required", models: [] });
  assert.deepEqual(await provider.invoke({ model: "claude-opus-5", effort: "high", assignment: "Challenge the premise." }), { ok: false, code: "auth_required" });
});

test("valid Ukrainian Critic prose survives Claude output validation", async () => {
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token", claudeModelCandidates: [] }, {
    run: async input => input.args.includes("auth")
      ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }
      : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: "Назвіть умови, які змінять рекомендацію." }), stderr: "" }
  });
  assert.deepEqual(await provider.invoke(criticInput), { ok: true, body: "Назвіть умови, які змінять рекомендацію.", sources: [] });
});

test("Opus 5.5 uses its exact model ID at every supported effort without enabling Fast mode or API keys", async () => {
  const calls = [];
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, {
    run: async input => {
      calls.push(input);
      if (input.args.includes("auth")) return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" };
      return { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5-5": {} }, result: "Check the stated assumption." }), stderr: "" };
    }
  });
  for (const [saved, cli] of [["low", "low"], ["medium", "medium"], ["high", "high"], ["extra", "xhigh"], ["max", "max"]]) {
    assert.equal((await provider.invoke({ ...criticInput, model: "claude-opus-5-5", effort: saved })).ok, true);
    const { args, environment } = calls.at(-1);
    assert.equal(args[args.indexOf("--model") + 1], "claude-opus-5-5");
    assert.equal(args[args.indexOf("--effort") + 1], cli);
    assert.equal(args.includes("--fallback-model"), false);
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.equal(args.includes("--disable-slash-commands"), true);
    assert.equal(environment.CLAUDE_CODE_DISABLE_FAST_MODE, "1");
    assert.equal(environment.ANTHROPIC_API_KEY, undefined);
  }
});

test("Claude refuses unreported, substituted, or mixed model identities", async () => {
  for (const modelUsage of [undefined, {}, { "claude-opus-5-5": {} }, { "claude-opus-5": {}, "claude-opus-5-5": {} }]) {
    let calls = 0;
    const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "managed-token" }, {
      run: async input => {
        if (input.args.includes("auth")) return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" };
        calls += 1;
        return { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage, result: "Do not accept this substituted reply." }), stderr: "" };
      }
    });
    assert.deepEqual(await provider.invoke(criticInput), { ok: false, code: "incompatible" });
    assert.equal(calls, 1);
  }
});

test("native Claude subscription sign-in keeps the CLI credential identity and suppresses customizations", async () => {
  const calls = [];
  const home = join(tmpdir(), "synthetic-claude-home");
  const configDirectory = join(home, "alternate-config");
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeHome: home, claudeConfigDirectory: configDirectory }, {
    run: async input => {
      calls.push(input);
      return input.args.includes("auth")
        ? { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "pro" }), stderr: "" }
        : { exitCode: 0, stdout: JSON.stringify({ subtype: "success", modelUsage: { "claude-opus-5": {} }, result: "A native subscription reply." }), stderr: "" };
    }
  });
  assert.equal((await provider.inspect()).status, "ready");
  assert.equal((await provider.invoke(criticInput)).ok, true);
  assert.equal(calls.filter(call => call.args.includes("auth")).length, 2, "Every invocation rechecks authorization");
  for (const call of calls) {
    assert.equal(call.environment.HOME, home); assert.equal(call.environment.USERPROFILE, home);
    assert.equal(call.environment.CLAUDE_CONFIG_DIR, configDirectory);
    assert.equal(call.environment.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    assert.equal(call.environment.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, undefined);
    assert.equal(call.environment.ANTHROPIC_API_KEY, undefined);
    assert.equal(call.environment.ANTHROPIC_AUTH_TOKEN, undefined);
    assert.equal(call.args.includes("--safe-mode"), true); assert.equal(call.args.includes("--restricted"), true);
    assert.equal(JSON.parse(call.args[call.args.indexOf("--settings") + 1]).disableAllHooks, true);
    assert.notEqual(call.cwd, home);
    await assert.rejects(access(call.cwd), /ENOENT/u);
  }
  const completion = calls.at(-1);
  assert.equal(completion.args[completion.args.indexOf("--mcp-config") + 1], '{"mcpServers":{}}');
  assert.equal(completion.args[completion.args.indexOf("--disallowedTools") + 1].includes("mcp__*"), true);
  assert.equal(calls[0].timeoutMilliseconds, 20_000); assert.equal(completion.timeoutMilliseconds, 1_800_000);
});

test("explicit Claude OAuth token overrides native sign-in without sharing its home", async () => {
  let call;
  const home = join(tmpdir(), "synthetic-claude-home");
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeHome: home, claudeOAuthToken: "synthetic-managed-token", claudeConfigDirectory: join(home, "config") }, {
    run: async input => { call = input; return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" }; }
  });
  assert.equal((await provider.inspect()).status, "ready");
  assert.notEqual(call.environment.HOME, home); assert.equal(call.environment.HOME, call.cwd);
  assert.equal(call.environment.CLAUDE_CONFIG_DIR, join(call.cwd, "config"));
  assert.equal(call.environment.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST, "1");
  assert.equal(call.environment.CLAUDE_CODE_OAUTH_TOKEN, "synthetic-managed-token");
});

test("Claude sign-in can recover without recreating the provider", async () => {
  let signedIn = false;
  const provider = createClaudeProvider({ claudeCommand: "claude", claudeHome: tmpdir() }, {
    run: async () => ({ exitCode: signedIn ? 0 : 1, stdout: JSON.stringify(signedIn
      ? { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }
      : { loggedIn: false, authMethod: "none", apiProvider: "firstParty" }), stderr: "" })
  });
  assert.deepEqual(await provider.inspect(), { status: "auth_required", models: [] });
  signedIn = true;
  assert.equal((await provider.inspect()).status, "ready");
});

test("Claude refuses paid credential sources and distinguishes connection failures before any model call", async () => {
  const native = { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "pro" };
  for (const [result, expected] of [
    [{ exitCode: 0, stdout: JSON.stringify({ ...native, apiKeySource: "/login managed key" }), stderr: "" }, "incompatible"],
    [{ exitCode: 0, stdout: JSON.stringify({ ...native, subscriptionType: null }), stderr: "" }, "incompatible"],
    [{ exitCode: 0, stdout: JSON.stringify({ ...native, apiProvider: "bedrock" }), stderr: "" }, "incompatible"],
    [{ exitCode: 0, stdout: JSON.stringify({ ...native, authMethod: "api_key" }), stderr: "" }, "incompatible"],
    [{ exitCode: 1, stdout: JSON.stringify(native), stderr: "" }, "provider_unavailable"],
    [{ exitCode: null, stdout: "", stderr: "", timedOut: true }, "provider_unavailable"],
    [{ exitCode: 1, stdout: "", stderr: "HTTP 429 usage limit" }, "quota_blocked"],
    [{ exitCode: 1, stdout: "", stderr: "Connection refused" }, "provider_unavailable"]
  ]) {
    const calls = [];
    const provider = createClaudeProvider({ claudeCommand: "claude", claudeHome: tmpdir() }, {
      run: async input => { calls.push(input); return result; }
    });
    assert.deepEqual(await provider.inspect(), { status: expected, models: [] });
    assert.deepEqual(await provider.invoke(criticInput), { ok: false, code: expected });
    assert.equal(calls.every(call => call.args.includes("auth")), true, "Denied authorization must never reach a model turn");
  }
});

test("Claude records each internal retry and error usage before rejecting output, with truthful timeout status", async () => {
  for (const mode of ["retry", "timeout", "failed"]) {
    const records = []; let calls = 0;
    const provider = createClaudeProvider({ claudeCommand: "claude", claudeOAuthToken: "synthetic" }, { run: async input => {
      if (input.args.includes("auth")) return { exitCode: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth_token", apiProvider: "firstParty" }), stderr: "" };
      assert.equal(input.timeoutMilliseconds, 1_800_000);
      calls++;
      return { exitCode: mode === "failed" ? 1 : 0, timedOut: mode === "timeout", stderr: "", stdout: JSON.stringify({ subtype: mode === "failed" ? "error_max_turns" : "success", result: mode === "retry" && calls === 1 ? '<tool_use name="Bash">pwd</tool_use>' : "The pilot should measure demand.", modelUsage: { "claude-opus-5": { inputTokens: 2, cacheReadInputTokens: 60, cacheCreationInputTokens: 38, outputTokens: 40 } } }) };
    } });
    const result = await provider.invoke({ ...criticInput, onUsage: value => records.push(value) });
    assert.equal(result.code, mode === "timeout" ? "provider_timeout" : mode === "failed" ? "provider_unavailable" : undefined);
    assert.equal(calls, mode === "retry" ? 2 : 1);
    const finished = records.filter(item => item.finishedAt);
    assert.equal(finished.length, calls); assert.equal(new Set(finished.map(item => item.id)).size, calls);
    assert.equal(finished.every(item => item.usage[0].tokens.total === 140), true);
  }
});

test("Claude preserves distinct claims from one source URL", async () => {
 const resultText="Two independently supported claims.\n"+["First supported fact.","Second supported fact."].map(claim=>`<nanoduck-source>${JSON.stringify({url:"https://example.com/shared",title:"Shared report",claim})}</nanoduck-source>`).join("\n");
 const provider=createClaudeProvider({claudeCommand:"claude",claudeOAuthToken:"managed-token"},{run:async input=>({exitCode:0,stderr:"",stdout:JSON.stringify(input.args.includes("auth")?{loggedIn:true,authMethod:"oauth_token",apiProvider:"firstParty"}:{subtype:"success",result:resultText,modelUsage:{"claude-opus-5":{}}})})});
 const result=await provider.invoke(criticInput);assert.equal(result.ok,true);assert.deepEqual(result.sources.map(s=>s.claim),["First supported fact.","Second supported fact."]);
});

test("Claude reuses only the accepted request workspace, keeps history disabled and cleans up", async () => {
  const calls=[];
  const provider=createClaudeProvider({claudeCommand:'claude',claudeOAuthToken:'managed-token'},{run:async input=>{
    if(input.args.includes('auth')) return {exitCode:0,stdout:JSON.stringify({loggedIn:true,authMethod:'oauth_token',apiProvider:'firstParty'})};
    const file=input.args[input.args.indexOf('--system-prompt-file')+1];
    input.contextText=await readFile(file,'utf8'); input.contextFile=file;
    if(process.platform!=='win32') assert.equal((await stat(file)).mode & 0o777,0o600);
    calls.push(input);return {exitCode:0,stdout:JSON.stringify({subtype:'success',modelUsage:{'claude-opus-5':{}},result:'Evidence remains insufficient.'})};
  }});
  try {
    await provider.invoke({...criticInput,contextScope:'request-a'});
    await provider.invoke({...criticInput,contextScope:'request-a',assignment:'Assess the correction.'});
    await provider.invoke({...criticInput,contextScope:'request-b'});
    assert.equal(calls[0].contextText,calls[1].contextText);assert.match(calls[0].contextText,/Should we fund the expansion/);assert.doesNotMatch(calls[0].stdinText,/Should we fund the expansion/);assert.doesNotMatch(calls[0].args.join(' '),/Should we fund the expansion/);await assert.rejects(access(calls[0].contextFile));
    assert.equal(calls[0].cwd,calls[1].cwd);assert.notEqual(calls[0].cwd,calls[2].cwd);
    for(const call of calls) {assert.ok(call.args.includes('--no-session-persistence'));assert.equal(call.args.includes('--resume'),false);assert.equal(call.environment.CLAUDE_CODE_DISABLE_AUTO_MEMORY,'1');}
    await access(calls[0].cwd);await provider.releaseScope('request-a');await assert.rejects(access(calls[0].cwd));await access(calls[2].cwd);
  } finally {await provider.releaseScope('request-a');await provider.releaseScope('request-b');}
});

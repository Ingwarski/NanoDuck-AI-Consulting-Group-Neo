import assert from "node:assert/strict";
import test from "node:test";
import { randomBytes } from "node:crypto";
import { createMemoryStore } from "../src/server/store.mjs";
import { randomId } from "../src/server/crypto.mjs";
import { encryptText, decryptText } from "../src/server/crypto.mjs";
import { claudeTokens, codexTokens, normalizeUsageAttempt } from "../src/server/usage.mjs";
import { sealRecoverySnapshot, openRecoveryEnvelope } from "../src/server/recovery.mjs";
const tokens = { input: 100, output: 40, total: 140, cachedInput: 60, cacheWriteInput: 0, reasoningOutput: 30 };
const attempt = (patch = {}) => ({ id: randomId(), provider: "codex", model: "gpt-6-sol", status: "completed", startedAt: "2026-09-25T12:00:00.000Z", finishedAt: "2026-09-25T12:01:00.000Z", usage: [{ model: "gpt-6-sol", tokens }], ...patch });

test("provider categories include Claude cache input once and Codex reasoning only as an output subset", () => {
  assert.deepEqual(codexTokens({ inputTokens: 100, outputTokens: 40, totalTokens: 140, cachedInputTokens: 60, reasoningOutputTokens: 30 }), { ...tokens, cacheWriteInput: null });
  const [claude] = claudeTokens(JSON.stringify({ modelUsage: { "claude-opus-5-5": { inputTokens: 2, outputTokens: 40, cacheReadInputTokens: 60, cacheCreationInputTokens: 38 } } }));
  assert.deepEqual(claude.tokens, { ...tokens, cacheWriteInput: 38, reasoningOutput: null });
  assert.deepEqual(claudeTokens("not JSON"), []);
  assert.equal(claudeTokens(JSON.stringify({ modelUsage: { "claude-opus-5-5": { outputTokens: 20 } } }))[0].tokens.input, null);
  assert.equal(normalizeUsageAttempt(attempt({ usage: [{ model: "gpt-6-sol", tokens: { ...tokens, total: -1 } }] })), undefined);
});

test("usage is idempotent per attempt, includes retries/failures, separates models, and stays unknown for old calls", async () => {
  const store = createMemoryStore(); const a = await store.createConversation(); const b = await store.createConversation();
  assert.equal((await store.usageSummary(a.id)).total, null);
  const first = attempt();
  await store.recordUsage(a.id, { ...first, status: "running", finishedAt: null, usage: [] });
  await store.recordUsage(a.id, first); await store.recordUsage(a.id, first);
  await store.recordUsage(a.id, attempt({ status: "failed" }));
  await store.recordUsage(a.id, attempt({ status: "cancelled", usage: [] }));
  await store.recordUsage(b.id, attempt({ provider: "claude_code", model: "claude-opus-5-5", usage: [{ model: "claude-opus-5-5", tokens }] }));
  const summary = await store.usageSummary(a.id);
  assert.equal(summary.total, 280); assert.equal(summary.attempts, 3); assert.equal(summary.unavailable, 1);
  assert.equal(summary.models[0].tokens.total.unavailable, 1);
  assert.equal((await store.usageSummary()).total, 420);
  assert.equal((await store.usageSummary()).models.length, 2);
  await store.deleteConversation(a.id);
  assert.equal(await store.recordUsage(a.id, attempt()), false, "Late callbacks cannot resurrect deleted usage");
  assert.equal((await store.usageSummary()).total, 140);
  assert.equal(await store.usageSummary(a.id), undefined);
});

test("encrypted usage survives restart and recovery, interrupts stale calls and honors deletion tombstones", async () => {
  const dataKey = randomBytes(32);
  let store = createMemoryStore();
  const a = await store.createConversation();
  await store.recordUsage(a.id, attempt());
  await store.recordUsage(a.id, attempt({ status: "running", finishedAt: null, usage: [] }));
  const sealedState = encryptText(JSON.stringify(store.snapshotState()), dataKey);
  assert.equal(JSON.stringify(sealedState).includes("gpt-6-sol"), false);
  store = createMemoryStore(JSON.parse(decryptText(sealedState, dataKey)));
  await store.interruptUsage();
  const summary = await store.usageSummary(a.id);
  assert.equal(summary.total, 140); assert.equal(summary.incomplete, 1);
  const backup = openRecoveryEnvelope(sealRecoverySnapshot(await store.recoverySnapshot(), dataKey), dataKey);
  assert.equal(backup.conversations[0].usage[1].status, "interrupted");
  const restored = createMemoryStore(); await restored.restoreRecovery(backup);
  assert.deepEqual(await restored.usageSummary(a.id), summary);
  await restored.deleteConversation(a.id); await restored.restoreRecovery(backup);
  assert.equal((await restored.usageSummary()).attempts, 0);
  const corrupt = structuredClone(backup); corrupt.conversations[0].usage[0].usage[0].tokens.total = "private content";
  assert.equal(await restored.restoreRecovery(corrupt), undefined);
});

test("stage diagnostics contain only bounded metadata and stage totals do not duplicate overall counts", async () => {
  const store = createMemoryStore(); const chat = await store.createConversation();
  const first = attempt({ diagnostics: { stage: 'public_research', promptBytes: 1234, prefixBytes: 1000, webSearchCount: 3, prompt: 'must never persist' } });
  await store.recordUsage(chat.id, first);
  await store.recordUsage(chat.id, attempt({ diagnostics: { stage: 'head_final', promptBytes: 2345, prefixBytes: 1000 } }));
  const summary = await store.usageSummary(chat.id);
  assert.equal(summary.total, 280);
  assert.equal(summary.stages.reduce((sum, stage) => sum + stage.total, 0), 280);
  assert.equal(summary.stages.find(stage => stage.stage === 'public_research').attempts, 1);
  assert.equal(JSON.stringify(store.snapshotState()).includes('must never persist'), false);
  const normalized = normalizeUsageAttempt(first);
  assert.equal(normalized.diagnostics.webSearchCount, 3);
  assert.equal(normalizeUsageAttempt(attempt({ diagnostics: { stage: '<script>', promptBytes: -1 } })).diagnostics.stage, 'unavailable');
});

test("research-step diagnostics keep only numeric snapshots and known action names", () => {
 const value=normalizeUsageAttempt(attempt({diagnostics:{stage:"public_research",researchSteps:[{action:"search",elapsedMs:10,cumulativeInput:100,cumulativeCachedInput:60,repeatOf:null,query:"PRIVATE",url:"PRIVATE",fingerprint:"PRIVATE"},{action:"PRIVATE",elapsedMs:-1}]}}));
 assert.doesNotMatch(JSON.stringify(value),/PRIVATE/);assert.equal(value.diagnostics.researchSteps[0].cumulativeInput,100);assert.equal(value.diagnostics.researchSteps[1].action,"other");assert.equal(value.diagnostics.researchSteps[1].elapsedMs,null);
});

test("failed Claude results preserve positive native usage but crash-zero placeholders remain unknown", () => {
 const parsed=claudeTokens(JSON.stringify({subtype:'error_during_execution',modelUsage:{'claude-opus-5-5':{inputTokens:2,outputTokens:10,cacheReadInputTokens:20,cacheCreationInputTokens:30},'zero-placeholder':{inputTokens:0,outputTokens:0,cacheReadInputTokens:0,cacheCreationInputTokens:0}}}));
 assert.equal(parsed.length,1);assert.equal(parsed[0].tokens.total,62);
});

test("attempt breakdown preserves all models, statuses and unknown fields without double counting", async () => {
 const store=createMemoryStore();const chat=await store.createConversation();
 await store.recordUsage(chat.id,attempt({status:'failed',usage:[{model:'gpt-6-sol',tokens},{model:'another-reported-model',tokens:{...tokens,cachedInput:null}}]}));
 await store.recordUsage(chat.id,attempt({status:'running',finishedAt:null,usage:[]}));
 const summary=await store.usageSummary(chat.id);assert.equal(summary.total,280);assert.equal(summary.callDetails.length,2);assert.equal(summary.callDetails[0].usage.length,2);assert.equal(summary.incomplete,1);assert.equal(summary.unavailable,1);
});

test("running usage snapshots stay ordered and final usage cannot be overwritten by a delayed update", async () => {
 const {beginUsage}=await import('../src/server/usage.mjs');const received=[];
 const finish=await beginUsage(async value=>{if(value.usage.length&&value.status==='running') await new Promise(resolve=>setTimeout(resolve,15));received.push(value)},'codex','gpt-6-sol');
 await Promise.all([finish('running',[{model:'gpt-6-sol',tokens:{...tokens,input:50}}]),finish('completed',[{model:'gpt-6-sol',tokens}])]);
 assert.deepEqual(received.map(x=>x.status),['running','running','completed']);assert.equal(received[1].finishedAt,null);assert.equal(received[2].usage[0].tokens.input,100);assert.ok(received[2].finishedAt);
});

test("dashboard attribution groups requests and participants and counts overlapping repeat work once", async () => {
  const store = createMemoryStore(); const conversation = await store.createConversation();
  const requestId = randomId();
  await store.recordUsage(conversation.id, attempt({ attribution: { requestId, participantId: "finance", participant: "Finance Consultant", purpose: "retry" }, status: "failed" }));
  await store.recordUsage(conversation.id, attempt({ attribution: { requestId, participantId: "finance", participant: "Finance Consultant", purpose: "correction" } }));
  await store.recordUsage(conversation.id, attempt());
  const summary = await store.usageSummary(conversation.id);
  assert.equal(summary.requests.length, 2);
  assert.equal(summary.requests[0].total, 280);
  assert.equal(summary.participants[0].label, "Finance Consultant");
  assert.equal(summary.providers[0].total, 420);
  assert.equal(summary.repeatWork.total, 280);
  assert.equal(summary.repeatWork.attempts, 2);
  assert.equal(summary.repeatWork.coverage, "partial");
  assert.equal(summary.repeatWork.attributionIncomplete, true);
  assert.equal(summary.coverage, "complete");
  assert.equal(summary.callDetails[0].attribution.requestId, requestId);
  assert.equal(summary.callDetails[0].conversationId, conversation.id);
  await store.recordUsage(conversation.id, attempt({ status: "running", finishedAt: null, usage: [] }));
  assert.equal((await store.usageSummary(conversation.id)).coverage, "running");
  await store.interruptUsage();
  assert.equal((await store.usageSummary(conversation.id)).coverage, "partial");
});

test("repeat-work totals distinguish fully attributed zero from legacy unknown purpose", async () => {
  const { summarizeUsage } = await import("../src/server/usage.mjs");
  const known = summarizeUsage([{ hasMessages: true, usage: [attempt({ attribution: { purpose: "initial" } })] }]);
  assert.equal(known.repeatWork.total, null);
  assert.equal(known.repeatWork.attempts, 0);
  assert.equal(known.repeatWork.coverage, "complete");
  assert.equal(known.repeatWork.attributionIncomplete, false);

  const legacy = summarizeUsage([{ hasMessages: true, usage: [attempt()] }]);
  assert.equal(legacy.repeatWork.total, null);
  assert.equal(legacy.repeatWork.attempts, 0);
  assert.equal(legacy.repeatWork.coverage, "partial");
  assert.equal(legacy.repeatWork.attributionIncomplete, true);

  const untracked = summarizeUsage([{ hasMessages: true, usage: [] }]);
  assert.equal(untracked.repeatWork.coverage, "partial");
  assert.equal(untracked.repeatWork.attributionIncomplete, true);
});

test("usage separates the same model at different reasoning levels", async () => {
  const store = createMemoryStore(); const conversation = await store.createConversation();
  for (const effort of ["medium", "high"]) await store.recordUsage(conversation.id, attempt({ diagnostics: { stage: "head_plan", effort, effortSource: "request" } }));
  const summary = await store.usageSummary(conversation.id);
  assert.deepEqual(summary.models.map(row => row.effort).sort(), ["high", "medium"]);
  assert.equal(summary.total, 280);
  assert.equal(summary.callDetails[0].effortSource, "request");
});

test("historical reasoning uses only a matching single-request snapshot", async () => {
  const { usageWithSavedEffort } = await import("../src/server/usage.mjs");
  const owner = { id: randomId(), createdAt: "2026-09-25T11:00:00Z" };
  const snapshot = { requestMessageId: owner.id, headModel: "gpt-6-sol", headReasoning: "high" };
  const original = attempt({ diagnostics: { stage: "head_plan" } });
  assert.equal(usageWithSavedEffort(original, snapshot, [owner]).diagnostics.effort, "high");
  assert.equal(usageWithSavedEffort(original, snapshot, [owner]).diagnostics.effortSource, "saved_run");
  assert.equal(usageWithSavedEffort(original, snapshot, [owner, owner]), original);
  assert.equal(usageWithSavedEffort(original, { ...snapshot, requestMessageId: randomId() }, [owner]), original);
  assert.equal(usageWithSavedEffort({ ...original, diagnostics: { stage: "head_plan", effort: "medium" } }, snapshot, [owner]).diagnostics.effort, "medium");
});

test("activity counts distinguish issued work, research attempts and partial web telemetry", async () => {
  const { summarizeUsage } = await import("../src/server/usage.mjs");
  const known = { activity: { consultants: 5, reviewRounds: 1, correctionOrders: 4, partial: false }, usage: [attempt({ diagnostics: { stage: "public_research", webSearchCount: 6 } }), attempt({ diagnostics: { stage: "head_plan", webSearchCount: 0 } })] };
  const activity = summarizeUsage([known]).activity;
  assert.deepEqual(activity.consultants, { value: 5, partial: false });
  assert.deepEqual(activity.reviewRounds, { value: 1, partial: false });
  assert.deepEqual(activity.correctionOrders, { value: 4, partial: false });
  assert.deepEqual(activity.researchCalls, { value: 1, partial: false });
  assert.deepEqual(activity.webActions, { value: 6, partial: false });
  const mixed = summarizeUsage([known, { usage: [attempt()] }]).activity;
  assert.deepEqual(mixed.consultants, { value: 5, partial: true });
  assert.deepEqual(mixed.webActions, { value: 6, partial: true });
  assert.deepEqual(summarizeUsage([{ usage: [attempt()] }]).activity.researchCalls, { value: null, partial: true });
  assert.equal(summarizeUsage([known, known]).activity.consultants.value, 10);
  assert.deepEqual(summarizeUsage([{ hasMessages: true, usage: [] }]).activity.researchCalls, { value: null, partial: true });
});

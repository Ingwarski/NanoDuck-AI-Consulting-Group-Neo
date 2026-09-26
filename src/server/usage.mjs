import { randomId } from "./crypto.mjs";

export const tokenFields = Object.freeze(["input", "output", "total", "cachedInput", "cacheWriteInput", "reasoningOutput"]);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const modelId = value => typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(value);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const sum = values => values.every(value => count(value) !== null) && Number.isSafeInteger(values.reduce((a, b) => a + b, 0)) ? values.reduce((a, b) => a + b, 0) : null;
export const emptyTokens = () => Object.fromEntries(tokenFields.map(key => [key, null]));

// Each Codex invocation owns one ephemeral thread. Its cumulative total includes
// tool/reasoning continuations; summing repeated notifications would overcount.
export function codexTokens(value) {
  return { input: count(value?.inputTokens), output: count(value?.outputTokens), total: count(value?.totalTokens), cachedInput: count(value?.cachedInputTokens), cacheWriteInput: count(value?.cacheWriteInputTokens), reasoningOutput: count(value?.reasoningOutputTokens) };
}
// Read upstream JSON before the CLI's missing-field-to-zero conversion.
export function codexResponseTokens(value) {
  if (!object(value)) return undefined;
  const input = count(value.input_tokens), output = count(value.output_tokens), total = count(value.total_tokens);
  if (input === null || output === null || total === null) return undefined;
  return { input, output, total, cachedInput: count(value.input_tokens_details?.cached_tokens), cacheWriteInput: count(value.input_tokens_details?.cache_write_tokens), reasoningOutput: count(value.output_tokens_details?.reasoning_tokens) };
}
export function sumTokenUsage(values) {
  return Object.fromEntries(tokenFields.map(field => [field, sum(values.map(value => value[field]))]));
}
export function claudeTokens(stdout) {
  let value; try { value = JSON.parse(stdout); } catch { return []; }
  // A crashed CLI can emit zeroed final usage; it does not prove a free call.
  if (!object(value?.modelUsage)) return [];
  return Object.entries(value.modelUsage).filter(([model, usage]) => modelId(model) && object(usage) && (value?.subtype !== "error_during_execution" || [usage.inputTokens, usage.outputTokens, usage.cacheReadInputTokens, usage.cacheCreationInputTokens].some(token => count(token) > 0))).map(([model, usage]) => {
    const cachedInput = count(usage.cacheReadInputTokens); const cacheWriteInput = count(usage.cacheCreationInputTokens);
    const input = sum([count(usage.inputTokens), cachedInput, cacheWriteInput]); const output = count(usage.outputTokens);
    return { model, tokens: { input, output, total: sum([input, output]), cachedInput, cacheWriteInput, reasoningOutput: null } };
  });
}

const efforts = new Set(["none", "minimal", "low", "medium", "high", "xhigh", "extra", "max", "ultra"]);
const normalizeDiagnostics = value => ({
  effort: efforts.has(value?.effort) ? value.effort : null,
  effortSource: ["request", "saved_run"].includes(value?.effortSource) ? value.effortSource : null,
  ...(["upstream_responses", "codex_normalized"].includes(value?.usageSource) ? { usageSource: value.usageSource, responseCount: count(value.responseCount) } : {}),
  ...(["reconciled", "partial", "normalized"].includes(value?.usageCoverage) ? { usageCoverage: value.usageCoverage } : {}),
  stage: typeof value?.stage === "string" && /^[a-z_]{1,48}$/u.test(value.stage) ? value.stage : "unavailable",
  promptBytes: count(value?.promptBytes), prefixBytes: count(value?.prefixBytes), webSearchCount: count(value?.webSearchCount),
  ...(Array.isArray(value?.researchSteps) ? { researchSteps: value.researchSteps.map(step => ({
    action: ["search", "open_page", "find_in_page"].includes(step?.action) ? step.action : "other",
    elapsedMs: count(step?.elapsedMs), cumulativeInput: count(step?.cumulativeInput), cumulativeCachedInput: count(step?.cumulativeCachedInput), repeatOf: count(step?.repeatOf)
  })) } : {})
});

const safeId = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value) ? value : null;
export function usageAttribution(value) {
  return { requestId: safeId(value?.requestId), participantId: safeId(value?.participantId),
    participant: typeof value?.participant === "string" && value.participant.length <= 100 && !/[\p{Cc}\p{Cf}]/u.test(value.participant) ? value.participant : null,
    purpose: ["initial", "retry", "correction", "followup_research"].includes(value?.purpose) ? value.purpose : null };
}

export function normalizeUsageAttempt(value) {
  if (!object(value) || typeof value.id !== "string" || !/^[A-Za-z0-9_-]{32}$/u.test(value.id) || !["codex", "claude_code"].includes(value.provider) || !modelId(value.model) || !["running", "completed", "failed", "cancelled", "interrupted"].includes(value.status) || typeof value.startedAt !== "string" || !Number.isFinite(Date.parse(value.startedAt)) || (value.finishedAt !== null && (typeof value.finishedAt !== "string" || !Number.isFinite(Date.parse(value.finishedAt)))) || !Array.isArray(value.usage)) return undefined;
  if (value.usage.some(item => !object(item) || !modelId(item.model) || !object(item.tokens) || tokenFields.some(key => item.tokens[key] !== null && count(item.tokens[key]) === null)) || new Set(value.usage.map(item => item.model)).size !== value.usage.length) return undefined;
  return { attribution: usageAttribution(value.attribution), id: value.id, provider: value.provider, model: value.model, ...(value.diagnostics ? { diagnostics: normalizeDiagnostics(value.diagnostics) } : {}), status: value.status, startedAt: value.startedAt, finishedAt: value.finishedAt, usage: value.usage.map(item => ({ model: item.model, tokens: Object.fromEntries(tokenFields.map(key => [key, item.tokens[key]])) })) };
}

// Only allowlisted numeric/model metadata crosses this callback. Usage storage
// failures cannot discard an otherwise valid consultation answer.
export async function beginUsage(onUsage, provider, model, diagnostics = {}) {
  const attempt = { id: randomId(), provider, model, diagnostics: normalizeDiagnostics(diagnostics), status: "running", startedAt: new Date().toISOString(), finishedAt: null, usage: [] };
  let pending = Promise.resolve();
  const emit = () => {
    const snapshot = structuredClone(attempt);
    pending = pending.then(async () => {
      try { await onUsage?.(snapshot); }
      catch { process.stdout.write(`${JSON.stringify({ event: "nanoduck.usage.storage_failed", provider })}\n`); }
    });
    return pending;
  };
  await emit();
  return async (status, usage = [], details = {}) => { attempt.diagnostics = normalizeDiagnostics({ ...attempt.diagnostics, ...details }); attempt.status = status; attempt.finishedAt = status === "running" ? null : new Date().toISOString(); attempt.usage = usage; await emit(); };
}

export function summarizeUsage(entries, includeStages = true) {
  const models = new Map(); let attempts = 0; let incomplete = 0; let unavailable = 0; let startedAt = null;
  for (const entry of entries) for (const attempt of entry.usage ?? []) {
    attempts += 1;
    if ((["running", "interrupted"].includes(attempt.status) || attempt.diagnostics?.usageCoverage === "partial")) incomplete += 1;
    if (!startedAt || attempt.startedAt < startedAt) startedAt = attempt.startedAt;
    if (!attempt.usage.length || attempt.usage.some(item => ["input", "output", "total"].some(field => item.tokens[field] === null))) unavailable += 1;
    for (const item of attempt.usage.length ? attempt.usage : [{ model: attempt.model, tokens: emptyTokens() }]) {
      const key = `${attempt.provider}:${item.model}:${attempt.diagnostics?.effort ?? "unknown"}`;
      const row = models.get(key) ?? { provider: attempt.provider, model: item.model, effort: attempt.diagnostics?.effort ?? null, calls: 0, tokens: Object.fromEntries(tokenFields.map(field => [field, { value: null, unavailable: 0 }])) };
      row.calls += 1;
      for (const field of tokenFields) {
        if (item.tokens[field] === null) row.tokens[field].unavailable += 1;
        else row.tokens[field].value = (row.tokens[field].value ?? 0) + item.tokens[field];
      }
      models.set(key, row);
    }
  }
  const rows = [...models.values()].sort((a, b) => `${a.provider}:${a.model}`.localeCompare(`${b.provider}:${b.model}`));
  const totals = rows.map(row => row.tokens.total.value).filter(value => value !== null);
  const callDetails = entries.flatMap(entry => (entry.usage ?? []).map(attempt => ({
    id: attempt.id, effort: attempt.diagnostics?.effort ?? null, effortSource: attempt.diagnostics?.effortSource ?? null, attribution: usageAttribution(attempt.attribution), conversationId: entry.conversationId ?? null, provider: attempt.provider, model: attempt.model, status: attempt.status,
    startedAt: attempt.startedAt, finishedAt: attempt.finishedAt,
    stage: attempt.diagnostics?.stage ?? "unavailable", usageSource: attempt.diagnostics?.usageSource ?? (attempt.provider === "claude_code" ? "claude_model_usage" : "codex_normalized"), responseCount: attempt.diagnostics?.responseCount ?? null, usageCoverage: attempt.diagnostics?.usageCoverage ?? "normalized", usage: attempt.usage
  }))).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const stages = new Map();
  if (includeStages) for (const entry of entries) for (const attempt of entry.usage ?? []) {
    const stage = attempt.diagnostics?.stage ?? "unavailable";
    if (!stages.has(stage)) stages.set(stage, []);
    stages.get(stage).push(attempt);
  }
  const coverage = entries.some(entry => entry.usage?.some(attempt => attempt.status === "running")) ? "running" : incomplete || unavailable ? "partial" : "complete";
  const groups = (keyFor) => {
    const grouped = new Map();
    for (const entry of entries) for (const attempt of entry.usage ?? []) {
      const { key, label } = keyFor(attempt, entry);
      if (!grouped.has(key)) grouped.set(key, { key, label, usage: [] });
      grouped.get(key).usage.push(attempt);
    }
    return [...grouped.values()].map(({ key, label, usage }) => ({ key, label, ...summarizeUsage([{ usage }], false) })).sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  };
  const attemptsList = entries.flatMap(entry => entry.usage ?? []);
  let repeatWork;
  if (includeStages) {
    const repeatEntries = entries.map(entry => ({ usage: (entry.usage ?? []).filter(attempt => ["failed", "cancelled", "interrupted"].includes(attempt.status) || ["retry", "correction", "followup_research"].includes(attempt.attribution?.purpose)) }));
    const repeatAttributionIncomplete = entries.some(entry => entry.hasMessages && !(entry.usage?.length)) || attemptsList.some(attempt => attempt.attribution?.purpose === null || attempt.attribution?.purpose === undefined);
    repeatWork = { ...summarizeUsage(repeatEntries, false), attributionIncomplete: repeatAttributionIncomplete };
    if (repeatAttributionIncomplete && repeatWork.coverage !== "running") repeatWork.coverage = "partial";
  }
  const activity = {};
  for (const field of ["consultants", "reviewRounds", "correctionOrders"]) {
    const known = entries.filter(entry => Number.isSafeInteger(entry.activity?.[field]));
    activity[field] = { value: known.length ? known.reduce((total, entry) => total + entry.activity[field], 0) : null,
      partial: entries.some(entry => !entry.activity || entry.activity.partial) };
  }
  const research = attemptsList.filter(attempt => attempt.diagnostics?.stage === "public_research");
  const unknownStages = entries.some(entry => entry.hasMessages && !entry.usage?.length) || attemptsList.some(attempt => !attempt.diagnostics?.stage || attempt.diagnostics.stage === "unavailable");
  activity.researchCalls = { value: research.length || !unknownStages ? research.length : null, partial: unknownStages };
  const knownActions = research.filter(attempt => count(attempt.diagnostics?.webSearchCount) !== null);
  activity.webActions = { value: knownActions.length ? knownActions.reduce((total, attempt) => total + attempt.diagnostics.webSearchCount, 0) : !research.length && !unknownStages ? 0 : null,
    partial: unknownStages || knownActions.length !== research.length || research.some(attempt => attempt.status === "running" || attempt.status === "interrupted") };
  return { coverage, ...(includeStages ? { activity,
    providers: groups(attempt => ({ key: attempt.provider, label: attempt.provider === "codex" ? "OpenAI · Codex" : "Anthropic · Claude" })),
    requests: groups((attempt, entry) => ({ key: `${entry.conversationId ?? ""}:${attempt.attribution?.requestId ?? "legacy"}`, label: attempt.attribution?.requestId ? `Request · ${attempt.attribution.requestId.slice(0, 8)}` : "Earlier calls — request unknown" })),
    participants: groups(attempt => ({ key: attempt.attribution?.participantId ?? attempt.attribution?.participant ?? "unknown", label: attempt.attribution?.participant ?? "Earlier calls — participant unknown" })),
    repeatWork,
    callDetails, stages: [...stages].map(([stage, usage]) => ({ stage, ...summarizeUsage([{ usage }], false) })).sort((a, b) => (b.total ?? -1) - (a.total ?? -1)) } : {}), attempts, incomplete, unavailable, startedAt, total: totals.length ? sum(totals) : null, models: rows, historyMayBeMissing: true };
}

// Conservative historical attribution: only the immutable snapshot of a
// single accepted request can establish the setting for its recorded calls.
export function usageWithSavedEffort(attempt, snapshot, owners) {
  if (attempt.diagnostics?.effort || owners.length !== 1 || owners[0].id !== snapshot?.requestMessageId || Date.parse(attempt.startedAt) < Date.parse(owners[0].createdAt)) return attempt;
  if (attempt.attribution?.requestId && attempt.attribution.requestId !== snapshot.requestMessageId) return attempt;
  const stage = attempt.diagnostics?.stage;
  if (!["head_plan", "owner_deliverables", "public_research", "research_query", "specialist_position", "specialist_reply", "specialist_final", "head_review", "head_final", "team_review", "critic_order_assessment", "critic_challenge", "critic_final"].includes(stage)) return attempt;
  const critic = ["team_review", "critic_order_assessment", "critic_challenge", "critic_final"].includes(stage);
  const provider = critic ? snapshot.criticProvider : "codex";
  const model = critic ? snapshot.criticModel : snapshot.headModel;
  const effort = critic ? snapshot.criticReasoning : snapshot.headReasoning;
  if (attempt.provider !== provider || attempt.model !== model || !efforts.has(effort)) return attempt;
  return { ...attempt, diagnostics: { ...attempt.diagnostics, effort, effortSource: "saved_run" } };
}

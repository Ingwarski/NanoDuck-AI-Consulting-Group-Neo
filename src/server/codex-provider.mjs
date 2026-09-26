import { codexAllowance } from "./account-usage.mjs";
import { sourceKey } from "./research-evidence.mjs";
import { buildProviderContext, consultationBaseInstructions } from "./provider-context.mjs";
import { beginUsage, codexTokens, codexResponseTokens, sumTokenUsage } from "./usage.mjs";
import { ensurePrivateDirectory, ensurePrivateFile } from "./private-files.mjs";
import { spawnIsolatedProcess, signalProcessTree } from "./child-process.mjs";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomId } from "./crypto.mjs";
import { createTurnDeadline, isTurnProgress } from "./turn-deadline.mjs";
import { RuntimeInstructionError } from "./prompt-contracts.mjs";
import { hasProhibitedLanguage, omitProhibitedLanguage, omitUnsafeExternalUrls, safeExternalUrl } from "./validation.mjs";

const waitFor = (promise, milliseconds, label, signal = undefined) => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (callback, value) => {
    if (settled) return;
    settled = true; clearTimeout(timer); signal?.removeEventListener("abort", abort); callback(value);
  };
  const abort = () => finish(reject, new Error("cancelled"));
  const timer = milliseconds === undefined ? undefined : setTimeout(() => finish(reject, new Error(label)), milliseconds);
  if (signal?.aborted) return abort();
  signal?.addEventListener("abort", abort, { once: true });
  Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
});
const record = value => typeof value === "object" && value !== null && !Array.isArray(value);
const allowedModelEfforts = new Map([
  ["gpt-6-astra", new Set(["xhigh", "ultra"])],
  ["gpt-6-sol", new Set(["low", "medium", "high", "xhigh", "max", "ultra"])]
]);
// Keep the complete application-built prompt within the same finite transport
// ceiling as the other provider. Never trim or silently substitute context.
const maxPromptBytes = 8 * 1024 * 1024;
const terminalTurn = value => record(value) && ["completed", "interrupted", "failed"].includes(value.status) ? value : undefined;
const providerLog = (event, details) => process.stdout.write(`${JSON.stringify({ event, ...details })}\n`);

const appServerErrorCategory = error => {
  const message = typeof error?.message === "string" ? error.message.toLocaleLowerCase() : "";
  if (error?.code === -32601 || /(?:method\s+(?:not\s+found|unsupported)|unknown\s+method)/u.test(message)) return "method_unavailable";
  if (/(?:auth(?:entication|orization)?|sign\s*in|log\s*in|credential|refresh\s*token)/u.test(message)) return "auth_required";
  if (/(?:rate\s*limit|quota|usage\s*limit|too\s*many\s*requests)/u.test(message)) return "quota_blocked";
  if (/(?:context\s*(?:window|length)|input\s*(?:is\s*)?too\s*large|prompt\s*(?:is\s*)?too\s*long|maximum\s+context|max(?:imum)?\s+tokens|too\s+many\s+tokens)/u.test(message)) return "context_too_large";
  if (/(?:model|reasoning\s*effort).{0,80}(?:unsupported|unavailable|not\s+(?:found|available|supported))|(?:unsupported|unavailable)\s+(?:model|reasoning\s*effort)/u.test(message)) return "incompatible";
  if (/(?:subscription|entitlement|plan)/u.test(message)) return "subscription_unavailable";
  return "provider_unavailable";
};

class AppServerRequestError extends Error {
  constructor(method, error) {
    super("app_server_error");
    this.name = "AppServerRequestError";
    this.requestMethod = method;
    this.category = appServerErrorCategory(error);
    this.safeCode = Number.isSafeInteger(error?.code) ? `rpc_${error.code}` : "rpc_unknown";
  }
}

const providerFailureDetails = error => {
  if (error instanceof AppServerRequestError) return Object.freeze({
    code: error.safeCode,
    category: error.category,
    request: error.requestMethod
  });
  const code = ["cancelled", "provider_timeout", "provider_idle_timeout", "app_server_timeout", "app_server_closed"].includes(error?.message) ? error.message : "provider_error";
  return Object.freeze({ code, category: ["cancelled", "provider_timeout", "provider_idle_timeout"].includes(code) ? code : "provider_unavailable" });
};
const providerFailureCategory = error => providerFailureDetails(error).category;
const providerStatus = error => {
  const category = providerFailureCategory(error);
  return ["auth_required", "quota_blocked", "incompatible"].includes(category) ? category : "unavailable";
};

class AppServerConnection {
  constructor(child, workspace, cleanup) {
    this.child = child; this.workspace = workspace; this.cleanup = cleanup; this.pending = new Map(); this.notifications = new Set(); this.nextId = 1;
    this.reader = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.reader.on("line", line => this.receive(line));
    this.closed = new Promise(resolve => { this.resolveClosed = resolve; });
    this.exited = new Promise(resolve => child.once("close", resolve));
    const fail = error => {
      this.closeError = error;
      this.resolveClosed(error);
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
      this.pending.clear();
    };
    child.stdin.on("error", fail); child.once("error", fail); child.once("exit", () => fail(new Error("app_server_closed")));
  }
  receive(line) {
    let value; try { value = JSON.parse(line); } catch { return; }
    if (!record(value)) return;
    if (typeof value.id === "number") {
      const pending = this.pending.get(value.id); if (!pending) return;
      this.pending.delete(value.id); clearTimeout(pending.timer);
      Object.hasOwn(value, "result") ? pending.resolve(value.result) : pending.reject(new AppServerRequestError(pending.method, value.error)); return;
    }
    if (typeof value.method === "string") for (const listener of this.notifications) listener({ method: value.method, params: value.params });
  }
  request(method, params, milliseconds = 20_000) {
    if (this.closeError) return Promise.reject(this.closeError);
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("app_server_timeout")); }, milliseconds);
      this.pending.set(id, { resolve, reject, timer, method });
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, error => {
        if (!error) return; const pending = this.pending.get(id); if (!pending) return; this.pending.delete(id); clearTimeout(timer); reject(error);
      });
    });
  }
  notify(method, params) { this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`); }
  on(listener) { this.notifications.add(listener); return () => this.notifications.delete(listener); }
  async close() {
    this.closing ??= (async () => {
      this.reader.close();
      await signalProcessTree(this.child, "SIGTERM");
      await waitFor(this.exited, 1_000, "close_timeout").catch(async () => {
        await signalProcessTree(this.child, "SIGKILL");
        await waitFor(this.exited, 5_000, "process_exit_timeout");
      });
      await this.cleanup();
    })();
    return this.closing;
  }
}

async function startConnection(config, signal, requestWorkspace) {
  if (signal?.aborted) throw new Error("cancelled");
  const directory = await mkdtemp(join(tmpdir(), "nanoduck-codex-"));
  ensurePrivateDirectory(directory);
  let connection;
  try {
    const codexHome = join(directory, "codex-home"); await mkdir(codexHome, { mode: 0o700 });
    const authDestination = join(codexHome, "auth.json");
    if (config.codexAuthPath) await copyFile(config.codexAuthPath, authDestination);
    else if (config.codexAuthBytes) await writeFile(authDestination, config.codexAuthBytes, { mode: 0o600 });
    if (config.codexAuthPath || config.codexAuthBytes) ensurePrivateFile(authDestination);
    if (signal?.aborted) throw new Error("cancelled");
    const child = spawnIsolatedProcess(config.codexCommand, [...(config.codexCommandArgs ?? []), "app-server", "--stdio"], {
      cwd: requestWorkspace ?? directory,
      env: { PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin", HOME: requestWorkspace ?? directory, TMPDIR: directory, TEMP: directory, TMP: directory, USERPROFILE: requestWorkspace ?? directory, ...(process.platform === "win32" ? { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR } : {}), CODEX_HOME: codexHome, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "ignore"]
    });
    connection = new AppServerConnection(child, requestWorkspace ?? directory, () => rm(directory, { recursive: true, force: true }));
    await waitFor(connection.request("initialize", { clientInfo: { name: "nanoduck-consulting-group", title: "NanoDuck Consulting Group", version: "0.1.0" }, capabilities: { experimentalApi: true } }), 20_000, "app_server_timeout", signal);
    connection.notify("initialized", {}); return connection;
  } catch (error) {
    if (connection) await connection.close();
    else await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

const bodyFrom = value => {
  if (!record(value) || !Array.isArray(value.items)) return undefined;
  return [...value.items].reverse().find(item => record(item) && item.type === "agentMessage" && typeof item.text === "string" && item.text.trim())?.text;
};

const cleanText = value => typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : undefined;
const publishedAt = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/u.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
const sentenceNear = (text, index) => cleanText(text.slice(Math.max(0, text.lastIndexOf(".", index - 1) + 1), Math.min(text.length, (() => { const end = text.indexOf(".", index); return end === -1 ? text.length : end + 1; })())), 1_000);

function sourceRecord(value, retrievedAt) {
  if (!record(value)) return undefined;
  const url = safeExternalUrl(value.url);
  const title = cleanText(value.title, 280);
  const claim = cleanText(value.claim, 1_000);
  if (!url || !title || !claim || hasProhibitedLanguage(title) || hasProhibitedLanguage(claim)) return undefined;
  return Object.freeze({ url, title, claim, retrievedAt, ...(publishedAt(value.publishedAt) ? { publishedAt: publishedAt(value.publishedAt) } : {}) });
}

function sourcesFrom(text) {
  const retrievedAt = new Date().toISOString();
  const sources = [];
  const body = text.replace(/<nanoduck-source>([\s\S]*?)<\/nanoduck-source>/giu, (_, raw) => {
    try {
      const source = sourceRecord(JSON.parse(raw), retrievedAt);
      if (source) sources.push(source);
    } catch { /* Ignore malformed model-provided metadata. */ }
    return "";
  }).trim();
  for (const match of body.matchAll(/\[([^\]\n]{1,280})\]\((https:\/\/[^\s)]+)\)/gu)) {
    const source = sourceRecord({ title: match[1], url: match[2], claim: sentenceNear(body, match.index ?? 0) }, retrievedAt);
    if (source) sources.push(source);
  }
  const deduplicated = new Map();
  for (const source of sources) if (!deduplicated.has(sourceKey(source))) deduplicated.set(sourceKey(source), source);
  const filtered = omitUnsafeExternalUrls(body);
  const language = omitProhibitedLanguage(filtered.body);
  const failureReason = !language.body.trim() ? "empty_response" : !language.substantive ? (language.omittedCount ? "prohibited_language" : "no_usable_content") : undefined;
  return Object.freeze({ body: failureReason ? undefined : language.body, sources: Object.freeze([...deduplicated.values()]), urlOmissionCount: filtered.omittedCount, languageOmissionCount: language.omittedCount, failureReason });
}

async function supportedCatalog(connection) {
  const models = [];
  let cursor;
  for (let page = 0; page < 20; page += 1) {
    const result = await connection.request("model/list", { limit: 100, includeHidden: true, ...(cursor ? { cursor } : {}) });
    if (!record(result) || !Array.isArray(result.data)) throw new Error("invalid_catalog");
    models.push(...result.data);
    if (result.nextCursor === null || result.nextCursor === undefined) { cursor = undefined; break; }
    if (typeof result.nextCursor !== "string" || !result.nextCursor || result.nextCursor === cursor) throw new Error("invalid_catalog");
    cursor = result.nextCursor;
  }
  if (cursor || models.length > 2_000) throw new Error("invalid_catalog");
  const supported = [];
  for (const [id, allowedEfforts] of allowedModelEfforts) {
    const model = models.find(item => record(item) && item.model === id && typeof item.id === "string" && Array.isArray(item.supportedReasoningEfforts));
    if (!model) continue;
    const efforts = model.supportedReasoningEfforts.flatMap(item => record(item) && allowedEfforts.has(item.reasoningEffort) ? [item.reasoningEffort] : []);
    if (efforts.length) supported.push(Object.freeze({ id, efforts: Object.freeze([...new Set(efforts)]) }));
  }
  return supported.length ? Object.freeze(supported) : undefined;
}

export function createCodexProvider(config, deadlineOptions = undefined) {
  const requestWorkspaces = new Map();
  const requestWorkspace = async scope => {
    if (!scope) return undefined;
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(scope)) throw new Error("invalid_run_state");
    if (!requestWorkspaces.has(scope)) requestWorkspaces.set(scope, (async () => {
      const directory = await mkdtemp(join(tmpdir(), "nanoduck-request-"));
      ensurePrivateDirectory(directory); return directory;
    })());
    return requestWorkspaces.get(scope);
  };
  const releaseScope = async scope => {
    const pending = requestWorkspaces.get(scope);
    if (!pending) return;
    requestWorkspaces.delete(scope);
    await rm(await pending, { recursive: true, force: true });
  };
  const inspect = async () => {
    if (!config.readyForProvider) return Object.freeze({ status: "unavailable", models: Object.freeze([]) });
    let connection;
    try {
      connection = await startConnection(config);
      const account = await connection.request("account/read", { refreshToken: false });
      if (!record(account) || !record(account.account) || account.account.type !== "chatgpt") return Object.freeze({ status: "auth_required", models: Object.freeze([]) });
      const [models, limits] = await Promise.all([supportedCatalog(connection), connection.request("account/rateLimits/read", {})]);
      if (!models) return Object.freeze({ status: "incompatible", models: Object.freeze([]) });
      const quotaBlocked = record(limits) && record(limits.rateLimits) && limits.rateLimits.rateLimitReachedType !== null && limits.rateLimits.rateLimitReachedType !== undefined;
      return Object.freeze({ status: quotaBlocked ? "quota_blocked" : "ready", models });
    } catch (error) {
      return Object.freeze({ status: providerStatus(error), models: Object.freeze([]) });
    } finally {
      await connection?.close().catch(() => {});
    }
  };
  const accountUsage = async () => {
    if (!config.readyForProvider) throw new Error("provider_unavailable");
    let connection;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      connection = await startConnection(config, controller.signal);
      const account = await waitFor(connection.request("account/read", { refreshToken: false }), 10_000, "app_server_timeout", controller.signal);
      if (account?.account?.type !== "chatgpt") throw new Error("auth_required");
      return codexAllowance(await waitFor(connection.request("account/rateLimits/read", {}), 10_000, "app_server_timeout", controller.signal));
    } finally { clearTimeout(timer); await connection?.close().catch(() => {}); }
  };
  const invoke = async ({ assignment, model, effort, evidence, research, outputKind = "discussion", maximumCharacters = undefined, runtimeInstructions, signal, onUsage, contextScope }) => {
    if (!config.readyForProvider) return { ok: false, code: "provider_unavailable" };
    if (!runtimeInstructions) throw new RuntimeInstructionError("Provider invocation is missing its runtime-instructions contract.");
    let connection; let threadId; let unsubscribe = () => {}; let deadline;
    let startedAt; let lastProgressAt; let progressCount = 0;
    let usageEmittedAt = 0; let webSearchCount = 0; let finishUsage; let expectedUsageTurn; let usageStatus = "failed"; const usageByTurn = new Map(); const responseUsageByTurn = new Map(); const researchStepsByTurn = new Map();
    try {
      if (Buffer.byteLength(assignment, "utf8") > maxPromptBytes) return { ok: false, code: "context_too_large" };
      const { prompt, prefixBytes, promptBytes } = buildProviderContext({ assignment, model, effort, evidence, research, outputKind, runtimeInstructions, contextScope });
      if (promptBytes > maxPromptBytes) return { ok: false, code: "context_too_large" };
      connection = await startConnection(config, signal, await requestWorkspace(contextScope));
      if (signal?.aborted) throw new Error("cancelled");
      const started = await connection.request("thread/start", { experimentalRawEvents: true, model, baseInstructions: consultationBaseInstructions, ephemeral: true, cwd: connection.workspace, sandbox: "read-only", approvalPolicy: "never", environments: [], config: { web_search: research ? "live" : "disabled", features: { shell_tool: false, unified_exec: false, view_image: false, shell_snapshot: false, apps: false, plugins: false, hooks: false, memories: false, browser_use: false, browser_use_external: false, browser_use_full_cdp_access: false, computer_use: false, image_generation: false, workspace_dependencies: false, code_mode: false, code_mode_host: false, multi_agent: false, multi_agent_v2: false, skill_search: false, tool_suggest: false, request_permissions_tool: false } } });
      if (!record(started) || !record(started.thread) || typeof started.thread.id !== "string") return { ok: false, code: "provider_unavailable" };
      threadId = started.thread.id;
      let resolveTurn; const turnDone = new Promise(resolve => { resolveTurn = resolve; });
      let expectedTurnId;
      deadline = createTurnDeadline(deadlineOptions);
      const completedTurns = new Map();
      const completedBodies = new Map();
      const completedSearches = new Map();
      const recordSearch = (turnId, item) => {
        const steps = researchStepsByTurn.get(turnId) ?? new Map();
        if (steps.has(item.id)) return;
        const action = ({ search: "search", open_page: "open_page", openPage: "open_page", find_in_page: "find_in_page", findInPage: "find_in_page" })[item.action?.type] ?? "other";
        const fingerprint = action === "other" ? null : JSON.stringify(item.action);
        const duplicate = fingerprint ? [...steps.values()].findIndex(step => step.fingerprint === fingerprint) : -1;
        const usage = usageByTurn.get(turnId);
        steps.set(item.id, { fingerprint, action, elapsedMs: startedAt ? Date.now() - startedAt : null, cumulativeInput: usage?.input ?? null, cumulativeCachedInput: usage?.cachedInput ?? null, repeatOf: duplicate < 0 ? null : duplicate + 1 });
        researchStepsByTurn.set(turnId, steps);
      };
      unsubscribe = connection.on(notification => {
        const params = notification.params;
        if (!record(params) || params.threadId !== threadId) return;
        if (notification.method === "rawResponse/completed" && typeof params.turnId === "string" && typeof params.responseId === "string") {
          const tokens = codexResponseTokens(params.usageMetadata?.metadata);
          if (tokens) {
            const responses = responseUsageByTurn.get(params.turnId) ?? new Map();
            if (!responses.has(params.responseId)) responses.set(params.responseId, tokens);
            responseUsageByTurn.set(params.turnId, responses);
          }
        }
        if (notification.method === "thread/tokenUsage/updated" && typeof params.turnId === "string" && record(params.tokenUsage?.total)) {
          usageByTurn.set(params.turnId, codexTokens(params.tokenUsage.total));
          if (params.turnId === expectedUsageTurn && finishUsage && Date.now() - usageEmittedAt >= 1000) {
            usageEmittedAt = Date.now();
            void finishUsage("running", [{ model, tokens: usageByTurn.get(params.turnId) }]);
          }
        }
        if (isTurnProgress(notification, threadId, expectedTurnId)) {
          lastProgressAt = Date.now(); progressCount += 1; deadline.progress();
        }
        if (notification.method === "item/completed" && typeof params.turnId === "string") {
          const body = bodyFrom({ items: [params.item] });
          if (body) completedBodies.set(params.turnId, body);
          if (params.item?.type === "webSearch" && typeof params.item.id === "string") {
            const searches = completedSearches.get(params.turnId) ?? new Set();
            recordSearch(params.turnId, params.item); searches.add(params.item.id); completedSearches.set(params.turnId, searches); webSearchCount = searches.size;
          }
        }
        if (notification.method !== "turn/completed") return;
        const completed = terminalTurn(params.turn);
        if (!completed || typeof completed.id !== "string") return;
        completedTurns.set(completed.id, completed);
        if (completed.id === expectedTurnId) resolveTurn(completed);
      });
      if (signal?.aborted) throw new Error("cancelled");
      finishUsage = await beginUsage(onUsage, "codex", model, { stage: outputKind, effort, effortSource: "request", promptBytes, prefixBytes });
      const turn = await waitFor(connection.request("turn/start", { threadId, input: [{ type: "text", text: prompt, text_elements: [] }], model, approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: research }, environments: [], effort }), 20_000, "app_server_timeout", signal);
      const startedTurn = record(turn) && record(turn.turn) ? turn.turn : undefined;
      if (!record(startedTurn) || typeof startedTurn.id !== "string") throw new Error("provider_error");
      expectedTurnId = startedTurn.id; expectedUsageTurn = expectedTurnId;
      startedAt = Date.now(); lastProgressAt ??= startedAt;
      deadline.start();
      providerLog("nanoduck.provider.turn_started", { outputKind, research, effort });
      // Ephemeral threads have no saved turn history. Consume the subscribed event
      // stream; thread/read(includeTurns:true) is rejected by the pinned app server.
      const resolvedTurn = terminalTurn(startedTurn) ?? completedTurns.get(expectedTurnId) ?? await waitFor(
        Promise.race([turnDone, deadline.promise, connection.closed.then(error => { throw error; })]),
        undefined, "provider_timeout", signal
      );
      usageStatus = resolvedTurn.status === "completed" ? "completed" : "failed";
      if (resolvedTurn.status !== "completed") throw new AppServerRequestError("turn/completed", resolvedTurn.error);
      const resultBody = bodyFrom(resolvedTurn) ?? completedBodies.get(expectedTurnId);
      const completionSource = terminalTurn(startedTurn) ? "turn_start" : "notification";
      const searchIds = new Set([...(completedSearches.get(expectedTurnId) ?? []), ...(resolvedTurn.items ?? []).filter(item => item?.type === "webSearch" && typeof item.id === "string").map(item => item.id)]);
      for (const item of resolvedTurn.items ?? []) if (item?.type === "webSearch" && typeof item.id === "string") recordSearch(expectedTurnId, item);
      webSearchCount = searchIds.size;
      providerLog("nanoduck.provider.turn_completed", { outputKind, completionSource, durationMs: Date.now() - startedAt, webSearchCount: searchIds.size });
      unsubscribe();
      const output = typeof resultBody === "string" ? sourcesFrom(resultBody) : undefined;
      if (output?.urlOmissionCount) providerLog("nanoduck.provider.output_policy", { outputKind, reason: "unapproved_url_omitted", count: output.urlOmissionCount });
      if (output?.languageOmissionCount) providerLog("nanoduck.provider.output_policy", { outputKind, reason: "prohibited_fragment_omitted", count: output.languageOmissionCount });
      if (output?.failureReason) providerLog("nanoduck.provider.output_policy", { outputKind, reason: output.failureReason });
      return output?.body ? { ok: true, body: output.body, sources: output.sources } : output ? { ok: false, code: output.failureReason === "prohibited_language" ? "language_policy" : output.failureReason === "no_usable_content" ? "output_policy" : "provider_unavailable" } : { ok: false, code: "provider_unavailable" };
    } catch (error) {
      const details = providerFailureDetails(error);
      const code = signal?.aborted || error.message === "cancelled" ? "cancelled" : details.category;
      providerLog("nanoduck.provider.turn_failed", { outputKind, ...details, ...(startedAt ? { durationMs: Date.now() - startedAt, idleMs: Date.now() - lastProgressAt, progressCount } : {}) });
      return { ok: false, code };
    } finally {
      deadline?.stop();
      const normalized = usageByTurn.get(expectedUsageTurn);
      const responses = [...(responseUsageByTurn.get(expectedUsageTurn)?.values() ?? [])];
      const upstream = responses.length ? sumTokenUsage(responses) : undefined;
      // Raw events describe individual responses; total/last notifications describe
      // cumulative usage. Reconcile them, never add the two representations.
      const verified = upstream && (!normalized || ["input", "output", "total"].every(field => upstream[field] === normalized[field]));
      const tokens = verified ? upstream : normalized;
      await finishUsage?.(signal?.aborted ? "cancelled" : usageStatus, tokens ? [{ model, tokens }] : [], { usageSource: verified ? "upstream_responses" : "codex_normalized", usageCoverage: verified ? (normalized ? "reconciled" : "partial") : "normalized", responseCount: responses.length, webSearchCount: expectedUsageTurn ? researchStepsByTurn.get(expectedUsageTurn)?.size ?? 0 : null, ...(research ? { researchSteps: [...(researchStepsByTurn.get(expectedUsageTurn)?.values() ?? [])].map(({ fingerprint, ...step }) => step) } : {}) });
      unsubscribe();
      if (connection && threadId && !signal?.aborted) await connection.request("thread/unsubscribe", { threadId }, 1_000).catch(() => {});
      await connection?.close().catch(() => {});
    }
  };
  return Object.freeze({ inspect, accountUsage, invoke, releaseScope, id: () => randomId() });
}

import { initializeInstructions } from "./instruction-bootstrap.mjs";
import { documentNames, readDocumentDefault, validDocument } from "./instruction-documents.mjs";
import { createServer } from "node:http";
import { readRegularFile } from "./read-regular-file.mjs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { createDatabaseSslOptions } from "./database-tls.mjs";
import { createMemoryStore, createMySqlStore } from "./store.mjs";
import { createAuth } from "./auth.mjs";
import { secureEqual } from "./crypto.mjs";
import { createProviders } from "./providers.mjs";
import { createConsultationService } from "./consultation.mjs";
import { parseRuntimeInstructions, RuntimeInstructionError, upgradeRuntimeInstructionMarkdown } from "./prompt-contracts.mjs";
import { attachmentExtension, readImageAttachment } from "./attachments.mjs";
import { exportConversationRtf } from "./conversation-export.mjs";
import { messageError, parseConversationId, parseConversationIds, parseMessage, parseSettings } from "./validation.mjs";

const config = loadConfig();
const databaseSsl = config.databaseUrl ? await createDatabaseSslOptions(config) : undefined;
const store = config.databaseUrl ? await createMySqlStore(config.databaseUrl, config.dataKey, databaseSsl) : createMemoryStore();
let leadershipWasLost = false;
let stopAfterLeadershipLoss;
store.onLeadershipLost?.((code, errno) => {
  leadershipWasLost = true;
  process.stderr.write(`NanoDuck database leadership lost (${code}${errno === undefined ? "" : `, errno=${errno}`}); shutting down.\n`);
  process.exitCode = 1; stopAfterLeadershipLoss?.();
});
store.onLeadershipAcquired?.(({ idleTimeoutSeconds, heartbeatIntervalMs }) => {
  process.stdout.write(`NanoDuck database leadership acquired (session idle timeout=${idleTimeoutSeconds}s, heartbeat=${heartbeatIntervalMs}ms).\n`);
});
try {
  if (store.acquireLeadership && !await store.acquireLeadership()) throw new Error("Another application process owns this database. Stop it before starting this instance.");
  await store.interruptUsage?.();
  await initializeInstructions(store);
  await store.migrateRuntimeInstructions(markdown => {
    const upgraded = upgradeRuntimeInstructionMarkdown(markdown);
    return upgraded === markdown ? undefined : parseRuntimeInstructions(upgraded);
  });
} catch (error) { await store.close?.(); throw error; }
const auth = createAuth({ config, store });
const providers = createProviders(config);
const consultation = createConsultationService({ store, provider: providers });
const publicDirectory = fileURLToPath(new URL("../../public/", import.meta.url));
const clientDirectory = fileURLToPath(new URL("../client/", import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".wav": "audio/wav" };

const securityHeaders = { "cache-control": "no-store", "content-security-policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; media-src 'self' blob:;", "permissions-policy": "camera=(), geolocation=(), microphone=(self)", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff", "x-frame-options": "DENY" };
const send = (response, status, value, headers = {}) => { const body = JSON.stringify(value); response.writeHead(status, { ...securityHeaders, "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), ...headers }); response.end(body); };
const publicRun = run => {
  if (!run || run.snapshot?.contractVersion !== "parallel-v1") return run;
  const { parallelWork, ...snapshot } = run.snapshot;
  return { ...run, snapshot, progress: parallelWork ? { completed: Object.keys(parallelWork.results ?? {}).length, total: parallelWork.assignments.length, round: parallelWork.rounds.length } : { completed: 0, total: 0, round: 0 } };
};
const empty = (response, status, headers = {}) => { response.writeHead(status, { ...securityHeaders, ...headers }); response.end(); };
const bytes = (response, status, value, headers = {}) => {
  if (!["application/octet-stream", "application/rtf", "image/jpeg", "image/png", "image/webp"].includes(headers["content-type"] ?? "application/octet-stream")) throw new Error("invalid_download_type");
  response.writeHead(status, { "content-type": "application/octet-stream", "content-disposition": "attachment", ...headers, ...securityHeaders, "content-length": value.byteLength });
  response.end(value);
};
const json = async request => {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 16 * 1024 * 1024) throw new Error("body_too_large"); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return undefined; }
};
const protectedSession = async (request, response, options = {}) => {
  const session = await auth.require(request, options);
  if (!session) { send(response, 401, { error: "authentication_required" }); return undefined; }
  return session;
};
const routeId = pathname => pathname.match(/^\/api\/conversations\/([A-Za-z0-9_-]{16,128})(?:\/([^/]+)(?:\/([A-Za-z0-9_-]{16,128}))?)?$/u);
const activeRuntimeInstructions = async () => {
  const current = await store.runtimeInstructions();
  if (!current) throw new Error("runtime_instructions_unavailable");
  const contract = parseRuntimeInstructions(current.markdown);
  if (current.contentHash !== contract.revision) throw new Error("runtime_instructions_corrupt");
  return Object.freeze({ markdown: contract.markdown, revision: current.revision, contentHash: current.contentHash, updatedAt: current.updatedAt, source: "database" });
};

async function staticFile(request, response, pathname) {
  const wanted = pathname === "/" ? "/index.html" : pathname;
  const safe = normalize(wanted).replace(/^([/\\])+/, "");
  if (safe.includes("..")) return false;
  const path = pathname.startsWith("/client/") ? join(clientDirectory, safe.slice("client/".length)) : join(publicDirectory, safe);
  try {
    const body = await readRegularFile(path); response.writeHead(200, { ...securityHeaders, "content-type": mime[extname(path)] ?? "application/octet-stream", "content-length": body.byteLength }); response.end(body); return true;
  } catch { return false; }
}

const handler = async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", config.origin ?? "http://localhost");
    if (request.method === "GET" && url.pathname === "/healthz") return send(response, 200, { status: "alive", store: store.kind });
    const suppliedProxyKey = request.headers["x-nanoduck-origin-key"];
    if (config.edgeProxyKey && (typeof suppliedProxyKey !== "string" || !secureEqual(suppliedProxyKey, config.edgeProxyKey))) {
      return send(response, 404, { error: "not_found" });
    }
    if (request.method === "POST" && url.pathname === "/auth/google/start") {
      const flow = await auth.beginGoogle(); return flow ? empty(response, 204, { location: flow.location, "set-cookie": flow.cookie }) : send(response, 503, { error: "google_auth_unavailable" });
    }
    if (request.method === "GET" && url.pathname === "/auth/google/callback") {
      const result = await auth.finishGoogle(url.toString(), request); return result ? empty(response, 303, { location: "/", "set-cookie": [auth.sessionCookie(result.session), result.clearFlowCookie] }) : send(response, 403, { error: "authentication_failed" });
    }
    if (request.method === "POST" && url.pathname === "/api/auth/development") {
      const session = await auth.developmentSignIn(); return session ? send(response, 200, { authenticated: true }, { "set-cookie": auth.sessionCookie(session) }) : send(response, 404, { error: "not_found" });
    }
    if (request.method === "GET" && url.pathname === "/api/session") {
      const session = await auth.session(request); return send(response, 200, session ? { authenticated: true, consented: Boolean(session.consentedAt), csrfToken: session.csrfToken, expiresAt: session.expiresAt, development: session.ownerSubject.startsWith("development:") } : { authenticated: false, development: Boolean(config.developmentOwnerEmail) });
    }
    if (request.method === "POST" && url.pathname === "/api/consent") {
      const session = await auth.consent(request); return session ? send(response, 200, { consented: true }) : send(response, 403, { error: "consent_denied" });
    }
    if (request.method === "POST" && url.pathname === "/api/logout") { if (!await auth.signOut(request)) return send(response, 403, { error: "logout_denied" }); return empty(response, 204, { "set-cookie": auth.clearSessionCookie() }); }
    if (request.method === "GET" && url.pathname === "/api/settings") { if (!await protectedSession(request, response)) return; const [capabilities, runtimeInstructions] = await Promise.all([providers.inspect(), activeRuntimeInstructions()]); return send(response, 200, { settings: await store.settings(), runtimeInstructions, provider: capabilities.codex.status, catalog: capabilities.codex.models, criticProviders: capabilities }); }
    if (request.method === "PUT" && url.pathname === "/api/settings") { if (!await protectedSession(request, response, { csrf: true })) return; const capabilities = await providers.inspect(); const next = parseSettings(await json(request), capabilities); return next ? send(response, 200, { settings: await store.saveSettings(next) }) : send(response, 422, { error: "invalid_settings" }); }
    if (request.method === "GET" && url.pathname === "/api/runtime-instructions") {
      if (!await protectedSession(request, response)) return;
      const [runtimeInstructions, history] = await Promise.all([activeRuntimeInstructions(), store.listRuntimeInstructionHistory()]);
      return send(response, 200, { runtimeInstructions, history });
    }
    const instructionHistory = url.pathname.match(/^\/api\/runtime-instructions\/history\/([A-Za-z0-9_-]{16,128})$/u);
    if (request.method === "GET" && instructionHistory) {
      if (!await protectedSession(request, response)) return;
      const version = await store.runtimeInstructionVersion(instructionHistory[1]);
      return version ? send(response, 200, { version }) : send(response, 404, { error: "not_found" });
    }
    if (request.method === "PUT" && url.pathname === "/api/runtime-instructions") {
      if (!await protectedSession(request, response, { csrf: true })) return;
      const input = await json(request); const contract = parseRuntimeInstructions(input?.markdown);
      const saved = await store.saveRuntimeInstructions(contract, input?.revision);
      return saved ? send(response, 200, { runtimeInstructions: { ...saved, source: "database" } }) : send(response, 409, { error: "stale_runtime_instructions", message: "Runtime instructions changed in another session. Reload Settings before saving." });
    }
    if (request.method === "PUT" && url.pathname === "/api/runtime-instructions/restore") {
      if (!await protectedSession(request, response, { csrf: true })) return;
      const input = await json(request);
      if (typeof input?.historyId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(input.historyId)) return send(response, 422, { error: "invalid_runtime_instruction_version" });
      const previous = await store.runtimeInstructionVersion(input.historyId);
      if (!previous) return send(response, 404, { error: "not_found" });
      const saved = await store.restoreRuntimeInstructions(parseRuntimeInstructions(upgradeRuntimeInstructionMarkdown(previous.markdown)), input?.revision, previous.id);
      return saved ? send(response, 200, { runtimeInstructions: { ...saved, source: "database" } }) : send(response, 409, { error: "stale_runtime_instructions", message: "Runtime instructions changed in another session. Reload Settings before restoring." });
    }
    if (url.pathname === "/api/instruction-documents" && request.method === "GET") {
      if (!await protectedSession(request, response)) return;
      return send(response, 200, { documents: await store.instructionDocuments() });
    }
    const managedDocument = url.pathname.match(/^\/api\/instruction-documents\/([A-Z_]+\.md)(?:\/(restore-default|history)(?:\/([1-9][0-9]{0,9}))?)?$/u);
    if (managedDocument && documentNames.includes(managedDocument[1])) {
      const [, name, action, version] = managedDocument;
      if (!await protectedSession(request, response, { csrf: request.method !== "GET" })) return;
      if (request.method === "GET" && action === "history") {
        const result = version ? await store.instructionVersion(name, Number(version)) : await store.instructionHistory(name);
        return result ? send(response, 200, { result }) : send(response, 404, { error: "not_found" });
      }
      if (request.method === "PUT" && (!action || action === "restore-default")) {
        const input = await json(request);
        const markdown = action === "restore-default" && input?.confirmed === true ? await readDocumentDefault(name) : !action ? input?.markdown : undefined;
        if (!validDocument(markdown) || !Number.isSafeInteger(input?.revision)) return send(response, 422, { error: "invalid_document" });
        const document = await store.saveInstructionDocument(name, input.revision, markdown, action ?? "save");
        return document ? send(response, 200, { document }) : send(response, 409, { error: "stale_document" });
      }
      return send(response, 405, { error: "method_not_allowed" });
    }
    if (request.method === "GET" && url.pathname === "/api/account-usage") {
      if (!await protectedSession(request, response)) return;
      return send(response, 200, { accounts: await providers.accountUsage() });
    }
    if (request.method === "GET" && url.pathname === "/api/usage") {
      if (!await protectedSession(request, response)) return;
      const conversationId = url.searchParams.get("conversationId") ?? undefined;
      if (conversationId !== undefined && !parseConversationId(conversationId)) return send(response, 422, { error: "invalid_conversation" });
      const usage = await store.usageSummary(conversationId);
      return usage ? send(response, 200, { usage }) : send(response, 404, { error: "not_found" });
    }
    if (request.method === "GET" && url.pathname === "/api/conversations") { if (!await protectedSession(request, response)) return; return send(response, 200, { conversations: await store.listConversations() }); }
    if (request.method === "POST" && url.pathname === "/api/conversations") { if (!await protectedSession(request, response, { csrf: true })) return; return send(response, 201, { conversation: await store.createConversation() }); }
    if (request.method === "DELETE" && url.pathname === "/api/conversations") {
      if (!await protectedSession(request, response, { csrf: true })) return;
      const conversationIds = parseConversationIds(await json(request));
      if (!conversationIds) return send(response, 422, { error: "invalid_conversations" });
      for (const id of conversationIds) await consultation.stop(id);
      const deletedConversationIds = await store.deleteConversations(conversationIds);
      return send(response, 200, { deletedConversationIds });
    }
    const matched = routeId(url.pathname);
    if (matched) {
      const [, conversationId, action, resourceId] = matched; if (!parseConversationId(conversationId)) return send(response, 404, { error: "not_found" });
      if (!await protectedSession(request, response, { csrf: request.method !== "GET" })) return;
      if (request.method === "GET" && !action) { const conversation = await store.getConversation(conversationId); return conversation ? send(response, 200, { conversation, run: publicRun(await store.run(conversationId)), events: await store.events(conversationId, Number(url.searchParams.get("after") ?? 0)) }) : send(response, 404, { error: "not_found" }); }
      if (request.method === "POST" && action === "attachments" && !resourceId) {
        const attachment = await readImageAttachment(request, config.maxAttachmentBytes);
        const created = await store.createAttachment(conversationId, attachment);
        return created ? send(response, 201, { attachment: created }) : send(response, 409, { error: "active_or_missing_conversation" });
      }
      if (request.method === "GET" && action === "attachments" && resourceId) {
        const attachment = await store.attachment(conversationId, resourceId);
        return attachment ? bytes(response, 200, attachment.content, { "content-type": attachment.contentType, "content-disposition": `attachment; filename="nanoduck-image.${attachmentExtension(attachment.contentType)}"` }) : send(response, 404, { error: "not_found" });
      }
      if (request.method === "DELETE" && action === "attachments" && resourceId) return (await store.deletePendingAttachment(conversationId, resourceId)) ? empty(response, 204) : send(response, 404, { error: "not_found" });
      if (request.method === "POST" && action === "messages") {
        const raw = await json(request); const input = parseMessage(raw); if (!input) return send(response, 422, { error: messageError(raw) });
        const [settings, runtimeInstructions] = await Promise.all([store.settings(), activeRuntimeInstructions()]);
        const accepted = await store.acceptMessage(conversationId, input, { ...settings, contractVersion: "parallel-v1", runtimeInstructions: { markdown: runtimeInstructions.markdown, revision: runtimeInstructions.revision }, instructionDocuments: await store.instructionDocuments() });
        if (!accepted) return send(response, 409, { error: "active_or_missing_conversation" }); if (!accepted.replayed) await consultation.start(conversationId, accepted.run); return send(response, 202, { ...accepted, run: publicRun(accepted.run) });
      }
      if (request.method === "POST" && action === "stop") { const run = await consultation.stop(conversationId); return run ? send(response, 200, { run: publicRun(run) }) : send(response, 409, { error: "no_active_run" }); }
      if (request.method === "POST" && action === "continue") { const run = await consultation.continue(conversationId); return run ? send(response, 202, { run: publicRun(run) }) : send(response, 409, { error: "not_stopped" }); }
      if (request.method === "GET" && action === "export") {
        const exported = await store.exportConversation(conversationId);
        if (!exported) return send(response, 404, { error: "not_found" });
        let document;
        try { document = exportConversationRtf(exported, url.searchParams.get("timeZone") ?? "UTC"); }
        catch (error) { if (error instanceof RangeError) return send(response, 422, { error: "invalid_time_zone" }); throw error; }
        return bytes(response, 200, document, { "content-type": "application/rtf", "content-disposition": `attachment; filename="nanoduck-${conversationId}.rtf"` });
      }
      if (request.method === "DELETE" && !action) { await consultation.stop(conversationId); return (await store.deleteConversation(conversationId)) ? empty(response, 204) : send(response, 404, { error: "not_found" }); }
    }
    if (request.method === "GET" && await staticFile(request, response, url.pathname)) return;
    send(response, 404, { error: "not_found" });
  } catch (error) {
    if (error instanceof RuntimeInstructionError) return send(response, 422, { error: error.code, message: error.message });
    if (error.message === "body_too_large") return send(response, 413, { error: "body_too_large" });
    if (error.code === "attachment_too_large") return send(response, 413, { error: "attachment_too_large" });
    if (error.code === "invalid_image_attachment") return send(response, 422, { error: "invalid_image_attachment" });
    send(response, 500, { error: "service_unavailable" });
  }
};

let shutdown;
const requests = new Set();
const server = createServer((request, response) => {
  if (shutdown) return send(response, 503, { error: "shutting_down" });
  const active = handler(request, response).finally(() => requests.delete(active));
  requests.add(active);
});
server.requestTimeout = 30_000;
server.headersTimeout = 20_000;
const close = () => shutdown ??= (async () => {
  const drained = new Promise(resolve => server.close(resolve));
  server.closeIdleConnections();
  const deadline = setTimeout(() => server.closeAllConnections(), 10_000); deadline.unref();
  try {
    await consultation.close();
    await drained;
    await Promise.allSettled([...requests]);
  } finally { clearTimeout(deadline); await store.close?.(); }
})().catch(() => { process.exitCode = 1; });
stopAfterLeadershipLoss = () => { void close(); };
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => void close());
try {
  if (leadershipWasLost) throw new Error("Database leadership was lost before HTTP startup.");
  await consultation.resume();
  if (store.acquireLeadership && !await store.acquireLeadership()) throw new Error("Database leadership was lost before HTTP startup.");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.mode === "production" ? "0.0.0.0" : "127.0.0.1", resolve);
  });
  const address = server.address();
  process.stdout.write(`NanoDuck Consulting Group listening on ${address.address}:${address.port} (mode=${config.mode}).\n`);
} catch (error) { await close(); throw error; }

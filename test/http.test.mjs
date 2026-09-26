import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { testRuntimeInstructionsBootstrap } from "./fixtures/runtime-instructions.mjs";

const reservePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
};

const waitFor = async (predicate, milliseconds = 3_000) => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("timed_out");
};

test("the edge proxy key protects every route except the health check", async () => {
  const port = await reservePort();
  const edgeProxyKey = "synthetic-edge-proxy-key-that-is-long-enough";
  const child = spawn(globalThis.process.execPath, ["src/server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...globalThis.process.env, NODE_ENV: "development", DEV_OWNER_EMAIL: "owner@local.test", EDGE_PROXY_KEY: edgeProxyKey, PORT: String(port) },
    stdio: "ignore"
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => {
      try { return (await fetch(`${origin}/healthz`)).ok; } catch { return false; }
    });
    assert.equal((await fetch(`${origin}/`)).status, 404);
    assert.equal((await fetch(`${origin}/`, { headers: { "x-nanoduck-origin-key": "wrong" } })).status, 404);
    assert.equal((await fetch(`${origin}/`, { headers: { "x-nanoduck-origin-key": edgeProxyKey } })).status, 200);
    assert.equal((await fetch(`${origin}/api/auth/development`, { method: "POST", headers: { "x-nanoduck-origin-key": edgeProxyKey } })).status, 200);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
  }
});

test("the local HTTP flow protects data, saves settings and preserves a truthful unavailable-provider message", async () => {
  const port = await reservePort();
  const child = spawn(globalThis.process.execPath, ["src/server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...globalThis.process.env, NODE_ENV: "development", DEV_OWNER_EMAIL: "owner@local.test", PORT: String(port), RUNTIME_INSTRUCTIONS_BOOTSTRAP_B64: testRuntimeInstructionsBootstrap },
    stdio: "ignore"
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => {
      try { return (await fetch(`${origin}/healthz`)).ok; } catch { return false; }
    });
    assert.equal((await fetch(`${origin}/api/conversations`)).status, 401);
    for (const path of ["/client/", "/sounds/", "/missing-file.txt", "/client/missing.js"]) {
      const missing = await fetch(`${origin}${path}`);
      assert.equal(missing.status, 404);
      assert.deepEqual(await missing.json(), { error: "not_found" });
    }

    const signIn = await fetch(`${origin}/api/auth/development`, { method: "POST" });
    assert.equal(signIn.status, 200);
    const cookie = signIn.headers.get("set-cookie").split(";", 1)[0];
    assert.match(cookie, /^nanoduck-session=/u);

    const session = await (await fetch(`${origin}/api/session`, { headers: { cookie } })).json();
    assert.equal(session.authenticated, true);
    assert.equal(session.consented, false);
    assert.equal(session.expiresAt > new Date().toISOString(), true);
    const headers = { cookie, "x-csrf-token": session.csrfToken, "content-type": "application/json" };
    assert.equal((await fetch(`${origin}/api/consent`, { method: "POST", headers })).status, 200);
    assert.equal((await fetch(`${origin}/api/voice/transcribe`, { method: "POST", headers, body: "not audio" })).status, 404);
    const client = await (await fetch(`${origin}/client/app.js`)).text();
    assert.match(client, /SpeechRecognition/u);
    const audioClient = await (await fetch(`${origin}/client/notification-audio.js`)).text();
    assert.match(audioClient, /audio\/wav/u);
    assert.doesNotMatch(client, /View conversation/u);
    assert.match(client, /Delete selected/u);
    assert.match(client, /critic-provider/u);
    assert.match(client, /requestSubmit\(\)/u);
    assert.match(client, /setTab\("discussion"\)/u);
    assert.match(client, /refresh-state\.js/u);
    assert.match(client, /saveRefreshState\(\)/u);
    assert.match(client, /restoreScroll\(saved\.scrollY\)/u);
    assert.doesNotMatch(client, /MediaRecorder|voice\/transcribe/u);
    const refreshState = await (await fetch(`${origin}/client/refresh-state.js`)).text();
    assert.match(refreshState, /nanoduck-page-state-v1/u);
    const shell = await (await fetch(`${origin}/`)).text();
    assert.match(shell, /id="notification-sound"/u);
    assert.doesNotMatch(shell, /id="conversation-title"/u);
    assert.match((await fetch(`${origin}/`)).headers.get("content-security-policy"), /media-src 'self' blob:/u);
    const knockResponse = await fetch(`${origin}/sounds/table-taps-250ms-v5.wav`);
    assert.equal(knockResponse.status, 200);
    assert.equal(knockResponse.headers.get("content-type"), "audio/wav");
    const knockBytes = Buffer.from(await knockResponse.arrayBuffer());
    assert.equal(knockBytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(knockBytes.toString("ascii", 8, 12), "WAVE");
    assert.equal((await fetch(`${origin}/api/conversations`, { method: "POST", headers })).status, 201);

    const created = await (await fetch(`${origin}/api/conversations`, { method: "POST", headers })).json();
    const conversationId = created.conversation.id;
    const settings = { headModel: "gpt-6-astra", headReasoning: "ultra", criticProvider: "codex", criticCodexModel: "gpt-6-astra", criticCodexReasoning: "xhigh", criticModel: "gpt-6-astra", criticReasoning: "xhigh", specialistCount: "3", discussionDepth: "3", notificationSound: "ripple" };
    assert.deepEqual((await (await fetch(`${origin}/api/settings`, { method: "PUT", headers, body: JSON.stringify(settings) })).json()).settings, settings);
    const bulk = await (await fetch(`${origin}/api/conversations`, { method: "POST", headers })).json();
    assert.deepEqual((await (await fetch(`${origin}/api/conversations`, { method: "DELETE", headers, body: JSON.stringify({ conversationIds: [bulk.conversation.id] }) })).json()).deletedConversationIds, [bulk.conversation.id]);

    assert.equal((await fetch(`${origin}/api/instruction-documents`)).status, 401);
    const docs = await (await fetch(`${origin}/api/instruction-documents`, { headers })).json();
    assert.equal(docs.documents.length, 4);
    const contextPath = `${origin}/api/instruction-documents/WORKING_CONTEXT.md`;
    const contextInput = { revision: 1, markdown: "# Synthetic browser context" };
    assert.equal((await fetch(contextPath, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(contextInput) })).status, 401);
    assert.equal((await fetch(contextPath, { method: "PUT", headers, body: JSON.stringify(contextInput) })).status, 200);
    assert.equal((await fetch(contextPath, { method: "PUT", headers, body: JSON.stringify(contextInput) })).status, 409);
    const contextHistory = await (await fetch(`${contextPath}/history`, { headers })).json();
    assert.equal(contextHistory.result.length, 2);
    assert.equal(contextHistory.result[0].markdown, undefined);
    assert.equal((await fetch(`${contextPath}/restore-default`, { method: "PUT", headers, body: JSON.stringify({ revision: 2 }) })).status, 422);
    const defaultRestored = await (await fetch(`${contextPath}/restore-default`, { method: "PUT", headers, body: JSON.stringify({ revision: 2, confirmed: true }) })).json();
    assert.equal(defaultRestored.document.revision, 3);
    assert.equal(defaultRestored.document.markdown, docs.documents.at(-1).markdown);

    const initialInstructions = await (await fetch(`${origin}/api/runtime-instructions`, { headers: { cookie } })).json();
    assert.equal(initialInstructions.runtimeInstructions.source, "database");
    assert.equal(typeof initialInstructions.runtimeInstructions.updatedAt, "string");
    assert.match(initialInstructions.runtimeInstructions.markdown, /## Head Task/u);
    const markdown = initialInstructions.runtimeInstructions.markdown.replace("must not give the owner advice, a recommendation, analysis, or a preliminary conclusion.", "must not give the owner advice before the final synthesis.");
    const savedInstructions = await (await fetch(`${origin}/api/runtime-instructions`, { method: "PUT", headers, body: JSON.stringify({ markdown, revision: initialInstructions.runtimeInstructions.revision }) })).json();
    assert.equal(savedInstructions.runtimeInstructions.source, "database");
    assert.match(savedInstructions.runtimeInstructions.revision, /^[A-Za-z0-9_-]{32}$/u);
    assert.match(savedInstructions.runtimeInstructions.contentHash, /^[a-f0-9]{64}$/u);
    const settingsWithInstructions = await (await fetch(`${origin}/api/settings`, { headers: { cookie } })).json();
    assert.equal(settingsWithInstructions.runtimeInstructions.revision, savedInstructions.runtimeInstructions.revision);
    const invalidInstructions = await fetch(`${origin}/api/runtime-instructions`, { method: "PUT", headers, body: JSON.stringify({ markdown: "## Head Task\nIncomplete", revision: savedInstructions.runtimeInstructions.revision }) });
    assert.equal(invalidInstructions.status, 422);
    assert.equal((await invalidInstructions.json()).error, "invalid_runtime_instructions");
    const staleInstructions = await fetch(`${origin}/api/runtime-instructions`, { method: "PUT", headers, body: JSON.stringify({ markdown, revision: initialInstructions.runtimeInstructions.revision }) });
    assert.equal(staleInstructions.status, 409);
    assert.equal((await staleInstructions.json()).error, "stale_runtime_instructions");
    const instructionHistory = await (await fetch(`${origin}/api/runtime-instructions`, { headers: { cookie } })).json();
    assert.equal(instructionHistory.history.length, 2);
    const previous = instructionHistory.history.find(version => version.id === initialInstructions.runtimeInstructions.revision);
    assert.ok(previous);
    const preview = await (await fetch(`${origin}/api/runtime-instructions/history/${previous.id}`, { headers: { cookie } })).json();
    assert.equal(preview.version.markdown, initialInstructions.runtimeInstructions.markdown);
    const restored = await (await fetch(`${origin}/api/runtime-instructions/restore`, { method: "PUT", headers, body: JSON.stringify({ historyId: previous.id, revision: savedInstructions.runtimeInstructions.revision }) })).json();
    assert.notEqual(restored.runtimeInstructions.revision, previous.id);
    assert.equal(restored.runtimeInstructions.markdown, initialInstructions.runtimeInstructions.markdown);

    const message = { body: "What should we validate first?", clientRequestId: "integration-request-0001" };
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/messages`, { method: "POST", headers, body: JSON.stringify(message) })).status, 202);
    const detail = await waitFor(async () => {
      const response = await fetch(`${origin}/api/conversations/${conversationId}`, { headers: { cookie } });
      const value = await response.json();
      return value.run?.status === "failed" ? value : undefined;
    });
    assert.deepEqual(detail.events.map(event => event.role), ["owner", "System"]);
    assert.equal(detail.events[1].body, "The selected Codex route could not complete this request. Your question remains saved.");
    assert.equal(detail.run.snapshot.runtimeInstructions.revision, restored.runtimeInstructions.revision);
    assert.equal(detail.run.snapshot.runtimeInstructions.markdown, restored.runtimeInstructions.markdown);
    const retry = await fetch(`${origin}/api/conversations/${conversationId}/continue`, { method: "POST", headers });
    assert.equal(retry.status, 202);
    const retried = await retry.json();
    assert.equal(retried.run.generation, detail.run.generation + 1);
    const failedAgain = await waitFor(async () => {
      const value = await (await fetch(`${origin}/api/conversations/${conversationId}`, { headers: { cookie } })).json();
      return value.run?.status === "failed" ? value : undefined;
    });
    assert.deepEqual(failedAgain.events.map(event => event.role), ["owner", "System", "System"]);
    assert.deepEqual(failedAgain.events.slice(0, 2), detail.events);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
  }
});

test("owner image attachments validate bytes, link only on message acceptance and download safely", async () => {
  const port = await reservePort();
  const child = spawn(globalThis.process.execPath, ["src/server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...globalThis.process.env, NODE_ENV: "development", DEV_OWNER_EMAIL: "owner@local.test", PORT: String(port), RUNTIME_INSTRUCTIONS_BOOTSTRAP_B64: testRuntimeInstructionsBootstrap },
    stdio: "ignore"
  });
  const origin = `http://127.0.0.1:${port}`;
  const html = Buffer.from('<script>globalThis.downloadExecuted=true</script><svg onload="alert(1)">');
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), html, Buffer.from([0xff, 0xd9])]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), html, Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])]);
  const webp = Buffer.concat([Buffer.from("RIFF0000WEBPVP8 "), html]);
  webp.writeUInt32LE(webp.length - 8, 4);
  const images = [{ body: jpeg, type: "image/jpeg", extension: "jpg" }, { body: png, type: "image/png", extension: "png" }, { body: webp, type: "image/webp", extension: "webp" }];
  try {
    await waitFor(async () => {
      try { return (await fetch(`${origin}/healthz`)).ok; } catch { return false; }
    });
    const signIn = await fetch(`${origin}/api/auth/development`, { method: "POST" });
    const cookie = signIn.headers.get("set-cookie").split(";", 1)[0];
    const session = await (await fetch(`${origin}/api/session`, { headers: { cookie } })).json();
    const protectedHeaders = { cookie, "x-csrf-token": session.csrfToken };
    await fetch(`${origin}/api/consent`, { method: "POST", headers: { ...protectedHeaders, "content-type": "application/json" } });
    const created = await (await fetch(`${origin}/api/conversations`, { method: "POST", headers: protectedHeaders })).json();
    const conversationId = created.conversation.id;
    const attachments = [];
    for (const image of images) {
      const pending = await fetch(`${origin}/api/conversations/${conversationId}/attachments`, { method: "POST", headers: { ...protectedHeaders, "content-type": "text/html" }, body: image.body });
      assert.equal(pending.status, 201);
      const attachment = (await pending.json()).attachment; attachments.push(attachment);
      assert.equal(attachment.contentType, image.type);
      assert.equal(attachment.byteLength, image.body.byteLength);
      assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/attachments/${attachment.id}`, { headers: { cookie } })).status, 404);
      assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/attachments/${attachment.id}`)).status, 401);
    }

    const accepted = await fetch(`${origin}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { ...protectedHeaders, "content-type": "application/json" },
      body: JSON.stringify({ body: `Please assess the visual direction. ${html.toString()}`, attachmentIds: attachments.map(attachment => attachment.id), clientRequestId: "image-message-request-0001" })
    });
    assert.equal(accepted.status, 202);
    const detail = await (await fetch(`${origin}/api/conversations/${conversationId}`, { headers: { cookie } })).json();
    assert.deepEqual(detail.events[0].attachments, attachments);
    for (const [index, image] of images.entries()) {
      const download = await fetch(`${origin}/api/conversations/${conversationId}/attachments/${attachments[index].id}`, { headers: { cookie } });
      assert.equal(download.status, 200);
      assert.equal(download.headers.get("content-type"), image.type);
      assert.equal(download.headers.get("content-disposition"), `attachment; filename="nanoduck-image.${image.extension}"`);
      assert.equal(download.headers.get("x-content-type-options"), "nosniff");
      assert.equal(download.headers.get("cache-control"), "no-store");
      assert.match(download.headers.get("content-security-policy"), /script-src 'self'/u);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), image.body);
    }
    const exported = await fetch(`${origin}/api/conversations/${conversationId}/export`, { headers: { cookie } });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-type"), "application/rtf");
    assert.equal(exported.headers.get("x-content-type-options"), "nosniff");
    assert.match(exported.headers.get("content-disposition"), /^attachment;/u);
    assert.match(await exported.text(), /<script>globalThis\.downloadExecuted=true<\/script>/u);
    const invalidTimeZone = await fetch(`${origin}/api/conversations/${conversationId}/export?timeZone=${encodeURIComponent(html.toString())}`, { headers: { cookie } });
    assert.equal(invalidTimeZone.status, 422);
    assert.deepEqual(await invalidTimeZone.json(), { error: "invalid_time_zone" });

    const pendingToDelete = await fetch(`${origin}/api/conversations/${conversationId}/attachments`, { method: "POST", headers: { ...protectedHeaders, "content-type": "image/jpeg" }, body: jpeg });
    assert.equal(pendingToDelete.status, 201);
    const pendingToDeleteId = (await pendingToDelete.json()).attachment.id;
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/attachments/${pendingToDeleteId}`, { method: "DELETE", headers: protectedHeaders })).status, 204);
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/attachments/${pendingToDeleteId}`, { headers: { cookie } })).status, 404);
    const pdf = await fetch(`${origin}/api/conversations/${conversationId}/attachments`, { method: "POST", headers: { ...protectedHeaders, "content-type": "image/jpeg" }, body: Buffer.from("%PDF-1.7") });
    assert.equal(pdf.status, 422);
    const truncated = await fetch(`${origin}/api/conversations/${conversationId}/attachments`, { method: "POST", headers: { ...protectedHeaders, "content-type": "image/jpeg" }, body: jpeg.subarray(0, -2) });
    assert.equal(truncated.status, 422);
    const tooLarge = Buffer.concat([jpeg, Buffer.alloc(8 * 1024 * 1024)]);
    const oversized = await fetch(`${origin}/api/conversations/${conversationId}/attachments`, { method: "POST", headers: { ...protectedHeaders, "content-type": "image/jpeg" }, body: tooLarge });
    assert.equal(oversized.status, 413);
    const client = await (await fetch(`${origin}/client/app.js`)).text();
    assert.match(client, /attachmentIds/u);
    assert.doesNotMatch(client, /application\/pdf/u);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
  }
});

test("the authenticated discussion shows parallel specialist answers and a targeted Critic correction before synthesis", async () => {
  const port = await reservePort();
  const directory = await mkdtemp(`${tmpdir()}/nanoduck-http-provider-`);
  const authPath = `${directory}/auth.json`;
  const codexCommand = fileURLToPath(new URL("./fixtures/fake-codex.mjs", import.meta.url));
  await writeFile(authPath, "{}", { mode: 0o600 });
  const child = spawn(globalThis.process.execPath, ["src/server/index.mjs"], {
    cwd: process.cwd(),
    env: {
      ...globalThis.process.env,
      NODE_ENV: "development",
      DEV_OWNER_EMAIL: "owner@local.test",
      PORT: String(port),
      RUNTIME_INSTRUCTIONS_BOOTSTRAP_B64: testRuntimeInstructionsBootstrap,
      CODEX_APP_SERVER_AUTH_PATH: authPath,
      CODEX_APP_SERVER_COMMAND: codexCommand
    },
    stdio: "ignore"
  });
  const origin = `http://127.0.0.1:${port}`;
  try {
    await waitFor(async () => {
      try { return (await fetch(`${origin}/healthz`)).ok; } catch { return false; }
    });
    const signIn = await fetch(`${origin}/api/auth/development`, { method: "POST" });
    const cookie = signIn.headers.get("set-cookie").split(";", 1)[0];
    const session = await (await fetch(`${origin}/api/session`, { headers: { cookie } })).json();
    const headers = { cookie, "x-csrf-token": session.csrfToken, "content-type": "application/json" };
    await fetch(`${origin}/api/consent`, { method: "POST", headers });
    const created = await (await fetch(`${origin}/api/conversations`, { method: "POST", headers })).json();
    const conversationId = created.conversation.id;
    const accepted = await fetch(`${origin}/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ body: "What is the current market evidence for positioning this offer?", clientRequestId: "provider-exchange-0001" })
    });
    assert.equal(accepted.status, 202);
    const detail = await waitFor(async () => {
      const response = await fetch(`${origin}/api/conversations/${conversationId}`, { headers: { cookie } });
      const value = await response.json();
      assert.notEqual(value.run?.status, "failed", "The synthetic consultant exchange must finish successfully.");
      return value.run?.status === "complete" ? value : undefined;
    });
    assert.deepEqual(detail.events.slice(0, 3).map(event => [event.role, event.recipient]), [
      ["owner", null], ["Head Consultant", "Strategy Consultant"], ["Head Consultant", "Finance Consultant"]
    ]);
    assert.deepEqual(detail.events.slice(3, 5).map(event => event.role).sort(), ["Finance Consultant", "Strategy Consultant"]);
    assert.deepEqual(detail.events.slice(5).map(event => [event.role, event.recipient]), [
      ["Critic", "Head Consultant"], ["Critic", "Strategy Consultant"], ["Strategy Consultant", "Critic"],
      ["Critic", "Head Consultant"], ["Head Consultant", null]
    ]);
    assert.match(detail.events[6].body, /assumes those buyers will take calls/u);
    assert.match(detail.events[7].body, /recruit calls from a defined prospect list/u);
    assert.match(detail.events[8].body, /resolved corrected/u);
    assert.match(detail.events.at(-1).body, /^## Consolidated advice\n\n/u);
    assert.match(detail.events.at(-1).body, /measure interview acceptance/u);
    assert.equal(detail.events.every(event => !event.body.includes("nanoduck-source")), true);
    const evidence = detail.events.flatMap(event => event.sources).find(source => source.title === "Buyer evidence");
    assert.deepEqual({ title: evidence.title, url: evidence.url, claim: evidence.claim, publishedAt: evidence.publishedAt }, { title: "Buyer evidence", url: "https://example.com/buyer-evidence", claim: "Buyer willingness must be measured before positioning.", publishedAt: "2026-09-01" });
    assert.match(evidence.retrievedAt, /^\d{4}-\d{2}-\d{2}T/u);
    assert.equal("parallelWork" in detail.run.snapshot, false);
    assert.equal(detail.events.some(event => event.role === "System"), false);
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/export`)).status, 401);
    const exported = await fetch(`${origin}/api/conversations/${conversationId}/export?timeZone=Europe%2FKyiv`, { headers: { cookie } });
    assert.equal(exported.status, 200);
    assert.equal(exported.headers.get("content-type"), "application/rtf");
    assert.match(exported.headers.get("content-disposition"), /attachment; filename="nanoduck-[\w-]+\.rtf"/u);
    assert.equal(exported.headers.get("cache-control"), "no-store");
    const rtf = await exported.text();
    assert.ok(rtf.startsWith("{\\rtf1"));
    assert.ok(rtf.includes("Time zone: Europe/Kyiv"));
    const exportedRoles = [...rtf.matchAll(/\\sb240\\keepn \{\\b ([^}]+)\}/gu)].map(match => match[1]);
    assert.deepEqual(exportedRoles, detail.events.map(event => event.role === "owner" ? "You" : event.role));
    assert.match(rtf, /\{\\b Buyer evidence\}\\line https:\/\/example\.com\/buyer-evidence\\par\n/u);
    assert.ok(rtf.includes("{\\b Consolidated advice}"));
    assert.ok(rtf.includes("measure interview acceptance"));
    assert.equal(rtf.includes("## Consolidated advice"), false);
    assert.equal(rtf.includes("runtimeInstructions"), false);
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/export?timeZone=invalid`, { headers: { cookie } })).status, 422);
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}`, { method: "DELETE", headers })).status, 204);
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}`, { headers: { cookie } })).status, 404);
    assert.equal((await fetch(`${origin}/api/conversations/${conversationId}/export`, { headers: { cookie } })).status, 404);
    assert.deepEqual((await (await fetch(`${origin}/api/conversations`, { headers: { cookie } })).json()).conversations, []);
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
    await rm(directory, { recursive: true, force: true });
  }
});

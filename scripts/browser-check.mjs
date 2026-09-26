import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright";
import { testRuntimeInstructionsBootstrap } from "../test/fixtures/runtime-instructions.mjs";
import { verifyActiveDiscussion } from "./browser-active-discussion.mjs";
import { verifyProgressRecovery } from "./browser-progress-recovery.mjs";
import { verifyReadingMode } from "./browser-reading-mode.mjs";
import { verifyLostAcceptanceRetry } from "./browser-send-retry.mjs";
import { verifyUsage } from "./browser-usage.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const fakeCodex = fileURLToPath(new URL("../test/fixtures/fake-codex.mjs", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "nanoduck-neo-browser-"));
const outputRoot = process.env.BROWSER_OUTPUT_DIR ? join(root, process.env.BROWSER_OUTPUT_DIR) : join(temporary, "artifacts");
const authPath = join(temporary, "auth.json");
const portProbe = createServer().listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise(resolve => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;

const waitForHealth = async (child, diagnostics) => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && child.exitCode === null) {
    try { if ((await fetch(`${origin}/healthz`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Neo browser fixture did not become healthy.\n${diagnostics()}`);
};

const lensPixels = page => page.locator(".navbar-lens").evaluate(canvas => Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data));
const lensVisible = pixels => pixels.some((value, index) => index % 4 === 3 && value > 0);
const lensEdgeColors = page => page.locator(".navbar-lens").evaluate(canvas => {
  const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  const edgeWidth = Math.min(width / 2, Math.ceil(height * 1.25));
  const colors = [new Set(), new Set()];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const edge = x < edgeWidth ? 0 : x >= width - edgeWidth ? 1 : -1;
    const offset = (y * width + x) * 4;
    if (edge >= 0 && data[offset + 3] > 0) colors[edge].add(`${data[offset]},${data[offset + 1]},${data[offset + 2]}`);
  }
  return colors.map(set => set.size);
});

async function verifyIntegratedGlass(page, name) {
  await page.setViewportSize({ width: 1280, height: 520 });
  for (const pageName of ["discussion", "conversations", "settings"]) {
    await page.locator(`.desktop-nav [data-nav="${pageName}"]`).click();
    await page.locator(`#${pageName}-page`).waitFor({ state: "visible" });
    if (pageName === "settings") await page.waitForFunction(() => document.querySelector("#runtime-instructions")?.value.length > 0);
    await page.evaluate(() => scrollTo(0, 50));
    await page.waitForTimeout(120);
    assert.ok(await page.evaluate(() => scrollY > 0), `${name} ${pageName} must scroll real content beneath the fixed glass`);
    const pixels = await lensPixels(page);
    assert.ok(lensVisible(pixels), `${name} ${pageName} must paint visible refractive edge pixels`);
    assert.equal(await page.locator(".navbar-lens").evaluate(canvas => canvas.getContext("2d").getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3]), 0, `${name} ${pageName} keeps the lens centre clear`);
    const edgeColors = await lensEdgeColors(page);
    assert.ok(edgeColors.every(count => count > 1), `${name} ${pageName} must show sampled color variation at both curved ends: ${edgeColors.join(",")}`);
    const widths = await page.evaluate(id => ({ bar: document.querySelector(".navbar").getBoundingClientRect(), page: document.querySelector(`#${id}-page`).getBoundingClientRect() }), pageName);
    assert.ok(widths.page.width >= 1_000 && widths.page.left < widths.bar.left + 42 && widths.page.right > widths.bar.right - 42, `${name} ${pageName} content reaches beneath both curved ends`);
    await mkdir(join(outputRoot, "output", "playwright"), { recursive: true });
    await page.screenshot({ path: join(outputRoot, "output", "playwright", `${name}-${pageName}-glass.png`), fullPage: false });
  }

  const textarea = page.locator("#runtime-instructions");
  await textarea.evaluate(element => scrollTo(0, scrollY + element.getBoundingClientRect().top - 24));
  await page.waitForTimeout(120);
  const beforeValue = await lensPixels(page);
  await textarea.evaluate(element => { element.value = "A different private value that must never enter the optical surface."; window.dispatchEvent(new Event("scroll")); });
  await page.waitForTimeout(120);
  assert.deepEqual(await lensPixels(page), beforeValue, `${name} changing a private textarea value must not alter sampled pixels`);
  await textarea.evaluate(element => { element.style.background = "rgb(30, 180, 90)"; });
  await page.waitForTimeout(120);
  assert.notDeepEqual(await lensPixels(page), beforeValue, `${name} changing a visible control background must refresh sampled pixels`);
  await textarea.evaluate(element => { element.style.removeProperty("background"); });
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function authenticate(page) {
  await page.goto(origin);
  await page.locator("#sign-in").waitFor({ state: "visible" });
  await page.locator("#development-sign-in").click();
  await Promise.race([
    page.locator("#consent").waitFor({ state: "visible" }),
    page.locator("#app").waitFor({ state: "visible" })
  ]);
  if (await page.locator("#consent").isVisible()) {
    await page.locator("#consent-check").check();
    await page.locator("#consent-button").click();
  }
  await page.locator("#app").waitFor({ state: "visible" });
}

async function verifyPrivacyLock(page, context, name) {
  await page.locator(".desktop-nav [data-nav=discussion]").click();
  if (await page.locator("#expand-composer").isVisible()) await page.locator("#expand-composer").click();
  await page.locator("#message").fill(`PRIVATE_SYNTHETIC_DRAFT_${name}`);
  let startSlowAllowance; let releaseSlowAllowance; let finishSlowAllowance;
  const allowanceStarted = new Promise(resolve => { startSlowAllowance = resolve; });
  const allowanceReleased = new Promise(resolve => { releaseSlowAllowance = resolve; });
  const allowanceFinished = new Promise(resolve => { finishSlowAllowance = resolve; });
  await page.route("**/api/account-usage", async route => {
    startSlowAllowance();
    await allowanceReleased;
    await route.fulfill({ status: 200, json: { accounts: { codex: { status: "available", checkedAt: new Date().toISOString(), windows: [{ bucket: "stale-private-window", kind: "primary", usedPercent: 91 }] }, claude_code: { status: "external", windows: [] } } } }).catch(() => {});
    finishSlowAllowance();
  });
  await page.getByRole("tab", { name: "Usage", exact: true }).click();
  await allowanceStarted;
  await page.waitForFunction(() => document.querySelector("#usage-content")?.textContent.length > 0);
  await page.route("**/api/logout", route => route.abort("failed"));
  await page.locator("[data-session-action]").click();
  await page.locator("#logout-pending").waitFor({ state: "visible" });
  assert.equal(await page.locator("#message").inputValue(), "", `${name} clears the private draft before sign-out is confirmed`);
  assert.equal(await page.locator("#usage-content").textContent(), "", `${name} clears private usage before sign-out is confirmed`);
  assert.equal((await lensPixels(page)).some(value => value !== 0), false, `${name} synchronously clears both glass buffers on privacy lock`);
  releaseSlowAllowance(); await allowanceFinished; await page.waitForTimeout(50);
  assert.equal(await page.locator("#account-usage").textContent(), "", `${name} rejects a delayed account allowance response after privacy cleanup`);
  await page.unroute("**/api/account-usage");
  await page.unroute("**/api/logout");
  await page.locator("#retry-logoff").click();
  await page.locator("#sign-in").waitFor({ state: "visible" });
  assert.equal((await context.request.get(`${origin}/api/usage`)).status(), 401, `${name} usage is private after logoff`);
}

await writeFile(authPath, "{}", { mode: 0o600 });
await chmod(fakeCodex, 0o755);
let child;
try {
  const environment = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    HOME: temporary,
    USERPROFILE: temporary,
    TMPDIR: temporary,
    TEMP: temporary,
    TMP: temporary,
    NODE_ENV: "development",
    NANODUCK_RUNTIME_MODE: "development",
    DEV_OWNER_EMAIL: "owner@local.test",
    PORT: String(port),
    RUNTIME_INSTRUCTIONS_BOOTSTRAP_B64: testRuntimeInstructionsBootstrap,
    CODEX_APP_SERVER_AUTH_PATH: authPath,
    CODEX_APP_SERVER_COMMAND: fakeCodex
  };
  child = spawn(process.execPath, ["src/server/index.mjs"], { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
  let diagnostics = "";
  child.stdout.on("data", value => { diagnostics += value; });
  child.stderr.on("data", value => { diagnostics += value; });
  await waitForHealth(child, () => diagnostics);

  const selected = process.argv.find(value => value.startsWith("--engine="))?.slice(9);
  const engines = Object.entries({ chromium, firefox, webkit }).filter(([name]) => !selected || name === selected);
  if (!engines.length) throw new Error("Choose --engine=chromium, --engine=firefox, or --engine=webkit.");
  for (const [name, engine] of engines) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({ baseURL: origin, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage(); const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await authenticate(page);
      await page.locator("#new-conversation").click();
      await page.locator("#thread .empty").waitFor();
      await verifyReadingMode(page, name, outputRoot);
      await verifyActiveDiscussion(page, name, outputRoot);
      await verifyProgressRecovery(page);
      await verifyLostAcceptanceRetry(page, name);
      await verifyUsage(page, name, outputRoot);
      await verifyIntegratedGlass(page, name);
      await verifyPrivacyLock(page, context, name);
      assert.deepEqual(errors, [], `${name} has no uncaught page errors`);
      console.log(`${name}: Neo reading, active Stop/Continue, poll recovery, serialized usage, retry, hosted auth, privacy clear, and integrated glass passed`);
      await context.close();
    } finally { await browser.close(); }
  }
  console.log(`Screenshots: ${process.env.BROWSER_OUTPUT_DIR ? join(process.env.BROWSER_OUTPUT_DIR, "output", "playwright") : join(outputRoot, "output", "playwright")}`);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = once(child, "exit"); child.kill("SIGTERM"); await stopped.catch(() => {});
  }
  if (!process.env.KEEP_BROWSER_FIXTURE) await rm(temporary, { recursive: true, force: true });
}

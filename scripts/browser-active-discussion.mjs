import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAI0lEQVR4AdzKMQ0AAAwCwQZXVVWj9QQOYOeT3w57Tzcm1AEEAAD//1ZaZpIAAAAGSURBVAMA8hYTqUxDMF4AAAAASUVORK5CYII=", "base64");

async function openNewConversation(page) {
  const loaded = page.waitForResponse(response => response.request().method() === "GET" && /\/api\/conversations\/[^/]+$/u.test(new URL(response.url()).pathname));
  await page.locator("#new-conversation").click();
  await (await loaded).finished();
  await page.waitForFunction(() => document.querySelector("#thread .empty") && document.querySelector("#run-status").textContent === "Describe the decision you want to make.");
}

export async function verifyActiveDiscussion(page, name, artifactRoot) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openNewConversation(page);
  await page.locator("#message").fill(`Synthetic ${name} active controls. Wait until cancelled`);
  const sendBox = await page.locator("#send").boundingBox();
  const acceptance = page.waitForResponse(response => response.url().endsWith("/messages") && response.request().method() === "POST");
  await page.locator("#send").click();
  const acceptedResponse = await acceptance;
  assert.equal(acceptedResponse.status(), 202);
  const conversationUrl = acceptedResponse.url().replace(/\/messages$/u, "");
  await page.getByRole("button", { name: "Stop consultation", exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.locator("#composer").isVisible(), false);
  assert.equal(await page.locator(".thinking-indicator").isVisible(), true);
  assert.notEqual(await page.evaluate(() => document.activeElement.id), "stop", "Collapsing Send must not move focus to Stop");
  assert.equal(await page.evaluate(() => document.querySelector("#composer").contains(document.activeElement)), false, "Focus leaves the hidden composer");

  const stopBox = await page.locator("#stop").boundingBox();
  assert.ok(Math.abs(stopBox.height - 38) < 0.01, "Desktop Stop matches the 38px consultant avatar");
  assert.ok(stopBox.width > stopBox.height, "Stop keeps its horizontal icon and label");
  assert.equal(await page.locator("#stop").evaluate(element => getComputedStyle(element).borderRadius), "7px");
  assert.equal(await page.locator("#stop").evaluate(element => getComputedStyle(element, "::before").height), "44px", "Transparent hit area preserves touch size");
  assert.ok(Math.abs(stopBox.y - sendBox.y) >= 100, "Stop is away from the former Send target");
  for (const tab of ["Outcome", "Sources", "Usage", "Discussion"]) {
    await page.getByRole("tab", { name: tab, exact: true }).click();
    assert.equal(await page.locator("#composer").isVisible(), false);
    assert.equal(await page.locator("#stop").isVisible(), true);
  }

  const screenshots = join(artifactRoot, "output", "playwright");
  await mkdir(screenshots, { recursive: true });
  await page.screenshot({ path: join(screenshots, `${name}-active-desktop.png`), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileStop = await page.locator("#stop").boundingBox();
  assert.ok(Math.abs(mobileStop.height - 32) < 0.01, "Mobile Stop matches the 32px consultant avatar");
  assert.equal(await page.locator("#stop").evaluate(element => getComputedStyle(element).borderRadius), "7px");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(screenshots, `${name}-active-mobile.png`), fullPage: true });

  // Intercept only progress reads. Stop and Continue still exercise the real
  // authenticated Neo endpoints and their generation fencing.
  const initial = await (await page.request.get(conversationUrl)).json();
  const replies = [...initial.events];
  let polls = 0;
  let holdPoll = false;
  let capturedPoll;
  let releasePoll;
  const held = new Promise(resolve => { capturedPoll = resolve; });
  const released = new Promise(resolve => { releasePoll = resolve; });
  const pollRoute = async route => {
    if (route.request().method() !== "GET") return route.continue();
    polls++;
    const snapshot = { ...initial, events: [...replies] };
    if (holdPoll) { capturedPoll(); await released; }
    return route.fulfill({ json: snapshot });
  };
  await page.route(conversationUrl, pollRoute);
  replies.push({
    id: "long-consultant-event",
    role: "Head Consultant",
    body: "Synthetic Head Consultant reply.\n\n".repeat(45),
    createdAt: new Date().toISOString()
  });
  await page.waitForFunction(() => document.querySelector("#thread").textContent.includes("Synthetic Head Consultant reply"));
  const before = polls;
  await page.waitForTimeout(2_200);
  assert.ok(polls > before, "Active progress polling continues while reading a long reply");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const scrolledStop = await page.locator("#stop").boundingBox();
  const navigation = await page.locator(".navbar").boundingBox();
  assert.ok(scrolledStop.y > navigation.y + navigation.height, "Sticky Stop remains below navigation");
  assert.ok(scrolledStop.y + scrolledStop.height < 844, "Stop remains reachable while reading a long discussion");

  holdPoll = true;
  await Promise.race([
    held,
    new Promise((_, reject) => setTimeout(() => reject(new Error("The synthetic polling reply was not observed")), 10_000))
  ]);
  await page.locator("#stop").click();
  await page.locator("#composer").waitFor({ state: "visible" });
  assert.equal(await page.locator("#stop").isVisible(), false);
  assert.match(await page.locator("#run-status").textContent(), /stopped/u);
  releasePoll();
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#composer").isVisible(), true, "A late active poll cannot undo confirmed Stop");
  assert.equal(await page.locator("#stop").isVisible(), false);
  await page.unroute(conversationUrl, pollRoute);

  const draft = "Keep this unsent draft while the earlier consultation continues.";
  await page.locator("#message").fill(draft);
  await page.locator("#attachment").setInputFiles({ name: "preserved-draft.png", mimeType: "image/png", buffer: png });
  await page.locator("#continue").click();
  await page.locator("#stop").waitFor({ state: "visible" });
  assert.equal(await page.locator("#composer").isVisible(), false);
  await page.locator("#stop").click();
  await page.locator("#composer").waitFor({ state: "visible" });
  assert.equal(await page.locator("#message").inputValue(), draft);
  assert.match(await page.locator("#attachment-list").textContent(), /preserved-draft\.png/u);
  await page.locator("#message").fill("");
  await page.locator(".attachment-draft button").click();

  await page.setViewportSize({ width: 1280, height: 900 });
  await openNewConversation(page);
  await page.locator("#message").fill("Synthetic failure recovery. Fail the turn RPC");
  await page.locator("#send").click();
  await page.waitForFunction(() => document.querySelector("#run-status").textContent.includes("Retry to continue"));
  assert.equal(await page.locator("#composer").isVisible(), true, "Failure restores the composer");
  assert.equal(await page.locator("#stop").isVisible(), false);
  assert.equal(await page.locator("#continue").textContent(), "Retry");
  await openNewConversation(page);
}

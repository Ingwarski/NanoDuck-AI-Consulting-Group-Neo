import assert from "node:assert/strict";

export async function verifyProgressRecovery(page) {
  await page.locator("#new-conversation").click();
  await page.waitForFunction(() => document.querySelector("#thread .empty"));
  await page.locator("#message").fill("Synthetic progress recovery. Wait until cancelled");
  const acceptance = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/messages"));
  await page.locator("#send").click();
  const accepted = await acceptance;
  const url = accepted.url().replace(/\/messages$/u, "");
  await page.locator("#stop").waitFor({ state: "visible" });

  let polls = 0;
  await page.route(url, async route => {
    if (route.request().method() !== "GET") return route.continue();
    if (++polls === 1) return route.abort("failed");
    const response = await route.fetch();
    const data = await response.json();
    data.events[0].sources = ["First supported claim", "Second supported claim"].map(claim => ({
      url: "https://example.com/shared-evidence",
      title: "Shared evidence",
      claim,
      retrievedAt: "2026-09-26T00:00:00.000Z"
    }));
    return route.fulfill({ response, json: data });
  });
  await page.locator("#connection-status").waitFor({ state: "visible" });
  assert.match(await page.locator("#connection-status").innerText(), /Reconnecting automatically/u);
  await page.locator("#connection-status").waitFor({ state: "hidden" });
  assert.ok(polls >= 2, "Transient poll failure recovers without owner action");
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  assert.equal(await page.locator("#sources .source-card").count(), 2, "Distinct claims for the same URL stay visible");

  let inFlight = 0;
  let maximum = 0;
  let usageCalls = 0;
  await page.route("**/api/usage*", async route => {
    usageCalls++;
    maximum = Math.max(maximum, ++inFlight);
    const response = await route.fetch();
    const data = await response.json();
    data.usage.total = usageCalls === 1 ? 101 : 202;
    await new Promise(resolve => setTimeout(resolve, 3_200));
    inFlight--;
    await route.fulfill({ response, json: data });
  });
  await page.getByRole("tab", { name: "Usage", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#usage-status").textContent.startsWith("Usage updates"), undefined, { timeout: 10_000 });
  assert.equal(maximum, 1, "Slow usage response is serialized instead of being superseded by polling");
  assert.ok(usageCalls >= 1);
  await page.locator("#stop").click();
  await page.waitForFunction(() => document.querySelector(".usage-total")?.textContent === "202", undefined, { timeout: 10_000 });
  assert.equal(maximum, 1, "The coalesced final refresh never overlaps the pending usage read");
  await page.getByRole("tab", { name: "Discussion", exact: true }).click();
  await page.locator("#composer").waitFor({ state: "visible" });

  // Let already issued reads finish; confirmed Stop must not restart polling.
  await page.waitForTimeout(3_500);
  const stoppedPolls = polls;
  await page.waitForTimeout(4_500);
  assert.equal(polls, stoppedPolls);
  await page.unroute(url);
  await page.unroute("**/api/usage*");
  await page.locator("#new-conversation").click();
  await page.waitForFunction(() => document.querySelector("#thread .empty"));
}

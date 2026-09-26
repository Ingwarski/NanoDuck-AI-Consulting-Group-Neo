import assert from 'node:assert/strict';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAI0lEQVR4AdzKMQ0AAAwCwQZXVVWj9QQOYOeT3w57Tzcm1AEEAAD//1ZaZpIAAAAGSURBVAMA8hYTqUxDMF4AAAAASUVORK5CYII=', 'base64');

// Exercise a lost HTTP response after real durable acceptance, then retry after
// the synthetic consultation finishes. Nothing is stored outside the fixture.
export async function verifyLostAcceptanceRetry(page, name) {
  const body = `Synthetic ${name} browser decision`;
  const edited = `An edited ${name} draft that must remain unsent`;
  const requests = []; const replies = [];
  let conversationUrl;
  const routePattern = '**/api/conversations/*/messages';
  await page.route(routePattern, async route => {
    requests.push(route.request().postDataJSON());
    conversationUrl = route.request().url().replace(/\/messages$/u, '');
    const response = await route.fetch();
    replies.push({ status: response.status(), data: await response.json() });
    if (requests.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  try {
    await page.locator('#message').fill(body);
    await page.locator('#attachment').setInputFiles({ name: 'synthetic-pixel.png', mimeType: 'image/png', buffer: png });
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#voice-status').textContent.includes('Delivery is unconfirmed'));
    assert.equal(replies[0].status, 202);
    assert.equal(requests[0].attachmentIds.length, 1);
    assert.equal(await page.locator('#message').inputValue(), body);
    const deadline = Date.now() + 30_000;
    let detail;
    do {
      const response = await page.request.get(conversationUrl);
      assert.equal(response.status(), 200);
      detail = await response.json();
      if (detail.run.status === 'complete') break;
      assert.notEqual(detail.run.status, 'failed', 'Synthetic discussion must complete before retry');
      if (Date.now() >= deadline) throw new Error('Synthetic discussion did not finish before acceptance retry');
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (true);
    await page.locator('#message').fill(edited);
    await page.locator('#send').click();
    await page.waitForFunction(() => document.querySelector('#run-status').textContent.includes('Discussion complete.'));
    await page.waitForFunction(() => document.querySelector('#outcome').textContent.includes('buyer'));
    assert.equal(replies.length, 2);
    assert.deepEqual(requests[1], requests[0], 'Retry must preserve body, request ID and attachment IDs');
    assert.equal(replies[1].data.replayed, true);
    assert.equal(replies[1].data.run.id, replies[0].data.run.id);
    const confirmed = await (await page.request.get(conversationUrl)).json();
    assert.equal(confirmed.events.filter(event => event.role === 'owner').length, 1);
    assert.equal(confirmed.events[0].body, body);
    assert.equal(confirmed.events[0].attachments.length, 1);
    assert.equal(await page.locator('#thread .message[data-role="owner"]').count(), 1);
    assert.equal(await page.locator('#message').inputValue(), edited);
    await page.locator('#expand-composer').click();
    await page.locator('#message').fill('');
    await page.locator('.attachment-draft button').click();
    await page.locator('#collapse-composer').click();
  } finally { await page.unroute(routePattern); }
}

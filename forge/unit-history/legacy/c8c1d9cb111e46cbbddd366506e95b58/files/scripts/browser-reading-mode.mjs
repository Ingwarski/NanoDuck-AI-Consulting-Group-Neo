import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function verifyReadingMode(page, name, root) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#message').fill('Draft must survive folding');
  await page.locator('#collapse-composer').click();
  assert.equal(await page.locator('#composer').isVisible(), false);
  await page.locator('#expand-composer').click();
  assert.equal(await page.locator('#message').inputValue(), 'Draft must survive folding');
  assert.equal(await page.locator('#message').evaluate(el => el === document.activeElement), true);
  await page.locator('#message').fill('Synthetic reading mode: assess a fictional bakery pilot.');
  await page.locator('#send').click();
  await page.locator('#stop').waitFor({ state: 'visible' });
  await page.getByRole('tab', { name: 'Sources', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('#run-status').textContent.includes('complete'), undefined, { timeout: 30000 });
  assert.equal(await page.locator('[data-tab=sources]').getAttribute('aria-selected'), 'true', 'Completion does not switch the view');
  assert.equal(await page.locator('#composer').isVisible(), false);
  await page.locator('#read-outcome').click();
  assert.equal(await page.locator('#outcome').isVisible(), true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('tab', { name: 'Discussion', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('#chat-start').waitFor({ state: 'hidden' });
  await page.locator('#chat-end').click();
  await page.waitForFunction(() => { const el = document.querySelector('#thread').lastElementChild; return el && el.getBoundingClientRect().bottom <= innerHeight + 2; });
  assert.equal(await page.locator('#thread').isVisible(), true);
  await page.locator('#chat-end').waitFor({ state: 'hidden' });
  await page.locator('#chat-start').click();
  await page.waitForFunction(() => { const el = document.querySelector('#thread').firstElementChild; return el && el.getBoundingClientRect().top >= 100; });
  await page.locator('#chat-start').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#chat-end').isVisible(), true);
  await page.locator('#expand-composer').click();
  await page.locator('#message').fill('Follow-up draft');
  await page.locator('#collapse-composer').click();
  await page.locator('#expand-composer').click();
  assert.equal(await page.locator('#message').inputValue(), 'Follow-up draft');
  assert.equal(await page.locator('#composer').evaluate(el => getComputedStyle(el).position), 'static');
  await page.locator('#collapse-composer').click();
  await mkdir(join(root, 'output', 'playwright'), { recursive: true });
  await page.screenshot({ path: join(root, 'output', 'playwright', `${name}-reading-desktop.png`), fullPage: true });
  const position = await page.evaluate(() => ({nav:document.querySelector('.discussion-header').getBoundingClientRect().right, content:document.querySelector('.discussion-content').getBoundingClientRect().left}));
  assert.ok(position.nav < position.content, 'Desktop navigation occupies a separate column');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.locator('#consultation-view').selectOption('discussion');
    assert.equal(await page.locator('#thread').isVisible(), true);
    await page.locator('#consultation-view').selectOption('outcome');
    assert.equal(await page.locator('#outcome').isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px reflow`);
    assert.equal(await page.locator('.tabs').isVisible(), false);
    if (width === 390) {
      await page.locator('#consultation-view').selectOption('discussion');
      await page.evaluate(() => window.scrollTo(0, 150));
      await page.locator('#chat-start').waitFor({ state: 'visible' });
      const positions = await page.evaluate(() => {
        const header = document.querySelector('.discussion-header').getBoundingClientRect();
        const arrow = document.querySelector('#chat-start').getBoundingClientRect();
        return { headerBottom: header.bottom, arrowTop: arrow.top };
      });
      assert.ok(positions.arrowTop >= positions.headerBottom, `Top arrow clears the sticky mobile header: ${JSON.stringify(positions)}`);
      await page.locator('#consultation-view').selectOption('outcome');
      await page.screenshot({ path: join(root, 'output', 'playwright', `${name}-reading-mobile.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('[data-tab=outcome]').focus();
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.locator('[data-tab=sources]').getAttribute('aria-selected'), 'true');
  await page.locator('[data-tab=outcome]').click();
  await page.reload();
  await page.locator('#app').waitFor({ state: 'visible' });
  await page.locator('#expand-composer').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#composer').isVisible(), false, 'Saved completed consultation opens in reading mode');
}

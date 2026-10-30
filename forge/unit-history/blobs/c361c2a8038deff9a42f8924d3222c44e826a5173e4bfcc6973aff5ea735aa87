import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium, firefox, webkit } from 'playwright';

// Exercise the actual application's DOM renderer with synthetic content only.
const app = await readFile(new URL('../src/client/app.js', import.meta.url), 'utf8');
const renderer = app.slice(app.indexOf('const clear ='), app.indexOf('const id ='));
const markdown = await readFile(new URL('../src/client/markdown.js', import.meta.url));
const css = await readFile(new URL('../public/styles.css', import.meta.url));
const fixture = '| Категорія | Стан доказів | Практична відповідь |\n| :--- | :---: | ---: |\n| **Дослідження** | Підтверджено | Довгий текст '.concat('для перевірки перенесення '.repeat(18), ' |\n| Безпека | <img src=x onerror=alert(1)> | [Джерело](https://example.com) |');
const server = createServer((req, res) => {
  if (req.url === '/markdown.js') { res.setHeader('content-type', 'text/javascript'); return res.end(markdown); }
  if (req.url === '/styles.css') { res.setHeader('content-type', 'text/css'); return res.end(css); }
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end('<link rel="stylesheet" href="/styles.css"><main style="width:calc(100% - 32px);max-width:950px;margin:auto"><article class="message"><div class="avatar">HC</div><div class="message-body" id="body"></div></article></main><script type="module">import {parseMarkdown} from "/markdown.js";'+renderer+'renderMarkdown(document.querySelector("#body"),'+JSON.stringify(fixture)+');</script>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  for (const engine of [chromium, firefox, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage();
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.locator('tbody tr').first().waitFor();
        assert.equal(await page.locator('th[scope=col]').count(), 3);
        assert.equal(await page.locator('tbody tr').count(), 2);
        assert.equal(await page.locator('#body img').count(), 0);
        assert.equal(await page.locator('td strong').textContent(), 'Дослідження');
        const sizes = await page.evaluate(() => { const el = document.querySelector('.markdown-table-scroll'); return { page: document.documentElement.scrollWidth, viewport: innerWidth, scroll: el.scrollWidth, client: el.clientWidth }; });
        assert.ok(sizes.page <= sizes.viewport, JSON.stringify(sizes));
        if (width < 500) assert.ok(sizes.scroll > sizes.client);
        await page.locator('.markdown-table-scroll').focus();
        assert.equal(await page.locator('.markdown-table-scroll').evaluate(el => el === document.activeElement), true);
      }
      if (process.env.TABLE_SCREENSHOT) await page.screenshot({ path: process.env.TABLE_SCREENSHOT.replace('.png', `-${engine.name()}.png`), fullPage: true });
      console.log(`${engine.name()}: tables passed at 320, 390, 1280px`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }

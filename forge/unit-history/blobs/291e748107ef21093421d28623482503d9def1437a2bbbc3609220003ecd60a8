import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, firefox, webkit } from "playwright";

const css = await readFile("public/styles.css", "utf8");
const javascript = await readFile("src/client/navbar-glass.js", "utf8");
const outputDirectory = process.env.GLASS_OUTPUT_DIR ?? await mkdtemp(join(tmpdir(), "nanoduck-glass-"));
await mkdir(outputDirectory, { recursive: true });
assert.match(javascript, /const sampleBleed = 24;/, "glass keeps the approved 24px sampling bleed");
assert.match(javascript, /const edgeBandLimit = 17;/, "glass keeps the approved 17px edge-band limit");
assert.match(javascript, /const displacementLimit = 15;/, "glass keeps the approved 15px displacement limit");
assert.match(css, /@media\(prefers-reduced-transparency:reduce\).*\.navbar\{background:var\(--surface\)\}.*\.navbar-lens,.navbar::before\{display:none\}/s, "reduced-transparency mode has an opaque readable fallback");

for (const [name, engine] of Object.entries({ chromium, firefox, webkit })) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.setContent(`<style>${css}#main{margin:0;width:100%;height:1600px;display:flex;align-items:stretch}.stripe{width:10%;min-width:0;overflow:hidden;height:1600px}.stripe p{margin-top:18px;font-size:25px}</style><header class="navbar"><button class="brand">NanoDuck</button><nav class="desktop-nav"><button>Discussion</button><button>Settings</button></nav></header><main id="main">${Array.from({ length: 10 }, (_, index) => `<div class="stripe" style="background:${index % 2 ? "#e5a728" : "#167b80"}"><p>Live text ${index}</p></div>`).join("")}</main>`);
    await page.addScriptTag({ content: `${javascript.replace("export function", "function")};window.lens=createNavbarGlass();` });
    await page.waitForTimeout(150);
    const pixels = () => page.locator(".navbar-lens").evaluate(canvas => Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data));
    const first = await pixels();
    assert.ok(first.some((value, index) => index % 4 === 3 && value > 0));
    assert.equal(await page.locator(".navbar-lens").evaluate(canvas => canvas.getContext("2d").getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data[3]), 0);
    const maximumPaintedDepth = await page.locator(".navbar-lens").evaluate(canvas => {
      const { data, width, height } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const radius = Math.min(height / 2, Number.parseFloat(getComputedStyle(canvas.parentElement).borderRadius) || 40);
      let maximum = 0;
      for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] === 0) continue;
        const centreX = Math.max(radius, Math.min(width - radius, x + 0.5));
        const centreY = Math.max(radius, Math.min(height - radius, y + 0.5));
        maximum = Math.max(maximum, radius - Math.hypot(x + 0.5 - centreX, y + 0.5 - centreY));
      }
      return maximum;
    });
    assert.ok(maximumPaintedDepth <= 17, `paint stays inside the 17px curved edge band (${maximumPaintedDepth})`);
    await page.screenshot({ path: join(outputDirectory, `${name}-refraction.png`) });

    const forcedColourChange = page.evaluate(() => new Promise(resolve => matchMedia("(forced-colors: active)").addEventListener("change", resolve, { once: true })));
    await page.emulateMedia({ forcedColors: "active" });
    await forcedColourChange;
    assert.equal(await page.locator(".navbar-lens").evaluate(canvas => getComputedStyle(canvas).display), "none");
    assert.equal((await pixels()).some(value => value !== 0), false, "forced colours synchronously remove sampled pixels");
    await page.emulateMedia({ forcedColors: "none" });
    await page.waitForTimeout(100);
    assert.ok((await pixels()).some((value, index) => index % 4 === 3 && value > 0), "glass repaints after leaving forced-colour fallback");

    await page.locator(".stripe").first().evaluate(element => { element.style.background = "#ff2200"; });
    await page.waitForTimeout(100);
    const second = await pixels();
    assert.notDeepEqual(first, second);
    await page.evaluate(() => scrollTo(0, 100));
    await page.waitForTimeout(100);
    const scrolled = await pixels();
    assert.notDeepEqual(second, scrolled);

    await page.evaluate(() => {
      scrollTo(0, 0);
      const main = document.querySelector("#main");
      main.style.cssText = "margin:0;width:100%;height:120px;min-height:0;display:block;overflow:auto";
      main.innerHTML = '<section style="height:180px;background:rgb(190,35,55)"><p>Nested red surface</p></section><section style="height:180px;background:rgb(25,180,95)"><p>Nested green surface</p></section>';
    });
    await page.waitForTimeout(100);
    const nestedBefore = await pixels();
    await page.locator("#main").evaluate(element => { element.scrollTop = 180; });
    await page.waitForTimeout(100);
    assert.notDeepEqual(nestedBefore, await pixels(), "captured nested scrolling must refresh the optical surface");

    await page.locator(".brand").click();
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    const beforeMutation = await pixels();
    const afterMutation = await page.evaluate(async () => {
      document.querySelector("#main").setAttribute("data-status", "updated");
      await Promise.resolve();
      const canvas = document.querySelector(".navbar-lens");
      return Array.from(canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data);
    });
    assert.deepEqual(afterMutation, beforeMutation, "mutation must not blank the lens between frames");

    await page.evaluate(() => {
      scrollTo(0, 0);
      document.querySelector("#main").innerHTML = '<section id="settings-page"><textarea style="position:fixed;left:30px;top:15px;width:140px;height:90px;background:rgb(210,30,50);border:2px solid white">Private original</textarea><input value="Private input" style="position:fixed;left:180px;top:15px;width:100px;height:42px;background:rgb(210,30,50);border:2px solid white"><select style="position:fixed;left:285px;top:15px;width:90px;height:42px;background:rgb(210,30,50);border:2px solid white"><option>Private selected option</option><option>Different private option</option></select></section>';
    });
    await page.waitForTimeout(100);
    const settings = await pixels();
    await page.evaluate(() => {
      document.querySelector("textarea").value = "Different textarea secret";
      document.querySelector("input").value = "Different input secret";
      document.querySelector("select").selectedIndex = 1;
      window.lens.refresh();
    });
    await page.waitForTimeout(100);
    assert.deepEqual(settings, await pixels());
    await page.locator("textarea").evaluate(element => { element.style.background = "rgb(20,200,70)"; });
    await page.waitForTimeout(100);
    assert.notDeepEqual(settings, await pixels());

    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
    assert.equal((await pixels()).some(value => value !== 0), false, "hidden documents synchronously clear sampled pixels");
    await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: false }); document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(100);
    assert.ok((await pixels()).some((value, index) => index % 4 === 3 && value > 0), "visible documents repaint the lens");

    await page.evaluate(() => {
      const original = CanvasRenderingContext2D.prototype.getImageData;
      CanvasRenderingContext2D.prototype.getImageData = function failOnce(...args) {
        CanvasRenderingContext2D.prototype.getImageData = original;
        throw new Error("synthetic canvas failure");
      };
      window.lens.refresh();
    });
    await page.waitForTimeout(100);
    assert.equal((await pixels()).some(value => value !== 0), false, "render failure clears both optical buffers safely");
    assert.equal(await page.locator(".navbar").evaluate(element => element.classList.contains("navbar-glass-fallback")), true, "render failure selects the opaque fallback");
    await page.evaluate(() => window.lens.clear());
    assert.equal((await pixels()).some(value => value !== 0), false);

    await page.evaluate(() => {
      document.querySelector(".navbar-lens")?.remove();
      HTMLCanvasElement.prototype.getContext = () => null;
      window.failedLens = createNavbarGlass();
    });
    assert.equal(await page.locator(".navbar").evaluate(element => element.classList.contains("navbar-glass-fallback")), true, "unavailable canvas selects the opaque fallback");
    assert.match(await page.locator(".navbar").evaluate(element => getComputedStyle(element).backgroundColor), /^rgb\(/, "unsupported rendering keeps an opaque readable navbar");
    console.log(`${name}: painted lens, live update, controls, mobile reflow, synchronous clearing passed`);
  } finally { await browser.close(); }
}
console.log(`Glass screenshots: ${outputDirectory}`);

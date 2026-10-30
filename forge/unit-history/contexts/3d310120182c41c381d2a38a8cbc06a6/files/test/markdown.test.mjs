import assert from "node:assert/strict";
import test from "node:test";
import { parseInline, parseMarkdown, safeMarkdownHref } from "../src/client/markdown.js";

test("restricted Markdown preserves Ember-style emphasis, lists and quotations as structured content", () => {
  assert.deepEqual(parseInline("Use **evidence** and *one* `measure` [source](https://example.com/report)."), [
    { type: "text", value: "Use " }, { type: "strong", value: "evidence" }, { type: "text", value: " and " }, { type: "emphasis", value: "one" }, { type: "text", value: " " }, { type: "code", value: "measure" }, { type: "text", value: " " }, { type: "link", value: "source", href: "https://example.com/report" }, { type: "text", value: "." }
  ]);
  const blocks = parseMarkdown("## Decision\n\n1. **Measure** demand\n2. *Review* conversion\n\n> **Critic:** test the assumption.");
  assert.deepEqual(blocks.map(block => block.type), ["heading", "list", "quote"]);
  assert.equal(blocks[1].ordered, true);
  assert.deepEqual(blocks[1].items[0], [{ type: "strong", value: "Measure" }, { type: "text", value: " demand" }]);
});

test("escaped syntax and unsafe links remain inert text", () => {
  assert.deepEqual(parseInline("\\**literal emphasis\\**"), [{ type: "text", value: "**literal emphasis**" }]);
  assert.deepEqual(parseInline("[blocked](https://example.su/report)"), [{ type: "text", value: "[blocked](https://example.su/report)" }]);
  assert.deepEqual(parseInline('<img src=x onerror="alert(1)">'), [{ type: "text", value: '<img src=x onerror="alert(1)">' }]);
  for (const blocked of ["https://localhost/private", "https://[::]/private", "https://[::ffff:127.0.0.1]/private", "https://[::ffff:10.0.0.1]/private", "https://[fe90::1]/private", "https://[febf::1]/private", "https://[fc00::1]/private", "https://[fec0::1]/private", "https://[ff02::1]/private"]) assert.equal(safeMarkdownHref(blocked), undefined, blocked);
  assert.equal(safeMarkdownHref("https://example.com/public"), "https://example.com/public");
  assert.equal(safeMarkdownHref("https://[2606:4700:4700::1111]/public"), "https://[2606:4700:4700::1111]/public");
});

test("tables preserve alignment, inline formatting, escaped pipes and malformed trailing rows", () => {
  const blocks = parseMarkdown("Before\n| Категорія | Стан | Відповідь |\n| :--- | :---: | ---: |\n| **Факт** | a\\|b | `code` |\n| extra | cells | remain | visible |\n\nAfter");
  assert.deepEqual(blocks.map(block => block.type), ["paragraph", "table", "paragraph", "paragraph"]);
  assert.deepEqual(blocks[1].alignments, ["left", "center", "right"]);
  assert.equal(blocks[1].rows[0][0][0].type, "strong");
  assert.equal(blocks[1].rows[0][1][0].value, "a|b");
  assert.match(blocks[2].content[0].value, /extra.*visible/u);
  assert.equal(parseMarkdown("A | B\n--- | ---\n1 | 2")[0].rows.length, 1);
  assert.equal(parseMarkdown("A | B\n--- | wrong")[0].type, "paragraph");
});

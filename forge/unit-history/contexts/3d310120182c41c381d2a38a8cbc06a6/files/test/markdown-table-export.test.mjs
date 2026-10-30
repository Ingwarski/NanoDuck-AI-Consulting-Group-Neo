import test from "node:test";
import assert from "node:assert/strict";
import { exportConversationRtf } from "../src/server/conversation-export.mjs";

test("RTF uses native bounded table cells and escapes untrusted Unicode content", () => {
  const bytes = exportConversationRtf({ conversation: { title: "Table", createdAt: "2026-09-26" }, messages: [{ role: "Head Consultant", createdAt: "2026-09-26", body: "| Категорія | Стан | Відповідь |\n| --- | :---: | ---: |\n| **Факт** | {unsafe} | \\trowd |\n\nAfter" }] });
  const rtf = bytes.toString("ascii");
  assert.equal((rtf.match(/\\trowd\\trgaph/gu) ?? []).length, 2);
  assert.equal((rtf.match(/\\cell /gu) ?? []).length, 6);
  assert.match(rtf, /\\cellx9639/u);
  assert.match(rtf, /\\trhdr/u);
  assert.match(rtf, /\\qc /u); assert.match(rtf, /\\qr /u);
  assert.ok(rtf.includes("\\{unsafe\\}"));
  assert.ok(rtf.includes("\\\\trowd"));
  assert.ok(rtf.includes("\\u1050?"));
  assert.match(rtf, /\\pard\\plain\\f0\\fs22.*After\\par/u);
});

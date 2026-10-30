import assert from "node:assert/strict";
import test from "node:test";
import { exportConversationRtf } from "../src/server/conversation-export.mjs";

const record = {
  conversation: { title: "A clear decision", createdAt: "2026-09-17T00:05:00.000Z" },
  messages: [
    { role: "owner", body: "First paragraph.\n\nSecond paragraph.", createdAt: "2026-09-17T00:05:00.000Z" },
    { role: "Finance Consultant", recipient: "Critic", body: "**Test** demand before *scaling*.\n\n- One `measure`\n- [Evidence](https://example.com/report)\n\n> Keep the limit.", createdAt: "2026-09-17T00:06:00.000Z", sources: [{ title: "Market evidence", url: "https://example.com/report", claim: "Measure willingness.", publishedAt: "2026-09-16", retrievedAt: "2026-09-17T00:04:00.000Z" }] },
    { role: "Head Consultant", body: "## Consolidated advice\n\nRun a bounded test.", createdAt: "2026-09-17T00:07:00.000Z" }
  ]
};

test("RTF export preserves ordered speakers, recipients, local timestamps, paragraphs and sources", () => {
  const rtf = exportConversationRtf(record, "Europe/Kyiv").toString("ascii");
  assert.ok(rtf.startsWith("{\\rtf1"));
  assert.match(rtf, /Time zone: Europe\/Kyiv/u);
  assert.match(rtf, /17 Sept 2026, 03:05/u);
  assert.ok(rtf.indexOf("{\\b You}") < rtf.indexOf("{\\b Finance Consultant}"));
  assert.match(rtf, /\{\\b Finance Consultant\} \\u8594\? \{\\b Critic\}/u);
  assert.match(rtf, /First paragraph\.\\par\n\\pard[^\n]+Second paragraph\./u);
  assert.ok(rtf.includes("{\\b Test}"));
  assert.ok(rtf.includes("{\\i scaling}"));
  assert.ok(rtf.includes("{\\f1 measure}"));
  assert.ok(rtf.includes("Evidence (https://example.com/report)"));
  assert.ok(rtf.includes("{\\b Market evidence}"));
  assert.ok(rtf.includes("Measure willingness."));
  assert.ok(rtf.includes("Published: 2026-09-16"));
  assert.ok(rtf.includes("{\\b Consolidated advice}"));
  assert.equal(rtf.includes("**Test**"), false);
});

test("RTF escaping keeps Unicode and document-control injection inert", () => {
  const dangerous = "{\\object\\objdata 0102} \\field {hidden} Привіт, їжак 🦆";
  const rtf = exportConversationRtf({ conversation: { title: dangerous, createdAt: record.conversation.createdAt }, messages: [{ role: "Critic", body: dangerous, createdAt: record.conversation.createdAt }] }).toString("ascii");
  assert.ok(rtf.includes("\\{\\\\object\\\\objdata 0102\\} \\\\field \\{hidden\\}"));
  assert.ok(rtf.includes("\\u1055?\\u1088?\\u1080?\\u1074?\\u1110?\\u1090?"));
  assert.ok(rtf.includes("\\u-10178?\\u-8826?"));
  assert.match(rtf, /^[\x00-\x7f]+$/u);
});

test("RTF export selects only transcript fields and preserves attachment references", () => {
  const rtf = exportConversationRtf({ ...record, draft: "UNSENT_PRIVATE_DRAFT", credentials: "PRIVATE_CREDENTIAL", snapshot: { runtimeInstructions: "PRIVATE_INSTRUCTIONS" }, messages: [{ ...record.messages[0], attachments: [{ id: "image-reference-1", contentType: "image/png", byteLength: 123 }] }] }).toString("ascii");
  for (const hidden of ["UNSENT_PRIVATE_DRAFT", "PRIVATE_CREDENTIAL", "PRIVATE_INSTRUCTIONS"]) assert.equal(rtf.includes(hidden), false);
  assert.ok(rtf.includes("image/png"));
  assert.ok(rtf.includes("image-reference-1"));
  assert.ok(rtf.includes("Image files remain in the conversation"));
});

test("RTF timestamps default to explicit UTC and reject malformed time zones", () => {
  const rtf = exportConversationRtf(record).toString("ascii");
  assert.ok(rtf.includes("Time zone: UTC"));
  assert.match(rtf, /17 Sept 2026, 00:05/u);
  assert.ok(exportConversationRtf(record, "Europe/Kiev").toString("ascii").includes("Time zone: Europe/Kyiv"));
  assert.throws(() => exportConversationRtf(record, "not-a-timezone"), RangeError);
  assert.throws(() => exportConversationRtf(record, "x".repeat(101)), RangeError);
});

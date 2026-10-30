import assert from "node:assert/strict";
import test from "node:test";
import { deriveConversationTitle } from "../src/server/conversation-title.mjs";

test("a completed consultation title keeps the decision question rather than its generic lead-in", () => {
  assert.equal(deriveConversationTitle("I have $100 and BTC is bearish. Should I sell, hold or buy BTC right now?"), "Sell, hold or buy BTC right now?");
  assert.equal(deriveConversationTitle("Що таке валова маржа?"), "Валова маржа?");
});

test("a generated conversation title has a stable readable bound", () => {
  const title = deriveConversationTitle("Should I keep the original offer or rebuild it around a much narrower, evidence-led segment before next quarter?");
  assert.equal(title.endsWith("…"), true);
  assert.equal(Array.from(title).length <= 56, true);
  assert.equal(title.includes("Should I"), false);
});

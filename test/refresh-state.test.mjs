import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRefreshState, refreshStateKey, serializeRefreshState } from "../src/client/refresh-state.js";

test("same-tab refresh state retains only a valid view, optional record id and scroll position", () => {
  assert.equal(refreshStateKey, "nanoduck-page-state-v1");
  assert.deepEqual(normalizeRefreshState({ page: "discussion", tab: "sources", conversationId: "conversation-123", scrollY: 433.7, draft: "must not persist" }), {
    page: "discussion",
    tab: "sources",
    conversationId: "conversation-123",
    scrollY: 434
  });
  assert.deepEqual(JSON.parse(serializeRefreshState({ page: "settings", tab: "unknown", scrollY: 0 })), {
    page: "settings",
    tab: "discussion",
    scrollY: 0
  });
  assert.deepEqual(normalizeRefreshState({ page: "discussion", tab: "usage", conversationId: "conversation-123", scrollY: 42 }), {
    page: "discussion",
    tab: "usage",
    conversationId: "conversation-123",
    scrollY: 42
  });
});

test("same-tab refresh state rejects malformed or out-of-range browser data", () => {
  assert.equal(normalizeRefreshState(), undefined);
  assert.equal(normalizeRefreshState({ page: "admin", tab: "discussion", scrollY: 0 }), undefined);
  assert.equal(normalizeRefreshState({ page: "discussion", tab: "discussion", scrollY: -1 }), undefined);
  assert.equal(normalizeRefreshState({ page: "discussion", tab: "discussion", scrollY: "not-a-number" }), undefined);
  assert.equal(normalizeRefreshState({ page: "discussion", tab: "discussion", conversationId: "x".repeat(201), scrollY: 1 }), undefined);
});

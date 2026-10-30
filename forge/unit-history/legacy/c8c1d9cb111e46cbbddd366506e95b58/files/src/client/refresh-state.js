export const refreshStateKey = "nanoduck-page-state-v1";

const pages = new Set(["discussion", "conversations", "settings"]);
const tabs = new Set(["discussion", "outcome", "sources", "usage"]);

export const normalizeRefreshState = value => {
  if (!value || typeof value !== "object" || !pages.has(value.page)) return undefined;
  const scrollY = Number(value.scrollY);
  if (!Number.isFinite(scrollY) || scrollY < 0) return undefined;
  if (value.conversationId !== undefined && (typeof value.conversationId !== "string" || value.conversationId.length > 200)) return undefined;
  const state = {
    page: value.page,
    tab: tabs.has(value.tab) ? value.tab : "discussion",
    scrollY: Math.round(scrollY)
  };
  if (value.conversationId) state.conversationId = value.conversationId;
  return state;
};

export const serializeRefreshState = value => JSON.stringify(normalizeRefreshState(value));

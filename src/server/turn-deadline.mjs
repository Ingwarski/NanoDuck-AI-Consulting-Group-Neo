// Activity contains metadata only. Never retain model reasoning or tool payloads.
export function createTurnDeadline({ idleMs = 540_000, maximumMs = 1_800_000 } = {}) {
  for (const value of [idleMs, maximumMs]) if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("invalid_turn_deadline");
  let idleTimer; let maximumTimer; let rejectDeadline; let stopped = false;
  const promise = new Promise((_, reject) => { rejectDeadline = reject; });
  // The connection may fail before the caller starts awaiting the deadline.
  promise.catch(() => {});
  const stop = () => { stopped = true; clearTimeout(idleTimer); clearTimeout(maximumTimer); };
  const expire = code => { stop(); rejectDeadline(new Error(code)); };
  const progress = () => {
    if (stopped) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => expire("provider_idle_timeout"), idleMs);
  };
  const start = () => {
    if (maximumTimer || stopped) return;
    maximumTimer = setTimeout(() => expire("provider_timeout"), maximumMs);
    progress();
  };
  return { promise, start, progress, stop };
}

export function isTurnProgress(notification, threadId, turnId) {
  const params = notification?.params;
  if (!turnId || params?.threadId !== threadId || params?.turnId !== turnId) return false;
  if (["item/started", "item/completed"].includes(notification.method)) return typeof params.item?.id === "string";
  return ["item/agentMessage/delta", "item/reasoning/textDelta", "item/reasoning/summaryTextDelta"].includes(notification.method)
    && typeof params.delta === "string" && params.delta.length > 0;
}

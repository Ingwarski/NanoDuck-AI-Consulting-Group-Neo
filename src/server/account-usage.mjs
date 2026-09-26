// Read-only allowance telemetry. These account-wide windows are never derived
// from conversation token totals and do not contain identity or grant material.
export function codexAllowance(value) {
  const buckets = value?.rateLimitsByLimitId && Object.keys(value.rateLimitsByLimitId).length ? Object.entries(value.rateLimitsByLimitId) : [["codex", value?.rateLimits]];
  return buckets.flatMap(([id, bucket]) => ["primary", "secondary"].flatMap(kind => {
    const window = bucket?.[kind];
    if (!window || !Number.isFinite(window.usedPercent) || window.usedPercent < 0) return [];
    return [{ bucket: /^[a-zA-Z0-9_.-]{1,80}$/u.test(id) ? id : "provider", kind,
      usedPercent: window.usedPercent,
      windowDurationMins: Number.isSafeInteger(window.windowDurationMins) && window.windowDurationMins > 0 ? window.windowDurationMins : null,
      resetsAt: Number.isSafeInteger(window.resetsAt) && window.resetsAt > 0 && window.resetsAt < 8_640_000_000_000 ? window.resetsAt : null }];
  }));
}
export function cachedAllowance(read, { ttl = 60_000, now = Date.now } = {}) {
  let cached, flight, attemptedAt = -Infinity;
  return async () => {
    if (flight) return flight;
    if (now() - attemptedAt < ttl && cached) return cached;
    attemptedAt = now();
    flight = (async () => {
      try {
        const windows = await read();
        cached = { status: windows.length ? "available" : "unavailable", checkedAt: new Date(now()).toISOString(), windows };
      } catch {
        cached = { status: "unavailable", checkedAt: cached?.checkedAt ?? null, windows: cached?.windows ?? [], stale: Boolean(cached?.windows?.length) };
      }
      return cached;
    })();
    try { return await flight; } finally { flight = undefined; }
  };
}

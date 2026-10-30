import test from "node:test";
import assert from "node:assert/strict";
import { codexAllowance, cachedAllowance } from "../src/server/account-usage.mjs";

test("account windows retain zero, prefer named buckets and discard unsafe metadata", () => {
  const result = codexAllowance({ rateLimits: { primary: { usedPercent: 99 } }, rateLimitsByLimitId: { codex: { primary: { usedPercent: 0, windowDurationMins: 300, resetsAt: 1790000000, secret: "never" }, secondary: { usedPercent: -1 } } } });
  assert.deepEqual(result, [{ bucket: "codex", kind: "primary", usedPercent: 0, windowDurationMins: 300, resetsAt: 1790000000 }]);
  assert.deepEqual(codexAllowance(null), []);
  assert.deepEqual(codexAllowance({ rateLimits: { primary: { usedPercent: "50" } } }), []);
});
test("account refresh coalesces requests, expires and preserves stale readings after failure", async () => {
  let now = 1000, calls = 0, fail = false;
  const read = cachedAllowance(async () => { calls++; if (fail) throw new Error("offline"); return [{ usedPercent: 25 }]; }, { ttl: 100, now: () => now });
  const [a, b] = await Promise.all([read(), read()]);
  assert.deepEqual(a, b); assert.equal(calls, 1);
  await read(); assert.equal(calls, 1);
  now += 101; fail = true;
  const stale = await read(); assert.equal(stale.stale, true); assert.equal(stale.windows[0].usedPercent, 25); assert.equal(stale.checkedAt, a.checkedAt);
  await read(); assert.equal(calls, 2);
});

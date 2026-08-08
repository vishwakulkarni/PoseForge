const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRateLimits } = require("../lib/codexRateLimits");

test("normalizes Codex 5-hour and weekly windows by duration", () => {
  const result = normalizeRateLimits({
    rateLimitsByLimitId: {
      codex: {
        planType: "plus",
        primary: { usedPercent: 55, windowDurationMins: 10080, resetsAt: 1786560788 },
        secondary: { usedPercent: 28, windowDurationMins: 300, resetsAt: 1786219200 },
      },
    },
  });

  assert.equal(result.available, true);
  assert.equal(result.planType, "plus");
  assert.equal(result.fiveHour.usedPercent, 28);
  assert.equal(result.fiveHour.remainingPercent, 72);
  assert.equal(result.weekly.usedPercent, 55);
  assert.equal(result.weekly.remainingPercent, 45);
});

test("keeps an unreported Codex window null", () => {
  const result = normalizeRateLimits({
    rateLimits: {
      planType: "plus",
      primary: { usedPercent: 55, windowDurationMins: 10080, resetsAt: null },
      secondary: null,
    },
  });

  assert.equal(result.fiveHour, null);
  assert.equal(result.weekly.usedPercent, 55);
  assert.equal(result.weekly.resetsAt, null);
});

test("returns a safe unavailable shape when Codex reports no snapshot", () => {
  assert.deepEqual(normalizeRateLimits({}), {
    available: false,
    planType: null,
    fiveHour: null,
    weekly: null,
    reason: "The signed-in Codex account did not report rate limits.",
  });
});

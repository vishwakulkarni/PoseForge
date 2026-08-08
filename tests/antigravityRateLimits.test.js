const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAntigravityLimits } = require("../lib/antigravityRateLimits");

test("normalizes Antigravity quota groups and windows", () => {
  const result = normalizeAntigravityLimits({
    status: "SUCCESS",
    command: {
      data: {
        groups: [
          {
            name: "Gemini Models",
            description: "Gemini Flash and Gemini Pro",
            buckets: [
              { window: "weekly", remaining_fraction: 0.9315, reset_time: "2026-08-09T17:58:09Z" },
              { window: "5h", remaining_fraction: 1, reset_time: "2026-08-08T22:26:07Z" },
            ],
          },
        ],
      },
    },
  });

  assert.equal(result.available, true);
  assert.equal(result.groups[0].name, "Gemini Models");
  assert.equal(result.groups[0].weekly.remainingPercent, 93);
  assert.equal(result.groups[0].weekly.usedPercent, 7);
  assert.equal(result.groups[0].fiveHour.remainingPercent, 100);
});

test("returns a safe unavailable shape for invalid Antigravity output", () => {
  assert.deepEqual(normalizeAntigravityLimits({ status: "ERROR" }), {
    available: false,
    groups: [],
    reason: "The signed-in Antigravity account did not report quota limits.",
  });
});

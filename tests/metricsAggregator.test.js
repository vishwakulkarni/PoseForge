const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAllSeries,
  buildSeries,
  computeEngineBreakdown,
  computeFailures,
  computeTotals,
  normalizeFailureReason,
  percentile,
  rowCost,
  rowLatencyMs,
  rowQueueWaitMs,
  rowTokens,
  summarizeHealth,
} = require("../lib/metricsAggregator");

const DAY = 86_400_000;
const BASE = Date.parse("2026-07-01T10:00:00.000Z");

function row(overrides = {}) {
  const created = overrides.created_at ?? new Date(BASE).toISOString();
  return {
    id: overrides.id ?? "00000000-0000-4000-8000-000000000001",
    engine: "codex",
    status: "completed",
    created_at: created,
    started_at: overrides.started_at ?? new Date(Date.parse(created) + 1_000).toISOString(),
    completed_at: overrides.completed_at ?? new Date(Date.parse(created) + 6_000).toISOString(),
    usage_metrics: { totalTokens: 100, inputTokens: 60, outputTokens: 40, estimatedCostUsd: 0.01 },
    error_message: null,
    ...overrides,
  };
}

test("percentile uses nearest-rank and returns null for empty input", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 95), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10);
  // Unsorted input must be handled.
  assert.equal(percentile([10, 1, 5, 3], 50), 3);
});

test("rowCost prefers recorded cost over the pre-run estimate", () => {
  assert.equal(rowCost({ usage_metrics: { estimatedCostUsd: 0.04, actualCostUsd: 0.07 } }), 0.07);
  assert.equal(rowCost({ usage_metrics: { estimatedCostUsd: 0.04 } }), 0.04);
  assert.equal(rowCost({ usage_metrics: {} }), 0);
  assert.equal(rowCost({}), 0);
  // A recorded zero (local ComfyUI) must not fall through to the estimate.
  assert.equal(rowCost({ usage_metrics: { actualCostUsd: 0, estimatedCostUsd: 0.5 } }), 0);
});

test("rowTokens falls back to input+output when total is absent", () => {
  assert.equal(rowTokens({ usage_metrics: { totalTokens: 900 } }), 900);
  assert.equal(rowTokens({ usage_metrics: { inputTokens: 100, outputTokens: 50 } }), 150);
  assert.equal(rowTokens({ usage_metrics: {} }), 0);
});

test("latency and queue wait reject negative or incomplete timestamps", () => {
  const good = row();
  assert.equal(rowLatencyMs(good), 5_000);
  assert.equal(rowQueueWaitMs(good), 1_000);

  assert.equal(rowLatencyMs(row({ completed_at: null })), null);
  assert.equal(rowQueueWaitMs(row({ started_at: null })), null);

  // Clock skew must not produce a negative duration.
  const skewed = row({
    created_at: new Date(BASE).toISOString(),
    started_at: new Date(BASE - 5_000).toISOString(),
  });
  assert.equal(rowQueueWaitMs(skewed), null);
});

test("computeTotals excludes in-flight runs from the success rate", () => {
  const totals = computeTotals([
    row({ id: "a", status: "completed" }),
    row({ id: "b", status: "failed" }),
    row({ id: "c", status: "pending", started_at: null, completed_at: null }),
    row({ id: "d", status: "running", completed_at: null }),
  ]);

  assert.equal(totals.totalRuns, 4);
  assert.equal(totals.completedRuns, 1);
  assert.equal(totals.failedRuns, 1);
  assert.equal(totals.inFlightRuns, 2);
  // 1 completed of 2 terminal runs, not 1 of 4.
  assert.equal(totals.successRate, 0.5);
});

test("computeTotals returns null rates rather than a misleading zero", () => {
  const totals = computeTotals([]);
  assert.equal(totals.successRate, null);
  assert.equal(totals.avgCostPerRun, null);
  assert.equal(totals.latencyMs.p50, null);
  assert.equal(totals.actualUsageShare, null);
  assert.equal(totals.activeDays, 0);
  assert.equal(totals.firstRunAt, null);
  // Averages must not divide by zero.
  assert.equal(totals.avgTokensPerDay, 0);
});

test("computeTotals averages over active days, not calendar span", () => {
  // Two runs a month apart: 2 active days, not 31.
  const totals = computeTotals([
    row({ id: "a", created_at: new Date(BASE).toISOString() }),
    row({ id: "b", created_at: new Date(BASE + 30 * DAY).toISOString() }),
  ]);

  assert.equal(totals.activeDays, 2);
  assert.equal(totals.totalTokens, 200);
  assert.equal(totals.avgTokensPerDay, 100);
});

test("computeTotals sums token and cost components", () => {
  const totals = computeTotals([
    row({ id: "a", usage_metrics: { inputTokens: 10, outputTokens: 5, estimatedCostUsd: 0.1 } }),
    row({ id: "b", usage_metrics: { inputTokens: 20, outputTokens: 7, actualCostUsd: 0.25 } }),
  ]);

  assert.equal(totals.inputTokens, 30);
  assert.equal(totals.outputTokens, 12);
  assert.equal(totals.totalTokens, 42);
  assert.equal(totals.totalCostUsd, 0.35);
});

test("actualUsageShare reflects recorded-vs-estimated mix", () => {
  const totals = computeTotals([
    row({ id: "a", usage_metrics: { source: "actual", totalTokens: 1 } }),
    row({ id: "b", usage_metrics: { source: "estimated", totalTokens: 1 } }),
    row({ id: "c", usage_metrics: { source: "estimated", totalTokens: 1 } }),
    row({ id: "d", usage_metrics: { source: "actual", totalTokens: 1 } }),
  ]);
  assert.equal(totals.actualUsageShare, 0.5);
});

test("buildSeries accumulates cumulatively and never decreases", () => {
  const rows = [
    row({ id: "a", created_at: new Date(BASE).toISOString() }),
    row({ id: "b", created_at: new Date(BASE + DAY).toISOString() }),
    row({ id: "c", created_at: new Date(BASE + 2 * DAY).toISOString() }),
  ];

  const series = buildSeries(rows, (_r, time) => new Date(time).toISOString().slice(0, 10));

  assert.equal(series.length, 3);
  assert.deepEqual(
    series.map((point) => point.tokens.all),
    [100, 200, 300]
  );

  for (let i = 1; i < series.length; i += 1) {
    assert.ok(series[i].tokens.all >= series[i - 1].tokens.all, "series must be monotonic");
  }
});

test("buildSeries keeps engines as separate keys plus an all roll-up", () => {
  const series = buildSeries(
    [
      row({ id: "a", engine: "codex", created_at: new Date(BASE).toISOString() }),
      row({ id: "b", engine: "gemini", created_at: new Date(BASE).toISOString() }),
      row({ id: "c", engine: "codex", created_at: new Date(BASE + DAY).toISOString() }),
    ],
    (_r, time) => new Date(time).toISOString().slice(0, 10)
  );

  assert.equal(series[0].tokens.codex, 100);
  assert.equal(series[0].tokens.gemini, 100);
  assert.equal(series[0].tokens.all, 200);

  // Day two adds only a codex run; gemini must carry forward, not reset.
  assert.equal(series[1].tokens.codex, 200);
  assert.equal(series[1].tokens.gemini, 100);
  assert.equal(series[1].tokens.all, 300);
});

test("buildAllSeries buckets by day, week, month and run", () => {
  // 2026-07-01 is a Wednesday; 2026-07-06 is the following Monday.
  const rows = [
    row({ id: "a", created_at: "2026-07-01T10:00:00.000Z" }),
    row({ id: "b", created_at: "2026-07-02T10:00:00.000Z" }),
    row({ id: "c", created_at: "2026-07-06T10:00:00.000Z" }),
    row({ id: "d", created_at: "2026-08-03T10:00:00.000Z" }),
  ];

  const series = buildAllSeries(rows);

  assert.equal(series.daily.length, 4);
  assert.equal(series.runs.length, 4);
  assert.deepEqual(
    series.weekly.map((point) => point.bucket),
    ["2026-06-29", "2026-07-06", "2026-08-03"]
  );
  assert.deepEqual(
    series.monthly.map((point) => point.bucket),
    ["2026-07", "2026-08"]
  );
  assert.equal(series.monthly.at(-1).tokens.all, 400);
});

test("computeEngineBreakdown groups by engine and model and sorts by cost", () => {
  const rows = [
    row({
      id: "a",
      engine: "gemini",
      usage_metrics: { model: "gemini-3-pro", totalTokens: 10, estimatedCostUsd: 1 },
    }),
    row({
      id: "b",
      engine: "gemini",
      usage_metrics: { model: "gemini-3-pro", totalTokens: 10, estimatedCostUsd: 1 },
    }),
    row({
      id: "c",
      engine: "gemini",
      usage_metrics: { model: "gemini-3-flash", totalTokens: 5, estimatedCostUsd: 0.1 },
    }),
    row({ id: "d", engine: "comfy", usage_metrics: { totalTokens: 0, estimatedCostUsd: 0 } }),
  ];

  const breakdown = computeEngineBreakdown(rows);

  assert.equal(breakdown.length, 3);
  assert.equal(breakdown[0].engine, "gemini");
  assert.equal(breakdown[0].model, "gemini-3-pro");
  assert.equal(breakdown[0].runs, 2);
  assert.equal(breakdown[0].costUsd, 2);
  assert.equal(breakdown[0].share, 0.5);

  // Local ComfyUI runs record no model and no cost.
  const comfy = breakdown.find((entry) => entry.engine === "comfy");
  assert.equal(comfy.model, null);
  assert.equal(comfy.costUsd, 0);

  const totalShare = breakdown.reduce((sum, entry) => sum + entry.share, 0);
  assert.ok(Math.abs(totalShare - 1) < 1e-6, "shares must sum to 1");
});

test("normalizeFailureReason collapses ids, paths, ports and long numbers", () => {
  const a = normalizeFailureReason(
    "Engine failed for 3f0a1b2c-1111-4222-8333-444455556666 at /Users/x/storage/out.png"
  );
  const b = normalizeFailureReason(
    "Engine failed for 9c9c9c9c-2222-4333-8444-555566667777 at /Users/y/storage/out.png"
  );
  assert.equal(a, b, "two runs of the same failure must group together");

  assert.equal(normalizeFailureReason(""), "Unknown error");
  assert.equal(normalizeFailureReason(null), "Unknown error");
  assert.ok(normalizeFailureReason("x".repeat(500)).length <= 180);
});

test("computeFailures groups, counts and orders by frequency", () => {
  const failures = computeFailures([
    row({ id: "a", status: "failed", error_message: "Timed out after 300000ms" }),
    row({ id: "b", status: "failed", error_message: "Timed out after 120000ms" }),
    row({ id: "c", status: "failed", error_message: "API key rejected" }),
    row({ id: "d", status: "completed" }),
  ]);

  assert.equal(failures.length, 2);
  assert.equal(failures[0].count, 2);
  assert.equal(failures[0].engines.length, 1);
  assert.ok(failures[0].lastSeenAt);
  // Completed runs must never appear.
  assert.ok(!failures.some((entry) => entry.reason === null));
});

test("summarizeHealth reports degraded, down and backlog states", () => {
  assert.equal(
    summarizeHealth({ engines: [{ ready: true }, { ready: true }], queue: { queued: 0 } }).status,
    "healthy"
  );
  assert.equal(
    summarizeHealth({ engines: [{ ready: true }, { ready: false }], queue: { queued: 0 } }).status,
    "degraded"
  );
  assert.equal(
    summarizeHealth({ engines: [{ ready: false }], queue: { queued: 0 } }).status,
    "down"
  );
  assert.equal(summarizeHealth({ engines: [], queue: { queued: 0 } }).status, "down");

  // Every engine ready but a deep backlog is still worth flagging.
  const backlog = summarizeHealth({ engines: [{ ready: true }], queue: { queued: 42 } });
  assert.equal(backlog.status, "degraded");
  assert.match(backlog.detail, /backlog/i);
  assert.equal(backlog.queueDepth, 42);
});

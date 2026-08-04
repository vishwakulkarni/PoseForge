/**
 * Pure aggregation helpers for the metrics dashboard.
 *
 * Deliberately free of database and Express concerns: every function takes
 * plain rows and returns plain objects, which makes the whole surface unit
 * testable without a live Postgres.
 *
 * A "row" here is a generation record with at least:
 *   { id, engine, status, created_at, started_at, completed_at,
 *     usage_metrics, error_message }
 */

const IN_FLIGHT_STATUSES = new Set(["pending", "running"]);

/** Milliseconds in a day, used for bucketing and per-day averages. */
const DAY_MS = 86_400_000;

function toTime(value) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function toIso(value) {
  const time = toTime(value);
  return time === null ? null : new Date(time).toISOString();
}

function round(value, places = 6) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Nearest-rank percentile on an already-unsorted array. Returns null for an
 * empty input rather than 0, so the UI can render "—" instead of implying a
 * measured zero.
 */
function percentile(values, p) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/** Cost recorded by the provider when available, else our pre-run estimate. */
function rowCost(row) {
  const usage = row.usage_metrics || {};
  const actual = Number(usage.actualCostUsd);
  if (Number.isFinite(actual)) return actual;
  const estimated = Number(usage.estimatedCostUsd);
  return Number.isFinite(estimated) ? estimated : 0;
}

function rowTokens(row) {
  const usage = row.usage_metrics || {};
  const total = Number(usage.totalTokens);
  if (Number.isFinite(total)) return total;
  const input = Number(usage.inputTokens) || 0;
  const output = Number(usage.outputTokens) || 0;
  return input + output;
}

function rowInputTokens(row) {
  return Number(row.usage_metrics?.inputTokens) || 0;
}

function rowOutputTokens(row) {
  return Number(row.usage_metrics?.outputTokens) || 0;
}

/** Wall-clock time the engine spent producing the image. */
function rowLatencyMs(row) {
  const started = toTime(row.started_at);
  const completed = toTime(row.completed_at);
  if (started === null || completed === null) return null;
  const delta = completed - started;
  return delta >= 0 ? delta : null;
}

/** Time spent waiting in the in-memory queue before the engine picked it up. */
function rowQueueWaitMs(row) {
  const created = toTime(row.created_at);
  const started = toTime(row.started_at);
  if (created === null || started === null) return null;
  const delta = started - created;
  return delta >= 0 ? delta : null;
}

function dayKey(time) {
  return new Date(time).toISOString().slice(0, 10);
}

/** ISO week start (Monday), rendered as the date of that Monday. */
function weekKey(time) {
  const date = new Date(time);
  const day = (date.getUTCDay() + 6) % 7; // Monday = 0
  const monday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day);
  return new Date(monday).toISOString().slice(0, 10);
}

function monthKey(time) {
  return new Date(time).toISOString().slice(0, 7);
}

/**
 * Builds a cumulative series keyed by engine plus an `all` roll-up.
 *
 * Cumulative (not per-bucket) matches the reference dashboard: the lines only
 * ever rise, so the chart reads as "value accrued so far" rather than a noisy
 * per-day bar. `runs` buckets use each generation individually, which is what
 * the "Checkpoints" mode in the reference shows.
 */
function buildSeries(rows, bucketFn) {
  const engines = [...new Set(rows.map((row) => row.engine))].sort();
  const buckets = new Map();

  for (const row of rows) {
    const created = toTime(row.created_at);
    if (created === null) continue;
    const key = bucketFn(row, created);
    if (!buckets.has(key)) {
      buckets.set(key, { tokens: {}, cost: {}, runs: {} });
    }
    const bucket = buckets.get(key);
    const engine = row.engine;
    bucket.tokens[engine] = (bucket.tokens[engine] || 0) + rowTokens(row);
    bucket.cost[engine] = (bucket.cost[engine] || 0) + rowCost(row);
    bucket.runs[engine] = (bucket.runs[engine] || 0) + 1;
  }

  const running = { tokens: {}, cost: {}, runs: {} };
  const points = [];

  for (const key of [...buckets.keys()].sort()) {
    const bucket = buckets.get(key);
    const point = { bucket: key, tokens: {}, cost: {}, runs: {} };

    for (const engine of engines) {
      running.tokens[engine] = (running.tokens[engine] || 0) + (bucket.tokens[engine] || 0);
      running.cost[engine] = (running.cost[engine] || 0) + (bucket.cost[engine] || 0);
      running.runs[engine] = (running.runs[engine] || 0) + (bucket.runs[engine] || 0);

      point.tokens[engine] = running.tokens[engine];
      point.cost[engine] = round(running.cost[engine]);
      point.runs[engine] = running.runs[engine];
    }

    point.tokens.all = engines.reduce((sum, e) => sum + point.tokens[e], 0);
    point.cost.all = round(engines.reduce((sum, e) => sum + point.cost[e], 0));
    point.runs.all = engines.reduce((sum, e) => sum + point.runs[e], 0);

    points.push(point);
  }

  return points;
}

function computeTotals(rows) {
  const completed = rows.filter((row) => row.status === "completed");
  const failed = rows.filter((row) => row.status === "failed");
  const inFlight = rows.filter((row) => IN_FLIGHT_STATUSES.has(row.status));

  const totalTokens = rows.reduce((sum, row) => sum + rowTokens(row), 0);
  const inputTokens = rows.reduce((sum, row) => sum + rowInputTokens(row), 0);
  const outputTokens = rows.reduce((sum, row) => sum + rowOutputTokens(row), 0);
  const totalCostUsd = round(rows.reduce((sum, row) => sum + rowCost(row), 0));

  const times = rows.map((row) => toTime(row.created_at)).filter((t) => t !== null);
  const firstRunAt = times.length ? toIso(Math.min(...times)) : null;
  const lastRunAt = times.length ? toIso(Math.max(...times)) : null;

  const activeDays = new Set(times.map((time) => dayKey(time))).size;

  // Averages are per *active* day rather than per calendar day in the range.
  // A user who generates in two bursts a month apart should not see their
  // daily average diluted by 28 idle days.
  const perDayDivisor = activeDays || 1;
  const weeksSpanned = Math.max(1, Math.ceil(perDayDivisor / 7));

  const latencies = rows.map(rowLatencyMs).filter((v) => v !== null);
  const queueWaits = rows.map(rowQueueWaitMs).filter((v) => v !== null);

  const usageSources = rows
    .map((row) => row.usage_metrics?.source)
    .filter(Boolean);
  const actualCount = usageSources.filter((source) => source === "actual").length;

  // Terminal runs only — a queued run has not had a chance to succeed yet, so
  // including it would make the success rate dip purely from pending work.
  const terminal = completed.length + failed.length;

  return {
    totalRuns: rows.length,
    completedRuns: completed.length,
    failedRuns: failed.length,
    inFlightRuns: inFlight.length,
    successRate: terminal ? round(completed.length / terminal, 4) : null,
    totalTokens,
    inputTokens,
    outputTokens,
    totalCostUsd,
    activeDays,
    firstRunAt,
    lastRunAt,
    avgTokensPerDay: Math.round(totalTokens / perDayDivisor),
    avgTokensPerWeek: Math.round(totalTokens / weeksSpanned),
    avgCostPerDay: round(totalCostUsd / perDayDivisor),
    avgCostPerRun: rows.length ? round(totalCostUsd / rows.length) : null,
    latencyMs: {
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : null,
    },
    queueWaitMs: {
      p50: percentile(queueWaits, 50),
      p95: percentile(queueWaits, 95),
      max: queueWaits.length ? Math.max(...queueWaits) : null,
    },
    actualUsageShare: usageSources.length ? round(actualCount / usageSources.length, 4) : null,
  };
}

/**
 * Per-engine (and per-model, when the engine records one) breakdown — the
 * right-hand table in the reference dashboard.
 */
function computeEngineBreakdown(rows) {
  const totalRuns = rows.length || 1;
  const groups = new Map();

  for (const row of rows) {
    const model = row.usage_metrics?.model || null;
    const key = `${row.engine}::${model ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, { engine: row.engine, model, rows: [] });
    }
    groups.get(key).rows.push(row);
  }

  return [...groups.values()]
    .map((group) => {
      const completed = group.rows.filter((row) => row.status === "completed").length;
      const failed = group.rows.filter((row) => row.status === "failed").length;
      const terminal = completed + failed;
      const latencies = group.rows.map(rowLatencyMs).filter((v) => v !== null);
      const tokens = group.rows.reduce((sum, row) => sum + rowTokens(row), 0);
      const costUsd = round(group.rows.reduce((sum, row) => sum + rowCost(row), 0));

      return {
        engine: group.engine,
        model: group.model,
        runs: group.rows.length,
        completed,
        failed,
        successRate: terminal ? round(completed / terminal, 4) : null,
        tokens,
        costUsd,
        avgLatencyMs: latencies.length
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null,
        p95LatencyMs: percentile(latencies, 95),
        share: round(group.rows.length / totalRuns, 4),
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd || b.runs - a.runs);
}

/**
 * Groups failures by message so recurring problems surface as one row with a
 * count, instead of N identical lines in History.
 */
function computeFailures(rows, limit = 8) {
  const groups = new Map();

  for (const row of rows) {
    if (row.status !== "failed") continue;
    const reason = normalizeFailureReason(row.error_message);
    if (!groups.has(reason)) {
      groups.set(reason, { reason, count: 0, engines: new Set(), lastSeen: 0 });
    }
    const group = groups.get(reason);
    group.count += 1;
    group.engines.add(row.engine);
    const seenAt = toTime(row.completed_at) ?? toTime(row.created_at) ?? 0;
    if (seenAt > group.lastSeen) group.lastSeen = seenAt;
  }

  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.lastSeen - a.lastSeen)
    .slice(0, limit)
    .map((group) => ({
      reason: group.reason,
      count: group.count,
      engines: [...group.engines].sort(),
      lastSeenAt: group.lastSeen ? new Date(group.lastSeen).toISOString() : null,
    }));
}

/**
 * Collapses the volatile parts of an engine error so the same underlying
 * failure groups together: UUIDs, absolute paths, ports and long digit runs
 * would otherwise make every message unique.
 */
function normalizeFailureReason(message) {
  const text = String(message || "").trim();
  if (!text) return "Unknown error";
  return (
    text
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
      .replace(/(\/[\w.-]+){2,}/g, "<path>")
      .replace(/:\d{2,5}(?=\D|$)/g, ":<port>")
      // No \b here: engine errors routinely fuse a number to its unit
      // ("timed out after 300000ms"), and \b would never match between a
      // digit and a letter, leaving every timeout as its own group.
      .replace(/\d{3,}/g, "<n>")
      .slice(0, 180)
  );
}

function buildAllSeries(rows) {
  return {
    daily: buildSeries(rows, (_row, time) => dayKey(time)),
    weekly: buildSeries(rows, (_row, time) => weekKey(time)),
    monthly: buildSeries(rows, (_row, time) => monthKey(time)),
    // One point per run, oldest first. Sorting by created_at then id keeps the
    // order stable for runs recorded within the same millisecond.
    runs: buildSeries(rows, (row, time) => `${new Date(time).toISOString()}::${row.id}`),
  };
}

function summarizeHealth({ engines = [], queue = { queued: 0, active: 0 } }) {
  const ready = engines.filter((engine) => engine.ready).length;
  const total = engines.length;
  const queueDepth = Number(queue.queued) || 0;

  let status = "healthy";
  let detail = `${ready}/${total} engines ready`;

  if (total === 0 || ready === 0) {
    status = "down";
    detail = total === 0 ? "No engines registered" : "No engine is ready";
  } else if (ready < total) {
    status = "degraded";
    detail = `${ready}/${total} engines ready`;
  }

  // A deep backlog is worth surfacing even when every engine reports ready.
  if (status === "healthy" && queueDepth > 10) {
    status = "degraded";
    detail = `Queue backlog: ${queueDepth} waiting`;
  }

  return { status, readyEngines: ready, totalEngines: total, queueDepth, detail };
}

module.exports = {
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
  DAY_MS,
};

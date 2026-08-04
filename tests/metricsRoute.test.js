const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

/**
 * Exercises routes/metrics.js end to end without a live Postgres.
 *
 * The pool and engine registry are injected into the require cache before the
 * route is loaded, so the real handler, the real SQL branching, and the real
 * aggregation all run — only the driver is stubbed.
 */

const ROOT = path.join(__dirname, "..");

function stub(relativePath, exports) {
  const resolved = require.resolve(path.join(ROOT, relativePath));
  const stubModule = new Module(resolved, null);
  stubModule.exports = exports;
  stubModule.loaded = true;
  require.cache[resolved] = stubModule;
  return resolved;
}

function generationRow(overrides = {}) {
  const created = overrides.created_at ?? "2026-08-01T10:00:00.000Z";
  return {
    id: overrides.id ?? "aaaaaaaa-0000-4000-8000-000000000001",
    engine: "codex",
    status: "completed",
    created_at: created,
    started_at: new Date(Date.parse(created) + 1000).toISOString(),
    completed_at: new Date(Date.parse(created) + 9000).toISOString(),
    usage_metrics: {
      source: "actual",
      model: null,
      totalTokens: 1200,
      inputTokens: 900,
      outputTokens: 300,
      estimatedCostUsd: 0.05,
    },
    error_message: null,
    studio_mode: "normal",
    batch_id: null,
    ...overrides,
  };
}

/** Routes the aggregate queries loadLibraryStats() issues, by shape. */
function makeQueryStub(generations) {
  return async function query(sql) {
    if (/FROM generations/.test(sql) && /ORDER BY created_at ASC/.test(sql)) {
      return { rows: generations, rowCount: generations.length };
    }
    if (/FROM characters/.test(sql)) return { rows: [{ count: 3 }] };
    if (/FROM pose_references/.test(sql) && /count\(\*\) FILTER/.test(sql)) {
      return { rows: [{ total: 20, custom: 4 }] };
    }
    if (/FROM studio_recipes/.test(sql)) return { rows: [{ count: 2 }] };
    if (/FROM generation_characters/.test(sql)) {
      return { rows: [{ id: "c-1", name: "Anika", runs: 7 }] };
    }
    if (/JOIN pose_references/.test(sql)) {
      return { rows: [{ id: "p-1", title: "Arms crossed", runs: 4 }] };
    }
    return { rows: [], rowCount: 0 };
  };
}

/** Builds a fresh route instance with the given data, isolated per test. */
function loadRoute(generations, engines = [{ key: "codex", ready: true }]) {
  const poolPath = stub("db/pool.js", { pool: { query: makeQueryStub(generations) } });
  const enginesPath = stub("engines/index.js", {
    registry: {},
    listEngines: async () => engines,
  });

  const routePath = require.resolve(path.join(ROOT, "routes/metrics.js"));
  delete require.cache[routePath];
  const router = require(routePath);

  return {
    router,
    cleanup() {
      delete require.cache[poolPath];
      delete require.cache[enginesPath];
      delete require.cache[routePath];
    },
  };
}

/** Invokes the router's GET / handler and resolves with the JSON body. */
function invoke(router, query = {}) {
  return new Promise((resolve, reject) => {
    const layer = router.stack.find((item) => item.route && item.route.path === "/");
    assert.ok(layer, "GET / route must be registered");

    const handler = layer.route.stack[0].handle;
    const req = { query, method: "GET", url: "/" };
    const res = {
      statusCode: 200,
      json(body) {
        resolve(body);
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
    };

    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

test("returns the full metrics contract the dashboard expects", async () => {
  const { router, cleanup } = loadRoute([
    generationRow({ id: "a", created_at: "2026-08-01T10:00:00.000Z" }),
    generationRow({ id: "b", created_at: "2026-08-02T10:00:00.000Z", engine: "gemini" }),
    generationRow({
      id: "c",
      created_at: "2026-08-02T12:00:00.000Z",
      status: "failed",
      error_message: "Timed out after 300000ms",
    }),
  ]);

  try {
    const body = await invoke(router);

    for (const key of [
      "scope",
      "generatedAt",
      "sessionStartedAt",
      "health",
      "totals",
      "series",
      "engines",
      "failures",
      "library",
    ]) {
      assert.ok(key in body, `response must include ${key}`);
    }

    assert.equal(body.scope, "historical");
    assert.equal(body.totals.totalRuns, 3);
    assert.equal(body.totals.completedRuns, 2);
    assert.equal(body.totals.failedRuns, 1);
    assert.deepEqual(Object.keys(body.series).sort(), ["daily", "monthly", "runs", "weekly"]);
    assert.equal(body.series.daily.length, 2);
    assert.equal(body.engines.length, 2);
    assert.equal(body.failures.length, 1);
    assert.equal(body.library.characters, 3);
    assert.equal(body.library.mostUsedCharacter.name, "Anika");
  } finally {
    cleanup();
  }
});

test("scope=session is the only value that filters, and it is validated", async () => {
  const { router, cleanup } = loadRoute([generationRow()]);
  try {
    assert.equal((await invoke(router, { scope: "session" })).scope, "session");
    // Anything unrecognised falls back to historical rather than erroring.
    assert.equal((await invoke(router, { scope: "'; DROP TABLE" })).scope, "historical");
    assert.equal((await invoke(router, {})).scope, "historical");
  } finally {
    cleanup();
  }
});

test("an empty database produces a valid, all-zero response", async () => {
  const { router, cleanup } = loadRoute([]);
  try {
    const body = await invoke(router);

    assert.equal(body.totals.totalRuns, 0);
    assert.equal(body.totals.successRate, null);
    assert.equal(body.totals.totalCostUsd, 0);
    assert.deepEqual(body.series.daily, []);
    assert.deepEqual(body.engines, []);
    assert.deepEqual(body.failures, []);
    assert.equal(body.health.status, "healthy");
  } finally {
    cleanup();
  }
});

test("health degrades when engines are not ready", async () => {
  const { router, cleanup } = loadRoute(
    [generationRow()],
    [
      { key: "codex", ready: true },
      { key: "gemini", ready: false, reason: "No API key" },
    ]
  );
  try {
    const body = await invoke(router);
    assert.equal(body.health.status, "degraded");
    assert.equal(body.health.readyEngines, 1);
    assert.equal(body.health.totalEngines, 2);
  } finally {
    cleanup();
  }
});

test("a failing engine registry does not take the whole endpoint down", async () => {
  const poolPath = stub("db/pool.js", { pool: { query: makeQueryStub([generationRow()]) } });
  const enginesPath = stub("engines/index.js", {
    registry: {},
    listEngines: async () => {
      throw new Error("engine probe exploded");
    },
  });
  const routePath = require.resolve(path.join(ROOT, "routes/metrics.js"));
  delete require.cache[routePath];
  const router = require(routePath);

  try {
    const body = await invoke(router);
    // Metrics still render; health reports down rather than 500-ing.
    assert.equal(body.totals.totalRuns, 1);
    assert.equal(body.health.status, "down");
    assert.equal(body.health.totalEngines, 0);
  } finally {
    delete require.cache[poolPath];
    delete require.cache[enginesPath];
    delete require.cache[routePath];
  }
});

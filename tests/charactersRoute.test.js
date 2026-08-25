const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const CHARACTER_ID = "11111111-1111-4111-8111-111111111111";

function stub(relativePath, exports) {
  const resolved = require.resolve(path.join(ROOT, relativePath));
  const stubModule = new Module(resolved, null);
  stubModule.exports = exports;
  stubModule.loaded = true;
  require.cache[resolved] = stubModule;
  return resolved;
}

function loadRoute() {
  let currentName = "Anika";
  const query = async (_sql, params = []) => {
    const [id, name] = params;
    if (name === "Ravi") {
      const conflict = new Error("duplicate name");
      conflict.code = "23505";
      throw conflict;
    }
    if (id !== CHARACTER_ID) return { rows: [], rowCount: 0 };
    currentName = name;
    return {
      rows: [{
        id: CHARACTER_ID,
        name: currentName,
        created_at: "2026-08-01T10:00:00.000Z",
        primary_photo_path: "characters/anika.png",
      }],
      rowCount: 1,
    };
  };

  const stubs = [
    stub("db/pool.js", { pool: { query } }),
    stub("lib/storage.js", { publicUrl: (filePath) => `/storage/${filePath}` }),
    stub("lib/imageNormalizer.js", { normalizeToPng: async () => {} }),
  ];
  const routePath = require.resolve(path.join(ROOT, "routes/characters.js"));
  delete require.cache[routePath];
  const router = require(routePath);
  return {
    router,
    cleanup() {
      for (const stubPath of stubs) delete require.cache[stubPath];
      delete require.cache[routePath];
    },
  };
}

function invoke(router, { id = CHARACTER_ID, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const layer = router.stack.find((item) =>
      item.route && item.route.path === "/:id" && item.route.methods.patch,
    );
    assert.ok(layer, "PATCH /:id route must be registered");
    const handler = layer.route.stack[0].handle;
    const req = { params: { id }, body, method: "PATCH", url: "/:id" };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        resolve({ status: this.statusCode, body: payload });
        return this;
      },
    };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

test("character rename trims and returns the updated summary", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const response = await invoke(router, { body: { name: "  Meera  " } });
    assert.equal(response.status, 200);
    assert.equal(response.body.name, "Meera");
    assert.equal(response.body.primaryPhotoUrl, "/storage/characters/anika.png");
  } finally {
    cleanup();
  }
});

test("character rename validates the id and name", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const malformed = await invoke(router, { id: "not-a-uuid", body: { name: "Meera" } });
    assert.equal(malformed.status, 404);

    const empty = await invoke(router, { body: { name: "   " } });
    assert.equal(empty.status, 400);

    const tooLong = await invoke(router, { body: { name: "x".repeat(81) } });
    assert.equal(tooLong.status, 400);
  } finally {
    cleanup();
  }
});

test("character rename reports missing characters and duplicate names", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const missing = await invoke(router, {
      id: "22222222-2222-4222-8222-222222222222",
      body: { name: "Meera" },
    });
    assert.equal(missing.status, 404);

    const duplicate = await invoke(router, { body: { name: "Ravi" } });
    assert.equal(duplicate.status, 409);
    assert.match(duplicate.body.error, /already exists/i);
  } finally {
    cleanup();
  }
});

test("character angle generation is queued only after the explicit profile request", async () => {
  const queued = [];
  const profileRuns = [];
  const statements = [];
  const client = {
    async query(sql, params = []) {
      statements.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const query = async (sql) => {
    if (/status IN \('pending', 'running'\)/.test(sql)) return { rows: [], rowCount: 0 };
    if (/JOIN character_photos/.test(sql)) {
      return { rows: [{ id: CHARACTER_ID, file_path: "characters/source.png" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
  const stubs = [
    stub("db/pool.js", { pool: { query, connect: async () => client } }),
    stub("lib/storage.js", {
      absolutePath: (filePath) => `/tmp/${filePath}`,
      publicUrl: (filePath) => `/storage/${filePath}`,
    }),
    stub("lib/imageNormalizer.js", { normalizeToPng: async () => {} }),
    stub("lib/generationQueue.js", { enqueue: (id, runFn) => queued.push({ id, runFn }) }),
    stub("engines/index.js", { registry: {
      gemini: {
        key: "gemini",
        label: "Google Gemini",
        models: [{ id: "gemini-test", label: "Gemini Test" }],
        capabilities: { angleProfiles: true },
        isReady: async () => ({ ready: true }),
        getConfiguredModel: async () => "gemini-test",
        generateProfileView: async () => {},
      },
    } }),
    stub("lib/characterAngleProfiles.js", {
      ANGLES: [0, 45, 90, 135, 180],
      anglePrompt: (angle) => `angle ${angle}`,
      validateSource: async () => {},
      runProfileGeneration: async (input) => { profileRuns.push(input); },
    }),
  ];
  const routePath = require.resolve(path.join(ROOT, "routes/characters.js"));
  delete require.cache[routePath];
  const router = require(routePath);
  try {
    const layer = router.stack.find((item) =>
      item.route && item.route.path === "/:id/angle-profile" && item.route.methods.post,
    );
    assert.ok(layer, "POST /:id/angle-profile route must be registered");
    const handler = layer.route.stack[0].handle;
    const response = await new Promise((resolve, reject) => {
      const req = { params: { id: CHARACTER_ID }, body: { engine: "gemini" }, requestId: "request-1", method: "POST", url: "/:id/angle-profile" };
      const res = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      };
      Promise.resolve(handler(req, res, reject)).catch(reject);
    });

    assert.equal(response.status, 202);
    assert.equal(response.body.totalAngles, 5);
    assert.equal(response.body.engine, "gemini");
    assert.equal(response.body.model, "gemini-test");
    assert.equal(queued.length, 1);
    assert.match(queued[0].id, /^character-profile:/);
    assert.equal(statements.filter(({ sql }) => /INSERT INTO character_profile_views/.test(sql)).length, 5);
    const profileSetInsert = statements.find(({ sql }) => /INSERT INTO character_profile_sets/.test(sql));
    assert.deepEqual(profileSetInsert.params.slice(2), ["gemini", "gemini-test"]);
    await queued[0].runFn();
    assert.equal(profileRuns[0].engineKey, "gemini");
    assert.equal(profileRuns[0].model, "gemini-test");
  } finally {
    for (const stubPath of stubs) delete require.cache[stubPath];
    delete require.cache[routePath];
  }
});

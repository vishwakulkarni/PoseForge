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

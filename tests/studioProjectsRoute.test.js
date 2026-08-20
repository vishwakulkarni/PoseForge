const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const PROJECT_ID = "33333333-3333-4333-8333-333333333333";

function stub(relativePath, exports) {
  const resolved = require.resolve(path.join(ROOT, relativePath));
  const stubModule = new Module(resolved, null);
  stubModule.exports = exports;
  stubModule.loaded = true;
  require.cache[resolved] = stubModule;
  return resolved;
}

function row(overrides = {}) {
  return {
    id: PROJECT_ID,
    name: "My Studio",
    schema_version: 1,
    revision: 0,
    document: {
      schemaVersion: 1,
      viewport: null,
      nodes: [],
      edges: [],
      locked: false,
    },
    is_default: true,
    created_at: "2026-08-17T10:00:00.000Z",
    updated_at: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

function loadRoute() {
  let current = row();
  const projects = [current];
  const query = async (sql, params = []) => {
    if (/SELECT id, name, schema_version/.test(sql)) {
      return { rows: projects, rowCount: projects.length };
    }
    if (/SELECT \* FROM studio_projects WHERE is_default/.test(sql)) {
      return { rows: [current], rowCount: 1 };
    }
    if (/SELECT is_default FROM studio_projects/.test(sql)) {
      const found = projects.find((item) => item.id === params[0]);
      return found ? { rows: [{ is_default: found.is_default }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/UPDATE studio_projects/.test(sql) && /revision = revision \+ 1/.test(sql)) {
      const expectedRevision = Number(params[3]);
      if (expectedRevision !== Number(current.revision)) return { rows: [], rowCount: 0 };
      current = row({
        revision: expectedRevision + 1,
        document: JSON.parse(params[0]),
        updated_at: "2026-08-17T10:01:00.000Z",
      });
      return { rows: [current], rowCount: 1 };
    }
    if (/INSERT INTO studio_projects \(name, schema_version, document\)/.test(sql)) {
      const created = row({
        id: "55555555-5555-4555-8555-555555555555",
        name: params[0],
        document: JSON.parse(params[2]),
        is_default: false,
        created_at: "2026-08-19T10:00:00.000Z",
        updated_at: "2026-08-19T10:00:00.000Z",
      });
      projects.unshift(created);
      return { rows: [created], rowCount: 1 };
    }
    if (/SELECT revision FROM studio_projects/.test(sql)) {
      return { rows: [{ revision: current.revision }], rowCount: 1 };
    }
    if (/UPDATE studio_projects/.test(sql) && /archived_at = now\(\)/.test(sql)) {
      const index = projects.findIndex((item) => item.id === params[0]);
      if (index < 0) return { rows: [], rowCount: 0 };
      const [removed] = projects.splice(index, 1);
      return { rows: [removed], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const poolPath = stub("db/pool.js", { pool: { query } });
  const routePath = require.resolve(path.join(ROOT, "routes/studio-projects.js"));
  delete require.cache[routePath];
  const router = require(routePath);
  return {
    router,
    cleanup() {
      delete require.cache[poolPath];
      delete require.cache[routePath];
    },
  };
}

function invoke(router, method, routePath, { params = {}, body = {} } = {}) {
  return new Promise((resolve, reject) => {
    const layer = router.stack.find((item) =>
      item.route && item.route.path === routePath && item.route.methods[method.toLowerCase()],
    );
    assert.ok(layer, `${method} ${routePath} route must be registered`);
    const handler = layer.route.stack[0].handle;
    const req = { params, body, method, url: routePath };
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
      end() {
        resolve({ status: this.statusCode, body: null });
      },
    };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

test("default Studio project returns the versioned document contract", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const response = await invoke(router, "GET", "/default");
    assert.equal(response.status, 200);
    assert.equal(response.body.id, PROJECT_ID);
    assert.equal(response.body.revision, 0);
    assert.equal(response.body.document.schemaVersion, 1);
  } finally {
    cleanup();
  }
});

test("Studio project list returns lightweight project summaries", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const response = await invoke(router, "GET", "/");
    assert.equal(response.status, 200);
    assert.equal(response.body.projects.length, 1);
    assert.equal(response.body.projects[0].id, PROJECT_ID);
    assert.equal(response.body.projects[0].name, "My Studio");
    assert.equal(response.body.projects[0].revision, 0);
    assert.equal("document" in response.body.projects[0], false);
  } finally {
    cleanup();
  }
});

test("Studio project creation returns a blank named project that appears in the list", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const created = await invoke(router, "POST", "/", {
      body: { name: "  Holiday launch  " },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.name, "Holiday launch");
    assert.equal(created.body.isDefault, false);
    assert.deepEqual(created.body.document.nodes, []);
    assert.deepEqual(created.body.document.edges, []);

    const listed = await invoke(router, "GET", "/");
    assert.equal(listed.body.projects.length, 2);
    assert.equal(listed.body.projects[0].id, created.body.id);
    assert.equal(listed.body.projects[0].name, "Holiday launch");
  } finally {
    cleanup();
  }
});

test("project update increments revision and rejects stale writers", async () => {
  const { router, cleanup } = loadRoute();
  const document = {
    schemaVersion: 1,
    viewport: { x: 10, y: 20, zoom: 1.25 },
    nodes: [{ id: "generate", kind: "generate", position: { x: 100, y: 200 } }],
    edges: [],
    locked: true,
  };
  try {
    const saved = await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.deepEqual(saved.body.document.viewport, document.viewport);
    assert.equal(saved.body.document.locked, true);

    const stale = await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.currentRevision, 1);
  } finally {
    cleanup();
  }
});

test("user-created Studio projects can be deleted but My Studio is protected", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const created = await invoke(router, "POST", "/", { body: { name: "Temporary shoot" } });
    const deleted = await invoke(router, "DELETE", "/:id", {
      params: { id: created.body.id },
    });
    assert.equal(deleted.status, 204);

    const protectedDefault = await invoke(router, "DELETE", "/:id", {
      params: { id: PROJECT_ID },
    });
    assert.equal(protectedDefault.status, 400);
    assert.match(protectedDefault.body.error, /cannot be deleted/i);
  } finally {
    cleanup();
  }
});

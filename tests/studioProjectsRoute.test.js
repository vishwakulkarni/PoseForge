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

function loadRoute({ registry, createGeneration } = {}) {
  const projects = [row()];
  const findIndex = (id) => projects.findIndex((item) => item.id === id);
  const query = async (sql, params = []) => {
    if (/SELECT id, name, schema_version/.test(sql)) {
      return { rows: projects, rowCount: projects.length };
    }
    if (/SELECT \* FROM studio_projects WHERE is_default/.test(sql)) {
      const found = projects.find((item) => item.is_default);
      return found ? { rows: [found], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/SELECT \* FROM studio_projects WHERE id = \$1/.test(sql)) {
      const found = projects.find((item) => item.id === params[0]);
      return found ? { rows: [found], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/SELECT is_default FROM studio_projects/.test(sql)) {
      const found = projects.find((item) => item.id === params[0]);
      return found ? { rows: [{ is_default: found.is_default }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/UPDATE studio_projects/.test(sql) && /schema_version = \$2/.test(sql)) {
      // PUT /:id — params: [document, schemaVersion, id, expectedRevision]
      const index = findIndex(params[2]);
      if (index < 0 || Number(params[3]) !== Number(projects[index].revision)) return { rows: [], rowCount: 0 };
      projects[index] = row({
        ...projects[index],
        revision: Number(params[3]) + 1,
        document: JSON.parse(params[0]),
        updated_at: "2026-08-17T10:01:00.000Z",
      });
      return { rows: [projects[index]], rowCount: 1 };
    }
    if (/UPDATE studio_projects/.test(sql) && /revision = revision \+ 1/.test(sql)) {
      // Studio pipeline run/assist endpoints — params: [document, id, expectedRevision]
      const index = findIndex(params[1]);
      if (index < 0 || Number(params[2]) !== Number(projects[index].revision)) return { rows: [], rowCount: 0 };
      projects[index] = row({
        ...projects[index],
        revision: Number(params[2]) + 1,
        document: JSON.parse(params[0]),
        updated_at: "2026-08-17T10:01:00.000Z",
      });
      return { rows: [projects[index]], rowCount: 1 };
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
      const found = projects.find((item) => item.id === params[0]);
      return found ? { rows: [{ revision: found.revision }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (/UPDATE studio_projects/.test(sql) && /archived_at = now\(\)/.test(sql)) {
      const index = findIndex(params[0]);
      if (index < 0) return { rows: [], rowCount: 0 };
      const [removed] = projects.splice(index, 1);
      return { rows: [removed], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const poolPath = stub("db/pool.js", { pool: { query } });
  const stubbedPaths = [poolPath];
  if (registry) stubbedPaths.push(stub("engines/index.js", { registry }));
  if (createGeneration) stubbedPaths.push(stub("lib/generationRunner.js", { createGeneration }));
  const routePath = require.resolve(path.join(ROOT, "routes/studio-projects.js"));
  delete require.cache[routePath];
  const router = require(routePath);
  return {
    router,
    cleanup() {
      for (const p of stubbedPaths) delete require.cache[p];
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

const PIPELINE_DOCUMENT = {
  schemaVersion: 1,
  viewport: null,
  nodes: [
    { id: "char-1", kind: "character", position: { x: 0, y: 0 }, imageUrl: "/storage/characters/char-1/photo.png", assetType: "character", assetId: "asset-char-1" },
    { id: "pose-1", kind: "pose", position: { x: 0, y: 200 }, imageUrl: "/storage/pose-library/pose-1.png", assetType: "pose", assetId: "asset-pose-1" },
    { id: "generate-1", kind: "generate", position: { x: 300, y: 100 }, engine: "gemini" },
    { id: "result-1", kind: "result", position: { x: 600, y: 100 } },
  ],
  edges: [
    { id: "e-char", source: "char-1", target: "generate-1", targetHandle: "character" },
    { id: "e-pose", source: "pose-1", target: "generate-1", targetHandle: "pose" },
    { id: "e-result", source: "generate-1", target: "result-1" },
  ],
  locked: false,
};

function stubGeminiRegistry() {
  return {
    gemini: {
      key: "gemini",
      async isReady() { return { ready: true }; },
      async getConfiguredModel() { return "gemini-3-pro-image-preview"; },
      async assistPrompt({ instruction }) { return { text: `Improved: ${instruction}` }; },
    },
  };
}

test("running a single generate node resolves its inputs and marks the connected result done", async () => {
  const { router, cleanup } = loadRoute({
    registry: stubGeminiRegistry(),
    createGeneration: async () => ({ id: "11111111-1111-4111-8111-111111111111", outputPath: "generations/gen-1/output.png" }),
  });
  try {
    await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document: PIPELINE_DOCUMENT },
    });

    const ran = await invoke(router, "POST", "/:id/nodes/:nodeId/run", {
      params: { id: PROJECT_ID, nodeId: "generate-1" },
    });

    assert.equal(ran.status, 200);
    assert.equal(ran.body.generationId, "11111111-1111-4111-8111-111111111111");
    const generateNode = ran.body.project.document.nodes.find((n) => n.id === "generate-1");
    const resultNode = ran.body.project.document.nodes.find((n) => n.id === "result-1");
    assert.equal(generateNode.status, "done");
    assert.equal(generateNode.generationId, "11111111-1111-4111-8111-111111111111");
    assert.equal(resultNode.status, "done");
    assert.equal(resultNode.generationId, "11111111-1111-4111-8111-111111111111");
    assert.match(resultNode.imageUrl, /11111111-1111-4111-8111-111111111111/);
  } finally {
    cleanup();
  }
});

test("running a single generate node reports missing inputs without touching the engine", async () => {
  let called = false;
  const { router, cleanup } = loadRoute({
    registry: stubGeminiRegistry(),
    createGeneration: async () => { called = true; return { id: "unused" }; },
  });
  try {
    const emptyDocument = { ...PIPELINE_DOCUMENT, edges: [] };
    await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document: emptyDocument },
    });

    const ran = await invoke(router, "POST", "/:id/nodes/:nodeId/run", {
      params: { id: PROJECT_ID, nodeId: "generate-1" },
    });

    assert.equal(ran.status, 422);
    assert.match(ran.body.error, /character/i);
    assert.equal(called, false);
  } finally {
    cleanup();
  }
});

test("running a whole pipeline executes waves and persists per-node status", async () => {
  const { router, cleanup } = loadRoute({
    registry: stubGeminiRegistry(),
    createGeneration: async () => ({ id: "22222222-2222-4222-8222-222222222222", outputPath: "generations/gen-2/output.png" }),
  });
  try {
    await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document: PIPELINE_DOCUMENT },
    });

    const ran = await invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID } });

    assert.equal(ran.status, 200);
    assert.deepEqual(Object.keys(ran.body.results), ["generate-1"]);
    assert.equal(ran.body.results["generate-1"].ok, true);
    const generateNode = ran.body.project.document.nodes.find((n) => n.id === "generate-1");
    assert.equal(generateNode.status, "done");
  } finally {
    cleanup();
  }
});

test("assist endpoint refines an assistant node's instruction using the selected engine", async () => {
  const { router, cleanup } = loadRoute({ registry: stubGeminiRegistry() });
  try {
    const assistDocument = {
      ...PIPELINE_DOCUMENT,
      nodes: [...PIPELINE_DOCUMENT.nodes, { id: "assistant-1", kind: "assistant", position: { x: 0, y: 400 }, engine: "gemini" }],
    };
    await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document: assistDocument },
    });

    const assisted = await invoke(router, "POST", "/:id/nodes/:nodeId/assist", {
      params: { id: PROJECT_ID, nodeId: "assistant-1" },
      body: { instruction: "make it moody" },
    });

    assert.equal(assisted.status, 200);
    assert.equal(assisted.body.outputText, "Improved: make it moody");
    const assistantNode = assisted.body.project.document.nodes.find((n) => n.id === "assistant-1");
    assert.equal(assistantNode.status, "done");
    assert.equal(assistantNode.outputText, "Improved: make it moody");
  } finally {
    cleanup();
  }
});

test("assist endpoint rejects an engine that does not support prompt assistance", async () => {
  const { router, cleanup } = loadRoute({
    registry: { comfy: { key: "comfy", async isReady() { return { ready: true }; } } },
  });
  try {
    const assistDocument = {
      ...PIPELINE_DOCUMENT,
      nodes: [...PIPELINE_DOCUMENT.nodes, { id: "assistant-1", kind: "assistant", position: { x: 0, y: 400 }, engine: "comfy" }],
    };
    await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document: assistDocument },
    });

    const assisted = await invoke(router, "POST", "/:id/nodes/:nodeId/assist", {
      params: { id: PROJECT_ID, nodeId: "assistant-1" },
      body: { instruction: "make it moody" },
    });

    assert.equal(assisted.status, 400);
    assert.match(assisted.body.error, /prompt assistance/i);
  } finally {
    cleanup();
  }
});

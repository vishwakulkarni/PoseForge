const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";

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
    name: "Untitled workflow",
    workspace: "advanced",
    template: "blank",
    schema_version: 2,
    revision: 0,
    document: { schemaVersion: 2, template: "blank", viewport: null, nodes: [], edges: [], locked: false },
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-01T10:00:00.000Z",
    ...overrides,
  };
}

/** Loads the router with db/pool, the engine registry and the generation
 * runner replaced, mirroring tests/studioProjectsRoute.test.js so both route
 * suites share one harness shape. `rows` seeds the fake table, including any
 * guided-Studio rows used to prove workspace isolation. */
function loadRoute({ rows = [row()], registry, createAdvancedImageGeneration, createAdvancedVideoGeneration } = {}) {
  const projects = rows.map((item) => ({ ...item }));
  const visible = (workspace) => projects.filter((item) => item.workspace === workspace && !item.archived_at);
  const findIndex = (id, workspace) => projects.findIndex((item) => item.id === id && item.workspace === workspace && !item.archived_at);

  const query = async (sql, params = []) => {
    if (/SELECT id, name, template/.test(sql)) {
      return { rows: visible(params[0]), rowCount: visible(params[0]).length };
    }
    if (/SELECT \* FROM studio_projects WHERE id = \$1 AND workspace = \$2/.test(sql)) {
      const index = findIndex(params[0], params[1]);
      return index < 0 ? { rows: [], rowCount: 0 } : { rows: [projects[index]], rowCount: 1 };
    }
    if (/INSERT INTO studio_projects/.test(sql)) {
      const created = row({
        id: "66666666-6666-4666-8666-666666666666",
        name: params[0],
        schema_version: params[1],
        document: JSON.parse(params[2]),
        workspace: params[3],
        template: params[4],
      });
      projects.unshift(created);
      return { rows: [created], rowCount: 1 };
    }
    if (/UPDATE studio_projects/.test(sql) && /archived_at = now\(\)/.test(sql)) {
      const index = findIndex(params[0], params[1]);
      if (index < 0) return { rows: [], rowCount: 0 };
      projects[index].archived_at = "now";
      return { rows: [projects[index]], rowCount: 1 };
    }
    if (/UPDATE studio_projects/.test(sql) && /revision = revision \+ 1/.test(sql)) {
      // params: [document, schemaVersion, id, expectedRevision, workspace, name?, template?]
      const index = findIndex(params[2], params[4]);
      if (index < 0 || Number(params[3]) !== Number(projects[index].revision)) return { rows: [], rowCount: 0 };
      projects[index] = {
        ...projects[index],
        revision: Number(params[3]) + 1,
        document: JSON.parse(params[0]),
        name: params[5] || projects[index].name,
        template: params[6] || projects[index].template,
        updated_at: "2026-09-01T10:01:00.000Z",
      };
      return { rows: [projects[index]], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  const stubbed = [stub("db/pool.js", { pool: { query } })];
  stubbed.push(stub("lib/advancedRuns.js", memoryRunStore()));
  if (registry) stubbed.push(stub("engines/index.js", { registry }));
  if (createAdvancedImageGeneration || createAdvancedVideoGeneration) {
    stubbed.push(stub("lib/advancedGenerationRunner.js", { createAdvancedImageGeneration, createAdvancedVideoGeneration }));
  }
  const routePath = require.resolve(path.join(ROOT, "routes/advanced-studio-projects.js"));
  delete require.cache[routePath];
  const router = require(routePath);
  return {
    router,
    projects,
    cleanup() {
      for (const item of stubbed) delete require.cache[item];
      delete require.cache[routePath];
    },
  };
}

/** In-memory stand-in for lib/advancedRuns.js (its SQL is covered end to end
 * against PGlite in tests/advancedWorkflowRuns.test.js). Pure helpers come
 * from the real module. */
function memoryRunStore() {
  const realPath = require.resolve(path.join(ROOT, "lib/advancedRuns.js"));
  delete require.cache[realPath];
  const real = require(realPath);
  delete require.cache[realPath];
  const versions = [];
  const runs = new Map();
  const shapeRun = (run) => ({
    ...run,
    version: versions.find((version) => version.id === run.versionId).version,
    outputs: Object.entries(run.nodes).flatMap(([nodeId, outcome]) => (outcome.results || []).map((result) => ({ nodeId, ...result }))),
  });
  return {
    ...real,
    async ensureVersion(projectId, document) {
      const hash = real.recipeHash(document);
      let version = versions.find((entry) => entry.projectId === projectId && entry.hash === hash);
      if (!version) {
        version = { id: `00000000-0000-4000-8000-${String(versions.length + 1).padStart(12, "0")}`, projectId, hash, version: versions.length + 1, document: real.withoutRunState(document) };
        versions.push(version);
      }
      return { id: version.id, version: version.version };
    },
    async findVersionByHash(projectId, document) {
      return versions.find((entry) => entry.projectId === projectId && entry.hash === real.recipeHash(document))?.id || null;
    },
    async listVersions(projectId) {
      return versions.filter((entry) => entry.projectId === projectId).map(({ id, version }) => ({ id, version, runCount: [...runs.values()].filter((run) => run.versionId === id).length }));
    },
    async getVersion(projectId, versionId) {
      const version = versions.find((entry) => entry.projectId === projectId && entry.id === versionId);
      return version ? { id: version.id, version: version.version, document: version.document } : null;
    },
    async createRun({ projectId, versionId, batchId = null, inputs = {}, nodeIds }) {
      const id = `11111111-1111-4111-8111-${String(runs.size + 1).padStart(12, "0")}`;
      runs.set(id, { id, projectId, versionId, batchId, inputs, nodeIds, status: "queued", nodes: Object.fromEntries(nodeIds.map((nodeId) => [nodeId, { status: "queued", results: [] }])) });
      return shapeRun(runs.get(id));
    },
    async getRun(projectId, runId) {
      const run = runs.get(runId);
      return run && run.projectId === projectId ? shapeRun(run) : null;
    },
    async listRuns(projectId, { versionId, batchId } = {}) {
      return [...runs.values()]
        .filter((run) => run.projectId === projectId && (!versionId || run.versionId === versionId) && (!batchId || run.batchId === batchId))
        .reverse()
        .map(shapeRun);
    },
    async markRunStarted(runId) { runs.get(runId).status = "running"; },
    async recordNodeOutcome(runId, nodeId, outcome) { runs.get(runId).nodes[nodeId] = outcome; },
    async finishRun(runId, outcomes) {
      const statuses = Object.values(outcomes);
      const done = statuses.filter((status) => status === "done").length;
      runs.get(runId).status = statuses.length && done === statuses.length ? "completed" : done ? "partial" : "failed";
    },
  };
}

function invoke(router, method, routePath, { params = {}, body = {}, query = {} } = {}) {
  return new Promise((resolve, reject) => {
    const layer = router.stack.find((item) =>
      item.route && item.route.path === routePath && item.route.methods[method.toLowerCase()],
    );
    assert.ok(layer, `${method} ${routePath} route must be registered`);
    const stack = layer.route.stack;
    const handler = stack[stack.length - 1].handle;
    const req = { params, body, query, method, url: routePath };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { resolve({ status: this.statusCode, body: payload }); return this; },
      end() { resolve({ status: this.statusCode, body: null }); },
    };
    Promise.resolve(handler(req, res, reject)).catch(reject);
  });
}

function engineStub(overrides = {}) {
  return {
    key: "gemini",
    label: "Google Gemini",
    models: [{ id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image" }],
    capabilities: { freeform: true, textToImage: true, maxReferenceImages: 5 },
    async isReady() { return { ready: true }; },
    async getConfiguredModel() { return "gemini-3-pro-image-preview"; },
    generateFreeform: async () => ({}),
    ...overrides,
  };
}

function graph(nodeOverrides = {}) {
  return {
    schemaVersion: 2,
    template: "image",
    viewport: null,
    locked: false,
    nodes: [
      { id: "text-1", type: "text", position: { x: 0, y: 0 }, data: { text: "a lighthouse at dusk", mode: "plain" } },
      { id: "gen-1", type: "imageGenerator", position: { x: 500, y: 0 }, data: { engine: "gemini", aspectRatio: "16:9", resolution: "1K", outputs: 1, ...nodeOverrides } },
    ],
    edges: [
      { id: "e1", source: "text-1", sourceHandle: "text", target: "gen-1", targetHandle: "prompt", dataType: "text" },
    ],
  };
}

function videoGraph(nodeOverrides = {}) {
  return {
    schemaVersion: 2,
    template: "video",
    viewport: null,
    locked: false,
    nodes: [
      { id: "text-1", type: "text", position: { x: 0, y: 0 }, data: { text: "a lighthouse at dusk", mode: "plain" } },
      { id: "frame-1", type: "imageInput", position: { x: 0, y: 300 }, data: { imageUrl: "/storage/advanced/start.png" } },
      { id: "video-1", type: "videoGenerator", position: { x: 500, y: 0 }, data: { engine: "fal-video", model: "video-model", duration: 10, aspectRatio: "9:16", resolution: "1080p", sound: true, outputs: 1, ...nodeOverrides } },
    ],
    edges: [
      { id: "e1", source: "text-1", sourceHandle: "text", target: "video-1", targetHandle: "prompt", dataType: "text" },
      { id: "e2", source: "frame-1", sourceHandle: "image", target: "video-1", targetHandle: "startFrame", dataType: "image" },
    ],
  };
}

test("the project list only returns Advanced Studio projects", async () => {
  const { router, cleanup } = loadRoute({
    rows: [
      row(),
      row({ id: "77777777-7777-4777-8777-777777777777", workspace: "studio", name: "My Studio" }),
    ],
  });
  try {
    const response = await invoke(router, "GET", "/");
    assert.equal(response.status, 200);
    assert.equal(response.body.projects.length, 1);
    assert.equal(response.body.projects[0].id, PROJECT_ID);
    assert.equal(response.body.projects[0].workspace, "advanced");
    assert.equal("document" in response.body.projects[0], false);
  } finally {
    cleanup();
  }
});

test("a guided Studio project cannot be opened through the Advanced Studio route", async () => {
  const guidedId = "77777777-7777-4777-8777-777777777777";
  const { router, cleanup } = loadRoute({ rows: [row({ id: guidedId, workspace: "studio" })] });
  try {
    const response = await invoke(router, "GET", "/:id", { params: { id: guidedId } });
    assert.equal(response.status, 404);
  } finally {
    cleanup();
  }
});

test("creating a project from the image template seeds prompt and generator nodes", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const created = await invoke(router, "POST", "/", { body: { name: "  Poster run  ", template: "image" } });
    assert.equal(created.status, 201);
    assert.equal(created.body.name, "Poster run");
    assert.equal(created.body.workspace, "advanced");
    assert.equal(created.body.template, "image");
    assert.deepEqual(created.body.document.nodes.map((node) => node.type), ["text", "imageGenerator"]);
  } finally {
    cleanup();
  }
});

test("creating a blank project opens an empty canvas", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const created = await invoke(router, "POST", "/", { body: { template: "blank" } });
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.document.nodes, []);
    assert.deepEqual(created.body.document.edges, []);
  } finally {
    cleanup();
  }
});

test("creating a storyboard project seeds ordered scene groups", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const created = await invoke(router, "POST", "/", { body: { template: "storyboard" } });
    const groups = created.body.document.nodes.filter((node) => node.type === "group");
    assert.equal(groups.length, 3);
    assert.deepEqual(groups.map((group) => group.label), ["Scene 1", "Scene 2", "Scene 3"]);
  } finally {
    cleanup();
  }
});

test("saving increments the revision and rejects a stale writer", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const saved = await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document: graph(), name: "Lighthouse" },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.revision, 1);
    assert.equal(saved.body.name, "Lighthouse");
    assert.equal(saved.body.document.nodes.length, 2);

    const stale = await invoke(router, "PUT", "/:id", {
      params: { id: PROJECT_ID },
      body: { expectedRevision: 0, document: graph() },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.currentRevision, 1);
  } finally {
    cleanup();
  }
});

test("saving restores the viewport and node geometry on reload", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const document = { ...graph(), viewport: { x: -120, y: 40, zoom: 0.75 } };
    document.nodes[0].width = 420;
    document.nodes[0].height = 260;
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document } });

    const reopened = await invoke(router, "GET", "/:id", { params: { id: PROJECT_ID } });
    assert.deepEqual(reopened.body.document.viewport, { x: -120, y: 40, zoom: 0.75 });
    assert.equal(reopened.body.document.nodes[0].width, 420);
    assert.equal(reopened.body.document.nodes[0].height, 260);
  } finally {
    cleanup();
  }
});

test("a project is soft deleted and disappears from the list", async () => {
  const { router, cleanup } = loadRoute();
  try {
    const removed = await invoke(router, "DELETE", "/:id", { params: { id: PROJECT_ID } });
    assert.equal(removed.status, 204);
    const listed = await invoke(router, "GET", "/");
    assert.equal(listed.body.projects.length, 0);
  } finally {
    cleanup();
  }
});

test("running an image generator node builds a request from its connected inputs", async () => {
  const calls = [];
  const { router, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async (request) => {
      calls.push(request);
      return { id: "11111111-1111-4111-8111-111111111111", imageUrl: "/storage/generations/11111111-1111-4111-8111-111111111111/output.png" };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph() } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].prompt, "a lighthouse at dusk");
    assert.equal(calls[0].engineKey, "gemini");
    assert.equal(calls[0].engineModel, "gemini-3-pro-image-preview");
    assert.equal(calls[0].aspectRatio, "16:9");
    assert.deepEqual(calls[0].referencePaths, []);

    const node = response.body.project.document.nodes.find((item) => item.id === "gen-1");
    assert.equal(node.data.status, "done");
    assert.equal(node.data.results.length, 1);
    assert.equal(node.data.results[0].imageUrl, "/storage/generations/11111111-1111-4111-8111-111111111111/output.png");
    assert.equal(node.data.activeResultIndex, 0);
  } finally {
    cleanup();
  }
});

test("the requested number of outputs produces that many results", async () => {
  let counter = 0;
  const { router, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => {
      counter += 1;
      return { id: `1111111${counter}-1111-4111-8111-111111111111`, imageUrl: `/storage/out-${counter}.png` };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph({ outputs: 3 }) } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    const node = response.body.project.document.nodes.find((item) => item.id === "gen-1");
    assert.equal(counter, 3);
    assert.equal(node.data.results.length, 3);
    assert.equal(node.data.activeResultIndex, 2);
  } finally {
    cleanup();
  }
});

// Regression: the run used to pin its save to the revision read before the
// generation. Autosave bumps the revision while a generation runs, so a
// perfectly good image was rejected with a "changed in another tab" conflict
// and discarded even though the file was already on disk.
test("a generation survives an autosave that lands while it is running", async () => {
  const { router, projects, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => {
      // Simulate the client's autosave landing mid-generation.
      const project = projects.find((item) => item.id === PROJECT_ID);
      project.revision = Number(project.revision) + 1;
      return { id: "33333333-3333-4333-8333-333333333333", imageUrl: "/storage/generations/33333333-3333-4333-8333-333333333333/output.png" };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph() } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });

    assert.equal(response.status, 200);
    const node = response.body.project.document.nodes.find((item) => item.id === "gen-1");
    assert.equal(node.data.status, "done");
    assert.equal(node.data.results.length, 1);
    assert.equal(node.data.results[0].imageUrl, "/storage/generations/33333333-3333-4333-8333-333333333333/output.png");
  } finally {
    cleanup();
  }
});

test("edits made to other nodes during a generation are preserved", async () => {
  let editedDuringRun = false;
  const { router, projects, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => {
      // The user keeps typing in the prompt node while the image renders.
      const project = projects.find((item) => item.id === PROJECT_ID);
      const document = JSON.parse(JSON.stringify(project.document));
      document.nodes.find((item) => item.id === "text-1").data.text = "an edit made mid-generation";
      project.document = document;
      project.revision = Number(project.revision) + 1;
      editedDuringRun = true;
      return { id: "44444444-4444-4444-8444-444444444444", imageUrl: "/storage/out.png" };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph() } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });

    assert.equal(editedDuringRun, true);
    assert.equal(response.status, 200);
    const document = response.body.project.document;
    assert.equal(document.nodes.find((item) => item.id === "text-1").data.text, "an edit made mid-generation");
    assert.equal(document.nodes.find((item) => item.id === "gen-1").data.results.length, 1);
  } finally {
    cleanup();
  }
});

test("a run whose node was deleted mid-generation does not fail the request", async () => {
  const { router, projects, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => {
      const project = projects.find((item) => item.id === PROJECT_ID);
      const document = JSON.parse(JSON.stringify(project.document));
      document.nodes = document.nodes.filter((item) => item.id !== "gen-1");
      document.edges = [];
      project.document = document;
      project.revision = Number(project.revision) + 1;
      return { id: "55555555-5555-4555-8555-555555555555", imageUrl: "/storage/out.png" };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph() } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    assert.equal(response.status, 200);
    assert.equal(response.body.project.document.nodes.some((item) => item.id === "gen-1"), false);
  } finally {
    cleanup();
  }
});

test("a node with no prompt fails validation without calling the engine", async () => {
  let called = false;
  const { router, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => { called = true; return { id: "x", imageUrl: "/storage/x.png" }; },
  });
  try {
    const document = graph();
    document.nodes[0].data.text = "";
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });

    assert.equal(called, false);
    assert.equal(response.status, 422);
    assert.match(response.body.error, /prompt/i);
    const node = response.body.project.document.nodes.find((item) => item.id === "gen-1");
    assert.equal(node.data.status, "error");
    assert.match(node.data.error, /prompt/i);
  } finally {
    cleanup();
  }
});

test("an engine that is not ready reports its reason on the node and leaves the rest of the project intact", async () => {
  const { router, cleanup } = loadRoute({
    registry: { gemini: engineStub({ isReady: async () => ({ ready: false, reason: "No Gemini API key configured" }) }) },
    createAdvancedImageGeneration: async () => { throw new Error("should not run"); },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph() } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    assert.equal(response.status, 422);
    assert.match(response.body.error, /No Gemini API key/);
    const promptNode = response.body.project.document.nodes.find((item) => item.id === "text-1");
    assert.equal(promptNode.data.text, "a lighthouse at dusk");
  } finally {
    cleanup();
  }
});

test("a provider failure is recorded on the node and the node can be retried", async () => {
  let attempt = 0;
  const { router, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("Provider rejected the request.");
      return { id: "22222222-2222-4222-8222-222222222222", imageUrl: "/storage/retry.png" };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph() } });
    const failed = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    assert.equal(failed.status, 422);
    assert.equal(failed.body.error, "Provider rejected the request.");

    const retried = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    assert.equal(retried.status, 200);
    const node = retried.body.project.document.nodes.find((item) => item.id === "gen-1");
    assert.equal(node.data.status, "done");
    assert.equal(node.data.error, undefined);
  } finally {
    cleanup();
  }
});

test("a second run is refused while the node is already generating", async () => {
  let releaseGeneration = () => {};
  const started = new Promise((resolve) => { releaseGeneration = resolve; });
  const { router, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => {
      await started;
      return { id: "66666666-6666-4666-8666-666666666666", imageUrl: "/storage/x.png" };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: graph() } });
    // The first run is in flight with its generation parked; a second must be
    // refused rather than queueing a duplicate.
    const first = invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    await new Promise((resolve) => setImmediate(resolve));
    const second = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    assert.equal(second.status, 409);
    assert.match(second.body.error, /already generating/i);

    releaseGeneration();
    assert.equal((await first).status, 200);

    // Once it has finished, the node can be run again.
    const third = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    assert.equal(third.status, 200);
  } finally {
    cleanup();
  }
});

test("connected image inputs are resolved in edge order and passed as references", async () => {
  const { resolveNodeInputs } = require("../routes/advanced-studio-projects");
  const document = {
    nodes: [
      { id: "t", type: "text", data: { text: "prompt text" } },
      { id: "i1", type: "imageInput", data: { imageUrl: "/storage/advanced/a.png" } },
      { id: "i2", type: "imageInput", data: { imageUrl: "/storage/advanced/b.png" } },
      { id: "prev", type: "imageGenerator", data: { results: [{ imageUrl: "/storage/generations/prev/output.png" }], activeResultIndex: 0 } },
      { id: "gen", type: "imageGenerator", data: {} },
    ],
    edges: [
      { id: "e1", source: "t", target: "gen", targetHandle: "prompt" },
      { id: "e2", source: "i2", target: "gen", targetHandle: "image" },
      { id: "e3", source: "i1", target: "gen", targetHandle: "image" },
      { id: "e4", source: "prev", target: "gen", targetHandle: "image" },
    ],
  };
  const resolved = resolveNodeInputs(document, "gen");
  assert.equal(resolved.prompt, "prompt text");
  assert.deepEqual(resolved.imageUrls, [
    "/storage/advanced/b.png",
    "/storage/advanced/a.png",
    "/storage/generations/prev/output.png",
  ]);
});

test("reference video and audio handles resolve media inputs and earlier video results", () => {
  const { resolveNodeInputs } = require("../routes/advanced-studio-projects");
  const document = {
    nodes: [
      { id: "v", type: "videoInput", data: { mediaUrl: "/storage/advanced/p/move.mp4" } },
      { id: "a", type: "audioInput", data: { mediaUrl: "/storage/advanced/p/beat.mp3" } },
      { id: "prev", type: "videoGenerator", data: { results: [{ videoUrl: "/storage/generations/prev/output.mp4" }], activeResultIndex: 0 } },
      { id: "gen", type: "videoGenerator", data: {} },
    ],
    edges: [
      { id: "e1", source: "v", target: "gen", targetHandle: "referenceVideo" },
      { id: "e2", source: "prev", target: "gen", targetHandle: "referenceVideo" },
      { id: "e3", source: "a", target: "gen", targetHandle: "referenceAudio" },
      { id: "e4", source: "v", target: "gen", targetHandle: "referenceAudio" },
    ],
  };
  const resolved = resolveNodeInputs(document, "gen");
  assert.deepEqual(resolved.referenceVideoUrls, ["/storage/advanced/p/move.mp4", "/storage/generations/prev/output.mp4"]);
  assert.deepEqual(resolved.referenceAudioUrls, ["/storage/advanced/p/beat.mp3"]);
  assert.deepEqual(resolved.imageUrls, []);
});

test("running a video node coerces settings and attaches an MP4 result", async () => {
  const calls = [];
  const videoModel = {
    id: "video-model",
    label: "Video Model",
    inputs: ["prompt", "startFrame"],
    durations: [5],
    defaultDuration: 5,
    aspectRatios: ["16:9"],
    defaultAspectRatio: "16:9",
    resolutions: ["720p"],
    defaultResolution: "720p",
    sound: false,
  };
  const videoEngine = {
    key: "fal-video",
    label: "fal.ai Video",
    async isReady() { return { ready: true }; },
    modelDefinition(id) { return id === videoModel.id ? videoModel : null; },
    generateVideo: async () => ({}),
  };
  const { router, cleanup } = loadRoute({
    registry: { "fal-video": videoEngine },
    createAdvancedVideoGeneration: async (request) => {
      calls.push(request);
      return { id: "55555555-5555-4555-8555-555555555555", videoUrl: "/storage/generations/55555555-5555-4555-8555-555555555555/output.mp4" };
    },
  });
  try {
    await invoke(router, "PUT", "/:id", { params: { id: PROJECT_ID }, body: { expectedRevision: 0, document: videoGraph() } });
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "video-1" } });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].duration, 5);
    assert.equal(calls[0].aspectRatio, "16:9");
    assert.equal(calls[0].resolution, "720p");
    assert.equal(calls[0].sound, false);
    assert.match(calls[0].startFramePath, /advanced\/start\.png$/);
    const node = response.body.project.document.nodes.find((item) => item.id === "video-1");
    assert.equal(node.data.status, "done");
    assert.match(node.data.results[0].videoUrl, /output\.mp4$/);
  } finally {
    cleanup();
  }
});

/** A prompt feeding `first`, whose image feeds `second` as a reference. */
function chainedGraph() {
  const base = graph();
  return {
    ...base,
    nodes: [
      ...base.nodes,
      { id: "gen-2", type: "imageGenerator", position: { x: 1000, y: 0 }, data: { engine: "gemini", outputs: 1 } },
    ],
    edges: [
      ...base.edges,
      { id: "e2", source: "text-1", sourceHandle: "text", target: "gen-2", targetHandle: "prompt", dataType: "text" },
      { id: "e3", source: "gen-1", sourceHandle: "image", target: "gen-2", targetHandle: "image", dataType: "image" },
    ],
  };
}

async function settled(router) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await invoke(router, "GET", "/:id", { params: { id: PROJECT_ID } });
    if (!response.body.activeRun) return response.body;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("workflow run did not finish");
}

test("a workflow run starts immediately and chains generator outputs in dependency order", async () => {
  const calls = [];
  const { router, cleanup } = loadRoute({
    rows: [row({ document: chainedGraph() })],
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async (input) => {
      calls.push(input.referencePaths);
      const index = calls.length;
      return { id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${index}`, imageUrl: `/storage/generations/${index}/output.png` };
    },
  });
  try {
    const started = await invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID } });
    assert.equal(started.status, 202);
    assert.deepEqual(started.body.waves, [["gen-1"], ["gen-2"]]);

    const project = await settled(router);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], []);
    assert.equal(calls[1].length, 1);
    assert.match(calls[1][0], /generations[/\\]1[/\\]output\.png$/, "the second node received the first node's image");
    const statuses = Object.fromEntries(project.document.nodes.filter((node) => node.type === "imageGenerator").map((node) => [node.id, node.data.status]));
    assert.deepEqual(statuses, { "gen-1": "done", "gen-2": "done" });
  } finally {
    cleanup();
  }
});

test("a failed node skips the nodes downstream of it", async () => {
  let calls = 0;
  const { router, cleanup } = loadRoute({
    rows: [row({ document: chainedGraph() })],
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => {
      calls += 1;
      throw new Error("Provider quota exhausted.");
    },
  });
  try {
    assert.equal((await invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID } })).status, 202);
    const project = await settled(router);
    assert.equal(calls, 1, "the downstream node never called the provider");
    const byId = Object.fromEntries(project.document.nodes.map((node) => [node.id, node.data]));
    assert.equal(byId["gen-1"].error, "Provider quota exhausted.");
    assert.equal(byId["gen-2"].status, "error");
    assert.equal(byId["gen-2"].error, "Upstream node gen-1 failed.");
  } finally {
    cleanup();
  }
});

test("a workflow run can be limited to chosen nodes and refuses unknown ones", async () => {
  const calls = [];
  const { router, cleanup } = loadRoute({
    rows: [row({ document: chainedGraph() })],
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async (input) => {
      calls.push(input);
      return { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000009", imageUrl: "/storage/generations/9/output.png" };
    },
  });
  try {
    const started = await invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID }, body: { nodeIds: ["gen-2"] } });
    assert.deepEqual(started.body.started, ["gen-2"]);
    await settled(router);
    assert.equal(calls.length, 1);

    await assert.rejects(
      invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID }, body: { nodeIds: ["text-1"] } }),
      (error) => error.statusCode === 422 && /Not a generator node/.test(error.message),
    );
  } finally {
    cleanup();
  }
});

/** The image graph with its prompt turned into a template. */
function templatedGraph(text = "a {{subject}} at {{time}}") {
  const base = graph();
  return { ...base, nodes: base.nodes.map((node) => (node.type === "text" ? { ...node, data: { ...node.data, text } } : node)) };
}

async function settledRuns(router) {
  await settled(router);
  return (await invoke(router, "GET", "/:id/runs", { params: { id: PROJECT_ID }, body: {} })).body.runs;
}

test("a project lists the inputs its workflow declares", async () => {
  const { router, cleanup } = loadRoute({ rows: [row({ document: templatedGraph() })] });
  try {
    const response = await invoke(router, "GET", "/:id", { params: { id: PROJECT_ID } });
    assert.deepEqual(response.body.inputs.map((input) => input.name), ["subject", "time"]);
  } finally {
    cleanup();
  }
});

test("run inputs fill prompt placeholders without changing the saved workflow", async () => {
  const prompts = [];
  const { router, projects, cleanup } = loadRoute({
    rows: [row({ document: templatedGraph() })],
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async (input) => {
      prompts.push(input.prompt);
      return { id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", imageUrl: "/storage/generations/1/output.png" };
    },
  });
  try {
    const started = await invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID }, body: { inputs: { subject: "lighthouse", time: "dawn" } } });
    assert.equal(started.status, 202);
    assert.equal(started.body.version, 1);
    const [run] = await settledRuns(router);
    assert.deepEqual(prompts, ["a lighthouse at dawn"]);
    assert.equal(run.status, "completed");
    assert.deepEqual(run.inputs, { subject: "lighthouse", time: "dawn" });
    assert.equal(run.outputs[0].imageUrl, "/storage/generations/1/output.png");
    assert.equal(projects[0].document.nodes.find((node) => node.type === "text").data.text, "a {{subject}} at {{time}}");
  } finally {
    cleanup();
  }
});

test("unknown and missing inputs are refused before anything runs", async () => {
  let calls = 0;
  const { router, cleanup } = loadRoute({
    rows: [row({ document: templatedGraph() })],
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async () => { calls += 1; return {}; },
  });
  try {
    await assert.rejects(
      invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID }, body: { inputs: { subjct: "x", time: "dawn" } } }),
      (error) => error.statusCode === 422 && /Unknown input subjct/.test(error.message),
    );
    await assert.rejects(
      invoke(router, "POST", "/:id/run", { params: { id: PROJECT_ID }, body: { inputs: { subject: "x" } } }),
      (error) => error.statusCode === 422 && /Missing value for input time/.test(error.message),
    );
    await assert.rejects(
      invoke(router, "POST", "/:id/batch", { params: { id: PROJECT_ID }, body: { rows: [{ subject: "a", time: "b" }, { subject: "a" }] } }),
      (error) => error.statusCode === 422 && /^Row 2:/.test(error.message),
    );
    assert.equal(calls, 0);
  } finally {
    cleanup();
  }
});

test("a batch runs every row of the same node in parallel, each with its own result", async () => {
  const prompts = [];
  let inFlight = 0;
  let peak = 0;
  const { router, projects, cleanup } = loadRoute({
    rows: [row({ document: templatedGraph() })],
    registry: { gemini: engineStub() },
    createAdvancedImageGeneration: async (input) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      prompts.push(input.prompt);
      const index = prompts.length;
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return { id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${index}`, imageUrl: `/storage/generations/${index}/output.png` };
    },
  });
  try {
    const started = await invoke(router, "POST", "/:id/batch", {
      params: { id: PROJECT_ID },
      body: { rows: [{ subject: "fox", time: "noon" }, { subject: "owl", time: "night" }, { subject: "cat", time: "dusk" }] },
    });
    assert.equal(started.status, 202);
    assert.equal(started.body.runs.length, 3);
    const runs = await settledRuns(router);
    assert.equal(runs.length, 3);
    assert.ok(runs.every((run) => run.batchId === started.body.batchId && run.status === "completed" && run.version === 1));
    assert.deepEqual(prompts.sort(), ["a cat at dusk", "a fox at noon", "a owl at night"]);
    assert.ok(peak > 1, "rows of the same node generate concurrently");
    assert.equal(projects[0].document.nodes.find((node) => node.id === "gen-1").data.results.length, 3, "every row's result reaches the canvas");
  } finally {
    cleanup();
  }
});

test("versions follow the recipe: layout changes reuse a version, setting changes make a new one", async () => {
  const { router, projects, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    rows: [row({ document: graph() })],
    createAdvancedImageGeneration: async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", imageUrl: "/storage/generations/1/output.png" }),
  });
  const runOnce = async () => {
    const response = await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    assert.equal(response.status, 200);
    return response.body;
  };
  const edit = (change) => {
    const document = projects[0].document;
    document.nodes = document.nodes.map((node) => (node.id === "gen-1" ? change(node) : node));
  };
  try {
    const first = await runOnce();
    assert.ok(first.runId);
    edit((node) => ({ ...node, position: { x: 900, y: 300 } }));
    await runOnce();
    edit((node) => ({ ...node, data: { ...node.data, aspectRatio: "1:1" } }));
    await runOnce();

    const versions = (await invoke(router, "GET", "/:id/versions", { params: { id: PROJECT_ID } })).body;
    assert.deepEqual(versions.versions.map((version) => [version.version, version.runCount]), [[1, 2], [2, 1]]);
    assert.equal(versions.currentVersionId, versions.versions[1].id, "the canvas matches the latest version");

    const v1Runs = (await invoke(router, "GET", "/:id/runs", { params: { id: PROJECT_ID }, body: {} })).body.runs.filter((run) => run.version === 1);
    assert.equal(v1Runs.length, 2);
  } finally {
    cleanup();
  }
});

test("restoring a version brings back its settings and keeps current results", async () => {
  const { router, projects, cleanup } = loadRoute({
    registry: { gemini: engineStub() },
    rows: [row({ document: graph() })],
    createAdvancedImageGeneration: async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-000000000001", imageUrl: "/storage/generations/1/output.png" }),
  });
  try {
    await invoke(router, "POST", "/:id/nodes/:nodeId/run", { params: { id: PROJECT_ID, nodeId: "gen-1" } });
    const [v1] = (await invoke(router, "GET", "/:id/versions", { params: { id: PROJECT_ID } })).body.versions;
    const document = projects[0].document;
    document.nodes.find((node) => node.id === "gen-1").data.aspectRatio = "9:16";

    const restored = await invoke(router, "POST", "/:id/versions/:versionId/restore", {
      params: { id: PROJECT_ID, versionId: v1.id },
      body: { expectedRevision: projects[0].revision },
    });
    assert.equal(restored.status, 200);
    const generator = restored.body.document.nodes.find((node) => node.id === "gen-1");
    assert.equal(generator.data.aspectRatio, "16:9");
    assert.equal(generator.data.results.length, 1, "restoring never hides an output");

    const stale = await invoke(router, "POST", "/:id/versions/:versionId/restore", {
      params: { id: PROJECT_ID, versionId: v1.id },
      body: { expectedRevision: 0 },
    });
    assert.equal(stale.status, 409);
  } finally {
    cleanup();
  }
});

/**
 * Sharing workflows as one JSON file: export → preview → import through the
 * real app and MCP endpoint, plus the import rules for untrusted files and
 * for engines the importer has not set up.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");

const { createApplication } = require("../server");
const { runMigrations } = require("../db/migrate");
const { pool } = require("../db/pool");
const engines = require("../engines");
const { applyReplacements, compatibilityReport, parseShareFile, SHARE_FORMAT } = require("../lib/advancedWorkflowShare");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const ROOT = path.join(__dirname, "..");
const fakeEngine = {
  key: "test-image",
  label: "Test image engine",
  models: [{ id: "test-model", label: "Test model" }, { id: "test-model-2", label: "Test model 2" }],
  capabilities: { freeform: true, textToImage: true, maxReferenceImages: 6 },
  imageSettings: {
    aspectRatios: ["1:1", "16:9"],
    resolutions: [{ id: "1K", label: "1K", quality: "medium" }],
    defaultResolution: "1K",
  },
  async isReady() { return { ready: true }; },
  async generateFreeform({ outputPath }) {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await sharp({ create: { width: 32, height: 32, channels: 3, background: "#f5a742" } }).png().toFile(outputPath);
    return { usage: { estimatedCostUsd: 0.05 } };
  },
};

let app;
let client;
let scratch;
const cleanupPaths = [];

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

async function callError(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true, "expected the tool to fail");
  return result.content[0].text;
}

async function png(color, size = 48) {
  return sharp({ create: { width: size, height: size, channels: 3, background: color } }).png().toBuffer();
}

function shareFile(document, assets = {}, extra = {}) {
  return JSON.stringify({ format: SHARE_FORMAT, formatVersion: 1, name: "Shared", document, assets, ...extra });
}

async function projectCount() {
  return (await pool.query("SELECT COUNT(*)::int AS n FROM studio_projects")).rows[0].n;
}

test.before(async () => {
  delete process.env.HOST;
  delete process.env.POSEFORGE_MCP_TOKEN;
  await runMigrations();
  engines.advancedRegistry["test-image"] = fakeEngine;
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-share-"));
  cleanupPaths.push(scratch);
  app = http.createServer(createApplication((req, res) => res.status(404).end()));
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  client = new Client({ name: "share-test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${app.address().port}/mcp`)));
});

test.after(async () => {
  await client?.close();
  delete engines.advancedRegistry["test-image"];
  await new Promise((resolve) => app.close(resolve));
  for (const target of cleanupPaths) fs.rmSync(target, { recursive: true, force: true });
});

test("a workflow round-trips through one file, keeping engines the importer has not set up", async () => {
  const photoPath = path.join(scratch, "person.png");
  await fs.promises.writeFile(photoPath, await png("#22aa66", 64));
  const character = await call("create_character", { name: "Share Person", filePath: photoPath });

  const workflow = await call("create_workflow", { name: "Paris reel", template: "blank" });
  cleanupPaths.push(path.join(ROOT, "storage", "advanced", workflow.id));
  const uploadPath = path.join(scratch, "style.png");
  await fs.promises.writeFile(uploadPath, await png("#4f8cff"));
  const upload = await call("upload_workflow_image", { id: workflow.id, filePath: uploadPath });

  const document = {
    nodes: [
      { id: "prompt", type: "text", position: { x: 0, y: 0 }, data: { text: "{{person}} in {{city}} at dusk" }, label: "Prompt" },
      { id: "who", type: "imageInput", position: { x: 0, y: 300 }, data: { inputName: "subject", characterId: character.id } },
      { id: "style", type: "imageInput", position: { x: 0, y: 600 }, data: { imageUrl: upload.url, fileName: "style.png" } },
      { id: "still", type: "imageGenerator", position: { x: 500, y: 0 }, data: { engine: "test-image", model: "test-model", aspectRatio: "16:9" }, label: "Still" },
      { id: "clip", type: "videoGenerator", position: { x: 1000, y: 0 }, data: { engine: "higgsfield-video", model: "bytedance/seedance-2.5/image-to-video", duration: 10, resolution: "720p" }, label: "Clip" },
      { id: "old", type: "imageGenerator", position: { x: 500, y: 400 }, data: { engine: "antigravity", model: "gemini-3.6-flash-high", aspectRatio: "16:9" }, label: "Old engine" },
    ],
    edges: [
      { id: "e1", source: "prompt", sourceHandle: "text", target: "still", targetHandle: "prompt", dataType: "text" },
      { id: "e2", source: "who", sourceHandle: "image", target: "still", targetHandle: "image", dataType: "image" },
      { id: "e3", source: "style", sourceHandle: "image", target: "still", targetHandle: "image", dataType: "image" },
      { id: "e4", source: "prompt", sourceHandle: "text", target: "clip", targetHandle: "prompt", dataType: "text" },
      { id: "e5", source: "still", sourceHandle: "image", target: "clip", targetHandle: "startFrame", dataType: "image" },
      { id: "e6", source: "prompt", sourceHandle: "text", target: "old", targetHandle: "prompt", dataType: "text" },
    ],
  };
  const saved = await call("update_workflow", { id: workflow.id, expectedRevision: workflow.revision, document });
  await call("run_workflow", { id: workflow.id, nodeIds: ["still"], inputs: { person: "Ana", city: "Paris" } });
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { runs } = await call("list_runs", { id: workflow.id });
    if (runs[0]?.status === "completed") break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const ran = await call("get_workflow", { id: workflow.id });
  assert.ok(ran.revision > saved.revision);
  assert.equal(ran.document.nodes.find((node) => node.id === "still").data.results.length, 1, "the source has an output to leave out");

  // Export: outputs and local ids stay home; both input photos travel.
  const filePath = path.join(scratch, "paris.poseforge.json");
  const exported = await call("export_workflow", { id: workflow.id, filePath });
  assert.equal(exported.embeddedFiles, 2);
  assert.deepEqual(exported.exportWarnings, []);
  const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(file.format, SHARE_FORMAT);
  const fileNode = (id) => file.document.nodes.find((node) => node.id === id);
  assert.equal(fileNode("still").data.results, undefined);
  assert.equal(fileNode("still").data.status, undefined);
  assert.equal(fileNode("who").data.characterId, undefined);
  assert.equal(fileNode("who").data.inputName, "subject");
  assert.ok(file.assets[fileNode("who").data.assetRef].data, "the character's photo is embedded");
  assert.ok(file.assets[fileNode("style").data.assetRef].data, "the uploaded image is embedded");
  assert.ok(!JSON.stringify(file).includes("/storage/"), "no local file locations leave the machine");
  assert.deepEqual(file.requirements.map((entry) => entry.engine).sort(), ["antigravity", "higgsfield-video", "test-image"]);

  // Preview: a dry run that reports each generator against this machine,
  // here one without a Higgsfield key.
  const higgsfield = engines.advancedRegistry["higgsfield-video"];
  const realIsReady = higgsfield.isReady;
  higgsfield.isReady = async () => ({ ready: false, reason: "Add a Higgsfield API key in Settings." });
  const before = await projectCount();
  const preview = await call("preview_workflow_import", { filePath });
  assert.equal(await projectCount(), before, "preview creates nothing");
  const status = Object.fromEntries(preview.report.generators.map((row) => [row.nodeId, row]));
  assert.equal(status.still.status, "ready");
  assert.equal(status.clip.status, "needs-setup");
  assert.equal(status.clip.reason, "Add a Higgsfield API key in Settings.");
  assert.equal(status.clip.engineLabel, "Higgsfield Video");
  assert.equal(status.old.status, "unknown-engine");
  assert.ok(status.old.alternatives.some((option) => option.engine === "test-image" && option.model === "test-model"));
  assert.equal(status.still.alternatives[0].model, "test-model-2", "the same engine's other models come first");
  assert.ok(!status.still.alternatives.some((option) => option.engine === "test-image" && option.model === "test-model"), "the current model is not an alternative");
  assert.ok(!status.clip.alternatives.some((option) => option.engine === "higgsfield-video"), "a provider that is not set up is never offered");
  assert.deepEqual(preview.inputs.map((input) => input.name).sort(), ["city", "person", "subject"]);

  // Import: the dead engine is swapped on request, Higgsfield is kept as the author chose.
  const imported = await call("import_workflow", { filePath, name: "Paris copy", replacements: { old: { engine: "test-image", model: "test-model-2" } } });
  cleanupPaths.push(path.join(ROOT, "storage", "advanced", imported.id));
  assert.equal(imported.name, "Paris copy");
  const node = (id) => imported.document.nodes.find((entry) => entry.id === id);
  assert.equal(node("prompt").data.text, "{{person}} in {{city}} at dusk");
  assert.deepEqual([node("clip").data.engine, node("clip").data.model, node("clip").data.duration], ["higgsfield-video", "bytedance/seedance-2.5/image-to-video", 10]);
  assert.deepEqual([node("old").data.engine, node("old").data.model, node("old").data.aspectRatio], ["test-image", "test-model-2", "16:9"]);
  assert.equal(node("still").data.results, undefined);
  for (const id of ["who", "style"]) {
    const url = node(id).data.imageUrl;
    assert.ok(url.startsWith(`/storage/advanced/${imported.id}/`), `${id} is stored under the new project`);
    const meta = await sharp(path.join(ROOT, "storage", url.slice("/storage/".length))).metadata();
    assert.equal(meta.format, "png");
  }
  assert.equal(imported.document.edges.length, 6);
  assert.equal(imported.report.generators.find((row) => row.nodeId === "old").status, "ready");
  assert.equal(imported.report.generators.find((row) => row.nodeId === "clip").status, "needs-setup");
  higgsfield.isReady = realIsReady;

  // The copy runs.
  await call("run_workflow", { id: imported.id, nodeIds: ["still", "old"], inputs: { person: "Ben", city: "Rome" } });
  let runs = [];
  for (let attempt = 0; attempt < 200; attempt += 1) {
    ({ runs } = await call("list_runs", { id: imported.id }));
    if (runs[0] && ["completed", "partial", "failed"].includes(runs[0].status)) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.equal(runs[0].status, "completed");

  for (const run of [...runs, ...(await call("list_runs", { id: workflow.id })).runs]) {
    for (const output of run.outputs) cleanupPaths.push(path.join(ROOT, "storage", "generations", output.generationId));
  }
  await call("delete_character", { id: character.id });
});

test("import rejects files that are not PoseForge workflows", async () => {
  const notJson = path.join(scratch, "bad.json");
  fs.writeFileSync(notJson, "{ nope");
  assert.match(await callError("preview_workflow_import", { filePath: notJson }), /not valid JSON/);
  const wrongFormat = path.join(scratch, "other.json");
  fs.writeFileSync(wrongFormat, JSON.stringify({ format: "comfyui.workflow", nodes: [] }));
  const before = await projectCount();
  assert.match(await callError("import_workflow", { filePath: wrongFormat }), /not a PoseForge workflow file/);
  assert.equal(await projectCount(), before);
});

test("an imported file cannot point inputs at local files or smuggle unsafe assets", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  const good = await png("#ff0000");
  const parsed = await parseShareFile(shareFile({
    schemaVersion: 2,
    nodes: [
      { id: "local", type: "imageInput", position: { x: 0, y: 0 }, data: { imageUrl: "/storage/characters/abc/photo.png" } },
      { id: "file", type: "imageInput", position: { x: 0, y: 0 }, data: { imageUrl: "file:///etc/passwd" } },
      { id: "char", type: "imageInput", position: { x: 0, y: 0 }, data: { characterId: "00000000-0000-4000-8000-000000000001" } },
      { id: "web", type: "imageInput", position: { x: 0, y: 0 }, data: { imageUrl: "https://example.com/pose.png" } },
      { id: "vector", type: "imageInput", position: { x: 0, y: 0 }, data: { assetRef: "s1" } },
      { id: "tampered", type: "imageInput", position: { x: 0, y: 0 }, data: { assetRef: "t1" } },
      { id: "missing", type: "imageInput", position: { x: 0, y: 0 }, data: { assetRef: "nope" } },
      { id: "ok", type: "imageInput", position: { x: 0, y: 0 }, data: { assetRef: "g1" } },
      { id: "clip", type: "videoInput", position: { x: 0, y: 0 }, data: { mediaUrl: "/storage/generations/x/output.mp4" } },
      { id: "gen", type: "imageGenerator", position: { x: 0, y: 0 }, data: { engine: "openai", results: [{ imageUrl: "/storage/generations/x/output.png" }], status: "done" } },
    ],
    edges: [],
  }, {
    s1: { kind: "image", mimeType: "image/svg+xml", data: svg.toString("base64") },
    t1: { kind: "image", mimeType: "image/png", sha256: "0".repeat(64), data: good.toString("base64") },
    g1: { kind: "image", mimeType: "image/png", data: good.toString("base64") },
  }));
  const data = (id) => parsed.document.nodes.find((node) => node.id === id).data;
  assert.equal(data("local").imageUrl, undefined);
  assert.equal(data("file").imageUrl, undefined);
  assert.equal(data("char").characterId, undefined);
  assert.equal(data("web").imageUrl, "https://example.com/pose.png");
  assert.equal(data("vector").assetRef, undefined);
  assert.equal(data("tampered").assetRef, undefined);
  assert.equal(data("missing").assetRef, undefined);
  assert.equal(data("ok").assetRef, "g1");
  assert.equal(data("clip").mediaUrl, undefined);
  assert.equal(data("gen").results, undefined);
  assert.equal(data("gen").status, undefined);
  assert.deepEqual([...parsed.assets.keys()], ["g1"]);
  const warnings = parsed.warnings.join("\n");
  for (const expected of ["/storage/characters", "file:///etc/passwd", "character or pose link", "\"s1\" was skipped", "\"t1\" was skipped", "missing: its embedded image"]) {
    assert.ok(warnings.includes(expected), `warns about ${expected}`);
  }
});

test("files from a newer PoseForge import best effort with a warning", async () => {
  const parsed = await parseShareFile(shareFile({
    schemaVersion: 3,
    nodes: [
      { id: "p", type: "text", position: { x: 0, y: 0 }, data: { text: "hi" } },
      { id: "future", type: "hologramGenerator", position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [{ id: "e", source: "p", target: "future", targetHandle: "prompt" }],
  }, {}, { formatVersion: 2 }));
  assert.deepEqual(parsed.document.nodes.map((node) => node.id), ["p"]);
  assert.match(parsed.warnings[0], /newer PoseForge/);
  assert.ok(parsed.warnings.some((warning) => warning.includes("\"future\" was dropped")));
});

const capabilities = [
  {
    key: "fal", label: "fal.ai", ready: true, models: [{ id: "edit", label: "Edit" }],
    image: { supported: true, textToImage: false, maxImages: 2, aspectRatios: ["1:1", "9:16"], defaultAspectRatio: "1:1", resolutions: [{ id: "1K" }], defaultResolution: "1K", maxOutputs: 4 },
    video: { supported: false },
  },
  {
    key: "fal-video", label: "fal.ai Video", ready: true,
    models: [{ id: "t2v", label: "Text to video" }, { id: "i2v", label: "Image to video" }],
    image: { supported: false },
    video: {
      supported: true,
      models: [
        { id: "t2v", inputs: ["prompt"], durations: [5, 10], defaultDuration: 5, aspectRatios: ["16:9"], defaultAspectRatio: "16:9", resolutions: ["720p"], defaultResolution: "720p", sound: false },
        { id: "i2v", inputs: ["prompt", "startFrame"], durations: [5], defaultDuration: 5, aspectRatios: ["16:9", "9:16"], defaultAspectRatio: "16:9", resolutions: ["720p"], defaultResolution: "720p", sound: true },
      ],
    },
  },
  {
    key: "higgsfield-video", label: "Higgsfield Video", ready: false, reason: "Add a Higgsfield API key in Settings.",
    models: [{ id: "seed-i2v", label: "Seedance i2v" }], image: { supported: false },
    video: { supported: true, models: [{ id: "seed-i2v", inputs: ["prompt", "startFrame", "endFrame"], durations: [5, 10, 15], defaultDuration: 5, aspectRatios: ["auto"], defaultAspectRatio: "auto", resolutions: ["720p", "1080p"], defaultResolution: "720p", sound: true }] },
  },
];

function graph(nodes, edges) {
  return { nodes: nodes.map((node) => ({ position: { x: 0, y: 0 }, ...node })), edges };
}

test("the compatibility report covers every way a generator can fail to fit", () => {
  const document = graph([
    { id: "p", type: "text", data: { text: "x" } },
    { id: "f", type: "imageInput", data: {} },
    { id: "setup", type: "videoGenerator", data: { engine: "higgsfield-video", model: "seed-i2v", duration: 15 } },
    { id: "nomodel", type: "videoGenerator", data: { engine: "fal-video", model: "retired" } },
    { id: "noframe", type: "videoGenerator", data: { engine: "fal-video", model: "i2v" } },
    { id: "edit", type: "imageGenerator", data: { engine: "fal", model: "edit" } },
    { id: "unset", type: "imageGenerator", data: {} },
  ], [
    { id: "a", source: "p", target: "setup", targetHandle: "prompt" },
    { id: "b", source: "f", target: "setup", targetHandle: "startFrame" },
    { id: "c", source: "p", target: "noframe", targetHandle: "prompt" },
    { id: "d", source: "p", target: "edit", targetHandle: "prompt" },
  ]);
  const report = compatibilityReport(document, capabilities);
  const row = Object.fromEntries(report.generators.map((entry) => [entry.nodeId, entry]));

  assert.equal(row.setup.status, "needs-setup");
  assert.equal(row.setup.reason, "Add a Higgsfield API key in Settings.");
  assert.deepEqual(row.setup.alternatives.map((option) => option.model), ["i2v"], "only ready models that take a start frame");
  assert.equal(row.nomodel.status, "unknown-model");
  assert.equal(row.noframe.status, "ready");
  assert.deepEqual(row.noframe.issues, ["Image to video needs a connected start frame."]);
  assert.deepEqual(row.noframe.alternatives.map((option) => option.model), ["t2v"]);
  assert.deepEqual(row.edit.issues, ["fal.ai edits images, so it needs a connected image."]);
  assert.equal(row.unset.status, "unset");
});

test("switching a generator keeps the settings the new model supports", () => {
  const document = graph([
    { id: "v", type: "videoGenerator", data: { engine: "higgsfield-video", model: "seed-i2v", duration: 15, resolution: "1080p", sound: true } },
    { id: "i", type: "imageGenerator", data: { engine: "antigravity", aspectRatio: "9:16", outputs: 4 } },
  ], []);
  const switched = applyReplacements(document, { v: { engine: "fal-video", model: "i2v" }, i: { engine: "fal", model: "edit" } }, capabilities);
  const data = (id) => switched.nodes.find((node) => node.id === id).data;
  assert.deepEqual(
    [data("v").engine, data("v").model, data("v").duration, data("v").resolution, data("v").sound, data("v").aspectRatio],
    ["fal-video", "i2v", 5, "720p", true, "16:9"],
  );
  assert.deepEqual([data("i").engine, data("i").aspectRatio, data("i").outputs], ["fal", "9:16", 4]);
  assert.equal(document.nodes[0].data.engine, "higgsfield-video", "the input document is not changed");
  assert.throws(() => applyReplacements(document, { v: { engine: "fal", model: "edit" } }, capabilities), /not a model/);
  assert.throws(() => applyReplacements(document, { ghost: { engine: "fal", model: "edit" } }, capabilities), /not a generator/);
});

/**
 * Runs, batches, inputs and versions end to end: the real app and SQL on an
 * in-memory PGlite, a fake image engine, a local HTTP server standing in for
 * a remote image host, all driven through the MCP endpoint.
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
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const generated = [];
const fakeEngine = {
  key: "test-image",
  label: "Test image engine",
  models: [{ id: "test-model", label: "Test model" }],
  capabilities: { freeform: true, textToImage: true, maxReferenceImages: 6 },
  async isReady() { return { ready: true }; },
  async generateFreeform({ prompt, referencePaths, outputPath }) {
    generated.push({ prompt, referencePaths });
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await sharp({ create: { width: 32, height: 32, channels: 3, background: "#f5a742" } }).png().toFile(outputPath);
    return { usage: { estimatedCostUsd: 0.05 } };
  },
};

let app;
let imageHost;
let baseUrl;
let client;
let remoteImageUrl;
const cleanupPaths = [];

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

async function untilRunsFinish(id, filter = {}) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const { runs } = await call("list_runs", { id, ...filter });
    if (runs.length && runs.every((run) => ["completed", "partial", "failed"].includes(run.status))) return runs;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("runs did not finish");
}

test.before(async () => {
  delete process.env.HOST;
  delete process.env.POSEFORGE_MCP_TOKEN;
  await runMigrations();
  engines.advancedRegistry["test-image"] = fakeEngine;

  const png = await sharp({ create: { width: 48, height: 48, channels: 3, background: "#4f8cff" } }).png().toBuffer();
  imageHost = http.createServer((req, res) => {
    if (req.url === "/pose.png") return res.writeHead(200, { "content-type": "image/png" }).end(png);
    res.writeHead(404).end();
  });
  await new Promise((resolve) => imageHost.listen(0, "127.0.0.1", resolve));
  remoteImageUrl = `http://127.0.0.1:${imageHost.address().port}/pose.png`;

  app = http.createServer(createApplication((req, res) => res.status(404).end()));
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${app.address().port}`;
  client = new Client({ name: "runs-test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
});

test.after(async () => {
  await client?.close();
  delete engines.advancedRegistry["test-image"];
  await new Promise((resolve) => app.close(resolve));
  await new Promise((resolve) => imageHost.close(resolve));
  for (const target of cleanupPaths) fs.rmSync(target, { recursive: true, force: true });
});

test("a templated workflow runs as a batch with characters, poses and web images as inputs", async () => {
  const photo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-runs-")), "person.png");
  await sharp({ create: { width: 64, height: 64, channels: 3, background: "#22aa66" } }).png().toFile(photo);
  const character = await call("create_character", { name: "Batch Person", filePath: photo });
  cleanupPaths.push(path.dirname(photo));

  const pose = (await pool.query(
    "INSERT INTO pose_references (title, category, source_url, is_custom) VALUES ('Remote pose', 'test', $1, true) RETURNING id",
    [remoteImageUrl]
  )).rows[0];

  const workflow = await call("create_workflow", {
    name: "Batch template",
    document: {
      nodes: [
        { id: "prompt", type: "text", position: { x: 0, y: 0 }, data: { text: "{{person}} in a {{style}} portrait" } },
        { id: "who", type: "imageInput", position: { x: 0, y: 300 }, data: { inputName: "subject", characterId: character.id } },
        { id: "pose", type: "imageInput", position: { x: 0, y: 600 }, data: { inputName: "pose", poseId: pose.id } },
        { id: "gen", type: "imageGenerator", position: { x: 500, y: 0 }, data: { engine: "test-image", model: "test-model" } },
      ],
      edges: [
        { id: "e1", source: "prompt", sourceHandle: "text", target: "gen", targetHandle: "prompt", dataType: "text" },
        { id: "e2", source: "pose", sourceHandle: "image", target: "gen", targetHandle: "image", dataType: "image" },
        { id: "e3", source: "who", sourceHandle: "image", target: "gen", targetHandle: "image", dataType: "image" },
      ],
    },
  });
  cleanupPaths.push(path.join(__dirname, "..", "storage", "advanced", workflow.id));
  assert.deepEqual(workflow.inputs.map((input) => input.name).sort(), ["person", "pose", "style", "subject"]);

  const batch = await call("run_batch", {
    id: workflow.id,
    rows: [
      { person: "Ana", style: "editorial" },
      { person: "Ben", style: "street", pose: remoteImageUrl },
    ],
  });
  assert.equal(batch.runs.length, 2);
  assert.equal(batch.version, 1);

  const runs = await untilRunsFinish(workflow.id, { batchId: batch.batchId });
  assert.deepEqual(runs.map((run) => run.status), ["completed", "completed"]);
  assert.deepEqual(generated.map((entry) => entry.prompt).sort(), ["Ana in a editorial portrait", "Ben in a street portrait"]);
  for (const entry of generated) assert.equal(entry.referencePaths.length, 2, "pose and character both reach the engine");

  const downloaded = fs.readdirSync(path.join(__dirname, "..", "storage", "advanced", workflow.id)).filter((file) => file.startsWith("remote-"));
  assert.equal(downloaded.length, 1, "the web image is downloaded once and reused");

  const run = await call("get_run", { id: workflow.id, runId: runs[0].id });
  assert.equal(run.outputs.length, 1);
  assert.ok(run.files.some((file) => file.url === run.outputs[0].imageUrl && fs.existsSync(file.path)));
  const linked = await pool.query("SELECT COUNT(*)::int AS count FROM generations WHERE advanced_run_id = $1", [run.id]);
  assert.equal(linked.rows[0].count, 1, "the generation is linked to its run");

  for (const output of runs.flatMap((entry) => entry.outputs)) {
    cleanupPaths.push(path.join(__dirname, "..", "storage", "generations", output.generationId));
  }
  await call("delete_character", { id: character.id });
});

test("versions record what ran and the canvas can return to one", async () => {
  const workflow = await call("create_workflow", {
    name: "Versioned",
    document: {
      nodes: [
        { id: "prompt", type: "text", position: { x: 0, y: 0 }, data: { text: "a red kite" } },
        { id: "gen", type: "imageGenerator", position: { x: 500, y: 0 }, data: { engine: "test-image", aspectRatio: "1:1" } },
      ],
      edges: [{ id: "e1", source: "prompt", sourceHandle: "text", target: "gen", targetHandle: "prompt", dataType: "text" }],
    },
  });
  cleanupPaths.push(path.join(__dirname, "..", "storage", "advanced", workflow.id));

  const first = await call("run_workflow", { id: workflow.id });
  await untilRunsFinish(workflow.id);
  assert.equal(first.version, 1);

  const current = await call("get_workflow", { id: workflow.id });
  const changed = structuredClone(current.document);
  changed.nodes.find((node) => node.id === "prompt").data.text = "a blue kite";
  const updated = await call("update_workflow", { id: workflow.id, expectedRevision: current.revision, document: changed });
  const second = await call("run_workflow", { id: workflow.id });
  assert.equal(second.version, 2);
  await untilRunsFinish(workflow.id);

  const { versions, currentVersionId } = await call("list_versions", { id: workflow.id });
  assert.deepEqual(versions.map((version) => [version.version, version.runCount]), [[2, 1], [1, 1]]);
  assert.deepEqual(
    versions.map((version) => [version.costUsd, version.generationCount, version.pricedGenerationCount]),
    [[0.05, 1, 1], [0.05, 1, 1]],
    "each version reports what its completed generations cost"
  );
  assert.equal(currentVersionId, versions[0].id);

  const v1Runs = await call("list_runs", { id: workflow.id, versionId: versions[1].id });
  assert.equal(v1Runs.runs.length, 1);
  assert.equal(v1Runs.runs[0].id, first.runId);

  const latest = await call("get_workflow", { id: workflow.id });
  assert.ok(latest.revision > updated.revision);
  const restored = await call("restore_version", { id: workflow.id, versionId: versions[1].id, expectedRevision: latest.revision });
  assert.equal(restored.document.nodes.find((node) => node.id === "prompt").data.text, "a red kite");
  assert.equal(restored.document.nodes.find((node) => node.id === "gen").data.results.length, 2, "results survive a restore");
  assert.equal((await call("list_versions", { id: workflow.id })).currentVersionId, versions[1].id);

  for (const run of (await call("list_runs", { id: workflow.id })).runs) {
    for (const output of run.outputs) cleanupPaths.push(path.join(__dirname, "..", "storage", "generations", output.generationId));
  }
});

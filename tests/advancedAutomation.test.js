/**
 * Adaptable automation end to end against PGlite, through the MCP server:
 * list fan-out, LLM text, image transforms and output nodes, provider
 * fallback, setting inputs, resuming and restart recovery, and triggers.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const sharp = require("sharp");

const { createApplication } = require("../server");
const { runMigrations } = require("../db/migrate");
const { pool } = require("../db/pool");
const engines = require("../engines");
const storage = require("../lib/storage");
const { recoverInterruptedRuns } = require("../lib/advancedRuns");
const { runDueTriggers } = require("../lib/advancedTriggers");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

const generated = [];
const flaky = { fail: true };
const textCalls = [];

function imageEngine(key, { fails } = {}) {
  return {
    key,
    label: key,
    models: [{ id: `${key}-model`, label: `${key} model` }],
    capabilities: { freeform: true, textToImage: true, maxReferenceImages: 4 },
    imageSettings: {
      aspectRatios: ["1:1", "16:9"],
      resolutions: [{ id: "1K", label: "1K", quality: "medium" }],
      defaultResolution: "1K",
    },
    async isReady() { return { ready: true }; },
    async generateFreeform({ prompt, referencePaths, outputPath, outputSettings }) {
      if (fails?.()) throw new Error(`${key} is down`);
      generated.push({ engine: key, prompt, referencePaths, outputSettings });
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
      await sharp({ create: { width: 40, height: 30, channels: 3, background: "#3366cc" } }).png().toFile(outputPath);
      return { usage: { estimatedCostUsd: 0.01 } };
    },
  };
}

const textEngine = {
  key: "test-text",
  label: "Test text engine",
  capabilities: {},
  async isReady() { return { ready: true }; },
  async assistPrompt({ instruction, system }) {
    textCalls.push({ instruction, system });
    return { text: "1. a kite over the sea\n2. a kite in the snow" };
  },
};

const edits = [];
const editorEngine = {
  key: "test-editor",
  label: "Test editor",
  capabilities: {},
  async isReady() { return { ready: true }; },
  async transformImage({ inputPath, instruction, context, outputPath }) {
    edits.push({ inputPath, instruction, context });
    await sharp({ create: { width: 64, height: 48, channels: 3, background: "#22aa66" } }).png().toFile(outputPath);
  },
};

let app;
let baseUrl;
let client;
const cleanupPaths = [];

async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

async function callError(name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true, `${name} was expected to fail`);
  return result.content[0].text;
}

async function untilRunsFinish(id) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const { runs } = await call("list_runs", { id });
    if (runs.length && runs.every((run) => ["completed", "partial", "failed"].includes(run.status))) return runs;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("runs did not finish");
}

async function workflow(name, nodes, edges) {
  const created = await call("create_workflow", { name, document: { nodes, edges } });
  assert.deepEqual(created.warnings, [], "the document is kept as written");
  cleanupPaths.push(path.join(__dirname, "..", "storage", "advanced", created.id));
  return created;
}

function edge(source, target, targetHandle, dataType) {
  return { id: `${source}-${target}-${targetHandle}`, source, sourceHandle: dataType, target, targetHandle, dataType };
}

function at(x) {
  return { x, y: 0 };
}

function trackOutputs(run) {
  for (const output of run.outputs) {
    if (output.generationId) cleanupPaths.push(path.join(__dirname, "..", "storage", "generations", output.generationId));
  }
}

test.before(async () => {
  delete process.env.HOST;
  delete process.env.POSEFORGE_MCP_TOKEN;
  await runMigrations();
  engines.advancedRegistry["test-image"] = imageEngine("test-image");
  engines.advancedRegistry["test-flaky"] = imageEngine("test-flaky", { fails: () => flaky.fail });
  engines.advancedRegistry["test-text"] = textEngine;
  engines.advancedRegistry["test-editor"] = editorEngine;
  app = http.createServer(createApplication((req, res) => res.status(404).end()));
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${app.address().port}`;
  client = new Client({ name: "automation-test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`)));
});

test.after(async () => {
  await client?.close();
  for (const key of ["test-image", "test-flaky", "test-text", "test-editor"]) delete engines.advancedRegistry[key];
  await new Promise((resolve) => app.close(resolve));
  for (const target of cleanupPaths) fs.rmSync(target, { recursive: true, force: true });
});

test("capabilities describe every node type, and text engines", async () => {
  const capabilities = await call("advanced_list_capabilities");
  const types = Object.fromEntries(capabilities.nodeTypes.map((entry) => [entry.type, entry]));
  for (const type of ["llmText", "list", "imageTransform", "output"]) assert.ok(types[type], `${type} is listed`);
  assert.equal(types.list.runs, false, "a list is derived, not run");
  assert.equal(types.output.runs, true);
  assert.deepEqual(types.imageGenerator.bindableSettings, ["model", "aspectRatio", "resolution", "outputs"]);
  assert.ok(capabilities.transformPresets.includes("9:16"));
  assert.equal(capabilities.engines.find((engine) => engine.key === "test-text").text.supported, true);
});

test("a list fans the workflow out: one generation, transform and deliverable per line", async () => {
  generated.length = 0;
  const created = await workflow("Fan out", [
    { id: "ideas", type: "list", position: at(0), data: { text: "1. a red kite\n2. a blue kite\n- a green kite" } },
    { id: "gen", type: "imageGenerator", position: at(400), data: { engine: "test-image" } },
    { id: "fmt", type: "imageTransform", position: at(800), data: { preset: "9:16", fit: "contain", background: "#ffffff" } },
    { id: "out", type: "output", position: at(1200), label: "Story posts", data: {} },
  ], [
    edge("ideas", "gen", "prompt", "text"),
    edge("gen", "fmt", "image", "image"),
    edge("ideas", "fmt", "text", "text"),
    edge("fmt", "out", "image", "image"),
    edge("ideas", "out", "text", "text"),
  ]);

  const { waves } = await call("run_workflow", { id: created.id });
  assert.deepEqual(waves, [["gen"], ["fmt"], ["out"]]);
  const [run] = await untilRunsFinish(created.id);
  trackOutputs(run);
  assert.equal(run.status, "completed", JSON.stringify(run.nodes));
  assert.deepEqual(generated.map((entry) => entry.prompt).sort(), ["a blue kite", "a green kite", "a red kite"]);

  const images = run.deliverables.filter((entry) => entry.imageUrl);
  const captions = run.deliverables.filter((entry) => entry.text).map((entry) => entry.text);
  assert.equal(images.length, 3);
  assert.deepEqual(captions, ["a red kite", "a blue kite", "a green kite"], "deliverables keep list order");
  assert.ok(run.deliverables.every((entry) => entry.name === "Story posts"));
  const metadata = await sharp(storage.absolutePathFromPublicUrl(images[0].imageUrl)).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1080, 1920]);
});

test("an engine can edit the image from an instruction, and the format still applies", async () => {
  edits.length = 0;
  const created = await workflow("Agent edit", [
    { id: "p", type: "text", position: at(0), data: { text: "a sneaker" } },
    { id: "caption", type: "text", position: at(0, 300), data: { text: "Summer drop" } },
    { id: "gen", type: "imageGenerator", position: at(400), data: { engine: "test-image" } },
    { id: "fmt", type: "imageTransform", position: at(800), data: { engine: "test-editor", instruction: "Remove the background for {{shop}}.", preset: "1:1", fit: "contain" } },
  ], [
    edge("p", "gen", "prompt", "text"),
    edge("gen", "fmt", "image", "image"),
    edge("caption", "fmt", "text", "text"),
  ]);

  await call("run_workflow", { id: created.id, inputs: { shop: "Kite & Co" } });
  const [run] = await untilRunsFinish(created.id);
  trackOutputs(run);
  assert.equal(run.status, "completed", JSON.stringify(run.nodes));
  assert.deepEqual(edits.map(({ instruction, context }) => ({ instruction, context })), [
    { instruction: "Remove the background for Kite & Co.", context: "Summer drop" },
  ]);
  const metadata = await sharp(storage.absolutePathFromPublicUrl(run.nodes.fmt.results[0].imageUrl)).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1080, 1080]);

  const bad = await call("update_workflow", {
    id: created.id,
    expectedRevision: (await call("get_workflow", { id: created.id })).revision,
    document: { ...(await call("get_workflow", { id: created.id })).document, nodes: [{ id: "x", type: "imageTransform", position: at(0), data: { engine: "test-image" } }], edges: [] },
  });
  assert.match(bad.warnings.join(" "), /cannot edit images/);
});

test("an LLM node writes the list the workflow fans out over", async () => {
  generated.length = 0;
  textCalls.length = 0;
  const created = await workflow("Hooks", [
    { id: "llm", type: "llmText", position: at(0), data: { engine: "test-text", instruction: "Write two hooks about {{topic}}." } },
    { id: "hooks", type: "list", position: at(400), data: {} },
    { id: "gen", type: "imageGenerator", position: at(800), data: { engine: "test-image" } },
  ], [
    edge("llm", "hooks", "text", "text"),
    edge("hooks", "gen", "prompt", "text"),
  ]);
  assert.deepEqual(created.inputs.map((input) => input.name), ["topic"]);

  await call("run_workflow", { id: created.id, inputs: { topic: "kites" } });
  const [run] = await untilRunsFinish(created.id);
  trackOutputs(run);
  assert.equal(run.status, "completed", JSON.stringify(run.nodes));
  assert.match(textCalls[0].instruction, /Write two hooks about kites\./);
  assert.match(textCalls[0].system, /content-creation workflow/);
  assert.equal(run.nodes.llm.results[0].text, "1. a kite over the sea\n2. a kite in the snow");
  assert.deepEqual(generated.map((entry) => entry.prompt).sort(), ["a kite in the snow", "a kite over the sea"]);
});

test("a generator falls back to the next model when its own fails, and records which one ran", async () => {
  flaky.fail = true;
  const created = await workflow("Fallback", [
    { id: "p", type: "text", position: at(0), data: { text: "a lighthouse" } },
    { id: "gen", type: "imageGenerator", position: at(400), data: { engine: "test-flaky", fallbacks: [{ engine: "test-image" }] } },
    { id: "solo", type: "imageGenerator", position: at(400), data: { engine: "test-flaky" } },
  ], [
    edge("p", "gen", "prompt", "text"),
    edge("p", "solo", "prompt", "text"),
  ]);

  await call("run_workflow", { id: created.id });
  const [run] = await untilRunsFinish(created.id);
  trackOutputs(run);
  assert.equal(run.nodes.gen.status, "done");
  assert.equal(run.nodes.gen.results[0].engine, "test-image");
  assert.equal(run.nodes.solo.status, "error");
  assert.equal(run.nodes.solo.error, "test-flaky is down", "without fallbacks the provider's own error is kept");
});

test("run inputs can set a generator's aspect ratio, and refuse one it does not offer", async () => {
  generated.length = 0;
  const created = await workflow("Formats", [
    { id: "p", type: "text", position: at(0), data: { text: "a harbour" } },
    { id: "gen", type: "imageGenerator", position: at(400), data: { engine: "test-image", aspectRatio: "1:1", inputBindings: { aspectRatio: "format" } } },
  ], [edge("p", "gen", "prompt", "text")]);
  const format = created.inputs.find((input) => input.name === "format");
  assert.deepEqual(format, { name: "format", kind: "setting", nodeIds: ["gen"], default: "1:1", setting: "aspectRatio", valueType: "enum", options: ["1:1", "16:9"] });

  const refused = await callError("run_workflow", { id: created.id, inputs: { format: "4:5" } });
  assert.match(refused, /use one of 1:1, 16:9/);

  await call("run_batch", { id: created.id, rows: [{ format: "16:9" }, { format: "1:1" }] });
  const runs = await untilRunsFinish(created.id);
  runs.forEach(trackOutputs);
  assert.deepEqual(generated.map((entry) => entry.outputSettings.aspectRatio).sort(), ["16:9", "1:1"]);
  assert.equal((await call("get_workflow", { id: created.id })).document.nodes[1].data.aspectRatio, "1:1", "the saved workflow is unchanged");
});

test("a failed run resumes from where it stopped, and a restart closes the runs it cut off", async () => {
  flaky.fail = true;
  generated.length = 0;
  const created = await workflow("Resume", [
    { id: "p", type: "text", position: at(0), data: { text: "a castle" } },
    { id: "first", type: "imageGenerator", position: at(400), data: { engine: "test-image" } },
    { id: "second", type: "imageGenerator", position: at(800), data: { engine: "test-flaky" } },
  ], [
    edge("p", "first", "prompt", "text"),
    edge("p", "second", "prompt", "text"),
    edge("first", "second", "image", "image"),
  ]);

  const { runId } = await call("run_workflow", { id: created.id });
  const [failed] = await untilRunsFinish(created.id);
  trackOutputs(failed);
  assert.equal(failed.status, "partial");

  flaky.fail = false;
  const resumed = await call("resume_run", { id: created.id, runId });
  assert.deepEqual(resumed.started, ["second"]);
  const runs = await untilRunsFinish(created.id);
  const run = runs.find((entry) => entry.id === resumed.runId);
  trackOutputs(run);
  assert.equal(run.status, "completed", JSON.stringify(run.nodes));
  assert.equal(run.resumedFrom, runId);
  assert.equal(generated.filter((entry) => entry.engine === "test-image").length, 1, "the finished node is not run again");
  const second = generated.find((entry) => entry.engine === "test-flaky");
  assert.equal(second.referencePaths.length, 1, "the first run's image reaches the resumed node");
  assert.match(await callError("resume_run", { id: created.id, runId: resumed.runId }), /Only a failed or partial run/);

  // A run the server was in the middle of when it stopped.
  await pool.query(
    `UPDATE advanced_workflow_runs SET status = 'running', completed_at = NULL,
       nodes = jsonb_set(nodes, '{second}', '{"status": "running", "results": []}'::jsonb)
     WHERE id = $1`,
    [runId]
  );
  assert.ok(await recoverInterruptedRuns() >= 1);
  const recovered = await call("get_run", { id: created.id, runId });
  assert.equal(recovered.status, "partial");
  assert.equal(recovered.nodes.second.status, "error");
  assert.match(recovered.errorSummary, /server restarted/);
  assert.equal(recovered.nodes.first.status, "done", "finished nodes keep their results");
});

test("triggers run from a webhook, on a schedule and on demand", async () => {
  generated.length = 0;
  const created = await workflow("Triggered", [
    { id: "p", type: "text", position: at(0), data: { text: "{{subject}} at dawn" } },
    { id: "gen", type: "imageGenerator", position: at(400), data: { engine: "test-image" } },
  ], [edge("p", "gen", "prompt", "text")]);

  assert.match(await callError("create_trigger", { id: created.id, inputs: { subjet: "x" } }), /Unknown input subjet/);
  const { trigger, webhookToken } = await call("create_trigger", {
    id: created.id,
    name: "Morning post",
    inputs: { subject: "a lighthouse" },
    schedule: { type: "interval", minutes: 30 },
    webhook: true,
  });
  assert.ok(webhookToken);
  assert.equal(trigger.webhook, true);
  assert.ok(new Date(trigger.nextRunAt) > new Date());

  const hook = (token, body = {}) => fetch(`${baseUrl}/api/advanced-studio-projects/hooks/${trigger.id}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  assert.equal((await hook("wrong")).status, 401);
  const accepted = await hook(webhookToken, { inputs: { subject: "a harbour" } });
  assert.equal(accepted.status, 202);
  await untilRunsFinish(created.id);

  const fired = await runDueTriggers(new Date(Date.now() + 31 * 60_000));
  assert.ok(fired.some((entry) => entry.triggerId === trigger.id && entry.runId));
  await untilRunsFinish(created.id);
  await call("run_trigger", { id: created.id, triggerId: trigger.id });
  const runs = await untilRunsFinish(created.id);
  runs.forEach(trackOutputs);
  assert.equal(runs.length, 3);
  assert.ok(runs.every((run) => run.triggerId === trigger.id && run.status === "completed"));
  assert.deepEqual(generated.map((entry) => entry.prompt).sort(), ["a harbour at dawn", "a lighthouse at dawn", "a lighthouse at dawn"]);

  const [listed] = (await call("list_triggers", { id: created.id })).triggers;
  assert.equal(listed.lastRunId, runs[0].id);
  assert.equal(listed.lastError, null);

  await call("update_trigger", { id: created.id, triggerId: trigger.id, webhook: false, enabled: false });
  assert.equal((await hook(webhookToken)).status, 401, "a removed webhook's token stops working");
  const [disabled] = (await call("list_triggers", { id: created.id })).triggers;
  assert.equal(disabled.nextRunAt, null);
  await call("delete_trigger", { id: created.id, triggerId: trigger.id });
  assert.deepEqual((await call("list_triggers", { id: created.id })).triggers, []);
});

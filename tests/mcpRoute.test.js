/**
 * The MCP endpoint end to end: a real app on an ephemeral loopback port, an
 * in-memory PGlite database, and the SDK's own client.
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
const { TOOLS } = require("../lib/mcp");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = require("@modelcontextprotocol/sdk/client/streamableHttp.js");

let server;
let baseUrl;

test.before(async () => {
  delete process.env.HOST;
  delete process.env.POSEFORGE_MCP_TOKEN;
  await runMigrations();
  server = http.createServer(createApplication((req, res) => res.status(404).end()));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));

async function connect(headers = {}) {
  const client = new Client({ name: "poseforge-test", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers } }));
  return client;
}

function parse(result) {
  assert.equal(result.isError, undefined, result.content?.[0]?.text);
  return JSON.parse(result.content[0].text);
}

const INITIALIZE = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "curl", version: "0" } },
});

function postRaw(headers) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: INITIALIZE,
  });
}

test("lists exactly the registered tools", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), TOOLS.map((tool) => tool.name).sort());
  await client.close();
});

test("creates a workflow, reports warnings, and rejects a stale revision", async () => {
  const client = await connect();
  const created = parse(await client.callTool({
    name: "create_workflow",
    arguments: {
      name: "MCP test",
      document: {
        nodes: [
          { id: "p", type: "text", position: { x: 0, y: 0 }, data: { text: "A neon city" } },
          { id: "img", type: "imageGenerator", position: { x: 500, y: 0 }, data: { engine: "no-such-engine" } },
          { id: "bogus", type: "spaceship", position: { x: 0, y: 0 }, data: {} },
        ],
        edges: [{ id: "e1", source: "p", sourceHandle: "text", target: "img", targetHandle: "promt" }],
      },
    },
  }));
  assert.equal(created.name, "MCP test");
  assert.equal(created.document.nodes.length, 2);
  assert.ok(created.warnings.some((warning) => warning.includes('"bogus"')));
  assert.ok(created.warnings.some((warning) => warning.includes('"promt"')));
  assert.ok(created.warnings.some((warning) => warning.includes('"no-such-engine" is not an image engine')));

  const status = parse(await client.callTool({ name: "get_run_status", arguments: { id: created.id } }));
  assert.equal(status.running, false);
  assert.deepEqual(status.nodes.map((node) => [node.id, node.status]), [["img", "idle"]]);

  const stale = await client.callTool({
    name: "update_workflow",
    arguments: { id: created.id, expectedRevision: created.revision + 5, document: created.document },
  });
  assert.equal(stale.isError, true);
  assert.match(stale.content[0].text, /409/);
  await client.close();
});

test("get_settings never returns credential previews", async () => {
  const client = await connect();
  const text = JSON.stringify(parse(await client.callTool({ name: "get_settings", arguments: {} })));
  assert.doesNotMatch(text, /"masked"/);
  assert.match(text, /"configured"/);
  await client.close();
});

test("list_characters returns the character library", async () => {
  const client = await connect();
  const result = parse(await client.callTool({ name: "list_characters", arguments: {} }));
  assert.ok(result && typeof result === "object");
  await client.close();
});

test("uploads a local photo, returns its file path, and deletes it", async () => {
  const photo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-mcp-")), "person.png");
  await sharp({ create: { width: 64, height: 64, channels: 3, background: "#4f8cff" } }).png().toFile(photo);
  const client = await connect();
  const created = parse(await client.callTool({ name: "create_character", arguments: { name: "MCP Person", filePath: photo } }));
  const stored = created.files.find((file) => file.url === created.primaryPhotoUrl);
  assert.ok(stored && fs.existsSync(stored.path), "the stored photo is reported with a path on disk");
  assert.equal(stored.absoluteUrl, `${baseUrl}${created.primaryPhotoUrl}`);

  parse(await client.callTool({ name: "delete_character", arguments: { id: created.id } }));
  assert.equal(fs.existsSync(stored.path), false);
  await client.close();
});

test("upload tools report a missing local file as a tool error", async () => {
  const client = await connect();
  const result = await client.callTool({ name: "add_pose", arguments: { filePath: "/definitely/not/here.png" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /No readable file/);
  await client.close();
});

test("rejects browser requests from a foreign origin", async () => {
  const response = await postRaw({ origin: "https://evil.example" });
  assert.equal(response.status, 403);
});

test("rejects a non-loopback Host header (DNS rebinding)", async () => {
  const response = await new Promise((resolve, reject) => {
    const request = http.request(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { host: "evil.example", "content-type": "application/json", accept: "application/json, text/event-stream" },
    }, resolve);
    request.on("error", reject);
    request.end(INITIALIZE);
  });
  response.resume();
  assert.equal(response.statusCode, 403);
});

test("accepts a loopback origin", async () => {
  const response = await postRaw({ origin: baseUrl });
  assert.equal(response.status, 200);
});

test("is off when listening beyond loopback without a token, and needs the token when set", async (t) => {
  t.after(() => {
    delete process.env.HOST;
    delete process.env.POSEFORGE_MCP_TOKEN;
  });
  process.env.HOST = "0.0.0.0";
  assert.equal((await postRaw({})).status, 404);

  process.env.POSEFORGE_MCP_TOKEN = "s3cret";
  assert.equal((await postRaw({})).status, 401);
  assert.equal((await postRaw({ authorization: "Bearer wrong" })).status, 401);
  assert.equal((await postRaw({ authorization: "Bearer s3cret" })).status, 200);
});

test("GET is not supported on the stateless endpoint", async () => {
  const response = await fetch(`${baseUrl}/mcp`);
  assert.equal(response.status, 405);
});

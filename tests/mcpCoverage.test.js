/**
 * Keeps the MCP surface in step with the API. Every route the app serves must
 * either be some tool's `route` (lib/mcp/tools/) or be listed with a reason in
 * lib/mcp/exclusions.js — so adding an endpoint without deciding its MCP story
 * fails CI, naming the route.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { API_ROUTES } = require("../server");
const { TOOLS } = require("../lib/mcp");
const EXCLUSIONS = require("../lib/mcp/exclusions");

function apiRoutes() {
  const routes = new Set();
  for (const [mountPath, modulePath] of API_ROUTES) {
    const router = require(path.join(__dirname, "..", modulePath));
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const suffix = layer.route.path === "/" ? "" : layer.route.path;
      for (const method of Object.keys(layer.route.methods)) {
        routes.add(`${method.toUpperCase()} ${mountPath}${suffix}`);
      }
    }
  }
  return routes;
}

const served = apiRoutes();
const toolRoutes = new Set(TOOLS.map((tool) => tool.route));

test("every API route is an MCP tool or an explicit exclusion", () => {
  const undecided = [...served].filter((route) => !toolRoutes.has(route) && !EXCLUSIONS[route]);
  assert.deepEqual(
    undecided,
    [],
    "Add an MCP tool in lib/mcp/tools/ for each of these routes, or list it in lib/mcp/exclusions.js with a reason."
  );
});

test("no route is both a tool and an exclusion", () => {
  assert.deepEqual(Object.keys(EXCLUSIONS).filter((route) => toolRoutes.has(route)), []);
});

test("every tool and exclusion names a route the app serves", () => {
  assert.deepEqual([...toolRoutes].filter((route) => !served.has(route)), [], "stale tool routes");
  assert.deepEqual(Object.keys(EXCLUSIONS).filter((route) => !served.has(route)), [], "stale exclusions");
});

test("exclusions give a reason", () => {
  for (const [route, reason] of Object.entries(EXCLUSIONS)) {
    assert.ok(typeof reason === "string" && reason.trim().length > 10, `${route} needs a reason`);
  }
});

test("tools are uniquely named, described and typed", () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length, "duplicate tool names");
  for (const tool of TOOLS) {
    assert.match(tool.name, /^[a-z][a-z0-9_]*$/, `${tool.name} should be snake_case`);
    assert.ok(tool.description?.length > 20, `${tool.name} needs a description`);
    assert.ok(tool.input && typeof tool.input === "object", `${tool.name} needs an input schema`);
    for (const arg of Object.values(tool.files || {})) {
      assert.ok(tool.input[arg], `${tool.name} maps a file from missing argument ${arg}`);
    }
  }
});

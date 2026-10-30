/**
 * PoseForge's MCP server: one tool per exposed API route, built from the
 * declarations in tools/. A declaration names its `route`; by default its
 * arguments become path params (`:id`), multipart files (`files` maps a form
 * field to the argument holding a local path), and the JSON body — or the
 * query string for GET/DELETE. A tool with custom logic supplies `call`.
 */
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { ApiError, createApiClient } = require("./api");
const { describeFiles } = require("./media");
const { version } = require("../../package.json");

const TOOLS = [
  ...require("./tools/advanced-studio"),
  ...require("./tools/characters"),
  ...require("./tools/poses"),
  ...require("./tools/history"),
  ...require("./tools/metrics"),
  ...require("./tools/settings"),
  ...require("./tools/engines"),
];

const INSTRUCTIONS = `PoseForge runs locally and generates images and videos with the user's own providers.
Typical flow: list_engines / advanced_list_capabilities to see what is ready, create_character or upload_workflow_image for inputs,
create_workflow with a document, run_workflow, then poll get_run_status and use the returned file paths.
Generations can spend provider credits.`;

function routeRequest(definition, args) {
  const [method, template] = definition.route.split(" ");
  const pathParams = new Set([...template.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1]));
  const fileArgs = new Map(Object.entries(definition.files || {}).map(([field, arg]) => [arg, field]));
  const params = {};
  const files = {};
  const rest = {};
  for (const [key, value] of Object.entries(args || {})) {
    if (pathParams.has(key)) params[key] = value;
    else if (fileArgs.has(key)) files[fileArgs.get(key)] = value;
    else rest[key] = value;
  }
  const usesQuery = method === "GET" || method === "DELETE";
  return {
    params,
    files,
    query: usesQuery ? rest : undefined,
    body: usesQuery ? undefined : rest,
  };
}

async function runTool(definition, args, api) {
  try {
    const result = definition.call
      ? await definition.call(args || {}, api)
      : await api.call(definition.route, routeRequest(definition, args));
    const files = describeFiles(result, api.baseUrl);
    const payload = files.length ? { ...result, files } : result;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  } catch (error) {
    const detail = error instanceof ApiError
      ? `PoseForge answered ${error.status}: ${JSON.stringify(error.body)}`
      : error.message;
    return { isError: true, content: [{ type: "text", text: detail }] };
  }
}

function createMcpServer({ baseUrl }) {
  const api = createApiClient(baseUrl);
  const server = new McpServer({ name: "poseforge", version }, { instructions: INSTRUCTIONS });
  for (const definition of TOOLS) {
    server.registerTool(
      definition.name,
      { description: definition.description, inputSchema: definition.input, annotations: definition.annotations },
      (args) => runTool(definition, args, api)
    );
  }
  return server;
}

module.exports = { TOOLS, createMcpServer, routeRequest };

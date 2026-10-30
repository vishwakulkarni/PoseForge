/**
 * MCP endpoint (Streamable HTTP, stateless): any local agent can connect to
 * http://127.0.0.1:<port>/mcp and drive PoseForge. See docs/MCP.md.
 *
 * There is no API key on loopback — the server only listens there — but a
 * browser can still be steered at 127.0.0.1 by a hostile page (DNS
 * rebinding), and these tools spend provider credits. So requests must carry
 * a loopback Host and must not come from a non-loopback browser Origin. Bound
 * anywhere else (HOST=0.0.0.0), the endpoint stays off unless
 * POSEFORGE_MCP_TOKEN is set, and then every request needs that bearer token.
 */
const crypto = require("crypto");
const express = require("express");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { localhostHostValidation } = require("@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js");
const { createMcpServer } = require("../lib/mcp");
const logger = require("../lib/logger");

const router = express.Router();
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const checkLoopbackHost = localhostHostValidation();

function isLoopback(hostname) {
  return LOOPBACK_HOSTNAMES.has(hostname) || /^127\.\d+\.\d+\.\d+$/.test(hostname);
}

function rpcError(res, status, message) {
  return res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: null });
}

function tokenMatches(header, token) {
  const presented = String(header || "").replace(/^Bearer\s+/i, "");
  const digest = (value) => crypto.createHash("sha256").update(value).digest();
  return Boolean(presented) && crypto.timingSafeEqual(digest(presented), digest(token));
}

router.use((req, res, next) => {
  const token = process.env.POSEFORGE_MCP_TOKEN;
  const boundToLoopback = isLoopback(process.env.HOST || "127.0.0.1");
  if (!boundToLoopback && !token) {
    return rpcError(res, 404, "MCP is off because PoseForge is listening beyond localhost. Set POSEFORGE_MCP_TOKEN to enable it.");
  }
  if (token && !tokenMatches(req.headers.authorization, token)) return rpcError(res, 401, "Missing or wrong bearer token.");

  const origin = req.headers.origin;
  if (origin) {
    let hostname = null;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      // An unparsable Origin is treated like a foreign one.
    }
    if (!isLoopback(hostname)) return rpcError(res, 403, `Requests from ${origin} are not allowed.`);
  }
  if (boundToLoopback) return checkLoopbackHost(req, res, next);
  next();
});

/** The tools call PoseForge's API on the address this request arrived on, so
 * they reach the same server whatever HOST and PORT it was started with. */
function selfBaseUrl(req) {
  const address = req.socket.localAddress || "127.0.0.1";
  const host = address.includes(":") ? `[${address}]` : address;
  return `http://${host}:${req.socket.localPort}`;
}

router.post("/", async (req, res) => {
  const server = createMcpServer({ baseUrl: selfBaseUrl(req) });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error("mcp request failed", { requestId: req.requestId, error: error.message });
    if (!res.headersSent) rpcError(res, 500, "Internal MCP error.");
  }
});

// Stateless: there is no session to stream to or to end.
router.all("/", (req, res) => {
  res.setHeader("Allow", "POST");
  return rpcError(res, 405, "Use POST.");
});

module.exports = router;

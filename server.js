const DEV_MODE = process.argv.includes("--dev");
if (DEV_MODE) {
  process.env.NODE_ENV = "development";
  process.env.LOG_LEVEL ||= "debug";
} else {
  process.env.NODE_ENV ||= "production";
}

require("dotenv").config({ quiet: true });
const express = require("express");
const http = require("http");
const multer = require("multer");
const path = require("path");
const { createRequire } = require("module");
const storage = require("./lib/storage");
const logger = require("./lib/logger");
const { prefetchProviderLimits } = require("./lib/providerLimits");
const { pool, databaseConfig } = require("./db/pool");
const { runMigrations } = require("./db/migrate");

const WEB_DIR = path.join(__dirname, "web");
const requireFromWeb = createRequire(path.join(WEB_DIR, "package.json"));

/**
 * Mount the existing API and local file storage ahead of Next's request
 * handler. The browser therefore talks to one origin and one server; Express
 * remains the source of truth for business rules without needing a proxy.
 */
function createApplication(nextHandler) {
  storage.ensureStorage();
  const app = express();

  app.use(logger.requestLogger);
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.use(express.static(path.join(__dirname, "public"), { index: false }));
  app.use("/storage", express.static(storage.STORAGE_ROOT, { fallthrough: true }));

  app.use("/api/characters", require("./routes/characters"));
  app.use("/api/presets", require("./routes/presets"));
  app.use("/api/engines", require("./routes/engines"));
  app.use("/api/settings", require("./routes/settings"));
  app.use("/api/generations", require("./routes/generations"));
  app.use("/api/pose-references", require("./routes/pose-references"));
  app.use("/api/recipes", require("./routes/recipes"));
  app.use("/api/studio-projects", require("./routes/studio-projects"));
  app.use("/api/media", require("./routes/media"));
  app.use("/api/passport", require("./routes/passport"));
  app.use("/api/metrics", require("./routes/metrics"));

  // Unknown API requests remain JSON errors instead of falling through to the
  // Next.js HTML 404 page.
  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  app.use((err, req, res, next) => {
    logger.error("request failed", {
      requestId: req.requestId,
      error: err.message,
      stack: err.stack,
    });
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error: err.code === "LIMIT_FILE_SIZE" ? "That file is too large (25MB max)." : err.message,
      });
    }
    return res.status(err.statusCode || 500).json({ error: err.message || "Unexpected error." });
  });

  app.all("*", (req, res) => nextHandler(req, res));
  return app;
}

async function start() {
  const port = Number(process.env.PORT || 3000);
  const hostname = process.env.HOST || "127.0.0.1";
  const dev = DEV_MODE || process.env.NODE_ENV === "development";

  await runMigrations();

  // Next and Fumadocs resolve project-relative generated imports from cwd.
  // Express, storage, and database paths use __dirname, so the complete app
  // can safely run with the web project as its working directory.
  process.chdir(WEB_DIR);

  // CLI quota probes take a few seconds. Start them while Next prepares so
  // the Metrics page can consume cached data without waiting on subprocesses.
  void prefetchProviderLimits();

  const next = requireFromWeb("next");
  const nextApp = next({ dev, dir: WEB_DIR, hostname, port });

  await nextApp.prepare();

  const app = createApplication(nextApp.getRequestHandler());
  const server = http.createServer(app);
  const upgrade = nextApp.getUpgradeHandler?.();
  if (upgrade) server.on("upgrade", upgrade);

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, hostname, resolve);
  });

  logger.info("server started", {
    url: `http://${hostname}:${port}`,
    environment: dev ? "development" : "production",
    databaseMode: databaseConfig.mode,
    databaseLocation: databaseConfig.pgliteDataDir,
    codexBinary: process.env.CODEX_BIN || "codex",
    codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 300000),
  });

  let closing = false;
  const shutdown = async (signal) => {
    if (closing) return;
    closing = true;
    logger.info("server stopping", { signal });
    await nextApp.close();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  return server;
}

if (require.main === module) {
  start().catch((error) => {
    logger.error("server failed to start", { error: error.message, stack: error.stack });
    process.exitCode = 1;
  });
}

module.exports = { createApplication, start };

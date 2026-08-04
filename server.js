require("dotenv").config({ quiet: true });
const express = require("express");
const multer = require("multer");
const path = require("path");
const storage = require("./lib/storage");
const logger = require("./lib/logger");

const app = express();
const PORT = process.env.PORT || 3004;
storage.ensureStorage();

app.use(logger.requestLogger);
app.use(express.json({ limit: "1mb" }));
app.use("/api", (req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.static(path.join(__dirname, "public")));
app.use("/storage", express.static(storage.STORAGE_ROOT, { fallthrough: true }));

app.use("/api/characters", require("./routes/characters"));
app.use("/api/presets", require("./routes/presets"));
app.use("/api/engines", require("./routes/engines"));
app.use("/api/settings", require("./routes/settings"));
app.use("/api/generations", require("./routes/generations"));
app.use("/api/pose-references", require("./routes/pose-references"));

app.use((req, res) => res.status(404).json({ error: "Not found." }));
app.use((err, req, res, next) => {
  logger.error("request failed", { requestId: req.requestId, error: err.message, stack: err.stack });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "That file is too large (25MB max)." : err.message });
  res.status(err.statusCode || 500).json({ error: err.message || "Unexpected error." });
});

app.listen(PORT, "127.0.0.1", () => logger.info("server started", {
  url: `http://127.0.0.1:${PORT}`,
  environment: process.env.NODE_ENV || "production",
  databaseConfigured: Boolean(process.env.DATABASE_URL),
  codexBinary: process.env.CODEX_BIN || "codex",
  codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || 300000),
}));
module.exports = app;

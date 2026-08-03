const crypto = require("crypto");
const DEBUG = process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV === "development";
function write(level, message, fields = {}) {
  const entry = { time: new Date().toISOString(), level, message, ...fields };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else if (level === "info" || DEBUG) console.log(line);
}
function requestId() { return crypto.randomUUID().slice(0, 8); }
function requestLogger(req, res, next) {
  const startedAt = Date.now(); req.requestId = req.headers["x-request-id"] || requestId(); res.setHeader("x-request-id", req.requestId);
  res.on("finish", () => write("info", "request completed", { requestId: req.requestId, method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Date.now() - startedAt }));
  next();
}
module.exports = { debug: (message, fields) => write("debug", message, fields), info: (message, fields) => write("info", message, fields), warn: (message, fields) => write("warn", message, fields), error: (message, fields) => write("error", message, fields), requestLogger };

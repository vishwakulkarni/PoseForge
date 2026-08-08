const { spawn } = require("child_process");

const CODEX_BIN = process.env.CODEX_BIN || "codex";
const TIMEOUT_MS = Number(process.env.CODEX_LIMITS_TIMEOUT_MS || 8000);
const CACHE_MS = Number(process.env.CODEX_LIMITS_CACHE_MS || 60000);
const FIVE_HOURS_MINS = 5 * 60;
const WEEK_MINS = 7 * 24 * 60;

let cached = null;
let cachedAt = 0;

function normalizeWindow(window) {
  if (!window || !Number.isFinite(Number(window.usedPercent))) return null;
  const usedPercent = Math.min(100, Math.max(0, Number(window.usedPercent)));
  const resetsAtSeconds = window.resetsAt == null ? null : Number(window.resetsAt);
  return {
    usedPercent,
    remainingPercent: 100 - usedPercent,
    windowDurationMins: Number.isFinite(Number(window.windowDurationMins))
      ? Number(window.windowDurationMins)
      : null,
    resetsAt: resetsAtSeconds != null && Number.isFinite(resetsAtSeconds)
      ? new Date(resetsAtSeconds * 1000).toISOString()
      : null,
  };
}

function normalizeRateLimits(result) {
  const buckets = result?.rateLimitsByLimitId;
  const snapshot = buckets?.codex || result?.rateLimits || null;
  if (!snapshot) {
    return {
      available: false,
      planType: null,
      fiveHour: null,
      weekly: null,
      reason: "The signed-in Codex account did not report rate limits.",
    };
  }

  const primary = normalizeWindow(snapshot.primary);
  const secondary = normalizeWindow(snapshot.secondary);
  const windows = [primary, secondary].filter(Boolean);
  const byDuration = (duration) =>
    windows.find((window) => window.windowDurationMins === duration) || null;

  // Current app-server payloads include duration. These fallbacks preserve
  // compatibility with older Codex versions where primary meant 5h and
  // secondary meant weekly but the duration could be omitted.
  const fiveHour = byDuration(FIVE_HOURS_MINS) ||
    (primary?.windowDurationMins == null ? primary : null);
  const weekly = byDuration(WEEK_MINS) ||
    (secondary?.windowDurationMins == null ? secondary : null);

  return {
    available: true,
    planType: snapshot.planType || null,
    fiveHour,
    weekly,
    reason: null,
  };
}

function readCodexRateLimits({ spawnImpl = spawn, binary = CODEX_BIN, timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    let buffer = "";
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child && typeof child.kill === "function" && !child.killed) child.kill();
      if (error) reject(error);
      else resolve(value);
    };

    const timer = setTimeout(
      () => finish(new Error("Timed out while reading Codex rate limits")),
      timeoutMs,
    );

    try {
      child = spawnImpl(binary, ["app-server"], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (error) {
      finish(error);
      return;
    }

    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (!settled) finish(new Error(`Codex app-server exited with code ${code}`));
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.id !== 2) continue;
        if (message.error) {
          finish(new Error(message.error.message || "Codex rejected the rate-limit request"));
        } else {
          finish(null, normalizeRateLimits(message.result));
        }
      }
    });

    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    send({
      method: "initialize",
      id: 1,
      params: {
        clientInfo: { name: "poseforge", title: "PoseForge", version: "0.1.0" },
      },
    });
    send({ method: "initialized", params: {} });
    send({ method: "account/rateLimits/read", id: 2, params: {} });
  });
}

async function getCodexRateLimits() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    cached = await readCodexRateLimits();
  } catch (error) {
    cached = {
      available: false,
      planType: null,
      fiveHour: null,
      weekly: null,
      reason: error?.code === "ENOENT"
        ? "Codex CLI is not installed or not on PATH."
        : "Could not read limits from the signed-in Codex CLI.",
    };
  }
  cachedAt = Date.now();
  return cached;
}

module.exports = { getCodexRateLimits, normalizeRateLimits, readCodexRateLimits };

const { spawn } = require("child_process");

const ANTIGRAVITY_BIN = process.env.ANTIGRAVITY_BIN || "agy";
const TIMEOUT_MS = Number(process.env.ANTIGRAVITY_LIMITS_TIMEOUT_MS || 10000);
const CACHE_MS = Number(process.env.ANTIGRAVITY_LIMITS_CACHE_MS || 60000);

let cached = null;
let cachedAt = 0;

function normalizeBucket(bucket) {
  const fraction = Number(bucket?.remaining_fraction);
  if (!Number.isFinite(fraction)) return null;
  const remainingPercent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  const resetTime = bucket?.reset_time;
  return {
    usedPercent: 100 - remainingPercent,
    remainingPercent,
    windowDurationMins: bucket?.window === "5h" ? 300 : bucket?.window === "weekly" ? 10080 : null,
    resetsAt: resetTime && Number.isFinite(Date.parse(resetTime))
      ? new Date(resetTime).toISOString()
      : null,
  };
}

function normalizeAntigravityLimits(payload) {
  const groups = payload?.command?.data?.groups;
  if (payload?.status !== "SUCCESS" || !Array.isArray(groups) || groups.length === 0) {
    return {
      available: false,
      groups: [],
      reason: "The signed-in Antigravity account did not report quota limits.",
    };
  }

  return {
    available: true,
    groups: groups.map((group) => {
      const buckets = Array.isArray(group.buckets) ? group.buckets : [];
      return {
        name: String(group.name || "Antigravity models"),
        description: group.description ? String(group.description) : null,
        fiveHour: normalizeBucket(buckets.find((bucket) => bucket.window === "5h")),
        weekly: normalizeBucket(buckets.find((bucket) => bucket.window === "weekly")),
      };
    }),
    reason: null,
  };
}

function readAntigravityRateLimits({
  spawnImpl = spawn,
  binary = ANTIGRAVITY_BIN,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  return new Promise((resolve, reject) => {
    let child;
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      if (child && typeof child.kill === "function" && !child.killed) child.kill();
      finish(new Error("Timed out while reading Antigravity quota limits"));
    }, timeoutMs);

    try {
      child = spawnImpl(binary, ["-p", "/quota", "--output-format", "json"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      finish(error);
      return;
    }

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(`Antigravity CLI exited with code ${code}: ${stderr.slice(-500)}`));
        return;
      }
      try {
        const jsonLine = stdout.trim().split("\n").reverse().find((line) => line.trim().startsWith("{"));
        finish(null, normalizeAntigravityLimits(JSON.parse(jsonLine || "{}")));
      } catch (error) {
        finish(error);
      }
    });
  });
}

async function getAntigravityRateLimits() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  try {
    cached = await readAntigravityRateLimits();
  } catch (error) {
    cached = {
      available: false,
      groups: [],
      reason: error?.code === "ENOENT"
        ? "Antigravity CLI is not installed or not on PATH."
        : "Could not read limits from the signed-in Antigravity CLI.",
    };
  }
  cachedAt = Date.now();
  return cached;
}

module.exports = {
  getAntigravityRateLimits,
  normalizeAntigravityLimits,
  readAntigravityRateLimits,
};

/**
 * The single gateway between PoseForge and the official Dreamina Canvas CLI
 * (https://dreamina.capcut.com/canvas-cli). Every call runs the installed
 * binary with `--format json --non-interactive` and reads its envelope, so
 * exit-code handling and error mapping live in one place. Commands and flags
 * follow the binary's own `schema` output (CLI 1.0.1); the bundled Skill at
 * ~/.agents/skills/dreamina-canvas-cli documents the protocol rules.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BIN = process.env.DREAMINA_CANVAS_BIN || path.join(os.homedir(), ".local", "bin", "dreamina-canvas");
const DEFAULT_TIMEOUT_MS = 120_000;

// Exit codes declared by the CLI schema.
const EXIT = {
  ok: 0,
  invalidInput: 2,
  confirmationRequired: 10,
  loginRequired: 11,
  permission: 12,
  compatibility: 13,
  incomplete: 20,
  serviceFailure: 21,
  humanAction: 22,
};

class DreaminaError extends Error {
  constructor(message, { exitCode = 1, code = null, reason = null, requiredAction = null, requestId = null, envelope = null } = {}) {
    super(message);
    this.name = "DreaminaError";
    this.exitCode = exitCode;
    this.code = code;
    this.reason = reason;
    this.requiredAction = requiredAction;
    this.requestId = requestId;
    this.envelope = envelope;
  }
}

function installed() {
  try {
    fs.accessSync(BIN, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function parseEnvelope(stdout) {
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Progress lines may precede the final envelope.
    const last = text.split("\n").reverse().find((line) => line.trim().startsWith("{"));
    try { return last ? JSON.parse(last) : null; } catch { return null; }
  }
}

const EXIT_MESSAGES = {
  [EXIT.loginRequired]: "Dreamina sign-in is required or has expired. Sign in again in Settings.",
  [EXIT.permission]: "Dreamina refused this request for this account (permission or membership).",
  [EXIT.compatibility]: "This Dreamina Canvas CLI version is no longer supported. Reinstall it from Settings.",
};

/**
 * Runs one CLI command. Resolves `{ exitCode, envelope }` for exit 0 and for
 * the codes listed in `accept` (e.g. 10 or 20, which carry state the caller
 * must act on); rejects with a DreaminaError otherwise. Never logs output:
 * envelopes can carry account details.
 */
function run(args, { timeoutMs = DEFAULT_TIMEOUT_MS, accept = [] } = {}) {
  if (!installed()) {
    return Promise.reject(new DreaminaError("The Dreamina Canvas CLI is not installed. See Settings → Dreamina.", { code: "not-installed" }));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(BIN, ["--format", "json", "--non-interactive", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new DreaminaError(`Could not run the Dreamina Canvas CLI: ${error.message}`, { code: "spawn" }));
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      const envelope = parseEnvelope(stdout);
      if (signal) {
        reject(new DreaminaError("The Dreamina Canvas CLI timed out.", { code: "timeout", envelope }));
        return;
      }
      if (exitCode === EXIT.ok || accept.includes(exitCode)) {
        resolve({ exitCode, envelope });
        return;
      }
      const error = envelope?.error || {};
      const message = EXIT_MESSAGES[exitCode] || error.message || stderr.trim().split("\n").pop() || `Dreamina Canvas CLI exited with code ${exitCode}.`;
      reject(new DreaminaError(message, {
        exitCode,
        code: error.code || null,
        reason: error.reason || null,
        requiredAction: error.requiredAction || null,
        requestId: error.requestId || envelope?.meta?.requestId || null,
        envelope,
      }));
    });
  });
}

module.exports = { BIN, EXIT, DreaminaError, installed, run };

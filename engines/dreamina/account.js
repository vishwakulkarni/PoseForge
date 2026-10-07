/**
 * Dreamina account state for PoseForge: sign-in, the one dedicated PoseForge
 * canvas, and credit limits.
 *
 * All PoseForge generations run on a single canvas whose project ID is stored
 * in settings and passed explicitly to every command, so the CLI's "current
 * canvas" (which the user may change from a terminal) never matters. The
 * canvas is only created from the Settings page.
 *
 * Dreamina approves spending per run against a credit ceiling. PoseForge
 * always passes the user's per-image or per-video limit as
 * `--credit-ceiling`, so the server refuses (exit 10, nothing charged) any
 * run priced above it; running without a limit set is refused locally.
 */
const crypto = require("crypto");
const { pool } = require("../../db/pool");
const cli = require("./cli");

const ENGINE_KEYS = ["dreamina", "dreamina-video"];
const SETTINGS = {
  projectId: "dreamina_project_id",
  canvasUrl: "dreamina_canvas_url",
  pendingProjectId: "dreamina_pending_project_id",
  creditCeiling: "dreamina_credit_ceiling",
  imageCreditCeiling: "dreamina_image_credit_ceiling",
  monthlyCreditBudget: "dreamina_monthly_credit_budget",
};
const CANVAS_NAME = "PoseForge";
const READINESS_TTL_MS = 30_000;

async function readSettings(keys) {
  const result = await pool.query("SELECT key, value FROM settings WHERE key = ANY($1)", [keys]);
  return Object.fromEntries(result.rows.map((row) => [row.key, row.value || ""]));
}

async function writeSetting(key, value) {
  await pool.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, String(value ?? "")]);
}

function parseCredits(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

async function limits() {
  const values = await readSettings([SETTINGS.creditCeiling, SETTINGS.imageCreditCeiling, SETTINGS.monthlyCreditBudget]);
  return {
    creditCeiling: parseCredits(values[SETTINGS.creditCeiling]),
    imageCreditCeiling: parseCredits(values[SETTINGS.imageCreditCeiling]),
    monthlyCreditBudget: parseCredits(values[SETTINGS.monthlyCreditBudget]),
  };
}

async function canvas() {
  const values = await readSettings([SETTINGS.projectId, SETTINGS.canvasUrl]);
  return values[SETTINGS.projectId] ? { projectId: values[SETTINGS.projectId], webUrl: values[SETTINGS.canvasUrl] || null } : null;
}

/** Creates the PoseForge canvas once. The client-generated project ID is
 * saved before the call and reused on retry, so a lost response never
 * leaves a second canvas behind. */
async function createCanvas() {
  const existing = await canvas();
  if (existing) return existing;
  const values = await readSettings([SETTINGS.pendingProjectId]);
  const projectId = values[SETTINGS.pendingProjectId] || crypto.randomUUID();
  await writeSetting(SETTINGS.pendingProjectId, projectId);
  const { envelope } = await cli.run(["canvas", "create", CANVAS_NAME, "--project-id", projectId]);
  const project = envelope?.data?.project;
  if (!project?.projectId) throw new cli.DreaminaError("Dreamina did not return the new canvas.", { requestId: envelope?.meta?.requestId });
  await writeSetting(SETTINGS.projectId, project.projectId);
  await writeSetting(SETTINGS.canvasUrl, project.webUrl || "");
  await writeSetting(SETTINGS.pendingProjectId, "");
  readinessCache = {};
  return { projectId: project.projectId, webUrl: project.webUrl || null };
}

async function authStatus() {
  const { envelope } = await cli.run(["auth", "status"], { timeoutMs: 15_000 });
  return envelope?.data || {};
}

let readinessCache = {};

/** The per-run credit limit for `kind` ("image" or "video"). */
function ceilingFor(kind, values) {
  return kind === "image" ? values.imageCreditCeiling : values.creditCeiling;
}

async function computeReadiness(kind) {
  if (!cli.installed()) return { ready: false, reason: "Install the Dreamina Canvas CLI (see Settings)." };
  let auth;
  try { auth = await authStatus(); } catch (error) { return { ready: false, reason: error.message }; }
  if (!auth.loggedIn) return { ready: false, reason: "Sign in to Dreamina in Settings." };
  if (!await canvas()) return { ready: false, reason: "Create the PoseForge canvas in Settings → Dreamina." };
  if (ceilingFor(kind, await limits()) == null) return { ready: false, reason: `Set a Dreamina credit limit per ${kind} in Settings.` };
  return { ready: true };
}

/** Cached briefly: the capability list asks every engine on each load and
 * each check spawns the CLI. */
async function readiness(kind) {
  const cached = readinessCache[kind];
  if (cached && Date.now() - cached.at < READINESS_TTL_MS) return cached.value;
  const value = await computeReadiness(kind);
  readinessCache[kind] = { at: Date.now(), value };
  return value;
}

function clearReadiness() {
  readinessCache = {};
}

/** Credits committed this month. Running generations hold their full
 * ceiling until Dreamina reports the actual amount. */
async function monthToDateCredits() {
  const result = await pool.query(
    `SELECT usage_metrics FROM generations
     WHERE engine = ANY($1) AND status <> 'failed' AND created_at >= date_trunc('month', now())`,
    [ENGINE_KEYS]
  );
  const credits = result.rows.reduce((sum, { usage_metrics: usage }) => sum + (Number(usage?.estimatedCredits) || 0), 0);
  return { credits, runs: result.rows.length };
}

/** Returns the ceiling to pass to the CLI, or throws before anything is
 * saved on the canvas. */
async function authorize(kind) {
  const values = await limits();
  const creditCeiling = ceilingFor(kind, values);
  const { monthlyCreditBudget } = values;
  if (creditCeiling == null) throw new cli.DreaminaError(`Set a Dreamina credit limit per ${kind} in Settings before generating.`, { code: "spend-limit" });
  if (monthlyCreditBudget != null) {
    const spent = await monthToDateCredits();
    if (spent.credits + creditCeiling > monthlyCreditBudget) {
      throw new cli.DreaminaError(
        `A Dreamina ${kind} can use up to ${creditCeiling} credits, which would take this month to ${spent.credits + creditCeiling}, above your ${monthlyCreditBudget}-credit monthly budget. Adjust it in Settings.`,
        { code: "spend-limit" }
      );
    }
  }
  return creditCeiling;
}

module.exports = {
  ENGINE_KEYS,
  SETTINGS,
  parseCredits,
  limits,
  canvas,
  createCanvas,
  authStatus,
  readiness,
  clearReadiness,
  monthToDateCredits,
  authorize,
};

/**
 * Triggers: saved ways to run an Advanced Studio workflow unattended
 * (db/migrations/018).
 *
 * A trigger holds the inputs and node selection for a run and fires on a
 * schedule, from a webhook, or on demand. Every firing goes through
 * `startRun`, so it is validated, versioned, priced and spending-limited
 * exactly like a run started from the canvas or an agent. A trigger whose
 * previous run is still going is skipped rather than stacked.
 *
 * Schedules run in this process: a 30-second tick starts every enabled
 * trigger that is due. A trigger that came due while the server was down
 * fires once when it starts, not once per missed slot.
 */
const crypto = require("crypto");
const { pool } = require("../db/pool");
const logger = require("./logger");
const { sanitizeAdvancedDocument } = require("./advancedStudioProject");
const { planWaves } = require("./advancedWorkflowRunner");
const { applyInputs } = require("./advancedRunInputs");
const { loadProject, startRun, triggerIsRunning } = require("./advancedRunService");

const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const TICK_MS = 30_000;
const MAX_TRIGGERS_PER_PROJECT = 50;
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

function statusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/** null (no schedule), `{ type: "interval", minutes }` or `{ type: "daily",
 * time: "HH:MM" }` in the server's local time. */
function sanitizeSchedule(value) {
  if (value == null) return null;
  if (value.type === "interval") {
    const minutes = Number(value.minutes);
    if (!Number.isInteger(minutes) || minutes < MIN_INTERVAL_MINUTES || minutes > MAX_INTERVAL_MINUTES) {
      throw statusError(422, `An interval schedule runs every ${MIN_INTERVAL_MINUTES} to ${MAX_INTERVAL_MINUTES} minutes.`);
    }
    return { type: "interval", minutes };
  }
  if (value.type === "daily") {
    const time = String(value.time || "").trim();
    if (!TIME_OF_DAY.test(time)) throw statusError(422, "A daily schedule needs a time as HH:MM (24-hour, server time).");
    return { type: "daily", time };
  }
  throw statusError(422, 'schedule must be null, { "type": "interval", "minutes": n } or { "type": "daily", "time": "HH:MM" }.');
}

/** The first time after `from` the schedule fires. */
function nextRunAt(schedule, from = new Date()) {
  if (!schedule) return null;
  if (schedule.type === "interval") return new Date(from.getTime() + schedule.minutes * 60_000);
  const [hours, minutes] = schedule.time.split(":").map(Number);
  const next = new Date(from);
  next.setHours(hours, minutes, 0, 0);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function shapeTrigger(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    inputs: row.inputs || {},
    nodeIds: row.node_ids || [],
    schedule: row.schedule || null,
    webhook: Boolean(row.webhook_token_hash),
    enabled: row.enabled,
    nextRunAt: row.next_run_at || null,
    lastRunAt: row.last_run_at || null,
    lastRunId: row.last_run_id || null,
    lastError: row.last_error || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function plainObject(value, field) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw statusError(422, `${field} must be an object.`);
  return value;
}

function nodeIdList(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw statusError(422, "nodeIds must be an array of node ids.");
  return [...new Set(value.map(String))];
}

/** Refuses a trigger the workflow could not run today, so a typo fails when
 * the trigger is saved, not at 3am. The workflow can still change later; a
 * firing that no longer validates records `lastError`. */
function validateAgainst(document, { inputs, nodeIds }) {
  planWaves(document, nodeIds.length ? nodeIds : undefined);
  applyInputs(document, inputs);
}

async function listTriggers(projectId) {
  const result = await pool.query(
    "SELECT * FROM advanced_workflow_triggers WHERE project_id = $1 ORDER BY created_at",
    [projectId]
  );
  return result.rows.map(shapeTrigger);
}

async function getTrigger(projectId, triggerId) {
  const result = await pool.query(
    "SELECT * FROM advanced_workflow_triggers WHERE project_id = $1 AND id = $2",
    [projectId, triggerId]
  );
  return result.rowCount ? shapeTrigger(result.rows[0]) : null;
}

/** Creates a trigger. `webhook: true` returns `webhookToken`, the only time
 * the token is ever shown. */
async function createTrigger(projectId, document, body = {}) {
  const count = await pool.query("SELECT COUNT(*)::int AS count FROM advanced_workflow_triggers WHERE project_id = $1", [projectId]);
  if (count.rows[0].count >= MAX_TRIGGERS_PER_PROJECT) throw statusError(422, `A workflow has at most ${MAX_TRIGGERS_PER_PROJECT} triggers.`);
  const name = String(body.name || "").trim().slice(0, 100) || "Automation";
  const inputs = plainObject(body.inputs, "inputs");
  const nodeIds = nodeIdList(body.nodeIds);
  const schedule = sanitizeSchedule(body.schedule);
  const enabled = body.enabled !== false;
  validateAgainst(document, { inputs, nodeIds });

  const webhookToken = body.webhook === true ? crypto.randomBytes(24).toString("base64url") : null;
  const created = await pool.query(
    `INSERT INTO advanced_workflow_triggers (project_id, name, inputs, node_ids, schedule, webhook_token_hash, enabled, next_run_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8)
     RETURNING *`,
    [
      projectId,
      name,
      JSON.stringify(inputs),
      JSON.stringify(nodeIds),
      schedule ? JSON.stringify(schedule) : null,
      webhookToken ? hashToken(webhookToken) : null,
      enabled,
      enabled ? nextRunAt(schedule) : null,
    ]
  );
  return { trigger: shapeTrigger(created.rows[0]), ...(webhookToken ? { webhookToken } : {}) };
}

/** Changes the fields given. `webhook: true` issues a new token (the old
 * one stops working), `webhook: false` removes the webhook. */
async function updateTrigger(projectId, triggerId, document, body = {}) {
  const existing = await getTrigger(projectId, triggerId);
  if (!existing) throw statusError(404, "Trigger not found.");
  const name = body.name == null ? existing.name : String(body.name).trim().slice(0, 100) || existing.name;
  const inputs = body.inputs === undefined ? existing.inputs : plainObject(body.inputs, "inputs");
  const nodeIds = body.nodeIds === undefined ? existing.nodeIds : nodeIdList(body.nodeIds);
  const schedule = body.schedule === undefined ? existing.schedule : sanitizeSchedule(body.schedule);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : existing.enabled;
  validateAgainst(document, { inputs, nodeIds });

  const webhookToken = body.webhook === true ? crypto.randomBytes(24).toString("base64url") : null;
  const scheduleChanged = body.schedule !== undefined || enabled !== existing.enabled;
  const updated = await pool.query(
    `UPDATE advanced_workflow_triggers SET
       name = $3, inputs = $4::jsonb, node_ids = $5::jsonb, schedule = $6::jsonb, enabled = $7,
       webhook_token_hash = CASE WHEN $8::text IS NOT NULL THEN $8 WHEN $9 THEN NULL ELSE webhook_token_hash END,
       next_run_at = CASE WHEN $10 THEN $11::timestamptz ELSE next_run_at END,
       updated_at = now()
     WHERE project_id = $1 AND id = $2
     RETURNING *`,
    [
      projectId,
      triggerId,
      name,
      JSON.stringify(inputs),
      JSON.stringify(nodeIds),
      schedule ? JSON.stringify(schedule) : null,
      enabled,
      webhookToken ? hashToken(webhookToken) : null,
      body.webhook === false,
      scheduleChanged,
      enabled ? nextRunAt(schedule) : null,
    ]
  );
  return { trigger: shapeTrigger(updated.rows[0]), ...(webhookToken ? { webhookToken } : {}) };
}

async function deleteTrigger(projectId, triggerId) {
  const result = await pool.query("DELETE FROM advanced_workflow_triggers WHERE project_id = $1 AND id = $2", [projectId, triggerId]);
  return result.rowCount > 0;
}

/**
 * Starts a run for `trigger` on the workflow as it is now. `inputs` (from a
 * webhook or a manual run) override the trigger's own. Records the outcome
 * on the trigger either way; throws the refusal (409 still running, 422
 * invalid) to the caller.
 */
async function fireTrigger(trigger, { inputs = {}, requestId } = {}) {
  try {
    if (triggerIsRunning(trigger.id)) throw statusError(409, "Skipped: this trigger's previous run is still going.");
    const row = await loadProject(trigger.projectId);
    if (!row) throw statusError(404, "Advanced Studio project not found.");
    const started = await startRun({
      projectId: trigger.projectId,
      document: sanitizeAdvancedDocument(row.document),
      nodeIds: trigger.nodeIds.length ? trigger.nodeIds : undefined,
      inputs: { ...trigger.inputs, ...plainObject(inputs, "inputs") },
      triggerId: trigger.id,
      requestId,
    });
    await pool.query(
      "UPDATE advanced_workflow_triggers SET last_run_at = now(), last_run_id = $2, last_error = NULL WHERE id = $1",
      [trigger.id, started.run.id]
    );
    return started;
  } catch (error) {
    await pool.query("UPDATE advanced_workflow_triggers SET last_error = $2 WHERE id = $1", [trigger.id, error.message.slice(0, 500)]);
    throw error;
  }
}

/** The trigger a webhook call names, when its token matches; null otherwise
 * (an unknown trigger and a wrong token look the same to the caller). */
async function verifyWebhook(triggerId, token) {
  if (!token) return null;
  const result = await pool.query(
    `SELECT t.* FROM advanced_workflow_triggers t
     JOIN studio_projects p ON p.id = t.project_id AND p.archived_at IS NULL
     WHERE t.id = $1 AND t.webhook_token_hash IS NOT NULL`,
    [triggerId]
  );
  if (!result.rowCount) return null;
  const expected = Buffer.from(result.rows[0].webhook_token_hash, "hex");
  const given = Buffer.from(hashToken(token), "hex");
  return crypto.timingSafeEqual(expected, given) ? shapeTrigger(result.rows[0]) : null;
}

/** Fires every enabled, scheduled trigger that is due. The next slot is
 * booked before firing, so a trigger that fails does not retry every tick. */
async function runDueTriggers(now = new Date()) {
  const due = await pool.query(
    `SELECT t.* FROM advanced_workflow_triggers t
     JOIN studio_projects p ON p.id = t.project_id AND p.archived_at IS NULL
     WHERE t.enabled AND t.schedule IS NOT NULL AND t.next_run_at <= $1
     ORDER BY t.next_run_at`,
    [now]
  );
  const fired = [];
  for (const row of due.rows) {
    const trigger = shapeTrigger(row);
    await pool.query("UPDATE advanced_workflow_triggers SET next_run_at = $2 WHERE id = $1", [trigger.id, nextRunAt(trigger.schedule, now)]);
    try {
      const { run } = await fireTrigger(trigger);
      fired.push({ triggerId: trigger.id, runId: run.id });
    } catch (error) {
      logger.warn("scheduled trigger did not start", { triggerId: trigger.id, projectId: trigger.projectId, error: error.message });
      fired.push({ triggerId: trigger.id, error: error.message });
    }
  }
  return fired;
}

function startScheduler() {
  const tick = () => runDueTriggers().catch((error) => logger.error("trigger scheduler failed", { error: error.message }));
  const timer = setInterval(tick, TICK_MS);
  timer.unref();
  void tick();
  return timer;
}

module.exports = {
  createTrigger,
  deleteTrigger,
  fireTrigger,
  getTrigger,
  listTriggers,
  nextRunAt,
  runDueTriggers,
  sanitizeSchedule,
  startScheduler,
  updateTrigger,
  verifyWebhook,
};

/**
 * Versions and run records for Advanced Studio (db/migrations/016).
 *
 * A version is keyed by the workflow's *recipe*: node types, settings and
 * wiring. Positions, sizes, labels, groups, the viewport and run outputs are
 * presentation or history, so they never make a new version.
 */
const crypto = require("crypto");
const { pool } = require("../db/pool");

const RUN_OUTPUT_FIELDS = ["status", "error", "results", "activeResultIndex"];
const GENERATOR_TYPES = new Set(["imageGenerator", "videoGenerator"]);

/** The document without generator run state — what a version stores. */
function withoutRunState(document) {
  return {
    ...document,
    nodes: (document.nodes || []).map((node) => {
      if (!GENERATOR_TYPES.has(node.type)) return node;
      const data = { ...node.data };
      for (const field of RUN_OUTPUT_FIELDS) delete data[field];
      return { ...node, data };
    }),
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function recipeHash(document) {
  const recipe = {
    nodes: withoutRunState(document).nodes
      .filter((node) => node.type !== "group")
      .map((node) => ({ id: node.id, type: node.type, data: node.data }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: (document.edges || [])
      .map((edge) => ({ source: edge.source, target: edge.target, sourceHandle: edge.sourceHandle || null, targetHandle: edge.targetHandle || null }))
      .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b))),
  };
  return crypto.createHash("sha256").update(stableStringify(recipe)).digest("hex");
}

/** Serializes this process's writes per project. Runs persist outcomes from
 * several nodes (and batch rows) at once; queuing them here means they never
 * conflict with each other, only — rarely — with an autosave. */
const projectLocks = new Map();
function withProjectLock(projectId, fn) {
  const previous = projectLocks.get(projectId) || Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  const settled = next.catch(() => {});
  projectLocks.set(projectId, settled);
  settled.then(() => {
    if (projectLocks.get(projectId) === settled) projectLocks.delete(projectId);
  });
  return next;
}

function shapeVersion(row, { includeDocument = false } = {}) {
  return {
    id: row.id,
    version: Number(row.version),
    createdAt: row.created_at,
    ...(row.run_count !== undefined ? {
      runCount: Number(row.run_count),
      lastRunAt: row.last_run_at || null,
      // Summed from each completed generation's recorded estimate. Engines
      // billed through a plan (Codex, fal) record none, so
      // pricedGenerationCount < generationCount means the total is partial.
      costUsd: row.cost_usd == null ? null : Number(row.cost_usd),
      generationCount: Number(row.generation_count),
      pricedGenerationCount: Number(row.priced_count),
    } : {}),
    ...(includeDocument ? { document: row.document } : {}),
  };
}

/** The version for this document's recipe, created on first use. */
function ensureVersion(projectId, document) {
  const hash = recipeHash(document);
  return withProjectLock(`version:${projectId}`, async () => {
    const existing = await pool.query(
      "SELECT * FROM advanced_workflow_versions WHERE project_id = $1 AND recipe_hash = $2",
      [projectId, hash]
    );
    if (existing.rowCount) return shapeVersion(existing.rows[0]);
    const created = await pool.query(
      `INSERT INTO advanced_workflow_versions (project_id, version, recipe_hash, document)
       SELECT $1, COALESCE(MAX(version), 0) + 1, $2, $3::jsonb FROM advanced_workflow_versions WHERE project_id = $1
       RETURNING *`,
      [projectId, hash, JSON.stringify(withoutRunState(document))]
    );
    return shapeVersion(created.rows[0]);
  });
}

async function findVersionByHash(projectId, document) {
  const result = await pool.query(
    "SELECT id FROM advanced_workflow_versions WHERE project_id = $1 AND recipe_hash = $2",
    [projectId, recipeHash(document)]
  );
  return result.rows[0]?.id || null;
}

async function listVersions(projectId) {
  const result = await pool.query(
    `SELECT v.id, v.version, v.created_at,
       COUNT(DISTINCT r.id) AS run_count,
       MAX(r.created_at) AS last_run_at,
       COUNT(g.id) AS generation_count,
       COUNT(g.usage_metrics->>'estimatedCostUsd') AS priced_count,
       SUM((g.usage_metrics->>'estimatedCostUsd')::numeric) AS cost_usd
     FROM advanced_workflow_versions v
     LEFT JOIN advanced_workflow_runs r ON r.version_id = v.id
     LEFT JOIN generations g ON g.advanced_run_id = r.id AND g.status = 'completed'
     WHERE v.project_id = $1
     GROUP BY v.id
     ORDER BY v.version DESC`,
    [projectId]
  );
  return result.rows.map((row) => shapeVersion(row));
}

async function getVersion(projectId, versionId) {
  const result = await pool.query(
    "SELECT * FROM advanced_workflow_versions WHERE project_id = $1 AND id = $2",
    [projectId, versionId]
  );
  return result.rowCount ? shapeVersion(result.rows[0], { includeDocument: true }) : null;
}

function shapeRun(row) {
  const nodes = row.nodes || {};
  return {
    id: row.id,
    projectId: row.project_id,
    versionId: row.version_id,
    version: row.version == null ? null : Number(row.version),
    batchId: row.batch_id || null,
    inputs: row.inputs || {},
    nodeIds: row.node_ids || [],
    status: row.status,
    nodes,
    outputs: Object.entries(nodes).flatMap(([nodeId, outcome]) =>
      (outcome.results || []).map((result) => ({ nodeId, ...result }))
    ),
    estimatedCostUsd: row.estimated_cost_usd == null ? null : Number(row.estimated_cost_usd),
    errorSummary: row.error_summary || null,
    createdAt: row.created_at,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
  };
}

const RUN_SELECT = `SELECT r.*, v.version,
  (SELECT SUM((g.usage_metrics->>'estimatedCostUsd')::numeric) FROM generations g
     WHERE g.advanced_run_id = r.id AND g.status = 'completed') AS estimated_cost_usd
  FROM advanced_workflow_runs r JOIN advanced_workflow_versions v ON v.id = r.version_id`;

async function createRun({ projectId, versionId, batchId = null, inputs = {}, nodeIds }) {
  const created = await pool.query(
    `INSERT INTO advanced_workflow_runs (project_id, version_id, batch_id, inputs, node_ids, nodes)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
     RETURNING id`,
    [
      projectId,
      versionId,
      batchId,
      JSON.stringify(inputs),
      JSON.stringify(nodeIds),
      JSON.stringify(Object.fromEntries(nodeIds.map((id) => [id, { status: "queued", results: [] }]))),
    ]
  );
  return getRun(projectId, created.rows[0].id);
}

async function getRun(projectId, runId) {
  const result = await pool.query(`${RUN_SELECT} WHERE r.project_id = $1 AND r.id = $2`, [projectId, runId]);
  return result.rowCount ? shapeRun(result.rows[0]) : null;
}

async function listRuns(projectId, { versionId, batchId, limit = 50 } = {}) {
  const params = [projectId];
  const where = ["r.project_id = $1"];
  if (versionId) { params.push(versionId); where.push(`r.version_id = $${params.length}`); }
  if (batchId) { params.push(batchId); where.push(`r.batch_id = $${params.length}`); }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const result = await pool.query(
    `${RUN_SELECT} WHERE ${where.join(" AND ")} ORDER BY r.created_at DESC LIMIT $${params.length}`,
    params
  );
  return result.rows.map(shapeRun);
}

function markRunStarted(runId) {
  return pool.query(
    "UPDATE advanced_workflow_runs SET status = 'running', started_at = now() WHERE id = $1",
    [runId]
  );
}

/** Records one node's outcome; each node writes only its own key. */
function recordNodeOutcome(runId, nodeId, outcome) {
  return pool.query(
    "UPDATE advanced_workflow_runs SET nodes = nodes || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1",
    [runId, nodeId, JSON.stringify(outcome)]
  );
}

function finishRun(runId, outcomes, errorSummary = null) {
  const statuses = Object.values(outcomes);
  const done = statuses.filter((status) => status === "done").length;
  const status = statuses.length && done === statuses.length ? "completed" : done ? "partial" : "failed";
  return pool.query(
    "UPDATE advanced_workflow_runs SET status = $2, error_summary = $3, completed_at = now() WHERE id = $1",
    [runId, status, errorSummary]
  );
}

module.exports = {
  RUN_OUTPUT_FIELDS,
  createRun,
  ensureVersion,
  findVersionByHash,
  finishRun,
  getRun,
  getVersion,
  listRuns,
  listVersions,
  markRunStarted,
  recipeHash,
  recordNodeOutcome,
  withProjectLock,
  withoutRunState,
};

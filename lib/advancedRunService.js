/**
 * Starting, executing and resuming Advanced Studio workflow runs.
 *
 * Shared by the HTTP routes (canvas Run, run_workflow, batches, resume) and
 * the trigger scheduler, so every way a run starts goes through the same
 * validation, version record, spending path and canvas write-back.
 *
 * Runs execute in this process. `liveRuns` is the only place a node that is
 * generating is visible, because a run writes a node to the document only
 * when it finishes — a long generation never holds a revision open. A run
 * cut off by a restart is closed by `recoverInterruptedRuns` at startup and
 * can be resumed.
 */
const { pool } = require("../db/pool");
const logger = require("./logger");
const { ADVANCED_SCHEMA_VERSION, sanitizeAdvancedDocument } = require("./advancedStudioProject");
const { planWaves, runWaves } = require("./advancedWorkflowRunner");
const { applyInputs, resolveSources } = require("./advancedRunInputs");
const { createRunState, executeNode, findNode } = require("./advancedNodes/resolve");
const { UUID_PATTERN } = require("./advancedNodes/shared");
const {
  createRun,
  ensureVersion,
  finishRun,
  getRun,
  getVersion,
  markRunStarted,
  recordNodeOutcome,
  withCurrentResults,
  withProjectLock,
} = require("./advancedRuns");

const WORKSPACE = "advanced";
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;

/** Runs in flight in this process, keyed by run id:
 * `{ projectId, triggerId, queued: Set, running: Set }` of node ids. */
const liveRuns = new Map();

function statusError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateDocument(input) {
  const bytes = Buffer.byteLength(JSON.stringify(input ?? null), "utf8");
  if (bytes > MAX_DOCUMENT_BYTES) throw statusError(413, "This Advanced Studio project is too large to save.");
  return sanitizeAdvancedDocument(input);
}

async function loadProject(id) {
  if (!UUID_PATTERN.test(String(id))) return null;
  const result = await pool.query(
    "SELECT * FROM studio_projects WHERE id = $1 AND workspace = $2 AND archived_at IS NULL",
    [id, WORKSPACE]
  );
  return result.rowCount ? result.rows[0] : null;
}

async function saveDocument(id, document, expectedRevision) {
  const saved = await pool.query(
    `UPDATE studio_projects
     SET document = $1::jsonb, schema_version = $2, revision = revision + 1, updated_at = now()
     WHERE id = $3 AND revision = $4 AND workspace = $5 AND archived_at IS NULL
     RETURNING *`,
    [JSON.stringify(validateDocument(document)), ADVANCED_SCHEMA_VERSION, id, expectedRevision, WORKSPACE]
  );
  return saved.rowCount ? saved.rows[0] : null;
}

/** Live run state for a project, null when nothing is running. */
function activeRun(projectId) {
  const runIds = [];
  const running = new Set();
  const queued = new Set();
  for (const [runId, live] of liveRuns) {
    if (live.projectId !== projectId) continue;
    runIds.push(runId);
    for (const nodeId of live.running) running.add(nodeId);
    for (const nodeId of live.queued) queued.add(nodeId);
  }
  if (!runIds.length) return null;
  return { runIds, running: [...running], queued: [...queued].filter((nodeId) => !running.has(nodeId)) };
}

function liveRunShape(run) {
  const live = liveRuns.get(run.id);
  return live ? { ...run, live: { running: [...live.running], queued: [...live.queued] } } : run;
}

/** True while a run started by this trigger is still in flight. */
function triggerIsRunning(triggerId) {
  return [...liveRuns.values()].some((live) => live.triggerId === triggerId);
}

/**
 * Applies a finished node to the project's *current* document: appends the
 * run's new results and sets status/error, leaving everything else — other
 * nodes, edges, positions — to whoever edited it meanwhile.
 *
 * A generation can take minutes, and autosave keeps running throughout, so
 * pinning the write to the revision read before the run would reject the
 * result of a perfectly good generation. Re-reading here, inside the
 * project's write lock, means runs never conflict with each other and only
 * rarely with an autosave, which one retry resolves.
 */
function persistRunOutcome(projectId, nodeId, outcome) {
  return withProjectLock(projectId, () => writeRunOutcome(projectId, nodeId, outcome));
}

async function writeRunOutcome(projectId, nodeId, { status, error, newResults }, attempt = 0) {
  const current = await loadProject(projectId);
  if (!current) return null;
  const document = sanitizeAdvancedDocument(current.document);
  const node = findNode(document, nodeId);
  // The node may have been deleted mid-run; its results still exist in
  // history and in the run record, there is simply nowhere to attach them.
  if (!node) return { row: current, missingNode: true };

  if (newResults.length) {
    node.data.results = [...(node.data.results || []), ...newResults].slice(-8);
    node.data.activeResultIndex = node.data.results.length - 1;
  }
  node.data.status = status;
  if (error) node.data.error = error;
  else delete node.data.error;

  const saved = await saveDocument(projectId, document, Number(current.revision));
  if (saved) return { row: saved };
  if (attempt < 2) return writeRunOutcome(projectId, nodeId, { status, error, newResults }, attempt + 1);
  return null;
}

/**
 * Executes a started run: resolves its input sources, then runs the waves.
 * `runDocument` is the run's private copy — inputs applied, upstream results
 * from *this* run — so batch rows running the same workflow at once never
 * read each other's outputs. Each finished node is written to the run record
 * (with the items it produced, so a resume can pick up from it) and to the
 * canvas.
 */
async function executeRun({ runId, projectId, runDocument, waves, live, state, requestId }) {
  await markRunStarted(runId);
  const finishNode = async (nodeId, recordStatus, error, results, items) => {
    const node = findNode(runDocument, nodeId);
    await recordNodeOutcome(runId, nodeId, {
      status: recordStatus,
      error: error || null,
      results,
      ...(items ? { items } : {}),
      type: node?.type,
      ...(node?.label ? { label: node.label } : {}),
    });
    await persistRunOutcome(projectId, nodeId, { status: recordStatus === "done" ? "done" : "error", error, newResults: results });
  };

  try {
    await resolveSources(runDocument, projectId);
  } catch (error) {
    const outcomes = {};
    for (const nodeId of waves.flat()) {
      live.queued.delete(nodeId);
      outcomes[nodeId] = "error";
      await finishNode(nodeId, "error", error.message, []);
    }
    await finishRun(runId, outcomes, error.message);
    return outcomes;
  }

  const outcomes = await runWaves(runDocument, waves, {
    runNode: async (nodeId) => {
      live.queued.delete(nodeId);
      live.running.add(nodeId);
      let result;
      try {
        result = await executeNode(runDocument, nodeId, state, { projectId, runId, requestId });
      } finally {
        live.running.delete(nodeId);
      }
      await finishNode(nodeId, result.ok ? "done" : "error", result.ok ? null : result.error, result.results, result.items);
      return result;
    },
    skipNode: async (nodeId, failedNodeId) => {
      live.queued.delete(nodeId);
      const node = findNode(runDocument, nodeId);
      node.data.status = "error";
      node.data.error = `Upstream node ${failedNodeId} failed.`;
      await finishNode(nodeId, "skipped", node.data.error, []);
    },
  });
  const unfinished = Object.values(outcomes).filter((status) => status !== "done").length;
  await finishRun(runId, outcomes, unfinished ? `${unfinished} of ${Object.keys(outcomes).length} nodes did not finish.` : null);
  return outcomes;
}

/**
 * Validates and records a run, then starts it without waiting. Throws 422s
 * (bad node ids, a cycle, unknown or invalid inputs) before anything is
 * recorded or spent. `seed` maps node ids to items already produced (a
 * resume). Resolves to the run plus a `completion` promise.
 */
async function startRun({
  projectId,
  document,
  nodeIds,
  inputs = {},
  batchId = null,
  version = null,
  seed = {},
  resumedFrom = null,
  triggerId = null,
  requestId,
}) {
  const waves = planWaves(document, nodeIds);
  const started = waves.flat();
  if (!started.length) throw statusError(422, "This workflow has no nodes that run.");
  const runDocument = applyInputs(document, inputs);
  const runVersion = version || await ensureVersion(projectId, document);
  const run = await createRun({ projectId, versionId: runVersion.id, batchId, inputs, nodeIds: started, resumedFrom, triggerId });
  const live = { projectId, triggerId, queued: new Set(started), running: new Set() };
  liveRuns.set(run.id, live);
  const completion = executeRun({ runId: run.id, projectId, runDocument, waves, live, state: createRunState(seed), requestId })
    .catch((error) => {
      logger.error("advanced workflow run failed", { projectId, runId: run.id, requestId, error: error.message });
      return finishRun(run.id, {}, error.message).catch(() => {});
    })
    .finally(() => liveRuns.delete(run.id));
  return { run, version: runVersion, waves, started, completion };
}

/** What a finished node offered downstream, from its run record. Records
 * from before items were stored fall back to the node's last result. */
function recordedItems(outcome) {
  if (Array.isArray(outcome.items)) return outcome.items;
  const last = (outcome.results || [])[(outcome.results || []).length - 1];
  if (!last) return [];
  return [{ ...(last.imageUrl ? { image: last.imageUrl } : {}), ...(last.videoUrl ? { video: last.videoUrl } : {}), ...(last.text ? { text: last.text } : {}) }];
}

/**
 * Runs the nodes a failed or partial run did not finish, with the same
 * version and inputs. Nodes it did finish are not run again: what they
 * produced feeds the resumed nodes as it did the first time.
 */
async function resumeRun({ projectId, runId, requestId }) {
  const run = await getRun(projectId, runId);
  if (!run) throw statusError(404, "Run not found.");
  if (!["partial", "failed"].includes(run.status)) throw statusError(409, "Only a failed or partial run can be resumed.");
  const unfinished = run.nodeIds.filter((nodeId) => run.nodes[nodeId]?.status !== "done");
  if (!unfinished.length) throw statusError(409, "Every node of this run finished.");
  const [row, version] = await Promise.all([loadProject(projectId), getVersion(projectId, run.versionId)]);
  if (!row) throw statusError(404, "Advanced Studio project not found.");
  if (!version) throw statusError(404, "This run's version no longer exists.");

  const document = sanitizeAdvancedDocument(withCurrentResults(version.document, sanitizeAdvancedDocument(row.document)));
  const seed = Object.fromEntries(run.nodeIds
    .filter((nodeId) => run.nodes[nodeId]?.status === "done")
    .map((nodeId) => [nodeId, recordedItems(run.nodes[nodeId])]));
  return startRun({
    projectId,
    document,
    nodeIds: unfinished,
    inputs: run.inputs,
    batchId: run.batchId,
    version: { id: version.id, version: version.version },
    seed,
    resumedFrom: run.id,
    triggerId: run.triggerId,
    requestId,
  });
}

module.exports = {
  WORKSPACE,
  activeRun,
  liveRunShape,
  loadProject,
  resumeRun,
  saveDocument,
  startRun,
  triggerIsRunning,
  validateDocument,
};

/**
 * Advanced Studio project API.
 *
 * Shares `studio_projects` with the guided Studio, discriminated by the
 * `workspace` column, and reuses the guided Studio's optimistic-concurrency
 * contract (`expectedRevision` -> 409 + `currentRevision`) so the client-side
 * autosave machinery is identical. Everything graph-shaped goes through
 * lib/advancedStudioProject.js, which owns the Advanced Studio vocabulary.
 */
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { pool } = require("../db/pool");
const { asyncHandler, isUuid, cleanup } = require("./helpers");
const {
  ADVANCED_SCHEMA_VERSION,
  defaultAdvancedDocument,
  diagnoseAdvancedDocument,
  sanitizeAdvancedDocument,
  templateDocument,
} = require("../lib/advancedStudioProject");
const { diagnoseGeneratorSettings, listAdvancedCapabilities } = require("../lib/advancedCapabilities");
const { describeNodeTypes, isExecutable } = require("../lib/advancedNodes");
const { PRESETS: TRANSFORM_PRESETS } = require("../lib/advancedNodes/imageTransform");
const { findNode } = require("../lib/advancedNodes/resolve");
const { normalizeToPng } = require("../lib/imageNormalizer");
const storage = require("../lib/storage");
const { resultThumbnail, sourceThumbnails } = require("../lib/thumbnails");
const { planWaves } = require("../lib/advancedWorkflowRunner");
const { applyInputs, declaredInputs } = require("../lib/advancedRunInputs");
const {
  WORKSPACE,
  activeRun,
  liveRunShape,
  loadProject,
  resumeRun,
  saveDocument,
  startRun,
  validateDocument,
} = require("../lib/advancedRunService");
const {
  MAX_SHARE_FILE_BYTES,
  MEDIA_EXTENSIONS,
  applyReplacements,
  compatibilityReport,
  exportWorkflow,
  materializeAssets,
  parseShareFile,
} = require("../lib/advancedWorkflowShare");
const {
  createTrigger,
  deleteTrigger,
  fireTrigger,
  getTrigger,
  listTriggers,
  updateTrigger,
  verifyWebhook,
} = require("../lib/advancedTriggers");
const {
  ensureVersion,
  findVersionByHash,
  getRun,
  getVersion,
  listRuns,
  listVersions,
  withCurrentResults,
} = require("../lib/advancedRuns");

const router = express.Router();
/** Nodes with a generation in flight, keyed `projectId:nodeId`. The node's
 * persisted status cannot serve as this guard: a run is not written to the
 * document until it finishes, precisely so a long generation does not hold a
 * revision open. */
const runningNodes = new Set();
const tempDir = path.join(__dirname, "..", "tmp", "advanced-studio");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const mediaUpload = multer({ dest: tempDir, limits: { fileSize: MAX_MEDIA_BYTES } });
const shareUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SHARE_FILE_BYTES } });

function enabled() {
  return process.env.FLUID_STUDIO_ENABLED !== "false";
}

function shape(row) {
  return {
    id: row.id,
    name: row.name,
    workspace: WORKSPACE,
    template: row.template || "blank",
    schemaVersion: row.schema_version,
    revision: Number(row.revision),
    document: sanitizeAdvancedDocument(row.document),
    inputs: declaredInputs(sanitizeAdvancedDocument(row.document)),
    activeRun: activeRun(row.id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function projectPreview(rawDocument) {
  const document = sanitizeAdvancedDocument(rawDocument);
  const nodes = document.nodes || [];
  const generatedImageUrl = [...nodes]
    .reverse()
    .map((node) => {
      if (!isExecutable(node)) return null;
      const results = node.data?.results || [];
      const active = results[node.data?.activeResultIndex ?? 0] || results[results.length - 1];
      return active?.imageUrl || null;
    })
    .find(Boolean) || null;
  const loadedImageUrls = nodes
    .filter((node) => node.type === "imageInput" && node.data?.imageUrl)
    .map((node) => node.data.imageUrl)
    .filter((url, index, urls) => urls.indexOf(url) === index)
    .slice(0, 4);
  return { generatedImageUrl: resultThumbnail(generatedImageUrl), loadedImageUrls: sourceThumbnails(loadedImageUrls) };
}

function summary(row) {
  return {
    id: row.id,
    name: row.name,
    workspace: WORKSPACE,
    template: row.template || "blank",
    schemaVersion: row.schema_version,
    revision: Number(row.revision),
    nodeCount: (sanitizeAdvancedDocument(row.document).nodes || []).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preview: projectPreview(row.document),
  };
}

/** Warnings for a document a client sent, so hand-written graphs learn what
 * sanitizing dropped or what the engine will ignore. The canvas ignores them. */
function documentWarnings(input, document) {
  return [...diagnoseAdvancedDocument(input, document), ...diagnoseGeneratorSettings(document)];
}

router.use((req, res, next) => {
  if (!enabled()) return res.status(404).json({ error: "Advanced Studio is disabled." });
  next();
});

/**
 * Webhook for a trigger: an outside service (a form, a CMS, a script) starts
 * the trigger's workflow, optionally with `{ inputs }` that override the
 * trigger's own. The token goes in `Authorization: Bearer <token>` or
 * `X-PoseForge-Token`, never the URL, so it stays out of logs.
 */
router.post("/hooks/:triggerId", asyncHandler(async (req, res) => {
  const header = req.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "").trim() || req.get("x-poseforge-token") || "";
  const trigger = isUuid(req.params.triggerId) ? await verifyWebhook(req.params.triggerId, token) : null;
  if (!trigger) return res.status(401).json({ error: "Unknown trigger or wrong token." });
  if (!trigger.enabled) return res.status(409).json({ error: "This trigger is turned off." });
  const { run } = await fireTrigger(trigger, { inputs: req.body?.inputs || {}, requestId: req.requestId });
  res.status(202).json({ runId: run.id, projectId: trigger.projectId });
}));

// Declared before `/:id` so the literal path is not read as a project id.
router.get("/capabilities", asyncHandler(async (req, res) => {
  res.json({
    engines: await listAdvancedCapabilities(),
    nodeTypes: describeNodeTypes(),
    transformPresets: Object.keys(TRANSFORM_PRESETS),
  });
}));

/** Reads the uploaded share file of an import request. */
async function readShareUpload(req) {
  if (!req.file) {
    const error = new Error("Choose a PoseForge workflow file (.json) to import.");
    error.statusCode = 400;
    throw error;
  }
  return parseShareFile(req.file.buffer);
}

function shareSummary(parsed, report) {
  return {
    name: parsed.name,
    nodeCount: parsed.document.nodes.length,
    generatorCount: report.generators.length,
    embeddedFiles: parsed.assets.size,
    inputs: parsed.inputs,
    report,
    warnings: parsed.warnings,
  };
}

// Declared before `/:id` so `import` is not read as a project id.
router.post("/import/preview", shareUpload.single("file"), asyncHandler(async (req, res) => {
  const parsed = await readShareUpload(req);
  res.json(shareSummary(parsed, compatibilityReport(parsed.document, await listAdvancedCapabilities())));
}));

/** Creates a project from a share file. `replacements` (JSON, optional)
 * switches named generators to another model; every other generator keeps
 * the author's engine and model, set up here or not. */
router.post("/import", shareUpload.single("file"), asyncHandler(async (req, res) => {
  const parsed = await readShareUpload(req);
  let replacements = {};
  if (req.body?.replacements) {
    try {
      replacements = JSON.parse(req.body.replacements);
    } catch {
      return res.status(400).json({ error: "replacements must be JSON: { \"<nodeId>\": { \"engine\": \"...\", \"model\": \"...\" } }." });
    }
  }
  const capabilities = await listAdvancedCapabilities();
  const document = applyReplacements(parsed.document, replacements, capabilities);
  const name = String(req.body?.name || parsed.name).trim().slice(0, 100) || parsed.name;

  // Assets are stored under the project id, so the row comes first; a failed
  // store removes the half-imported project again.
  const created = await pool.query(
    `INSERT INTO studio_projects (name, schema_version, document, workspace, template)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING *`,
    [name, ADVANCED_SCHEMA_VERSION, JSON.stringify(validateDocument(document)), WORKSPACE, document.template]
  );
  const projectId = created.rows[0].id;
  let saved;
  try {
    const materialized = await materializeAssets(projectId, document, parsed.assets);
    saved = await pool.query(
      "UPDATE studio_projects SET document = $1::jsonb WHERE id = $2 RETURNING *",
      [JSON.stringify(validateDocument(materialized)), projectId]
    );
  } catch (error) {
    await pool.query("DELETE FROM studio_projects WHERE id = $1", [projectId]);
    await fs.promises.rm(storage.absolutePath(storage.getAdvancedProjectDir(projectId)), { recursive: true, force: true });
    throw error;
  }
  const project = shape(saved.rows[0]);
  res.status(201).json({ ...project, report: compatibilityReport(project.document, capabilities), warnings: parsed.warnings });
}));

router.get("/", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, template, schema_version, revision, created_at, updated_at, document
     FROM studio_projects
     WHERE workspace = $1 AND archived_at IS NULL
     ORDER BY updated_at DESC, created_at DESC`,
    [WORKSPACE]
  );
  res.json({ projects: result.rows.map(summary) });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  res.json(shape(row));
}));

router.post("/", asyncHandler(async (req, res) => {
  const template = String(req.body?.template || "blank");
  const name = String(req.body?.name || "Untitled workflow").trim().slice(0, 100) || "Untitled workflow";
  const document = req.body?.document ? validateDocument(req.body.document) : templateDocument(template);
  const result = await pool.query(
    `INSERT INTO studio_projects (name, schema_version, document, workspace, template)
     VALUES ($1, $2, $3::jsonb, $4, $5)
     RETURNING *`,
    [name, ADVANCED_SCHEMA_VERSION, JSON.stringify(document), WORKSPACE, document.template]
  );
  const warnings = req.body?.document ? documentWarnings(req.body.document, document) : [];
  res.status(201).json({ ...shape(result.rows[0]), warnings });
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const expectedRevision = Number(req.body?.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return res.status(400).json({ error: "A valid expectedRevision is required." });
  }
  const name = req.body?.name == null ? null : String(req.body.name).trim().slice(0, 100);
  const document = validateDocument(req.body?.document);
  const saved = await pool.query(
    `UPDATE studio_projects
     SET document = $1::jsonb,
         schema_version = $2,
         name = COALESCE($6, name),
         template = $7,
         revision = revision + 1,
         updated_at = now()
     WHERE id = $3 AND revision = $4 AND workspace = $5 AND archived_at IS NULL
     RETURNING *`,
    [JSON.stringify(document), ADVANCED_SCHEMA_VERSION, req.params.id, expectedRevision, WORKSPACE, name || null, document.template]
  );
  if (!saved.rowCount) {
    return res.status(409).json({
      error: "This project changed in another tab. Reload before saving again.",
      currentRevision: Number(row.revision),
    });
  }
  res.json({ ...shape(saved.rows[0]), warnings: documentWarnings(req.body?.document, document) });
}));

/** The project as a share file: nodes, wiring, prompts, chosen models and
 * embedded input files, without outputs. See lib/advancedWorkflowShare.js. */
router.get("/:id/export", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const file = await exportWorkflow(row);
  const slug = String(row.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "workflow";
  res.setHeader("Content-Disposition", `attachment; filename="${slug}.poseforge.json"`);
  res.json(file);
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  await pool.query(
    "UPDATE studio_projects SET archived_at = now(), updated_at = now() WHERE id = $1 AND workspace = $2",
    [req.params.id, WORKSPACE]
  );
  res.status(204).end();
}));

/** Stores an Image Input node's upload beside the project's other assets and
 * returns its public URL. Uses the existing filesystem media layer — Advanced
 * Studio introduces no second storage system. */
router.post("/:id/assets", upload.single("image"), asyncHandler(async (req, res) => {
  try {
    const row = await loadProject(req.params.id);
    if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
    if (!req.file) return res.status(400).json({ error: "An image is required." });
    const assetId = crypto.randomUUID();
    const relativePath = storage.getAdvancedAssetPath(req.params.id, assetId, ".png");
    await normalizeToPng(req.file.path, storage.absolutePath(relativePath), {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    const metadata = await sharp(storage.absolutePath(relativePath)).metadata();
    res.status(201).json({
      assetId,
      url: storage.publicUrl(relativePath),
      fileName: String(req.file.originalname || "image.png").slice(0, 200),
      width: metadata.width || null,
      height: metadata.height || null,
    });
  } finally {
    await cleanup(req.file);
  }
}));

/** Stores a Video Input or Audio Input node's clip as-is (no transcoding) and
 * returns its public URL. The kind is checked by MIME type and extension. */
router.post("/:id/media", mediaUpload.single("file"), asyncHandler(async (req, res) => {
  try {
    const row = await loadProject(req.params.id);
    if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
    if (!req.file) return res.status(400).json({ error: "A video or audio file is required." });
    const kind = String(req.file.mimetype || "").split("/")[0];
    const extension = path.extname(req.file.originalname || "").toLowerCase();
    if (!MEDIA_EXTENSIONS[kind]?.has(extension)) {
      return res.status(400).json({ error: "Upload an MP4, MOV, WebM or M4V video, or an MP3, WAV, M4A, AAC, OGG or FLAC audio file." });
    }
    const assetId = crypto.randomUUID();
    const relativePath = storage.getAdvancedAssetPath(req.params.id, assetId, extension);
    await fs.promises.mkdir(path.dirname(storage.absolutePath(relativePath)), { recursive: true });
    await fs.promises.copyFile(req.file.path, storage.absolutePath(relativePath));
    res.status(201).json({
      assetId,
      url: storage.publicUrl(relativePath),
      fileName: String(req.file.originalname || `${kind}${extension}`).slice(0, 200),
      mediaKind: kind,
      size: req.file.size,
    });
  } finally {
    await cleanup(req.file);
  }
}));

/** The canvas's Run button: one node, answered when it finishes. Recorded as
 * a run like any other, so its result shows up under its version. */
router.post("/:id/nodes/:nodeId/run", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const document = sanitizeAdvancedDocument(row.document);
  const node = findNode(document, req.params.nodeId);
  if (!node) return res.status(404).json({ error: "Node not found." });
  if (!isExecutable(node)) {
    return res.status(422).json({ error: "This node does not run. Run a generator, LLM text, image transform or output node." });
  }

  const runKey = `${req.params.id}:${req.params.nodeId}`;
  if (runningNodes.has(runKey)) return res.status(409).json({ error: "This node is already generating." });
  runningNodes.add(runKey);
  let started;
  try {
    started = await startRun({ projectId: req.params.id, document, nodeIds: [req.params.nodeId], requestId: req.requestId });
    await started.completion;
  } finally {
    runningNodes.delete(runKey);
  }

  const [run, current] = await Promise.all([getRun(req.params.id, started.run.id), loadProject(req.params.id)]);
  if (!current) return res.status(404).json({ error: "Advanced Studio project not found." });
  const outcome = run?.nodes?.[req.params.nodeId];
  if (outcome?.status !== "done") {
    return res.status(422).json({ error: outcome?.error || "The run did not finish.", project: shape(current), runId: started.run.id });
  }
  res.json({ project: shape(current), results: outcome.results, runId: started.run.id });
}));

function requestedNodeIds(body) {
  return Array.isArray(body?.nodeIds) ? body.nodeIds.map(String) : undefined;
}

/**
 * Starts a whole-workflow run (or only `nodeIds`) with optional `inputs` and
 * answers 202 straight away: a graph of generations takes minutes. Progress
 * is `GET /:id/runs/:runId`, or `activeRun` on the project.
 */
router.post("/:id/run", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const { run, version, waves, started } = await startRun({
    projectId: req.params.id,
    document: sanitizeAdvancedDocument(row.document),
    nodeIds: requestedNodeIds(req.body),
    inputs: req.body?.inputs || {},
    requestId: req.requestId,
  });
  res.status(202).json({ runId: run.id, version: version.version, versionId: version.id, started, waves });
}));

const MAX_BATCH_ROWS = 100;

/**
 * Runs the same workflow once per row of inputs. Every row is validated
 * before any starts, so a typo in row 40 costs nothing. Rows share one
 * version; the generation queue bounds how many generate at once.
 */
router.post("/:id/batch", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const rows = req.body?.rows;
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: "rows must be a non-empty array of input objects." });
  if (rows.length > MAX_BATCH_ROWS) return res.status(400).json({ error: `A batch takes at most ${MAX_BATCH_ROWS} rows.` });

  const document = sanitizeAdvancedDocument(row.document);
  const nodeIds = requestedNodeIds(req.body);
  planWaves(document, nodeIds);
  rows.forEach((inputs, index) => {
    try {
      applyInputs(document, inputs);
    } catch (error) {
      error.message = `Row ${index + 1}: ${error.message}`;
      throw error;
    }
  });

  const batchId = crypto.randomUUID();
  const version = await ensureVersion(req.params.id, document);
  const runs = [];
  for (const inputs of rows) {
    const { run } = await startRun({ projectId: req.params.id, document, nodeIds, inputs, batchId, version, requestId: req.requestId });
    runs.push({ runId: run.id, inputs });
  }
  res.status(202).json({ batchId, version: version.version, versionId: version.id, runs });
}));

router.get("/:id/runs", asyncHandler(async (req, res) => {
  if (!(await loadProject(req.params.id))) return res.status(404).json({ error: "Advanced Studio project not found." });
  for (const key of ["versionId", "batchId"]) {
    if (req.query[key] && !isUuid(req.query[key])) return res.status(400).json({ error: `Invalid ${key}.` });
  }
  const runs = await listRuns(req.params.id, { versionId: req.query.versionId, batchId: req.query.batchId, limit: req.query.limit });
  res.json({ runs: runs.map(liveRunShape) });
}));

router.get("/:id/runs/:runId", asyncHandler(async (req, res) => {
  const run = isUuid(req.params.runId) && await getRun(req.params.id, req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found." });
  res.json(liveRunShape(run));
}));

/** Runs a failed or partial run's unfinished nodes again — after a restart,
 * a provider outage or a fix — reusing what its finished nodes produced. */
router.post("/:id/runs/:runId/resume", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.runId)) return res.status(404).json({ error: "Run not found." });
  const { run, version, waves, started } = await resumeRun({ projectId: req.params.id, runId: req.params.runId, requestId: req.requestId });
  res.status(202).json({ runId: run.id, resumedFrom: req.params.runId, version: version.version, versionId: version.id, started, waves });
}));

async function loadTriggerProject(req, res) {
  const row = await loadProject(req.params.id);
  if (!row) res.status(404).json({ error: "Advanced Studio project not found." });
  return row;
}

router.get("/:id/triggers", asyncHandler(async (req, res) => {
  if (!(await loadTriggerProject(req, res))) return;
  res.json({ triggers: await listTriggers(req.params.id) });
}));

/** A saved way to run this workflow: inputs, node selection, and a schedule
 * and/or a webhook. Answers `webhookToken` once when a webhook is created. */
router.post("/:id/triggers", asyncHandler(async (req, res) => {
  const row = await loadTriggerProject(req, res);
  if (!row) return;
  res.status(201).json(await createTrigger(req.params.id, sanitizeAdvancedDocument(row.document), req.body || {}));
}));

router.put("/:id/triggers/:triggerId", asyncHandler(async (req, res) => {
  const row = await loadTriggerProject(req, res);
  if (!row) return;
  if (!isUuid(req.params.triggerId)) return res.status(404).json({ error: "Trigger not found." });
  res.json(await updateTrigger(req.params.id, req.params.triggerId, sanitizeAdvancedDocument(row.document), req.body || {}));
}));

router.delete("/:id/triggers/:triggerId", asyncHandler(async (req, res) => {
  if (!(await loadTriggerProject(req, res))) return;
  const removed = isUuid(req.params.triggerId) && await deleteTrigger(req.params.id, req.params.triggerId);
  if (!removed) return res.status(404).json({ error: "Trigger not found." });
  res.status(204).end();
}));

/** Fires a trigger now, with optional `inputs` overriding its own. */
router.post("/:id/triggers/:triggerId/run", asyncHandler(async (req, res) => {
  const trigger = isUuid(req.params.triggerId) && await getTrigger(req.params.id, req.params.triggerId);
  if (!trigger) return res.status(404).json({ error: "Trigger not found." });
  const { run, version } = await fireTrigger(trigger, { inputs: req.body?.inputs || {}, requestId: req.requestId });
  res.status(202).json({ runId: run.id, version: version.version, versionId: version.id });
}));

router.get("/:id/versions", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const [versions, currentVersionId] = await Promise.all([
    listVersions(req.params.id),
    findVersionByHash(req.params.id, sanitizeAdvancedDocument(row.document)),
  ]);
  res.json({ currentVersionId, versions });
}));

router.get("/:id/versions/:versionId", asyncHandler(async (req, res) => {
  const version = isUuid(req.params.versionId) && await getVersion(req.params.id, req.params.versionId);
  if (!version) return res.status(404).json({ error: "Version not found." });
  res.json(version);
}));

/**
 * Puts a version's recipe back on the canvas. Results stay: a node that is
 * in both keeps its current results, so restoring never hides an output.
 */
router.post("/:id/versions/:versionId/restore", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const version = isUuid(req.params.versionId) && await getVersion(req.params.id, req.params.versionId);
  if (!version) return res.status(404).json({ error: "Version not found." });
  const expectedRevision = Number(req.body?.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return res.status(400).json({ error: "A valid expectedRevision is required." });
  }

  const restored = sanitizeAdvancedDocument(withCurrentResults(version.document, sanitizeAdvancedDocument(row.document)));
  const saved = await saveDocument(req.params.id, restored, expectedRevision);
  if (!saved) {
    return res.status(409).json({ error: "This project changed in another tab. Reload before restoring.", currentRevision: Number(row.revision) });
  }
  res.json(shape(saved));
}));

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const max = req.path.startsWith("/import") ? `${MAX_SHARE_FILE_BYTES / 1024 / 1024}MB` : req.path.endsWith("/media") ? "200MB" : "25MB";
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? `That file is too large (${max} max).` : err.message });
  }
  next(err);
});

module.exports = router;
module.exports.defaultAdvancedDocument = defaultAdvancedDocument;

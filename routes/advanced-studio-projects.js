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
const { createAdvancedImageGeneration, createAdvancedVideoGeneration } = require("../lib/advancedGenerationRunner");
const { normalizeToPng } = require("../lib/imageNormalizer");
const storage = require("../lib/storage");
const { resultThumbnail, sourceThumbnails } = require("../lib/thumbnails");
const logger = require("../lib/logger");
const { planWaves, runWaves } = require("../lib/advancedWorkflowRunner");
const { applyInputs, declaredInputs, resolveImageSources } = require("../lib/advancedRunInputs");
const {
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
  recordNodeOutcome,
  withProjectLock,
} = require("../lib/advancedRuns");
const engines = require("../engines");
const registry = engines.advancedRegistry || engines.registry;

const router = express.Router();
const WORKSPACE = "advanced";
/** Nodes with a generation in flight, keyed `projectId:nodeId`. The node's
 * persisted status cannot serve as this guard: a run is not written to the
 * document until it finishes, precisely so a long generation does not hold a
 * revision open. */
const runningNodes = new Set();
/** Runs in flight in this process, keyed by run id:
 * `{ projectId, queued: Set, running: Set }` of node ids. */
const liveRuns = new Map();
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const tempDir = path.join(__dirname, "..", "tmp", "advanced-studio");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const mediaUpload = multer({ dest: tempDir, limits: { fileSize: MAX_MEDIA_BYTES } });
const MEDIA_EXTENSIONS = {
  video: new Set([".mp4", ".mov", ".webm", ".m4v"]),
  audio: new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]),
};

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

/** Live run state for a project: generations in flight are not written to the
 * document until they finish, so this is the only place "running" is visible. */
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

function projectPreview(rawDocument) {
  const document = sanitizeAdvancedDocument(rawDocument);
  const nodes = document.nodes || [];
  const generatedImageUrl = [...nodes]
    .reverse()
    .map((node) => {
      if (node.type !== "imageGenerator" && node.type !== "videoGenerator") return null;
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

function validateDocument(input) {
  const bytes = Buffer.byteLength(JSON.stringify(input ?? null), "utf8");
  if (bytes > MAX_DOCUMENT_BYTES) {
    const error = new Error("This Advanced Studio project is too large to save.");
    error.statusCode = 413;
    throw error;
  }
  return sanitizeAdvancedDocument(input);
}

async function loadProject(id) {
  if (!isUuid(id)) return null;
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

function findNode(document, nodeId) {
  return (document.nodes || []).find((node) => node.id === nodeId) || null;
}

/** Resolves a node's connected inputs into typed buckets. Edge order in the
 * document is the reference order handed to the engine, so re-ordering
 * connections in the UI re-orders the references deterministically. */
function resolveNodeInputs(document, nodeId) {
  const byId = new Map((document.nodes || []).map((node) => [node.id, node]));
  const prompts = [];
  const imageUrls = [];
  const startFrameUrls = [];
  const endFrameUrls = [];
  const referenceImageUrls = [];
  const referenceVideoUrls = [];
  const referenceAudioUrls = [];
  const outputImageUrl = (source) => {
    if (source.type === "imageInput") return source.data?.imageUrl || null;
    if (source.type === "imageGenerator") {
      const results = source.data?.results || [];
      const active = results[source.data?.activeResultIndex ?? 0] || results[results.length - 1];
      return active?.imageUrl || null;
    }
    return null;
  };
  const outputMediaUrl = (source, kind) => {
    if (source.type === `${kind}Input`) return source.data?.mediaUrl || null;
    if (kind === "video" && source.type === "videoGenerator") {
      const results = source.data?.results || [];
      const active = results[source.data?.activeResultIndex ?? 0] || results[results.length - 1];
      return active?.videoUrl || null;
    }
    return null;
  };
  for (const edge of document.edges || []) {
    if (edge.target !== nodeId) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    if (edge.targetHandle === "prompt") {
      if (source.type === "text" && source.data?.text) prompts.push(source.data.text);
      continue;
    }
    if (edge.targetHandle === "referenceVideo" || edge.targetHandle === "referenceAudio") {
      const kind = edge.targetHandle === "referenceVideo" ? "video" : "audio";
      const url = outputMediaUrl(source, kind);
      if (url) (kind === "video" ? referenceVideoUrls : referenceAudioUrls).push(url);
      continue;
    }
    const imageUrl = outputImageUrl(source);
    if (!imageUrl) continue;
    if (edge.targetHandle === "image") imageUrls.push(imageUrl);
    else if (edge.targetHandle === "startFrame") startFrameUrls.push(imageUrl);
    else if (edge.targetHandle === "endFrame") endFrameUrls.push(imageUrl);
    else if (edge.targetHandle === "reference") referenceImageUrls.push(imageUrl);
    }
  return { prompt: prompts.join("\n\n"), imageUrls, startFrameUrls, endFrameUrls, referenceImageUrls, referenceVideoUrls, referenceAudioUrls };
}

/** Runs one image generator node in place, mutating only that node. Returns
 * `{ ok, error? }` rather than throwing so a failure is contained to the node
 * the user can fix and retry. */
async function runImageGeneratorNode(document, nodeId, requestId, runId) {
  const node = findNode(document, nodeId);
  if (!node || node.type !== "imageGenerator") return { ok: false, error: "Node is not an image generator." };

  const engineKey = node.data.engine;
  const engine = engineKey ? registry[engineKey] : null;
  if (!engine) {
    node.data.status = "error";
    node.data.error = "Choose a model for this node before generating.";
    return { ok: false, error: node.data.error };
  }
  const ready = await engine.isReady();
  if (!ready.ready) {
    node.data.status = "error";
    node.data.error = ready.reason || `${engine.label} is not ready.`;
    return { ok: false, error: node.data.error };
  }

  const resolved = resolveNodeInputs(document, nodeId);
  if (!resolved.prompt.trim()) {
    node.data.status = "error";
    node.data.error = "Connect a prompt with some text before generating.";
    return { ok: false, error: node.data.error };
  }
  const maxImages = Number(engine.capabilities?.maxReferenceImages) || 1;
  if (resolved.imageUrls.length > maxImages) {
    node.data.status = "error";
    node.data.error = `${engine.label} accepts at most ${maxImages} reference images.`;
    return { ok: false, error: node.data.error };
  }
  const referencePaths = resolved.imageUrls.map((url) => storage.absolutePathFromPublicUrl(url));
  if (referencePaths.some((referencePath) => !referencePath)) {
    node.data.status = "error";
    node.data.error = "One of the connected images could not be resolved.";
    return { ok: false, error: node.data.error };
  }

  const engineModel = node.data.model
    || (engine.getConfiguredModel ? await engine.getConfiguredModel() : null);
  const outputs = Math.min(Math.max(Number(node.data.outputs) || 1, 1), 4);

  node.data.status = "running";
  delete node.data.error;
  try {
    const generated = [];
    for (let index = 0; index < outputs; index += 1) {
      const result = await createAdvancedImageGeneration({
        engineKey,
        engine,
        engineModel,
        prompt: resolved.prompt,
        referencePaths,
        aspectRatio: node.data.aspectRatio,
        resolution: node.data.resolution,
        requestId,
        runId,
      });
      generated.push({ imageUrl: result.imageUrl, generationId: result.id });
    }
    node.data.results = [...(node.data.results || []), ...generated].slice(-8);
    node.data.activeResultIndex = Math.max(node.data.results.length - 1, 0);
    node.data.status = "done";
    return { ok: true, results: generated };
  } catch (err) {
    node.data.status = "error";
    node.data.error = err.message;
    return { ok: false, error: err.message };
  }
}

async function runVideoGeneratorNode(document, nodeId, requestId, runId) {
  const node = findNode(document, nodeId);
  if (!node || node.type !== "videoGenerator") return { ok: false, error: "Node is not a video generator." };
  const engine = node.data.engine ? registry[node.data.engine] : null;
  const definition = engine?.modelDefinition?.(node.data.model);
  const fail = (message) => {
    node.data.status = "error";
    node.data.error = message;
    return { ok: false, error: message };
  };
  if (!engine || typeof engine.generateVideo !== "function") return fail("Choose a video model before generating.");
  if (!definition) return fail("That video model is no longer available. Choose another.");
  const ready = await engine.isReady();
  if (!ready.ready) return fail(ready.reason || `${engine.label} is not ready.`);

  const resolved = resolveNodeInputs(document, nodeId);
  if (!resolved.prompt.trim()) return fail("Connect a prompt with some text before generating.");
  if (definition.inputs.includes("startFrame") && !resolved.startFrameUrls.length) {
    return fail(`${definition.label} requires a connected start frame.`);
  }
  const urls = [resolved.startFrameUrls[0], resolved.endFrameUrls[0], ...resolved.referenceImageUrls].filter(Boolean);
  const paths = urls.map((url) => storage.absolutePathFromPublicUrl(url));
  if (paths.some((inputPath) => !inputPath)) return fail("One of the connected frames could not be resolved.");
  const referenceVideoPaths = resolved.referenceVideoUrls.map((url) => storage.absolutePathFromPublicUrl(url));
  const referenceAudioPaths = resolved.referenceAudioUrls.map((url) => storage.absolutePathFromPublicUrl(url));
  if ([...referenceVideoPaths, ...referenceAudioPaths].some((inputPath) => !inputPath)) {
    return fail("One of the connected video or audio clips could not be resolved.");
  }

  node.data.status = "running";
  delete node.data.error;
  try {
    const result = await createAdvancedVideoGeneration({
      engineKey: engine.key,
      engine,
      engineModel: definition.id,
      prompt: resolved.prompt,
      startFramePath: resolved.startFrameUrls[0] ? paths[0] : undefined,
      endFramePath: resolved.endFrameUrls[0] ? paths[resolved.startFrameUrls[0] ? 1 : 0] : undefined,
      referencePaths: paths.slice((resolved.startFrameUrls[0] ? 1 : 0) + (resolved.endFrameUrls[0] ? 1 : 0)),
      referenceVideoPaths,
      referenceAudioPaths,
      duration: definition.durations.includes(Number(node.data.duration)) ? Number(node.data.duration) : definition.defaultDuration,
      aspectRatio: definition.aspectRatios.includes(node.data.aspectRatio) ? node.data.aspectRatio : definition.defaultAspectRatio,
      resolution: definition.resolutions.includes(node.data.resolution) ? node.data.resolution : definition.defaultResolution,
      sound: definition.sound && node.data.sound === true,
      requestId,
      runId,
    });
    const generated = [{ videoUrl: result.videoUrl, generationId: result.id }];
    node.data.results = [...(node.data.results || []), ...generated].slice(-8);
    node.data.activeResultIndex = node.data.results.length - 1;
    node.data.status = "done";
    return { ok: true, results: generated };
  } catch (error) {
    return fail(error.message);
  }
}

function runGeneratorNode(document, nodeId, requestId, runId) {
  const node = findNode(document, nodeId);
  return node?.type === "videoGenerator"
    ? runVideoGeneratorNode(document, nodeId, requestId, runId)
    : runImageGeneratorNode(document, nodeId, requestId, runId);
}

router.use((req, res, next) => {
  if (!enabled()) return res.status(404).json({ error: "Advanced Studio is disabled." });
  next();
});

// Declared before `/:id` so the literal path is not read as a project id.
router.get("/capabilities", asyncHandler(async (req, res) => {
  res.json({ engines: await listAdvancedCapabilities() });
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
  // The node may have been deleted mid-run; the generation still exists in
  // history and in the run record, there is simply nowhere to attach it.
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
 * Executes a started run: resolves its image sources, then runs the waves.
 * `runDocument` is the run's private copy — inputs applied, upstream results
 * from *this* run — so batch rows running the same workflow at once never
 * read each other's outputs. Each finished node is written to the run record
 * and to the canvas.
 */
async function executeRun({ runId, projectId, runDocument, waves, live, requestId }) {
  await markRunStarted(runId);
  const finishNode = async (nodeId, recordStatus, error, newResults) => {
    await recordNodeOutcome(runId, nodeId, { status: recordStatus, error: error || null, results: newResults });
    await persistRunOutcome(projectId, nodeId, { status: recordStatus === "done" ? "done" : "error", error, newResults });
  };

  try {
    await resolveImageSources(runDocument, projectId);
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
        result = await runGeneratorNode(runDocument, nodeId, requestId, runId);
      } finally {
        live.running.delete(nodeId);
      }
      await finishNode(nodeId, result.ok ? "done" : "error", result.ok ? null : result.error, result.ok ? result.results : []);
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

/** Validates and records a run, then starts it without waiting. Throws 422s
 * (bad node ids, a cycle, unknown or missing inputs) before anything is
 * recorded or spent. Resolves to the run plus a `completion` promise. */
async function startRun({ projectId, document, nodeIds, inputs = {}, batchId = null, version = null, requestId }) {
  const waves = planWaves(document, nodeIds);
  const started = waves.flat();
  if (!started.length) {
    const error = new Error("This workflow has no generator nodes to run.");
    error.statusCode = 422;
    throw error;
  }
  const runDocument = applyInputs(document, inputs);
  const runVersion = version || await ensureVersion(projectId, document);
  const run = await createRun({ projectId, versionId: runVersion.id, batchId, inputs, nodeIds: started });
  const live = { projectId, queued: new Set(started), running: new Set() };
  liveRuns.set(run.id, live);
  const completion = executeRun({ runId: run.id, projectId, runDocument, waves, live, requestId })
    .catch((error) => {
      logger.error("advanced workflow run failed", { projectId, runId: run.id, requestId, error: error.message });
      return finishRun(run.id, {}, error.message).catch(() => {});
    })
    .finally(() => liveRuns.delete(run.id));
  return { run, version: runVersion, waves, started, completion };
}

function liveRunShape(run) {
  const live = liveRuns.get(run.id);
  return live ? { ...run, live: { running: [...live.running], queued: [...live.queued] } } : run;
}

/** The canvas's Run button: one node, answered when it finishes. Recorded as
 * a run like any other, so its result shows up under its version. */
router.post("/:id/nodes/:nodeId/run", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const document = sanitizeAdvancedDocument(row.document);
  const node = findNode(document, req.params.nodeId);
  if (!node) return res.status(404).json({ error: "Node not found." });
  if (node.type !== "imageGenerator" && node.type !== "videoGenerator") {
    return res.status(422).json({ error: "Only generator nodes can run." });
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

  const current = sanitizeAdvancedDocument(row.document);
  const currentNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const restored = sanitizeAdvancedDocument({
    ...version.document,
    viewport: current.viewport,
    nodes: version.document.nodes.map((node) => {
      const existing = currentNodes.get(node.id);
      if (!existing || existing.type !== node.type) return node;
      const data = { ...node.data };
      for (const field of RUN_OUTPUT_FIELDS) if (existing.data[field] !== undefined) data[field] = existing.data[field];
      return { ...node, data };
    }),
  });
  const saved = await saveDocument(req.params.id, restored, expectedRevision);
  if (!saved) {
    return res.status(409).json({ error: "This project changed in another tab. Reload before restoring.", currentRevision: Number(row.revision) });
  }
  res.json(shape(saved));
}));

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const max = req.path.endsWith("/media") ? "200MB" : "25MB";
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? `That file is too large (${max} max).` : err.message });
  }
  next(err);
});

module.exports = router;
module.exports.resolveNodeInputs = resolveNodeInputs;
module.exports.defaultAdvancedDocument = defaultAdvancedDocument;

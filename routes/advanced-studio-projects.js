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
  sanitizeAdvancedDocument,
  templateDocument,
} = require("../lib/advancedStudioProject");
const { listAdvancedCapabilities } = require("../lib/advancedCapabilities");
const { createAdvancedImageGeneration } = require("../lib/advancedGenerationRunner");
const { normalizeToPng } = require("../lib/imageNormalizer");
const storage = require("../lib/storage");
const { registry } = require("../engines");

const router = express.Router();
const WORKSPACE = "advanced";
/** Nodes with a generation in flight, keyed `projectId:nodeId`. The node's
 * persisted status cannot serve as this guard: a run is not written to the
 * document until it finishes, precisely so a long generation does not hold a
 * revision open. */
const runningNodes = new Set();
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const tempDir = path.join(__dirname, "..", "tmp", "advanced-studio");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });

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
  return { generatedImageUrl, loadedImageUrls };
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
  for (const edge of document.edges || []) {
    if (edge.target !== nodeId) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    if (edge.targetHandle === "prompt") {
      if (source.type === "text" && source.data?.text) prompts.push(source.data.text);
      continue;
    }
    if (edge.targetHandle === "image") {
      if (source.type === "imageInput" && source.data?.imageUrl) {
        imageUrls.push(source.data.imageUrl);
      } else if (source.type === "imageGenerator") {
        const results = source.data?.results || [];
        const active = results[source.data?.activeResultIndex ?? 0] || results[results.length - 1];
        if (active?.imageUrl) imageUrls.push(active.imageUrl);
      }
    }
  }
  return { prompt: prompts.join("\n\n"), imageUrls };
}

/** Runs one image generator node in place, mutating only that node. Returns
 * `{ ok, error? }` rather than throwing so a failure is contained to the node
 * the user can fix and retry. */
async function runImageGeneratorNode(document, nodeId, requestId) {
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
  res.status(201).json(shape(result.rows[0]));
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
  res.json(shape(saved.rows[0]));
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

/** The fields a run owns on its node. Everything else in the document — other
 * nodes, edges, positions, the viewport — belongs to whoever edited it while
 * the generation was running, so only these are written back. */
const RUN_OUTPUT_FIELDS = ["status", "error", "results", "activeResultIndex"];

/**
 * Applies a finished run to the project's *current* document.
 *
 * A generation can take minutes, and autosave keeps running throughout, so
 * pinning the write to the revision read before the run would reject the
 * result of a perfectly good generation (and discard an image already on
 * disk). Re-reading here means the run only ever conflicts with itself.
 */
async function persistRunOutcome(projectId, nodeId, runNodeData, attempt = 0) {
  const current = await loadProject(projectId);
  if (!current) return null;
  const document = sanitizeAdvancedDocument(current.document);
  const node = findNode(document, nodeId);
  // The node may have been deleted mid-run; the generation still exists in
  // history, there is simply nowhere to attach it.
  if (!node) return { row: current, missingNode: true };

  for (const field of RUN_OUTPUT_FIELDS) {
    if (runNodeData[field] === undefined) delete node.data[field];
    else node.data[field] = runNodeData[field];
  }

  const saved = await saveDocument(projectId, document, Number(current.revision));
  if (saved) return { row: saved };
  // Another writer landed between the read and the write. One retry against a
  // fresh read is enough; the loser of a genuine tie is the autosave, which
  // will simply resend.
  if (attempt < 2) return persistRunOutcome(projectId, nodeId, runNodeData, attempt + 1);
  return null;
}

router.post("/:id/nodes/:nodeId/run", asyncHandler(async (req, res) => {
  const row = await loadProject(req.params.id);
  if (!row) return res.status(404).json({ error: "Advanced Studio project not found." });
  const document = sanitizeAdvancedDocument(row.document);
  const node = findNode(document, req.params.nodeId);
  if (!node) return res.status(404).json({ error: "Node not found." });

  const runKey = `${req.params.id}:${req.params.nodeId}`;
  if (runningNodes.has(runKey)) {
    return res.status(409).json({ error: "This node is already generating." });
  }
  runningNodes.add(runKey);

  let outcome;
  try {
    outcome = await runImageGeneratorNode(document, req.params.nodeId, req.requestId);
  } finally {
    runningNodes.delete(runKey);
  }

  const persisted = await persistRunOutcome(req.params.id, req.params.nodeId, findNode(document, req.params.nodeId).data);
  if (!persisted) {
    return res.status(409).json({ error: "This project is being edited elsewhere. Reload before running again." });
  }
  if (!outcome.ok) return res.status(422).json({ error: outcome.error, project: shape(persisted.row) });
  res.json({ project: shape(persisted.row), results: outcome.results });
}));

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "That file is too large (25MB max)." : err.message });
  }
  next(err);
});

module.exports = router;
module.exports.resolveNodeInputs = resolveNodeInputs;
module.exports.defaultAdvancedDocument = defaultAdvancedDocument;

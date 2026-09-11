const express = require("express");
const { pool } = require("../db/pool");
const { asyncHandler, isUuid } = require("./helpers");
const {
  PROJECT_SCHEMA_VERSION,
  defaultStudioDocument,
  sanitizeStudioDocument,
} = require("../lib/studioProject");
const { buildWaves, resolveGenerateInputs } = require("../lib/studioPipeline");
const { sanitizeAdvancedSettings } = require("../lib/studioSettings");
const { createGeneration } = require("../lib/generationRunner");
const storage = require("../lib/storage");
const { registry } = require("../engines");

const router = express.Router();
const MAX_DOCUMENT_BYTES = 768 * 1024;

function enabled() {
  return process.env.FLUID_STUDIO_ENABLED !== "false";
}

function shape(row) {
  return {
    id: row.id,
    name: row.name,
    schemaVersion: row.schema_version,
    revision: Number(row.revision),
    document: sanitizeStudioDocument(row.document),
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function summary(row) {
  return {
    id: row.id,
    name: row.name,
    schemaVersion: row.schema_version,
    revision: Number(row.revision),
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateDocument(input) {
  const bytes = Buffer.byteLength(JSON.stringify(input ?? null), "utf8");
  if (bytes > MAX_DOCUMENT_BYTES) {
    const error = new Error("Studio project is too large to save.");
    error.statusCode = 413;
    throw error;
  }
  return sanitizeStudioDocument(input);
}

function findNode(document, nodeId) {
  return (document.nodes || []).find((node) => node.id === nodeId) || null;
}

/** Runs a single `generate` node in place: resolves its inputs from connected
 * edges, invokes the chosen engine, and mutates the node (and any connected
 * `result` nodes) with the outcome. Awaits the underlying generation job so
 * pipeline waves can rely on chained outputs being ready before the next
 * wave starts. Returns `{ ok, error? }` instead of throwing so a run endpoint
 * can report per-node failures without aborting the rest of the run. */
async function runGenerateNode(document, nodeId, requestId) {
  const node = findNode(document, nodeId);
  if (!node || node.kind !== "generate") return { ok: false, error: "Node is not a generate node." };

  const resolved = resolveGenerateInputs(document, nodeId);
  if (resolved.errors.length) {
    node.status = "error";
    return { ok: false, error: resolved.errors.join(" ") };
  }

  const engineKey = node.engine;
  const engine = engineKey ? registry[engineKey] : null;
  if (!engine) {
    node.status = "error";
    return { ok: false, error: "Select a valid engine for this generate node." };
  }
  const ready = await engine.isReady();
  if (!ready.ready) {
    node.status = "error";
    return { ok: false, error: ready.reason || "Engine is not ready." };
  }
  const engineModel = engine.getConfiguredModel ? await engine.getConfiguredModel() : null;

  const characterSources = resolved.characterSources.map((source, index) => {
    const sourcePath = storage.absolutePathFromPublicUrl(source.imageUrl);
    return { position: index + 1, characterId: source.characterId, sourcePath, identitySourcePath: sourcePath, referenceKind: "photo" };
  });
  const poseSourcePath = storage.absolutePathFromPublicUrl(resolved.poseSource.imageUrl);
  if (characterSources.some((source) => !source.sourcePath) || !poseSourcePath) {
    node.status = "error";
    return { ok: false, error: "One of the connected images could not be resolved." };
  }
  const advancedSettings = sanitizeAdvancedSettings(node.advancedSettings, characterSources.length);

  node.status = "running";
  try {
    const { id } = await createGeneration({
      characterSources,
      poseSource: { referenceId: resolved.poseSource.referenceId, sourcePath: poseSourcePath },
      engineKey,
      engine,
      engineModel,
      background: null,
      style: null,
      customInstructions: resolved.prompt,
      studioMode: "normal",
      advancedSettings,
      requestId,
      awaitCompletion: true,
    });
    node.status = "done";
    node.generationId = id;
    const imageUrl = storage.publicUrl(storage.getGenerationOutputPath(id));
    for (const edge of document.edges || []) {
      if (edge.source !== nodeId || edge.targetHandle === "prompt") continue;
      const target = findNode(document, edge.target);
      if (target && target.kind === "result") {
        target.generationId = id;
        target.imageUrl = imageUrl;
        target.status = "done";
      }
    }
    return { ok: true, generationId: id, imageUrl };
  } catch (err) {
    node.status = "error";
    return { ok: false, error: err.message };
  }
}

router.use((req, res, next) => {
  if (!enabled()) return res.status(404).json({ error: "Fluid Studio is disabled." });
  next();
});

router.get("/", asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT id, name, schema_version, revision, is_default, created_at, updated_at
     FROM studio_projects
     WHERE archived_at IS NULL
     ORDER BY is_default DESC, updated_at DESC, created_at DESC`
  );
  res.json({ projects: result.rows.map(summary) });
}));

router.get("/default", asyncHandler(async (req, res) => {
  let result = await pool.query(
    "SELECT * FROM studio_projects WHERE is_default = true AND archived_at IS NULL LIMIT 1"
  );
  if (!result.rowCount) {
    try {
      result = await pool.query(
        `INSERT INTO studio_projects (name, schema_version, document, is_default)
         VALUES ($1, $2, $3::jsonb, true)
         RETURNING *`,
        ["My Studio", PROJECT_SCHEMA_VERSION, JSON.stringify(defaultStudioDocument())]
      );
    } catch (error) {
      if (error.code !== "23505") throw error;
      result = await pool.query(
        "SELECT * FROM studio_projects WHERE is_default = true AND archived_at IS NULL LIMIT 1"
      );
    }
  }
  res.json(shape(result.rows[0]));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Studio project not found." });
  const result = await pool.query(
    "SELECT * FROM studio_projects WHERE id = $1 AND archived_at IS NULL",
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Studio project not found." });
  res.json(shape(result.rows[0]));
}));

router.post("/", asyncHandler(async (req, res) => {
  const name = String(req.body?.name || "Untitled Studio").trim().slice(0, 100) || "Untitled Studio";
  const document = validateDocument(req.body?.document);
  const result = await pool.query(
    `INSERT INTO studio_projects (name, schema_version, document)
     VALUES ($1, $2, $3::jsonb)
     RETURNING *`,
    [name, PROJECT_SCHEMA_VERSION, JSON.stringify(document)]
  );
  res.status(201).json(shape(result.rows[0]));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Studio project not found." });
  const expectedRevision = Number(req.body?.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return res.status(400).json({ error: "A valid expectedRevision is required." });
  }
  const document = validateDocument(req.body?.document);
  const result = await pool.query(
    `UPDATE studio_projects
     SET document = $1::jsonb,
         schema_version = $2,
         revision = revision + 1,
         updated_at = now()
     WHERE id = $3 AND revision = $4 AND archived_at IS NULL
     RETURNING *`,
    [JSON.stringify(document), PROJECT_SCHEMA_VERSION, req.params.id, expectedRevision]
  );
  if (!result.rowCount) {
    const exists = await pool.query(
      "SELECT revision FROM studio_projects WHERE id = $1 AND archived_at IS NULL",
      [req.params.id]
    );
    if (!exists.rowCount) return res.status(404).json({ error: "Studio project not found." });
    return res.status(409).json({
      error: "This Studio project changed in another tab. Reload before saving again.",
      currentRevision: Number(exists.rows[0].revision),
    });
  }
  res.json(shape(result.rows[0]));
}));

router.post("/:id/run", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Studio project not found." });
  const result = await pool.query("SELECT * FROM studio_projects WHERE id = $1 AND archived_at IS NULL", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Studio project not found." });

  let row = result.rows[0];
  let document = sanitizeStudioDocument(row.document);
  const waves = buildWaves(document);
  const results = {};

  for (const wave of waves) {
    await Promise.allSettled(wave.map(async (nodeId) => {
      results[nodeId] = await runGenerateNode(document, nodeId, req.requestId);
    }));
    const saved = await pool.query(
      `UPDATE studio_projects SET document = $1::jsonb, revision = revision + 1, updated_at = now()
       WHERE id = $2 AND revision = $3 AND archived_at IS NULL RETURNING *`,
      [JSON.stringify(validateDocument(document)), req.params.id, Number(row.revision)]
    );
    if (!saved.rowCount) {
      return res.status(409).json({ error: "This Studio project changed in another tab. Reload before running again." });
    }
    row = saved.rows[0];
    document = sanitizeStudioDocument(row.document);
  }

  res.json({ project: shape(row), results });
}));

router.post("/:id/nodes/:nodeId/run", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Studio project not found." });
  const result = await pool.query("SELECT * FROM studio_projects WHERE id = $1 AND archived_at IS NULL", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Studio project not found." });
  const row = result.rows[0];
  const document = sanitizeStudioDocument(row.document);
  if (!findNode(document, req.params.nodeId)) return res.status(404).json({ error: "Node not found." });

  const outcome = await runGenerateNode(document, req.params.nodeId, req.requestId);
  const saved = await pool.query(
    `UPDATE studio_projects SET document = $1::jsonb, revision = revision + 1, updated_at = now()
     WHERE id = $2 AND revision = $3 AND archived_at IS NULL RETURNING *`,
    [JSON.stringify(validateDocument(document)), req.params.id, Number(row.revision)]
  );
  if (!saved.rowCount) return res.status(409).json({ error: "This Studio project changed in another tab. Reload before running again." });
  if (!outcome.ok) return res.status(422).json({ error: outcome.error, project: shape(saved.rows[0]) });
  res.json({ project: shape(saved.rows[0]), generationId: outcome.generationId, imageUrl: outcome.imageUrl });
}));

router.post("/:id/nodes/:nodeId/assist", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Studio project not found." });
  const result = await pool.query("SELECT * FROM studio_projects WHERE id = $1 AND archived_at IS NULL", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Studio project not found." });
  const row = result.rows[0];
  const document = sanitizeStudioDocument(row.document);
  const node = findNode(document, req.params.nodeId);
  if (!node || node.kind !== "assistant") return res.status(404).json({ error: "Assistant node not found." });

  const instruction = String(req.body?.instruction || node.instruction || "").trim().slice(0, 2_000);
  if (!instruction) return res.status(400).json({ error: "An instruction is required." });
  const engineKey = String(req.body?.engine || node.engine || "");
  const engine = engineKey ? registry[engineKey] : null;
  if (!engine || !engine.assistPrompt) return res.status(400).json({ error: "Select an engine that supports prompt assistance." });

  node.instruction = instruction;
  node.engine = engineKey;
  node.status = "running";
  let outputText;
  try {
    const assisted = await engine.assistPrompt({ instruction });
    outputText = assisted.text;
    node.outputText = outputText;
    node.status = "done";
  } catch (err) {
    node.status = "error";
    const saved = await pool.query(
      `UPDATE studio_projects SET document = $1::jsonb, revision = revision + 1, updated_at = now()
       WHERE id = $2 AND revision = $3 AND archived_at IS NULL RETURNING *`,
      [JSON.stringify(validateDocument(document)), req.params.id, Number(row.revision)]
    );
    return res.status(502).json({ error: err.message, project: saved.rowCount ? shape(saved.rows[0]) : undefined });
  }

  const saved = await pool.query(
    `UPDATE studio_projects SET document = $1::jsonb, revision = revision + 1, updated_at = now()
     WHERE id = $2 AND revision = $3 AND archived_at IS NULL RETURNING *`,
    [JSON.stringify(validateDocument(document)), req.params.id, Number(row.revision)]
  );
  if (!saved.rowCount) return res.status(409).json({ error: "This Studio project changed in another tab. Reload before saving again." });
  res.json({ project: shape(saved.rows[0]), outputText });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Studio project not found." });
  const existing = await pool.query(
    "SELECT is_default FROM studio_projects WHERE id = $1 AND archived_at IS NULL",
    [req.params.id]
  );
  if (!existing.rowCount) return res.status(404).json({ error: "Studio project not found." });
  if (existing.rows[0].is_default) {
    return res.status(400).json({ error: "The My Studio project cannot be deleted." });
  }
  const result = await pool.query(
    `UPDATE studio_projects
     SET archived_at = now(), is_default = false, updated_at = now()
     WHERE id = $1 AND archived_at IS NULL AND is_default = false`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Studio project not found." });
  res.status(204).end();
}));

module.exports = router;

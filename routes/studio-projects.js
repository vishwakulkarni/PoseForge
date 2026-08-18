const express = require("express");
const { pool } = require("../db/pool");
const { asyncHandler, isUuid } = require("./helpers");
const {
  PROJECT_SCHEMA_VERSION,
  defaultStudioDocument,
  sanitizeStudioDocument,
} = require("../lib/studioProject");

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

function validateDocument(input) {
  const bytes = Buffer.byteLength(JSON.stringify(input ?? null), "utf8");
  if (bytes > MAX_DOCUMENT_BYTES) {
    const error = new Error("Studio project is too large to save.");
    error.statusCode = 413;
    throw error;
  }
  return sanitizeStudioDocument(input);
}

router.use((req, res, next) => {
  if (!enabled()) return res.status(404).json({ error: "Fluid Studio is disabled." });
  next();
});

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

router.delete("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Studio project not found." });
  const result = await pool.query(
    `UPDATE studio_projects
     SET archived_at = now(), is_default = false, updated_at = now()
     WHERE id = $1 AND archived_at IS NULL`,
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Studio project not found." });
  res.status(204).end();
}));

module.exports = router;


const express = require("express");
const { pool } = require("../db/pool");
const { asyncHandler, isUuid } = require("./helpers");
const { sanitizeAdvancedSettings } = require("../lib/studioSettings");

const router = express.Router();

function shape(row) {
  return {
    id: row.id,
    name: row.name,
    settings: row.settings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT * FROM studio_recipes ORDER BY updated_at DESC");
  res.json({ recipes: result.rows.map(shape) });
}));

router.post("/", asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: "Recipe name is required." });
  const settings = sanitizeAdvancedSettings(req.body.settings, Math.min(Math.max(Number(req.body.characterCount) || 1, 1), 4));
  const result = await pool.query(
    "INSERT INTO studio_recipes (name, settings) VALUES ($1, $2::jsonb) RETURNING *",
    [name, JSON.stringify(settings)]
  );
  res.status(201).json(shape(result.rows[0]));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Recipe not found." });
  const result = await pool.query("DELETE FROM studio_recipes WHERE id = $1", [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: "Recipe not found." });
  res.status(204).end();
}));

module.exports = router;

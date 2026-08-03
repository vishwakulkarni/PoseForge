const express = require("express");
const { pool } = require("../db/pool");
const { asyncHandler } = require("./helpers");
const router = express.Router();
function shape(row) { return { id: row.id, type: row.type, name: row.name, isCustom: row.is_custom }; }
router.get("/", asyncHandler(async (req, res) => {
  const type = req.query.type; if (type && !["background", "style"].includes(type)) return res.status(400).json({ error: "Invalid preset type." });
  const result = await pool.query(type ? "SELECT * FROM presets WHERE type = $1 ORDER BY name" : "SELECT * FROM presets ORDER BY type, name", type ? [type] : []);
  res.json({ presets: result.rows.map(shape) });
}));
router.post("/", asyncHandler(async (req, res) => {
  const { type, name, promptFragment } = req.body || {};
  if (!["background", "style"].includes(type) || !String(name || "").trim() || !String(promptFragment || "").trim()) return res.status(400).json({ error: "type, name, and promptFragment are required." });
  try { const result = await pool.query("INSERT INTO presets (type, name, prompt_fragment, is_custom) VALUES ($1, $2, $3, true) RETURNING *", [type, name.trim(), promptFragment.trim()]); res.status(201).json(shape(result.rows[0])); } catch (err) { if (err.code === "23505") return res.status(409).json({ error: "A preset with that type and name already exists." }); throw err; }
}));
module.exports = router;

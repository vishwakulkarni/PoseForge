const express = require("express");
const { pool } = require("../db/pool");
const { asyncHandler } = require("./helpers");
const router = express.Router();
function mask(value) { return value ? `${value.slice(0, 3)}...${value.slice(-4)}` : null; }
async function getSettings() { const rows = (await pool.query("SELECT key, value FROM settings")).rows; const values = Object.fromEntries(rows.map((row) => [row.key, row.value || ""])); return { defaultEngine: values.default_engine || "codex", openaiApiKey: { configured: Boolean(values.openai_api_key), masked: mask(values.openai_api_key) }, replicateApiKey: { configured: Boolean(values.replicate_api_key), masked: mask(values.replicate_api_key) } }; }
router.get("/", asyncHandler(async (req, res) => res.json(await getSettings())));
router.put("/", asyncHandler(async (req, res) => {
  const allowed = { defaultEngine: "default_engine", openaiApiKey: "openai_api_key", replicateApiKey: "replicate_api_key" };
  if (req.body?.defaultEngine && !["codex", "openai", "replicate"].includes(req.body.defaultEngine)) return res.status(400).json({ error: "Unknown default engine." });
  for (const [field, key] of Object.entries(allowed)) if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) await pool.query("INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [key, String(req.body[field] ?? "")]);
  res.json(await getSettings());
}));
module.exports = router;

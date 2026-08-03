const express = require("express");
const { pool } = require("../db/pool");
const { listEngines } = require("../engines");
const { asyncHandler } = require("./helpers");
const router = express.Router();
router.get("/", asyncHandler(async (req, res) => { const rows = await pool.query("SELECT value FROM settings WHERE key = 'default_engine'"); res.json({ engines: await listEngines(), defaultEngine: rows.rows[0]?.value || "codex" }); }));
module.exports = router;

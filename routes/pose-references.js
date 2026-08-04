const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { pool } = require("../db/pool");
const storage = require("../lib/storage");
const poseLibrary = require("../lib/poseLibrary");
const { asyncHandler, isUuid, cleanup } = require("./helpers");

const router = express.Router();
const tempDir = path.join(__dirname, "..", "tmp", "uploads-v2");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });

router.get("/", asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.category) { params.push(String(req.query.category)); where.push(`category = $${params.length}`); }
  if (req.query.tag) { params.push(String(req.query.tag).toLowerCase()); where.push(`$${params.length} = ANY(tags)`); }
  const result = await pool.query(
    `SELECT * FROM pose_references ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`,
    params
  );
  res.json({ poseReferences: result.rows.map(poseLibrary.shape) });
}));

router.post("/", upload.single("posePhoto"), asyncHandler(async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "A pose photo is required." });
    const title = String(req.body.title || "").trim().slice(0, 80) || undefined;
    const category = String(req.body.category || "").trim().toLowerCase().slice(0, 40) || undefined;
    const row = await poseLibrary.addPoseReference(req.file.path, { title, category, isCustom: true, originalName: req.file.originalname, mimeType: req.file.mimetype });
    res.status(201).json(poseLibrary.shape(row));
  } finally { await cleanup(req.file); }
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Pose reference not found." });
  const existing = await pool.query("SELECT * FROM pose_references WHERE id = $1", [req.params.id]);
  if (!existing.rowCount) return res.status(404).json({ error: "Pose reference not found." });
  if (!existing.rows[0].is_custom) return res.status(403).json({ error: "Only custom pose references can be deleted." });
  await pool.query("DELETE FROM pose_references WHERE id = $1", [req.params.id]);
  await storage.removeRelative(existing.rows[0].file_path);
  res.status(204).end();
}));

router.use((err, req, res, next) => { if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message }); next(err); });
module.exports = router;

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../db/pool");
const storage = require("../lib/storage");
const { asyncHandler, isUuid, cleanup, errorStatus } = require("./helpers");
const { normalizeToPng } = require("../lib/imageNormalizer");

const router = express.Router();
const tempDir = path.join(__dirname, "..", "tmp", "uploads-v2");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });
function character(row) { return { id: row.id, name: row.name, createdAt: row.created_at, primaryPhotoUrl: row.primary_photo_path ? storage.publicUrl(row.primary_photo_path) : null }; }

router.get("/", asyncHandler(async (req, res) => {
  const result = await pool.query("SELECT c.*, p.file_path AS primary_photo_path FROM characters c LEFT JOIN character_photos p ON p.character_id = c.id AND p.is_primary = true ORDER BY c.created_at DESC");
  res.json({ characters: result.rows.map(character) });
}));
router.post("/", upload.single("characterPhoto"), asyncHandler(async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) return res.status(400).json({ error: "A character name is required." });
    if (!req.file) return res.status(400).json({ error: "A character photo is required." });
    const characterId = crypto.randomUUID();
    const photoId = crypto.randomUUID();
    const filePath = storage.getCharacterPhotoPath(characterId, photoId, ".png");
    const abs = storage.absolutePath(filePath);
    await normalizeToPng(req.file.path, abs, { originalName: req.file.originalname, mimeType: req.file.mimetype });
    const client = await pool.connect();
    let row;
    try {
      await client.query("BEGIN");
      row = (await client.query("INSERT INTO characters (id, name) VALUES ($1, $2) RETURNING *", [characterId, name])).rows[0];
      await client.query("INSERT INTO character_photos (id, character_id, file_path) VALUES ($1, $2, $3)", [photoId, characterId, filePath]);
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); await storage.removeRelative(filePath); throw err; } finally { client.release(); }
    res.status(201).json({ id: row.id, name: row.name, primaryPhotoUrl: storage.publicUrl(filePath) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A character with that name already exists." });
    throw err;
  } finally { await cleanup(req.file); }
}));
router.get("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Character not found." });
  const result = await pool.query("SELECT c.id, c.name, c.created_at, p.id AS photo_id, p.file_path, p.is_primary FROM characters c LEFT JOIN character_photos p ON p.character_id = c.id WHERE c.id = $1 ORDER BY p.created_at", [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: "Character not found." });
  const first = result.rows[0];
  res.json({ id: first.id, name: first.name, createdAt: first.created_at, photos: result.rows.filter((row) => row.photo_id).map((row) => ({ id: row.photo_id, url: storage.publicUrl(row.file_path), isPrimary: row.is_primary })) });
}));
router.post("/:id/photos", upload.single("photo"), asyncHandler(async (req, res) => {
  try {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: "Character not found." });
    if (!req.file) return res.status(400).json({ error: "A photo is required." });
    const exists = await pool.query("SELECT id FROM characters WHERE id = $1", [req.params.id]);
    if (!exists.rowCount) return res.status(404).json({ error: "Character not found." });
    const id = crypto.randomUUID(); const makePrimary = req.body.makePrimary === "true";
    const filePath = storage.getCharacterPhotoPath(req.params.id, id, ".png");
    const abs = storage.absolutePath(filePath);
    await normalizeToPng(req.file.path, abs, { originalName: req.file.originalname, mimeType: req.file.mimetype });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (makePrimary) await client.query("UPDATE character_photos SET is_primary = false WHERE character_id = $1", [req.params.id]);
      await client.query("INSERT INTO character_photos (id, character_id, file_path, is_primary) VALUES ($1, $2, $3, $4)", [id, req.params.id, filePath, makePrimary]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      await storage.removeRelative(filePath);
      throw error;
    } finally { client.release(); }
    res.status(201).json({ id, url: storage.publicUrl(filePath), isPrimary: makePrimary });
  } finally { await cleanup(req.file); }
}));
router.delete("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Character not found." });
  const photos = await pool.query("SELECT file_path FROM character_photos WHERE character_id = $1", [req.params.id]);
  const deleted = await pool.query("DELETE FROM characters WHERE id = $1 RETURNING id", [req.params.id]);
  if (!deleted.rowCount) return res.status(404).json({ error: "Character not found." });
  await Promise.all(photos.rows.map((row) => storage.removeRelative(row.file_path)));
  await fs.promises.rm(storage.absolutePath(`characters/${req.params.id}`), { recursive: true, force: true });
  res.status(204).end();
}));
router.use((err, req, res, next) => { if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message }); next(err); });
module.exports = router;

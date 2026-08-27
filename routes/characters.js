const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../db/pool");
const storage = require("../lib/storage");
const { asyncHandler, isUuid, cleanup } = require("./helpers");
const { normalizeToPng } = require("../lib/imageNormalizer");
const { enqueue } = require("../lib/generationQueue");
const { registry } = require("../engines");
const { ANGLES, anglePrompt, validateSource, runProfileGeneration } = require("../lib/characterAngleProfiles");

const router = express.Router();
const tempDir = path.join(__dirname, "..", "tmp", "uploads-v2");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });
function angleProfile(row) {
  return row.profile_set_id ? {
    id: row.profile_set_id,
    status: row.profile_status,
    completedAngles: Number(row.profile_completed_angles || 0),
    totalAngles: ANGLES.length,
    engine: row.profile_engine,
    model: row.profile_model,
    sheetUrl: row.profile_sheet_path ? storage.publicUrl(row.profile_sheet_path) : null,
    errorMessage: row.profile_error_message || null,
    createdAt: row.profile_created_at,
  } : null;
}
function character(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    primaryPhotoUrl: row.primary_photo_path ? storage.publicUrl(row.primary_photo_path) : null,
    angleProfile: angleProfile(row),
  };
}

const listSql = `
  SELECT c.*, p.file_path AS primary_photo_path,
         profile.id AS profile_set_id,
         profile.status AS profile_status,
         profile.sheet_path AS profile_sheet_path,
         profile.error_message AS profile_error_message,
         profile.created_at AS profile_created_at,
         profile.engine AS profile_engine,
         profile.model AS profile_model,
         profile.completed_angles AS profile_completed_angles
  FROM characters c
  LEFT JOIN character_photos p ON p.character_id = c.id AND p.is_primary = true
  LEFT JOIN LATERAL (
    SELECT ps.*, COUNT(v.id) FILTER (WHERE v.status = 'completed')::int AS completed_angles
    FROM character_profile_sets ps
    LEFT JOIN character_profile_views v ON v.profile_set_id = ps.id
    WHERE ps.character_id = c.id
    GROUP BY ps.id
    ORDER BY ps.created_at DESC
    LIMIT 1
  ) profile ON true
  ORDER BY c.created_at DESC`;

router.get("/", asyncHandler(async (req, res) => {
  const result = await pool.query(listSql);
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
    let row;
    try {
      await pool.transaction(async (transaction) => {
        row = (await transaction.query("INSERT INTO characters (id, name) VALUES ($1, $2) RETURNING *", [characterId, name])).rows[0];
        await transaction.query("INSERT INTO character_photos (id, character_id, file_path) VALUES ($1, $2, $3)", [photoId, characterId, filePath]);
      });
    } catch (err) { await storage.removeRelative(filePath); throw err; }
    res.status(201).json({ id: row.id, name: row.name, createdAt: row.created_at, primaryPhotoUrl: storage.publicUrl(filePath), angleProfile: null });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A character with that name already exists." });
    throw err;
  } finally { await cleanup(req.file); }
}));
router.post("/:id/angle-profile", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Character not found." });
  const engineKey = String(req.body?.engine || "openai").trim();
  const engine = registry[engineKey];
  if (!engine?.capabilities?.angleProfiles || typeof engine.generateProfileView !== "function") {
    return res.status(400).json({ error: "Choose an engine that supports five-angle character generation." });
  }
  const ready = await engine.isReady();
  if (!ready.ready) {
    return res.status(409).json({ error: `${engine.label} is not ready. ${ready.reason || "Configure it in Settings before generating character angles."}` });
  }
  const model = engine.getConfiguredModel
    ? await engine.getConfiguredModel()
    : engine.models?.[0]?.id || engine.key;
  const existing = await pool.query(
    "SELECT id FROM character_profile_sets WHERE character_id = $1 AND status IN ('pending', 'running') LIMIT 1",
    [req.params.id],
  );
  if (existing.rowCount) return res.status(409).json({ error: "Character angles are already being generated." });
  const source = await pool.query(
    "SELECT c.id, p.file_path FROM characters c JOIN character_photos p ON p.character_id = c.id AND p.is_primary = true WHERE c.id = $1",
    [req.params.id],
  );
  if (!source.rowCount) return res.status(404).json({ error: "Character not found." });
  const sourcePath = storage.absolutePath(source.rows[0].file_path);
  await validateSource(sourcePath);

  const profileSetId = crypto.randomUUID();
  await pool.transaction(async (transaction) => {
    await transaction.query(
      "INSERT INTO character_profile_sets (id, character_id, engine, model) VALUES ($1, $2, $3, $4)",
      [profileSetId, req.params.id, engineKey, model],
    );
    for (const angle of ANGLES) {
      await transaction.query(
        "INSERT INTO character_profile_views (id, profile_set_id, angle, prompt) VALUES ($1, $2, $3, $4)",
        [crypto.randomUUID(), profileSetId, angle, anglePrompt(angle)],
      );
    }
  });

  enqueue(`character-profile:${profileSetId}`, () => runProfileGeneration({
    characterId: req.params.id,
    profileSetId,
    sourcePath,
    engineKey,
    model,
    requestId: req.requestId,
  }));
  res.status(202).json({
    id: profileSetId,
    status: "pending",
    completedAngles: 0,
    totalAngles: ANGLES.length,
    engine: engineKey,
    model,
    sheetUrl: null,
    errorMessage: null,
  });
}));
router.patch("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Character not found." });
  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "A character name is required." });
  if (name.length > 80) return res.status(400).json({ error: "Character names must be 80 characters or fewer." });
  try {
    const result = await pool.query(
      `WITH updated AS (
         UPDATE characters SET name = $2 WHERE id = $1
         RETURNING id, name, created_at
       )
       SELECT updated.*, p.file_path AS primary_photo_path
       FROM updated
       LEFT JOIN character_photos p ON p.character_id = updated.id AND p.is_primary = true`,
      [req.params.id, name],
    );
    if (!result.rowCount) return res.status(404).json({ error: "Character not found." });
    res.json(character(result.rows[0]));
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "A character with that name already exists." });
    throw err;
  }
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
    try {
      await pool.transaction(async (transaction) => {
        if (makePrimary) await transaction.query("UPDATE character_photos SET is_primary = false WHERE character_id = $1", [req.params.id]);
        await transaction.query("INSERT INTO character_photos (id, character_id, file_path, is_primary) VALUES ($1, $2, $3, $4)", [id, req.params.id, filePath, makePrimary]);
      });
    } catch (error) {
      await storage.removeRelative(filePath);
      throw error;
    }
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

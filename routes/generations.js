const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../db/pool");
const storage = require("../lib/storage");
const { buildMergePrompt } = require("../lib/promptTemplate");
const { normalizeToPng } = require("../lib/imageNormalizer");
const { enqueue } = require("../lib/generationQueue");
const { registry } = require("../engines");
const { asyncHandler, isUuid, cleanup } = require("./helpers");
const logger = require("../lib/logger");
const router = express.Router();
const tempDir = path.join(__dirname, "..", "tmp", "uploads-v2"); fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });

const detailSql = `SELECT g.*, c.name AS character_name, bp.name AS background_name, bp.type AS background_type, sp.name AS style_name, sp.type AS style_type FROM generations g LEFT JOIN characters c ON c.id = g.character_id LEFT JOIN presets bp ON bp.id = g.background_preset_id LEFT JOIN presets sp ON sp.id = g.style_preset_id`;
function shape(row) { return { id: row.id, status: row.status, characterId: row.character_id, characterName: row.character_name || null, engine: row.engine, characterPhotoUrl: storage.publicUrl(storage.getGenerationCharacterPath(row.id, ".png")), posePhotoUrl: storage.publicUrl(row.pose_photo_path), outputUrl: row.output_path ? storage.publicUrl(row.output_path) : null, backgroundPreset: row.background_preset_id ? { id: row.background_preset_id, name: row.background_name, type: "background", isCustom: false } : null, stylePreset: row.style_preset_id ? { id: row.style_preset_id, name: row.style_name, type: "style", isCustom: false } : null, prompt: row.prompt, errorMessage: row.error_message, createdAt: row.created_at, startedAt: row.started_at, completedAt: row.completed_at }; }
async function load(id) { const result = await pool.query(`${detailSql} WHERE g.id = $1`, [id]); return result.rows[0]; }
async function getSetting(key) { const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]); return result.rows[0]?.value || ""; }

router.post("/", upload.fields([{ name: "posePhoto", maxCount: 1 }, { name: "characterPhoto", maxCount: 1 }]), asyncHandler(async (req, res) => {
  const pose = req.files?.posePhoto?.[0]; const characterPhoto = req.files?.characterPhoto?.[0];
  const uploadId = crypto.randomUUID();
  let storedPose = null; let storedCharacter = null;
  logger.debug("generation request received", { requestId: req.requestId, hasPosePhoto: Boolean(pose), hasCharacterPhoto: Boolean(characterPhoto), characterId: req.body.characterId || null, engine: req.body.engine || null });
  try {
    storedPose = pose ? await storage.persistUpload(pose, uploadId, "pose") : null;
    storedCharacter = characterPhoto ? await storage.persistUpload(characterPhoto, uploadId, "character") : null;
    logger.info("raw uploads stored", { requestId: req.requestId, uploadId, posePath: storedPose?.relativePath || null, characterPath: storedCharacter?.relativePath || null });
    if (!pose) return res.status(400).json({ error: "A pose photo is required." });
    const characterId = String(req.body.characterId || "");
    if ((characterId && characterPhoto) || (!characterId && !characterPhoto)) return res.status(400).json({ error: "Provide exactly one of characterId or characterPhoto." });
    const engineKey = String(req.body.engine || ""); const engine = registry[engineKey];
    if (!engine) return res.status(400).json({ error: "Unknown engine." });
    const ready = await engine.isReady(); if (!ready.ready) return res.status(409).json({ error: ready.reason || "Engine is not ready." });
    let character = null; let characterPhotoRow = null; let characterSourcePath;
    if (characterId) {
      if (!isUuid(characterId)) return res.status(404).json({ error: "Character not found." });
      const result = await pool.query("SELECT c.id, p.id AS photo_id, p.file_path FROM characters c JOIN character_photos p ON p.character_id = c.id AND p.is_primary = true WHERE c.id = $1", [characterId]);
      if (!result.rowCount) return res.status(404).json({ error: "Character not found." });
      character = result.rows[0]; characterPhotoRow = character.photo_id; characterSourcePath = storage.absolutePath(character.file_path);
    }
    const backgroundId = req.body.backgroundPresetId || null; const styleId = req.body.stylePresetId || null;
    const presetIds = [backgroundId, styleId].filter(Boolean); let presets = [];
    if (presetIds.some((id) => !isUuid(id))) return res.status(400).json({ error: "Invalid preset id." });
    if (presetIds.length) presets = (await pool.query("SELECT * FROM presets WHERE id = ANY($1::uuid[])", [presetIds])).rows;
    if (presets.length !== presetIds.length) return res.status(400).json({ error: "Preset not found." });
    const background = presets.find((item) => item.id === backgroundId && item.type === "background"); const style = presets.find((item) => item.id === styleId && item.type === "style");
    if ((backgroundId && !background) || (styleId && !style)) return res.status(400).json({ error: "Preset type does not match its field." });
    const id = crypto.randomUUID(); const posePath = storage.getGenerationPosePath(id, ".png"); const outputPath = storage.getGenerationOutputPath(id); const generationDir = path.dirname(storage.absolutePath(posePath));
    await fs.promises.mkdir(generationDir, { recursive: true });
    await normalizeToPng(storedPose.absolutePath, storage.absolutePath(posePath));
    const normalizedCharacterPath = storage.absolutePath(storage.getGenerationCharacterPath(id, ".png"));
    await normalizeToPng(storedCharacter ? storedCharacter.absolutePath : characterSourcePath, normalizedCharacterPath);
    characterSourcePath = normalizedCharacterPath;
    const customInstructions = String(req.body.instructions || "").trim().slice(0, 600);
    const prompt = buildMergePrompt({ characterName: character?.name, backgroundPresetFragment: background?.prompt_fragment, stylePresetFragment: style?.prompt_fragment, customInstructions: customInstructions || undefined });
    await pool.query("INSERT INTO generations (id, character_id, character_photo_id, pose_photo_path, engine, background_preset_id, style_preset_id, prompt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, character?.id || null, characterPhotoRow, posePath, engineKey, backgroundId, styleId, prompt]);
    enqueue(id, async () => {
      try {
        await pool.query("UPDATE generations SET status = 'running', started_at = now() WHERE id = $1", [id]);
        logger.info("engine execution started", { requestId: req.requestId, generationId: id, engine: engineKey });
        await engine.generate({ characterPhotoPath: characterSourcePath, posePhotoPath: storage.absolutePath(posePath), prompt, outputPath: storage.absolutePath(outputPath), apiKey: await getSetting(`${engineKey}_api_key`) });
        await pool.query("UPDATE generations SET status = 'completed', output_path = $2, completed_at = now() WHERE id = $1", [id, outputPath]);
        logger.info("generation completed", { requestId: req.requestId, generationId: id, engine: engineKey, outputPath });
      } catch (err) {
        logger.error("generation failed", { requestId: req.requestId, generationId: id, engine: engineKey, error: err.message });
        await pool.query("UPDATE generations SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1", [id, err.message]);
      }
    });
    logger.info("generation accepted", { requestId: req.requestId, generationId: id, engine: engineKey, status: "pending" });
    res.status(202).json({ id, status: "pending" });
  } finally { await cleanup(pose); await cleanup(characterPhoto); }
}));
router.get("/:id", asyncHandler(async (req, res) => { if (!isUuid(req.params.id)) return res.status(404).json({ error: "Generation not found." }); const row = await load(req.params.id); if (!row) return res.status(404).json({ error: "Generation not found." }); res.json(shape(row)); }));
router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100); const params = []; const where = [];
  if (req.query.characterId) { if (!isUuid(req.query.characterId)) return res.status(400).json({ error: "Invalid characterId." }); params.push(req.query.characterId); where.push(`g.character_id = $${params.length}`); }
  if (req.query.status) { if (!["pending", "running", "completed", "failed"].includes(req.query.status)) return res.status(400).json({ error: "Invalid status." }); params.push(req.query.status); where.push(`g.status = $${params.length}`); }
  if (req.query.cursor) { if (!isUuid(req.query.cursor)) return res.status(400).json({ error: "Invalid cursor." }); params.push(req.query.cursor); where.push(`g.created_at < (SELECT created_at FROM generations WHERE id = $${params.length})`); }
  params.push(limit + 1); const result = await pool.query(`${detailSql} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY g.created_at DESC LIMIT $${params.length}`, params); const rows = result.rows.slice(0, limit); res.json({ generations: rows.map(shape), nextCursor: result.rows.length > limit ? rows[rows.length - 1].id : null });
}));
router.delete("/:id", asyncHandler(async (req, res) => { if (!isUuid(req.params.id)) return res.status(404).json({ error: "Generation not found." }); const row = await load(req.params.id); if (!row) return res.status(404).json({ error: "Generation not found." }); await pool.query("DELETE FROM generations WHERE id = $1", [req.params.id]); await storage.removeRelative(row.pose_photo_path); await storage.removeRelative(row.output_path); await fs.promises.rm(storage.absolutePath(`generations/${req.params.id}`), { recursive: true, force: true }); res.status(204).end(); }));
router.use((err, req, res, next) => { if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message }); next(err); });
module.exports = router;

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
const poseLibrary = require("../lib/poseLibrary");

const router = express.Router();
const tempDir = path.join(__dirname, "..", "tmp", "uploads-v2"); fs.mkdirSync(tempDir, { recursive: true });
const MAX_CHARACTERS = 4;
const upload = multer({
  dest: tempDir,
  limits: { fileSize: 25 * 1024 * 1024 },
}).fields([
  { name: "posePhoto", maxCount: 1 },
  ...Array.from({ length: MAX_CHARACTERS }, (_, i) => ({ name: `characterPhoto_${i + 1}`, maxCount: 1 })),
]);

const detailSql = `SELECT g.*, bp.name AS background_name, bp.type AS background_type, sp.name AS style_name, sp.type AS style_type, pr.title AS pose_title FROM generations g LEFT JOIN presets bp ON bp.id = g.background_preset_id LEFT JOIN presets sp ON sp.id = g.style_preset_id LEFT JOIN pose_references pr ON pr.id = g.pose_reference_id`;

function shape(row, characters = []) {
  return {
    id: row.id,
    status: row.status,
    engine: row.engine,
    characters: characters.map((c) => ({ position: c.position, characterId: c.character_id, name: c.name || null, photoUrl: storage.publicUrl(c.file_path) })),
    posePhotoUrl: storage.publicUrl(row.pose_photo_path),
    poseReferenceId: row.pose_reference_id || null,
    poseTitle: row.pose_title || null,
    outputUrl: row.output_path ? storage.publicUrl(row.output_path) : null,
    backgroundPreset: row.background_preset_id ? { id: row.background_preset_id, name: row.background_name, type: "background", isCustom: false } : null,
    stylePreset: row.style_preset_id ? { id: row.style_preset_id, name: row.style_name, type: "style", isCustom: false } : null,
    prompt: row.prompt,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function loadCharactersMap(generationIds) {
  if (!generationIds.length) return {};
  const result = await pool.query(
    `SELECT gc.generation_id, gc.position, gc.character_id, gc.file_path, c.name
     FROM generation_characters gc LEFT JOIN characters c ON c.id = gc.character_id
     WHERE gc.generation_id = ANY($1::uuid[]) ORDER BY gc.position`,
    [generationIds]
  );
  const map = {};
  for (const row of result.rows) (map[row.generation_id] ||= []).push(row);
  return map;
}

async function load(id) {
  const result = await pool.query(`${detailSql} WHERE g.id = $1`, [id]);
  const row = result.rows[0];
  if (!row) return null;
  const charactersMap = await loadCharactersMap([id]);
  return { row, characters: charactersMap[id] || [] };
}

async function getSetting(key) { const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]); return result.rows[0]?.value || ""; }

router.post("/", upload, asyncHandler(async (req, res) => {
  const pose = req.files?.posePhoto?.[0];
  const poseReferenceId = String(req.body.poseReferenceId || "");
  const uploadId = crypto.randomUUID();
  let storedPose = null;
  const uploadedCharacterFiles = [];
  try {
    // Up to MAX_CHARACTERS character slots, each either a saved character
    // (characterId_N) or a fresh upload (characterPhoto_N). Slots must be
    // filled contiguously starting at 1 — that's how the Studio UI builds
    // them (add-another-person, one at a time), and it keeps validation
    // simple/unambiguous.
    const filledSlots = [];
    for (let position = 1; position <= MAX_CHARACTERS; position++) {
      const idField = req.body[`characterId_${position}`];
      const fileField = req.files?.[`characterPhoto_${position}`]?.[0];
      if (idField && fileField) return res.status(400).json({ error: `Provide exactly one of characterId_${position} or characterPhoto_${position}.` });
      if (idField || fileField) { filledSlots.push({ position, characterId: idField || null, file: fileField || null }); if (fileField) uploadedCharacterFiles.push(fileField); }
    }
    if (!filledSlots.length) return res.status(400).json({ error: "At least one character is required." });
    if (filledSlots.some((slot, i) => slot.position !== i + 1)) return res.status(400).json({ error: "Character slots must be filled in order starting from 1, with no gaps." });

    storedPose = pose ? await storage.persistUpload(pose, uploadId, "pose") : null;
    logger.info("raw uploads stored", { requestId: req.requestId, uploadId, posePath: storedPose?.relativePath || null, characterCount: filledSlots.length });
    if ((pose && poseReferenceId) || (!pose && !poseReferenceId)) return res.status(400).json({ error: "Provide exactly one of a pose photo upload or poseReferenceId." });
    if (poseReferenceId && !isUuid(poseReferenceId)) return res.status(404).json({ error: "Pose reference not found." });

    const engineKey = String(req.body.engine || ""); const engine = registry[engineKey];
    if (!engine) return res.status(400).json({ error: "Unknown engine." });
    const ready = await engine.isReady(); if (!ready.ready) return res.status(409).json({ error: ready.reason || "Engine is not ready." });

    // Resolve each slot to a local source image: a saved character's
    // primary photo, or the freshly uploaded file.
    const characterSources = [];
    for (const slot of filledSlots) {
      if (slot.characterId) {
        if (!isUuid(slot.characterId)) return res.status(404).json({ error: `Character not found for person ${slot.position}.` });
        const result = await pool.query("SELECT c.id, p.id AS photo_id, p.file_path FROM characters c JOIN character_photos p ON p.character_id = c.id AND p.is_primary = true WHERE c.id = $1", [slot.characterId]);
        if (!result.rowCount) return res.status(404).json({ error: `Character not found for person ${slot.position}.` });
        const character = result.rows[0];
        characterSources.push({ position: slot.position, characterId: character.id, sourcePath: storage.absolutePath(character.file_path) });
      } else {
        const stored = await storage.persistUpload(slot.file, uploadId, `character-${slot.position}`);
        characterSources.push({ position: slot.position, characterId: null, sourcePath: stored.absolutePath });
      }
    }

    const backgroundId = req.body.backgroundPresetId || null; const styleId = req.body.stylePresetId || null;
    const presetIds = [backgroundId, styleId].filter(Boolean); let presets = [];
    if (presetIds.some((id) => !isUuid(id))) return res.status(400).json({ error: "Invalid preset id." });
    if (presetIds.length) presets = (await pool.query("SELECT * FROM presets WHERE id = ANY($1::uuid[])", [presetIds])).rows;
    if (presets.length !== presetIds.length) return res.status(400).json({ error: "Preset not found." });
    const background = presets.find((item) => item.id === backgroundId && item.type === "background"); const style = presets.find((item) => item.id === styleId && item.type === "style");
    if ((backgroundId && !background) || (styleId && !style)) return res.status(400).json({ error: "Preset type does not match its field." });

    // Resolve the pose source: either a fresh upload (which we register as
    // a new library entry so it's reusable later) or an existing library
    // entry (lazily cached from its source_url on first real use).
    let resolvedPoseReferenceId;
    let poseSourcePath;
    if (pose) {
      const poseRefRow = await poseLibrary.addPoseReference(storedPose.absolutePath, { isCustom: true });
      resolvedPoseReferenceId = poseRefRow.id;
      poseSourcePath = storage.absolutePath(poseRefRow.file_path);
    } else {
      const resolved = await poseLibrary.resolvePoseReferenceFile(poseReferenceId);
      if (!resolved) return res.status(404).json({ error: "Pose reference not found." });
      resolvedPoseReferenceId = resolved.row.id;
      poseSourcePath = resolved.absolutePath;
    }

    const id = crypto.randomUUID(); const posePath = storage.getGenerationPosePath(id, ".png"); const outputPath = storage.getGenerationOutputPath(id); const generationDir = path.dirname(storage.absolutePath(posePath));
    await fs.promises.mkdir(generationDir, { recursive: true });
    await normalizeToPng(poseSourcePath, storage.absolutePath(posePath));

    const characterPaths = [];
    for (const src of characterSources) {
      const relPath = storage.getGenerationCharacterPath(id, src.position, ".png");
      await normalizeToPng(src.sourcePath, storage.absolutePath(relPath));
      characterPaths.push({ position: src.position, characterId: src.characterId, relPath, absolutePath: storage.absolutePath(relPath) });
    }

    const customInstructions = String(req.body.instructions || "").trim().slice(0, 600);
    const prompt = buildMergePrompt({ characterCount: characterPaths.length, backgroundPresetFragment: background?.prompt_fragment, stylePresetFragment: style?.prompt_fragment, customInstructions: customInstructions || undefined });
    await pool.query("INSERT INTO generations (id, pose_photo_path, pose_reference_id, engine, background_preset_id, style_preset_id, prompt) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, posePath, resolvedPoseReferenceId, engineKey, backgroundId, styleId, prompt]);
    for (const cp of characterPaths) {
      await pool.query("INSERT INTO generation_characters (generation_id, position, character_id, file_path) VALUES ($1,$2,$3,$4)", [id, cp.position, cp.characterId, cp.relPath]);
    }

    enqueue(id, async () => {
      try {
        await pool.query("UPDATE generations SET status = 'running', started_at = now() WHERE id = $1", [id]);
        logger.info("engine execution started", { requestId: req.requestId, generationId: id, engine: engineKey, characterCount: characterPaths.length });
        await engine.generate({ characterPhotoPaths: characterPaths.map((cp) => cp.absolutePath), posePhotoPath: storage.absolutePath(posePath), prompt, outputPath: storage.absolutePath(outputPath), apiKey: await getSetting(`${engineKey}_api_key`) });
        await pool.query("UPDATE generations SET status = 'completed', output_path = $2, completed_at = now() WHERE id = $1", [id, outputPath]);
        logger.info("generation completed", { requestId: req.requestId, generationId: id, engine: engineKey, outputPath });
      } catch (err) {
        logger.error("generation failed", { requestId: req.requestId, generationId: id, engine: engineKey, error: err.message });
        await pool.query("UPDATE generations SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1", [id, err.message]);
      }
    });
    logger.info("generation accepted", { requestId: req.requestId, generationId: id, engine: engineKey, status: "pending", characterCount: characterPaths.length });
    res.status(202).json({ id, status: "pending" });
  } finally {
    await cleanup(pose);
    await Promise.all(uploadedCharacterFiles.map(cleanup));
  }
}));

router.get("/:id", asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: "Generation not found." });
  const loaded = await load(req.params.id);
  if (!loaded) return res.status(404).json({ error: "Generation not found." });
  res.json(shape(loaded.row, loaded.characters));
}));

router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100); const params = []; const where = [];
  if (req.query.characterId) {
    if (!isUuid(req.query.characterId)) return res.status(400).json({ error: "Invalid characterId." });
    params.push(req.query.characterId);
    where.push(`g.id IN (SELECT generation_id FROM generation_characters WHERE character_id = $${params.length})`);
  }
  if (req.query.status) { if (!["pending", "running", "completed", "failed"].includes(req.query.status)) return res.status(400).json({ error: "Invalid status." }); params.push(req.query.status); where.push(`g.status = $${params.length}`); }
  if (req.query.cursor) { if (!isUuid(req.query.cursor)) return res.status(400).json({ error: "Invalid cursor." }); params.push(req.query.cursor); where.push(`g.created_at < (SELECT created_at FROM generations WHERE id = $${params.length})`); }
  params.push(limit + 1); const result = await pool.query(`${detailSql} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY g.created_at DESC LIMIT $${params.length}`, params); const rows = result.rows.slice(0, limit);
  const charactersMap = await loadCharactersMap(rows.map((row) => row.id));
  res.json({ generations: rows.map((row) => shape(row, charactersMap[row.id] || [])), nextCursor: result.rows.length > limit ? rows[rows.length - 1].id : null });
}));

router.delete("/:id", asyncHandler(async (req, res) => { if (!isUuid(req.params.id)) return res.status(404).json({ error: "Generation not found." }); const row = await load(req.params.id); if (!row) return res.status(404).json({ error: "Generation not found." }); await pool.query("DELETE FROM generations WHERE id = $1", [req.params.id]); await storage.removeRelative(row.row.pose_photo_path); await storage.removeRelative(row.row.output_path); await fs.promises.rm(storage.absolutePath(`generations/${req.params.id}`), { recursive: true, force: true }); res.status(204).end(); }));
router.use((err, req, res, next) => { if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message }); next(err); });
module.exports = router;

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { pool } = require("../db/pool");
const storage = require("../lib/storage");
const { normalizeToPng } = require("../lib/imageNormalizer");
const { enqueue } = require("../lib/generationQueue");
const { registry } = require("../engines");
const { asyncHandler, cleanup } = require("./helpers");
const { estimateGenerationUsage, mergeActualUsage } = require("../lib/usageEstimator");
const { RETRIEVED_ON, DOCUMENT_PHOTO_PROFILES } = require("../lib/passportGuidelines");
const logger = require("../lib/logger");

const router = express.Router();
const tempDir = path.join(__dirname, "..", "tmp", "document-photo");
fs.mkdirSync(tempDir, { recursive: true });
const upload = multer({ dest: tempDir, limits: { fileSize: 25 * 1024 * 1024 } });

async function setting(key) {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return result.rows[0]?.value || "";
}

async function createPoseTemplate(targetPath, profile) {
  const { widthPx, heightPx } = profile.output;
  const headY = Math.round(heightPx * 0.39);
  const headRx = Math.round(widthPx * 0.18);
  const headRy = Math.round(heightPx * 0.23);
  const svg = `<svg width="${widthPx}" height="${heightPx}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/><ellipse cx="${Math.round(widthPx / 2)}" cy="${headY}" rx="${headRx}" ry="${headRy}" fill="#d9dde4"/><path d="M${Math.round(widthPx * .18)} ${heightPx}c${Math.round(widthPx * .03)}-${Math.round(heightPx * .28)} ${Math.round(widthPx * .18)}-${Math.round(heightPx * .4)} ${Math.round(widthPx * .32)}-${Math.round(heightPx * .4)}s${Math.round(widthPx * .29)} ${Math.round(heightPx * .12)} ${Math.round(widthPx * .32)} ${Math.round(heightPx * .4)}" fill="#c9ced7"/></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(targetPath);
}

async function encodeWithinLimit(pipeline, profile) {
  if (profile.output.format === "png") return pipeline.png().withMetadata({ density: 300 }).toBuffer();
  let quality = 92;
  let output;
  do {
    output = await pipeline.clone().jpeg({ quality, mozjpeg: true }).withMetadata({ density: 300 }).toBuffer();
    quality -= 6;
  } while (profile.output.maxBytes && output.length > profile.output.maxBytes && quality >= 38);
  if (profile.output.maxBytes && output.length > profile.output.maxBytes) throw new Error(`Could not compress the image below ${Math.round(profile.output.maxBytes / 1000)} KB.`);
  return output;
}

async function createPrintSheet(photoBuffer, sheetPath, profile) {
  if (!profile.output.sheet) return null;
  let printWidth = Math.round((profile.output.printWidthMm / 25.4) * 300);
  let printHeight = Math.round((profile.output.printHeightMm / 25.4) * 300);
  if (printWidth * 2 > 1200) { const scale = 1200 / (printWidth * 2); printWidth = Math.floor(printWidth * scale); printHeight = Math.floor(printHeight * scale); }
  const cell = await sharp(photoBuffer).resize(printWidth, printHeight, { fit: "cover", position: "centre" }).png().toBuffer();
  const columns = Math.min(2, Math.floor(1200 / printWidth));
  const rows = Math.min(3, Math.floor(1800 / printHeight));
  const gapX = columns > 1 ? Math.floor((1200 - columns * printWidth) / (columns - 1)) : 0;
  const gapY = rows > 1 ? Math.floor((1800 - rows * printHeight) / (rows - 1)) : 0;
  const startX = Math.max(0, Math.floor((1200 - (columns * printWidth + (columns - 1) * gapX)) / 2));
  const startY = Math.max(0, Math.floor((1800 - (rows * printHeight + (rows - 1) * gapY)) / 2));
  const placements = [];
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) placements.push({ input: cell, left: startX + column * (printWidth + gapX), top: startY + row * (printHeight + gapY) });
  await sharp({ create: { width: 1200, height: 1800, channels: 4, background: "white" } }).composite(placements).png().withMetadata({ density: 300 }).toFile(sheetPath);
  return sheetPath;
}

async function createDocumentAssets(rawPath, outputPath, sheetPath, profile) {
  const pipeline = sharp(rawPath).rotate().resize(profile.output.widthPx, profile.output.heightPx, { fit: "cover", position: "centre" });
  const output = await encodeWithinLimit(pipeline, profile);
  await fs.promises.writeFile(outputPath, output);
  await createPrintSheet(output, sheetPath, profile);
}

router.get("/config", (req, res) => res.json({ retrievedOn: RETRIEVED_ON, profiles: Object.values(DOCUMENT_PHOTO_PROFILES) }));

router.post("/", upload.single("characterPhoto"), asyncHandler(async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "A portrait photo is required." });
    const profile = DOCUMENT_PHOTO_PROFILES[String(req.body.profileId || "us-passport")];
    if (!profile) return res.status(400).json({ error: "Unknown document photo profile." });
    const processingMode = req.body.processingMode === "ai" ? "ai" : "local";
    const engineKey = processingMode === "ai" ? String(req.body.engine || "codex") : "local-format";
    const engine = processingMode === "ai" ? registry[engineKey] : null;
    if (processingMode === "ai") {
      if (!engine) return res.status(400).json({ error: "Unknown engine." });
      const ready = await engine.isReady();
      if (!ready.ready) return res.status(409).json({ error: ready.reason || "Engine is not ready." });
    }
    const engineModel = engine?.getConfiguredModel ? await engine.getConfiguredModel() : null;

    const id = crypto.randomUUID();
    const posePath = storage.getGenerationPosePath(id, ".png");
    const characterPath = storage.getGenerationCharacterPath(id, 1, ".png");
    const rawPath = storage.getDocumentRawPath(id);
    const outputPath = storage.getDocumentOutputPath(id, profile.output.format);
    const sheetPath = storage.getDocumentSheetPath(id);
    const generationDir = path.dirname(storage.absolutePath(outputPath));
    await fs.promises.mkdir(generationDir, { recursive: true });
    await normalizeToPng(req.file.path, storage.absolutePath(characterPath), { originalName: req.file.originalname, mimeType: req.file.mimetype });
    await createPoseTemplate(storage.absolutePath(posePath), profile);

    const prompt = `Create a photorealistic ${profile.label} photo of the exact person in Image 1. Preserve identity, age, facial geometry, skin tone, hair, and natural texture exactly. Image 2 is only a composition guide. ${profile.prompt}. Do not beautify, reshape, de-age, add makeup, or change identifying features. No text, borders, watermarks, or props.`;
    const advancedSettings = { workflow: "document-photo", documentProfileId: profile.id, countryCode: profile.countryCode, documentType: profile.documentType, guidelineRetrievedOn: profile.retrievedOn, sourceVersionLabel: profile.sourceVersionLabel, officialGuidelineUrl: profile.officialLinks[0]?.url, processingMode, engineModel, output: { aspectRatio: `${profile.output.widthPx}:${profile.output.heightPx}`, quality: "high", variantCount: 1, widthPx: profile.output.widthPx, heightPx: profile.output.heightPx, format: profile.output.format } };
    const usageEstimate = processingMode === "ai"
      ? estimateGenerationUsage({ engine: engineKey, model: engineModel, prompt, imageCount: 2, quality: "high", aspectRatio: "1:1" })
      : { source: "local", rateDate: profile.retrievedOn, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, pricingNote: "Local crop, resize, and format processing; no generation tokens used." };
    await pool.query("INSERT INTO generations (id, pose_photo_path, engine, prompt, studio_mode, advanced_settings, usage_metrics) VALUES ($1,$2,$3,$4,'advanced',$5::jsonb,$6::jsonb)", [id, posePath, engineKey, prompt, JSON.stringify(advancedSettings), JSON.stringify(usageEstimate)]);
    await pool.query("INSERT INTO generation_characters (generation_id, position, file_path) VALUES ($1,1,$2)", [id, characterPath]);

    if (processingMode === "local") {
      await fs.promises.copyFile(storage.absolutePath(characterPath), storage.absolutePath(rawPath));
      await createDocumentAssets(storage.absolutePath(rawPath), storage.absolutePath(outputPath), storage.absolutePath(sheetPath), profile);
      await pool.query("UPDATE generations SET status = 'completed', output_path = $2, started_at = now(), completed_at = now() WHERE id = $1", [id, outputPath]);
      return res.status(201).json({ id, status: "completed" });
    }

    enqueue(id, async () => {
      try {
        await pool.query("UPDATE generations SET status = 'running', started_at = now() WHERE id = $1", [id]);
        const result = await engine.generate({ characterPhotoPaths: [storage.absolutePath(characterPath)], posePhotoPath: storage.absolutePath(posePath), prompt, outputPath: storage.absolutePath(rawPath), outputSettings: { aspectRatio: "1:1", quality: "high" }, apiKey: await setting(`${engineKey}_api_key`), model: engineModel });
        await createDocumentAssets(storage.absolutePath(rawPath), storage.absolutePath(outputPath), storage.absolutePath(sheetPath), profile);
        const usage = mergeActualUsage(usageEstimate, result?.usage);
        await pool.query("UPDATE generations SET status = 'completed', output_path = $2, usage_metrics = $3::jsonb, completed_at = now() WHERE id = $1", [id, outputPath, JSON.stringify(usage)]);
      } catch (error) {
        logger.error("document photo generation failed", { generationId: id, profileId: profile.id, engine: engineKey, error: error.message });
        await pool.query("UPDATE generations SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1", [id, error.message]);
      }
    });
    res.status(202).json({ id, status: "pending" });
  } finally { await cleanup(req.file); }
}));

router.use((err, req, res, next) => { if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "That file is too large (25MB max)." : err.message }); next(err); });

module.exports = router;
module.exports.createDocumentAssets = createDocumentAssets;

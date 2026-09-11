const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../db/pool");
const storage = require("./storage");
const { buildMergePrompt } = require("./promptTemplate");
const { normalizeToPng } = require("./imageNormalizer");
const { enqueue } = require("./generationQueue");
const logger = require("./logger");
const { buildAdvancedPromptFragment, outputSettings } = require("./studioSettings");
const { estimateGenerationUsage, mergeActualUsage } = require("./usageEstimator");

async function getSetting(key) {
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]);
  return result.rows[0]?.value || "";
}

/**
 * Creates and enqueues a single generation from already-resolved local image
 * sources. This is the core shared by the multipart Studio dock submit
 * (routes/generations.js) and the Studio pipeline runner
 * (routes/studio-projects.js) — both resolve their own inputs (uploads,
 * saved characters/poses, or a chained prior generation's output) into the
 * same `characterSources`/`poseSource` shape before calling this.
 *
 * `characterSources`: array of { position, characterId|null, sourcePath, identitySourcePath, referenceKind }
 * `poseSource`: { referenceId|null, sourcePath }
 */
async function createGeneration({
  characterSources,
  poseSource,
  engineKey,
  engine,
  engineModel,
  background,
  style,
  customInstructions,
  studioMode = "normal",
  advancedSettings,
  variantIndex = 0,
  variantCount = 1,
  collageEnabled = false,
  batchId = null,
  requestId,
  awaitCompletion = false,
}) {
  const id = crypto.randomUUID();
  const posePath = storage.getGenerationPosePath(id, ".png");
  const outputPath = storage.getGenerationOutputPath(id);
  const generationDir = path.dirname(storage.absolutePath(posePath));
  await fs.promises.mkdir(generationDir, { recursive: true });
  await normalizeToPng(poseSource.sourcePath, storage.absolutePath(posePath));

  const characterPaths = [];
  for (const src of characterSources) {
    const relPath = storage.getGenerationCharacterPath(id, src.position, ".png");
    await normalizeToPng(src.sourcePath, storage.absolutePath(relPath));
    let identityAbsolutePath = storage.absolutePath(relPath);
    if (src.referenceKind === "angle-sheet") {
      const identityRelPath = storage.getGenerationCharacterReferencePath(id, src.position, ".png");
      identityAbsolutePath = storage.absolutePath(identityRelPath);
      await normalizeToPng(src.identitySourcePath, identityAbsolutePath);
    }
    characterPaths.push({
      position: src.position,
      characterId: src.characterId,
      relPath,
      absolutePath: storage.absolutePath(relPath),
      identityAbsolutePath,
      referenceKind: src.referenceKind,
    });
  }

  const variantDirection = collageEnabled
    ? `Use pose cell ${variantIndex + 1} of ${variantCount} as the sole pose and composition reference for this output.`
    : variantCount > 1
      ? `This is variation ${variantIndex + 1} of ${variantCount}; create a distinct interpretation while preserving all requested identities and constraints.`
      : "";
  const advancedPromptFragment = studioMode === "advanced"
    ? [buildAdvancedPromptFragment(advancedSettings), variantDirection].filter(Boolean).join(" ")
    : variantDirection;
  const prompt = buildMergePrompt({
    characterCount: characterPaths.length,
    characterReferenceKinds: characterPaths.map((item) => item.referenceKind),
    backgroundPresetFragment: background?.prompt_fragment,
    stylePresetFragment: style?.prompt_fragment,
    advancedPromptFragment,
    customInstructions: customInstructions || undefined,
  });
  const usageEstimate = estimateGenerationUsage({
    engine: engineKey,
    model: engineModel,
    prompt,
    imageCount: characterPaths.length + 1,
    quality: advancedSettings.output.quality,
    aspectRatio: advancedSettings.output.aspectRatio,
  });
  const generationSettings = {
    ...advancedSettings,
    engineModel,
    characterReferenceKinds: characterPaths.map((item) => item.referenceKind),
    poseCollage: { ...advancedSettings.poseCollage, activeIndex: collageEnabled ? variantIndex : null },
  };
  await pool.query(
    "INSERT INTO generations (id, pose_photo_path, pose_reference_id, engine, background_preset_id, style_preset_id, prompt, studio_mode, advanced_settings, batch_id, usage_metrics) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb)",
    [id, posePath, poseSource.referenceId || null, engineKey, background?.id || null, style?.id || null, prompt, studioMode, JSON.stringify(generationSettings), batchId, JSON.stringify(usageEstimate)]
  );
  for (const cp of characterPaths) {
    await pool.query("INSERT INTO generation_characters (generation_id, position, character_id, file_path) VALUES ($1,$2,$3,$4)", [id, cp.position, cp.characterId, cp.relPath]);
  }

  let resolveJob;
  let rejectJob;
  const jobDone = new Promise((resolve, reject) => { resolveJob = resolve; rejectJob = reject; });
  jobDone.catch(() => {}); // prevent an unhandled rejection for fire-and-forget callers

  enqueue(id, async () => {
    try {
      await pool.query("UPDATE generations SET status = 'running', started_at = now() WHERE id = $1", [id]);
      logger.info("engine execution started", { requestId, generationId: id, engine: engineKey, characterCount: characterPaths.length });
      const engineResult = await engine.generate({
        characterPhotoPaths: characterPaths.map((cp) => cp.identityAbsolutePath),
        posePhotoPath: storage.absolutePath(posePath),
        prompt,
        outputPath: storage.absolutePath(outputPath),
        outputSettings: outputSettings(advancedSettings),
        apiKey: await getSetting(`${engineKey}_api_key`),
        model: engineModel,
      });
      const usage = mergeActualUsage(usageEstimate, engineResult?.usage);
      await pool.query("UPDATE generations SET status = 'completed', output_path = $2, usage_metrics = $3::jsonb, completed_at = now() WHERE id = $1", [id, outputPath, JSON.stringify(usage)]);
      logger.info("generation completed", { requestId, generationId: id, engine: engineKey, outputPath });
      resolveJob();
    } catch (err) {
      logger.error("generation failed", { requestId, generationId: id, engine: engineKey, error: err.message });
      await pool.query("UPDATE generations SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1", [id, err.message]);
      rejectJob(err);
    }
  });

  if (awaitCompletion) await jobDone;

  return { id, outputPath };
}

module.exports = { createGeneration, getSetting };

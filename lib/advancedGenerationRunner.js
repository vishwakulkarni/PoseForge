/**
 * Generation execution for Advanced Studio generator nodes.
 *
 * This deliberately reuses PoseForge's existing machinery — the same
 * `storage` layout, the same `generation_queue` concurrency limiter, the same
 * `generations` table and usage estimator — and only replaces the part that is
 * genuinely different: the prompt is the user's own text rather than a
 * pose-transfer template, and references are plain images rather than
 * identity donors plus a target canvas.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { pool } = require("../db/pool");
const storage = require("./storage");
const { normalizeToPng } = require("./imageNormalizer");
const { enqueue } = require("./generationQueue");
const logger = require("./logger");
const { estimateGenerationUsage, mergeActualUsage } = require("./usageEstimator");
const { qualityForResolution, supportsAspectRatio } = require("./advancedCapabilities");
const { getSetting } = require("./generationRunner");

const MAX_PROMPT_LENGTH = 20_000;

/** `generations.pose_photo_path` is NOT NULL and history renders it as the
 * generation's input thumbnail. A prompt-only Advanced Studio generation has
 * no input image, so it gets a transparent placeholder rather than a schema
 * change that would ripple through the existing history UI. */
async function writePromptOnlyPlaceholder(absolutePath) {
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png()
    .toFile(absolutePath);
}

/**
 * Runs one Advanced Studio image generation to completion.
 *
 * `referencePaths` are absolute paths to images already on disk (resolved from
 * connected node outputs). Returns `{ id, imageUrl }`; throws with a
 * provider-readable message on failure so the caller can attach the error to
 * the single failing node without disturbing the rest of the project.
 */
async function createAdvancedImageGeneration({
  engineKey,
  engine,
  engineModel,
  prompt,
  referencePaths = [],
  aspectRatio,
  resolution,
  requestId,
}) {
  const trimmedPrompt = String(prompt || "").trim().slice(0, MAX_PROMPT_LENGTH);
  if (!trimmedPrompt) throw new Error("Add a prompt before generating.");
  if (typeof engine.generateFreeform !== "function") {
    throw new Error(`${engine.label} does not support Advanced Studio image generation.`);
  }

  const id = crypto.randomUUID();
  const outputPath = storage.getGenerationOutputPath(id);
  const generationDir = path.dirname(storage.absolutePath(outputPath));
  await fs.promises.mkdir(generationDir, { recursive: true });

  // Copy every connected image into this generation's folder as clean PNG so
  // the record is self-contained and the engine sees normalized input.
  const normalizedReferences = [];
  for (const [index, sourcePath] of referencePaths.entries()) {
    const relPath = storage.getGenerationCharacterPath(id, index + 1, ".png");
    await normalizeToPng(sourcePath, storage.absolutePath(relPath));
    normalizedReferences.push({ relPath, absolutePath: storage.absolutePath(relPath) });
  }

  const posePath = normalizedReferences.length
    ? normalizedReferences[0].relPath
    : storage.getGenerationPosePath(id, ".png");
  if (!normalizedReferences.length) await writePromptOnlyPlaceholder(storage.absolutePath(posePath));

  const quality = qualityForResolution(engineKey, resolution);
  const effectiveAspectRatio = supportsAspectRatio(engineKey, aspectRatio) ? aspectRatio : undefined;
  const usageEstimate = estimateGenerationUsage({
    engine: engineKey,
    model: engineModel,
    prompt: trimmedPrompt,
    imageCount: normalizedReferences.length,
    quality,
    aspectRatio: effectiveAspectRatio,
  });

  await pool.query(
    `INSERT INTO generations (id, pose_photo_path, engine, prompt, studio_mode, advanced_settings, usage_metrics)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
    [
      id,
      posePath,
      engineKey,
      trimmedPrompt,
      "normal",
      JSON.stringify({ workspace: "advanced", engineModel, aspectRatio: effectiveAspectRatio || null, resolution: resolution || null, quality, referenceCount: normalizedReferences.length }),
      JSON.stringify(usageEstimate),
    ]
  );
  for (const [index, reference] of normalizedReferences.entries()) {
    await pool.query(
      "INSERT INTO generation_characters (generation_id, position, character_id, file_path) VALUES ($1,$2,$3,$4)",
      [id, index + 1, null, reference.relPath]
    );
  }

  let resolveJob;
  let rejectJob;
  const jobDone = new Promise((resolve, reject) => { resolveJob = resolve; rejectJob = reject; });
  jobDone.catch(() => {});

  enqueue(id, async () => {
    try {
      await pool.query("UPDATE generations SET status = 'running', started_at = now() WHERE id = $1", [id]);
      logger.info("advanced studio generation started", { requestId, generationId: id, engine: engineKey, referenceCount: normalizedReferences.length });
      const engineResult = await engine.generateFreeform({
        referencePaths: normalizedReferences.map((reference) => reference.absolutePath),
        prompt: trimmedPrompt,
        outputPath: storage.absolutePath(outputPath),
        outputSettings: { aspectRatio: effectiveAspectRatio, quality },
        apiKey: await getSetting(`${engineKey}_api_key`),
        model: engineModel,
      });
      const usage = mergeActualUsage(usageEstimate, engineResult?.usage);
      await pool.query(
        "UPDATE generations SET status = 'completed', output_path = $2, usage_metrics = $3::jsonb, completed_at = now() WHERE id = $1",
        [id, outputPath, JSON.stringify(usage)]
      );
      logger.info("advanced studio generation completed", { requestId, generationId: id, engine: engineKey });
      resolveJob();
    } catch (err) {
      logger.error("advanced studio generation failed", { requestId, generationId: id, engine: engineKey, error: err.message });
      await pool.query("UPDATE generations SET status = 'failed', error_message = $2, completed_at = now() WHERE id = $1", [id, err.message]);
      rejectJob(err);
    }
  });

  await jobDone;
  return { id, imageUrl: storage.publicUrl(outputPath) };
}

module.exports = { createAdvancedImageGeneration };

const fs = require("fs");
const sharp = require("sharp");
const { fal } = require("@fal-ai/client");
const { pool } = require("../db/pool");
const { RATE_DATE } = require("../lib/usageEstimator");
const logger = require("../lib/logger");

// Nano Banana Pro Edit accepts multiple image references. FLUX Kontext Max
// Multi repeatedly treated the first identity photo as a base image edit and
// ignored the pose reference in real PoseForge generations.
const MODEL_ID = "fal-ai/nano-banana-pro/edit";
const SYSTEM_PROMPT = "Perform identity-preserving pose transfer. Earlier images are identity donors only; the final image is the target canvas and supplies pose and composition only. Never copy the final image's person's identity into the output, and never keep an identity donor's original pose or background.";
const PROFILE_SYSTEM_PROMPT = "Create a new camera-angle view from the single source image. Change only the viewpoint requested by the user prompt. Treat every visible detail in the source as locked: identity, face, expression, eyeglasses, clothing, hairstyle, accessories, body pose, crop, lighting, colors, and background. Never remove, add, replace, restyle, beautify, or simplify those details. Only the source head direction or camera direction may differ when required by the requested angle.";

async function configuredKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const result = await pool.query("SELECT value FROM settings WHERE key = 'fal_api_key'");
  return result.rows[0]?.value || "";
}

async function toImageBlob(imagePath) {
  return new Blob([await fs.promises.readFile(imagePath)], { type: "image/png" });
}

function poseTransferPrompt(prompt, characterCount) {
  const poseIndex = characterCount + 1;
  const identities = characterCount === 1
    ? "Image 1 is the IDENTITY DONOR"
    : `Images 1 through ${characterCount} are the IDENTITY DONORS, in person order`;
  return `${prompt}\n\nMANDATORY IMAGE ROLES:\n- ${identities}. Preserve each donor's face, facial features, skin tone, hair, body identity, distinguishing details, and clothing unless the user's request explicitly asks for different clothing. Use nothing from these images for pose, framing, or background.\n- Image ${poseIndex}, the final image, is the TARGET CANVAS. Preserve its body pose and position, camera angle, crop, framing, lighting, scene, and background. Use nothing from this image for identity, face, hair, or clothing.\n\nCreate exactly one new image by replacing the person or people on the TARGET CANVAS with the IDENTITY DONOR person or people. The output must show the donor identity in Image ${poseIndex}'s pose and composition. Never output the target person's identity. Never retain an identity donor's original pose, crop, scene, or background.`;
}

function aspectRatio(value) {
  return ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"].includes(value) ? value : "auto";
}

function falErrorMessage(error) {
  const detail = error?.body?.detail || error?.detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg || item?.message || String(item)).filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (typeof detail === "string" && detail) return detail;
  return error?.message || "Unknown provider error";
}

async function generateEdit({ referencePaths, prompt, systemPrompt, outputPath, outputSettings = {}, apiKey }) {
  const key = apiKey || await configuredKey();
  if (!key) throw new Error("No fal.ai API key configured.");
  if (!referencePaths.length) throw new Error("At least one fal.ai image reference is required.");
  if (referencePaths.length > 10) throw new Error("fal.ai supports at most ten reference images for this workflow.");
  const input = {
    prompt,
    system_prompt: systemPrompt,
    // @fal-ai/client uploads Blob values to fal storage and replaces them
    // with hosted URLs before queue submission, avoiding huge base64 JSON.
    image_urls: await Promise.all(referencePaths.map(toImageBlob)),
    num_images: 1,
    aspect_ratio: aspectRatio(outputSettings.aspectRatio),
    output_format: "png",
    resolution: outputSettings.quality === "high" ? "2K" : "1K",
    limit_generations: true,
  };
  if (outputSettings.seed != null) input.seed = Number(outputSettings.seed);

  fal.config({ credentials: key });
  let providerRequestId = null;
  let result;
  try {
    result = await fal.subscribe(MODEL_ID, {
      input,
      logs: true,
      abortSignal: AbortSignal.timeout(Number(process.env.FAL_TIMEOUT_MS || 600000)),
      onEnqueue(requestId) {
        providerRequestId = requestId;
        logger.info("fal.ai generation queued", { providerRequestId: requestId, model: MODEL_ID });
      },
      onQueueUpdate(update) {
        if (update.status !== "IN_PROGRESS") return;
        for (const log of update.logs || []) logger.info("fal.ai generation progress", { providerRequestId, message: log.message });
      },
    });
  } catch (error) {
    const requestNote = providerRequestId ? ` (request ${providerRequestId})` : "";
    throw new Error(`fal.ai ${MODEL_ID} failed${requestNote}: ${falErrorMessage(error)}`);
  }
  providerRequestId = result.requestId || providerRequestId;
  logger.info("fal.ai generation returned", { providerRequestId, model: MODEL_ID });
  const imageUrl = result.data?.images?.[0]?.url || result.data?.image?.url;
  if (!imageUrl) throw new Error(`fal.ai returned no image URL${providerRequestId ? ` (request ${providerRequestId})` : ""}.`);
  const image = await fetch(imageUrl);
  if (!image.ok) throw new Error(`Could not download fal.ai output (${image.status})${providerRequestId ? ` for request ${providerRequestId}` : ""}.`);
  await sharp(Buffer.from(await image.arrayBuffer())).rotate().png().toFile(outputPath);
  return { usage: {
    source: "provider-estimate",
    rateDate: RATE_DATE,
    model: MODEL_ID,
    providerRequestId,
    estimatedCostUsd: null,
    pricingNote: "fal.ai Nano Banana Pro Edit returned no billable usage metadata; check fal.ai billing for the current price.",
  } };
}

const engine = {
  key: "fal",
  label: "fal.ai",
  models: [{ id: MODEL_ID, label: "Nano Banana Pro Edit", tier: "pose-editing", note: "Multi-reference image editing for identity-preserving pose transfer." }],
  capabilities: { multiImage: true, maxReferenceImages: 10, angleProfiles: true, aspectRatio: true, quality: false, variants: false, local: false },
  async getConfiguredModel() { return MODEL_ID; },
  async isReady() {
    return (await configuredKey())
      ? { ready: true }
      : { ready: false, reason: "No fal.ai API key configured" };
  },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings = {}, apiKey }) {
    const characterPaths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    const referencePaths = [...characterPaths, posePhotoPath];
    return generateEdit({
      referencePaths,
      prompt: poseTransferPrompt(prompt, characterPaths.length),
      systemPrompt: SYSTEM_PROMPT,
      outputPath,
      outputSettings,
      apiKey,
    });
  },
  async generateProfileView({ sourcePath, prompt, outputPath, outputSettings = {}, apiKey }) {
    return generateEdit({
      referencePaths: [sourcePath],
      prompt,
      systemPrompt: PROFILE_SYSTEM_PROMPT,
      outputPath,
      outputSettings,
      apiKey,
    });
  },
};

module.exports = engine;

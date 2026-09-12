const fs = require("fs");
const path = require("path");
const { fal } = require("@fal-ai/client");
const { pool } = require("../db/pool");
const { RATE_DATE } = require("../lib/usageEstimator");
const logger = require("../lib/logger");

/** Single source of truth for request construction and Advanced Studio UI. */
const VIDEO_MODELS = [
  {
    id: "fal-ai/kling-video/v2.5-turbo/pro/text-to-video",
    label: "Kling 2.5 Turbo Pro — Text to Video",
    note: "Prompt-only video generation.",
    inputs: ["prompt"],
    durations: [5, 10],
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    defaultAspectRatio: "16:9",
    resolutions: ["720p"],
    defaultResolution: "720p",
    sound: false,
  },
  {
    id: "fal-ai/kling-video/v2.1/master/image-to-video",
    label: "Kling 2.1 Master — Image to Video",
    note: "Animate a start frame; an end frame is optional.",
    inputs: ["prompt", "startFrame", "endFrame"],
    durations: [5, 10],
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    defaultAspectRatio: "16:9",
    resolutions: ["720p"],
    defaultResolution: "720p",
    sound: false,
  },
  {
    id: "fal-ai/veo3.1/fast/image-to-video",
    label: "Veo 3.1 Fast — Image to Video",
    note: "Image-to-video with optional generated audio.",
    inputs: ["prompt", "startFrame"],
    durations: [8],
    defaultDuration: 8,
    aspectRatios: ["16:9", "9:16"],
    defaultAspectRatio: "16:9",
    resolutions: ["720p", "1080p"],
    defaultResolution: "720p",
    sound: true,
  },
];

async function configuredKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY;
  const result = await pool.query("SELECT value FROM settings WHERE key = 'fal_api_key'");
  return result.rows[0]?.value || "";
}

function modelDefinition(modelId) {
  return VIDEO_MODELS.find((model) => model.id === modelId) || null;
}

async function imageBlob(imagePath) {
  return new Blob([await fs.promises.readFile(imagePath)], { type: "image/png" });
}

function providerError(error) {
  const detail = error?.body?.detail || error?.detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg || item?.message || String(item)).filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  return typeof detail === "string" && detail ? detail : error?.message || "Unknown provider error";
}

async function generateVideo({
  model,
  prompt,
  startFramePath,
  endFramePath,
  referencePaths = [],
  duration,
  aspectRatio,
  resolution,
  sound,
  outputPath,
  apiKey,
}) {
  const definition = modelDefinition(model);
  if (!definition) throw new Error("Choose a supported fal.ai video model.");
  const key = apiKey || await configuredKey();
  if (!key) throw new Error("Add a fal.ai key in Settings to generate video.");
  if (definition.inputs.includes("startFrame") && !startFramePath) {
    throw new Error(`${definition.label} requires a connected start frame.`);
  }

  const input = {
    prompt,
    duration: (() => {
      const seconds = definition.durations.includes(Number(duration)) ? Number(duration) : definition.defaultDuration;
      return definition.id.includes("veo") ? `${seconds}s` : String(seconds);
    })(),
    aspect_ratio: definition.aspectRatios.includes(aspectRatio) ? aspectRatio : definition.defaultAspectRatio,
    resolution: definition.resolutions.includes(resolution) ? resolution : definition.defaultResolution,
  };
  if (startFramePath) input.image_url = await imageBlob(startFramePath);
  if (endFramePath && definition.inputs.includes("endFrame")) input.tail_image_url = await imageBlob(endFramePath);
  if (referencePaths.length && definition.inputs.includes("reference")) {
    input.reference_images = await Promise.all(referencePaths.map(imageBlob));
  }
  if (definition.sound) input.generate_audio = sound === true;

  fal.config({ credentials: key });
  let providerRequestId = null;
  let result;
  try {
    result = await fal.subscribe(definition.id, {
      input,
      logs: true,
      abortSignal: AbortSignal.timeout(Number(process.env.FAL_VIDEO_TIMEOUT_MS || 1_200_000)),
      onEnqueue(requestId) {
        providerRequestId = requestId;
        logger.info("fal.ai video queued", { model: definition.id, providerRequestId });
      },
      onQueueUpdate(update) {
        if (update.status === "IN_PROGRESS" && update.logs) {
          for (const line of update.logs) {
            logger.info("fal.ai video progress", { model: definition.id, message: line.message });
          }
        }
      },
    });
  } catch (error) {
    throw new Error(`fal.ai ${definition.label} failed: ${providerError(error)}`);
  }

  providerRequestId ||= result.requestId || null;
  const videoUrl = result.data?.video?.url || result.data?.videos?.[0]?.url;
  if (!videoUrl) throw new Error(`fal.ai ${definition.label} returned no video URL.`);
  const response = await fetch(videoUrl);
  if (!response.ok) throw new Error(`Could not download generated video (${response.status}).`);
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));

  return {
    usage: {
      source: "provider-estimate",
      rateDate: RATE_DATE,
      model: definition.id,
      providerRequestId,
      estimatedCostUsd: null,
      pricingNote: "fal.ai returned no billable usage metadata; check fal.ai billing for the current model price.",
    },
  };
}

module.exports = {
  key: "fal-video",
  label: "fal.ai Video",
  models: VIDEO_MODELS.map(({ id, label, note }) => ({ id, label, note })),
  videoModels: VIDEO_MODELS,
  capabilities: { video: true, local: false },
  async getConfiguredModel() { return VIDEO_MODELS[0].id; },
  async isReady() {
    return (await configuredKey())
      ? { ready: true }
      : { ready: false, reason: "Add a fal.ai key in Settings to generate video." };
  },
  generateVideo,
  modelDefinition,
};

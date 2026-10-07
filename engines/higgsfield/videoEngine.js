const client = require("./client");
const billing = require("./billing");
const { VIDEO_MODELS, videoModel } = require("./models");

// Estimates price the request shape, not the media, so quotes are taken
// before uploading anything.
const QUOTE_IMAGE_URL = "https://example.com/poseforge-input.png";

function buildInput(definition, { prompt, startFramePath, endFramePath, referencePaths = [], duration, aspectRatio, resolution, sound }) {
  const input = {
    prompt,
    duration: definition.durations.includes(Number(duration)) ? Number(duration) : definition.defaultDuration,
  };
  if (definition.params.includes("aspectRatio")) {
    input.aspect_ratio = definition.aspectRatios.includes(aspectRatio) ? aspectRatio : definition.defaultAspectRatio;
  }
  if (definition.params.includes("resolution")) {
    input.resolution = definition.resolutions.includes(resolution) ? resolution : definition.defaultResolution;
  }
  if (definition.params.includes("sound")) input.generate_audio = sound === true;
  const media = {
    startFrame: startFramePath && definition.inputs.includes("startFrame") ? startFramePath : null,
    endFrame: endFramePath && definition.inputs.includes("endFrame") ? endFramePath : null,
    references: definition.inputs.includes("reference") ? referencePaths : [],
  };
  return { input, media };
}

function requireDefinition(model, startFramePath, referencePaths = []) {
  const definition = videoModel(model);
  if (!definition) throw new Error("Choose a supported Higgsfield video model.");
  if (definition.inputs.includes("startFrame") && !startFramePath) {
    throw new Error(`${definition.label} requires a connected start frame.`);
  }
  if (definition.inputs.includes("reference") && !referencePaths.length) {
    throw new Error(`${definition.label} requires a connected reference image.`);
  }
  return definition;
}

async function requireCredentials(apiKey) {
  const credentials = await client.resolveCredentials(apiKey);
  if (!credentials) throw new Error("Add Higgsfield credentials in Settings to generate video.");
  if (!client.validCredentials(credentials)) throw new Error("Higgsfield credentials must be in key-id:key-secret format.");
  return credentials;
}

/** Prices the request and enforces spending limits. The runner calls this
 * before creating the generation record, so a refused request leaves no
 * trace and costs nothing. */
async function quoteUsage(request, { enforce = true } = {}) {
  const definition = requireDefinition(request.model, request.startFramePath, request.referencePaths);
  const credentials = await requireCredentials(request.apiKey);
  const { input, media } = buildInput(definition, request);
  if (media.startFrame) input.image_url = QUOTE_IMAGE_URL;
  if (media.endFrame) input.end_image_url = QUOTE_IMAGE_URL;
  if (media.references.length) input.image_urls = media.references.map(() => QUOTE_IMAGE_URL);
  const usage = await billing.quote({ credentials, model: definition, input, label: "video" });
  if (enforce) await billing.authorize(usage);
  return usage;
}

async function generateVideo(request) {
  const { model, startFramePath, referencePaths = [], outputPath, apiKey, idempotencyKey, usage } = request;
  const definition = requireDefinition(model, startFramePath, referencePaths);
  const credentials = await requireCredentials(apiKey);
  const quoted = usage?.billing === "higgsfield" ? usage : await quoteUsage(request);
  const { input, media } = buildInput(definition, request);
  try {
    if (media.startFrame) input.image_url = await client.uploadImage(credentials, media.startFrame);
    if (media.endFrame) input.end_image_url = await client.uploadImage(credentials, media.endFrame);
    if (media.references.length) {
      input.image_urls = await Promise.all(media.references.map((referencePath) => client.uploadImage(credentials, referencePath)));
    }
    const result = await client.run(credentials, definition.id, input, {
      idempotencyKey,
      label: "video",
      timeoutMs: Number(process.env.HIGGSFIELD_VIDEO_TIMEOUT_MS || 1_200_000),
      pollIntervalMs: 5_000,
    });
    if (!result.video?.url) {
      throw new client.HiggsfieldError(`Higgsfield returned no video URL (request ${result.request_id}).`, { code: "failed", requestId: result.request_id, charged: true });
    }
    await client.download(result.video.url, outputPath);
    return { usage: { ...quoted, source: "provider-estimate", providerRequestId: result.request_id } };
  } catch (error) {
    error.usage = error.charged ? { ...quoted, providerRequestId: error.requestId || null } : billing.refundedUsage(quoted, error);
    throw error;
  }
}

module.exports = {
  key: "higgsfield-video",
  label: "Higgsfield Video",
  credentialSetting: client.CREDENTIAL_SETTING,
  models: VIDEO_MODELS.map(({ id, label, note }) => ({ id, label, note })),
  videoModels: VIDEO_MODELS,
  capabilities: { video: true, local: false },
  async getConfiguredModel() { return VIDEO_MODELS[0].id; },
  isReady: client.readiness,
  quoteUsage,
  generateVideo,
  modelDefinition: videoModel,
};

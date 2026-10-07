/**
 * Dreamina video engine (Seedance 2.5 / 2.0 / 2.0 Mini) running on the PoseForge canvas.
 * The run lifecycle (import, submit under the generation ID, wait, download)
 * lives in ./runner.
 */
const crypto = require("crypto");
const account = require("./account");
const runner = require("./runner");
const { VIDEO_MODELS, videoModel } = require("./models");

function requireDefinition(model, { prompt, startFramePath, referencePaths = [], referenceVideoPaths = [], referenceAudioPaths = [] }) {
  const definition = videoModel(model);
  if (!definition) throw new Error("Choose a supported Dreamina video model.");
  if (definition.inputs.includes("startFrame") && !startFramePath) throw new Error(`${definition.label} requires a connected start frame.`);
  if (definition.mode === "m2v") {
    const visual = referencePaths.length + referenceVideoPaths.length;
    if (!visual && !(definition.audioOnlyReferences && referenceAudioPaths.length)) {
      throw new Error(`${definition.label} requires a connected reference image or video${definition.audioOnlyReferences ? " (or audio)" : ""}.`);
    }
    for (const [paths, max, noun] of [
      [referencePaths, definition.maxReferences, "reference images"],
      [referenceVideoPaths, definition.maxReferenceVideos, "reference videos"],
      [referenceAudioPaths, definition.maxReferenceAudios, "reference audio clips"],
    ]) {
      if (paths.length > max) throw new Error(`${definition.label} accepts at most ${max} ${noun}.`);
    }
  } else if (referenceVideoPaths.length || referenceAudioPaths.length) {
    throw new Error(`${definition.label} does not take reference videos or audio; choose its Reference to Video mode.`);
  }
  if (String(prompt || "").length > definition.maxPromptLength) {
    throw new Error(`${definition.label} prompts are limited to ${definition.maxPromptLength} characters.`);
  }
  return definition;
}

function pick(values, value, fallback) {
  return values.includes(value) ? value : fallback;
}

function baseUsage(definition) {
  return { source: "estimated", billing: "dreamina", model: definition.model, mode: definition.mode, estimatedCostUsd: null, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

/** Checks limits before anything touches the canvas. Dreamina only prices
 * saved nodes, so the recorded estimate is the most the run may cost. */
async function quoteUsage(request) {
  const definition = requireDefinition(request.model, request);
  if (!await account.canvas()) throw new Error("Create the PoseForge canvas in Settings → Dreamina before generating.");
  const ceiling = await account.authorize("video");
  return {
    ...baseUsage(definition),
    estimatedCredits: ceiling,
    creditCeiling: ceiling,
    pricingSource: "credit-ceiling",
    pricingNote: `Up to ${ceiling} credits (your Dreamina limit per video). Dreamina prices the run when it starts and refuses it above the limit.`,
  };
}

async function generateVideo(request) {
  const { model, startFramePath, endFramePath, referencePaths = [], referenceVideoPaths = [], referenceAudioPaths = [], outputPath, idempotencyKey, usage } = request;
  const definition = requireDefinition(model, request);
  const quoted = usage?.billing === "dreamina" ? usage : await quoteUsage(request);
  const target = await account.canvas();
  const projectId = target.projectId;
  const submitId = idempotencyKey || crypto.randomUUID();
  const prompt = String(request.prompt || "").trim();
  const importFrame = (filePath, title) => runner.importImage(projectId, filePath, title);

  const refs = [];
  const importReferences = async (paths, mediaType, noun) => {
    for (const [index, referencePath] of paths.entries()) {
      refs.push(await runner.importMedia(projectId, referencePath, mediaType, `PoseForge ${noun} ${index + 1}`));
    }
  };
  if (definition.mode === "first_last_frame") {
    refs.push(await importFrame(startFramePath, "PoseForge start frame"));
    if (endFramePath) refs.push(await importFrame(endFramePath, "PoseForge end frame"));
  } else if (definition.mode === "m2v") {
    await importReferences(referencePaths, "image", "reference");
    await importReferences(referenceVideoPaths, "video", "reference video");
    await importReferences(referenceAudioPaths, "audio", "reference audio");
  }

  const runUsage = await runner.runNode({
    kind: "video",
    target,
    submitId,
    quoted,
    downloadPath: outputPath,
    timeoutMs: Number(process.env.DREAMINA_VIDEO_TIMEOUT_MS || 1_800_000),
    createArgs: [
      "node", "create", "video",
      "--project-id", projectId,
      "--title", runner.nodeTitle(prompt),
      "--mode", definition.mode,
      "--model", definition.model,
      "--prompt", runner.escapePrompt(prompt),
      "--ratio", pick(definition.aspectRatios, request.aspectRatio, definition.defaultAspectRatio),
      "--resolution", pick(definition.resolutions, request.resolution, definition.defaultResolution),
      "--duration", String(pick(definition.durations, Number(request.duration), definition.defaultDuration)),
      "--count", "1",
      ...refs.flatMap((nodeId) => ["--ref", `node:${nodeId}`]),
    ],
  });
  return { usage: runUsage };
}

module.exports = {
  key: "dreamina-video",
  label: "Dreamina",
  models: VIDEO_MODELS.map(({ id, label, note }) => ({ id, label, note })),
  videoModels: VIDEO_MODELS,
  capabilities: { video: true, local: false },
  async getConfiguredModel() { return VIDEO_MODELS[0].id; },
  isReady: () => account.readiness("video"),
  quoteUsage,
  generateVideo,
  modelDefinition: videoModel,
};

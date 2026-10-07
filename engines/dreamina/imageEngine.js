/**
 * Dreamina image engine (Seedream / GPT Image) running on the PoseForge
 * canvas. Text to image without connected images, image to image with them.
 * The run lifecycle (import, submit under the generation ID, wait, download)
 * lives in ./runner; the result is converted to PNG like every other engine.
 */
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const account = require("./account");
const runner = require("./runner");
const { IMAGE_MODELS, MAX_REFERENCE_IMAGES, imageModel, imageResolution } = require("./models");

function requireDefinition(model, { prompt, referencePaths = [] }) {
  const definition = imageModel(model);
  if (!definition) throw new Error("Choose a supported Dreamina image model.");
  if (referencePaths.length > definition.maxReferences) {
    throw new Error(`${definition.label} accepts at most ${definition.maxReferences} reference images.`);
  }
  if (String(prompt || "").length > definition.maxPromptLength) {
    throw new Error(`${definition.label} prompts are limited to ${definition.maxPromptLength} characters.`);
  }
  return definition;
}

function mode(referencePaths = []) {
  return referencePaths.length ? "i2i" : "t2i";
}

/** Checks limits before anything touches the canvas. Dreamina only prices
 * saved nodes, so the recorded estimate is the most the run may cost. */
async function quoteUsage(request) {
  const definition = requireDefinition(request.model, request);
  if (!await account.canvas()) throw new Error("Create the PoseForge canvas in Settings → Dreamina before generating.");
  const ceiling = await account.authorize("image");
  return {
    source: "estimated",
    billing: "dreamina",
    model: definition.model,
    mode: mode(request.referencePaths),
    estimatedCostUsd: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCredits: ceiling,
    creditCeiling: ceiling,
    pricingSource: "credit-ceiling",
    pricingNote: `Up to ${ceiling} credits (your Dreamina limit per image). Dreamina prices the run when it starts and refuses it above the limit.`,
  };
}

async function generateFreeform(request) {
  const { model, referencePaths = [], outputPath, outputSettings = {}, idempotencyKey, usage } = request;
  const definition = requireDefinition(model, request);
  const quoted = usage?.billing === "dreamina" ? usage : await quoteUsage(request);
  const target = await account.canvas();
  const projectId = target.projectId;
  const prompt = String(request.prompt || "").trim();

  const refs = [];
  for (const [index, referencePath] of referencePaths.entries()) {
    refs.push(await runner.importImage(projectId, referencePath, `PoseForge reference ${index + 1}`));
  }

  // Dreamina picks the file format; keep its download beside the output and
  // normalize to PNG.
  const downloadPath = `${outputPath}.dreamina`;
  try {
    const runUsage = await runner.runNode({
      kind: "image",
      target,
      submitId: idempotencyKey || crypto.randomUUID(),
      quoted,
      downloadPath,
      timeoutMs: Number(process.env.DREAMINA_IMAGE_TIMEOUT_MS || 600_000),
      createArgs: [
        "node", "create", "image",
        "--project-id", projectId,
        "--title", runner.nodeTitle(prompt),
        "--mode", mode(referencePaths),
        "--model", definition.model,
        "--prompt", runner.escapePrompt(prompt),
        "--ratio", definition.aspectRatios.includes(outputSettings.aspectRatio) ? outputSettings.aspectRatio : "1:1",
        "--resolution", imageResolution(definition, outputSettings.quality),
        "--count", "1",
        ...refs.flatMap((nodeId) => ["--ref", `node:${nodeId}`]),
      ],
    });
    await sharp(downloadPath).rotate().png().toFile(outputPath);
    return { usage: runUsage };
  } finally {
    await fs.promises.rm(downloadPath, { force: true });
  }
}

module.exports = {
  key: "dreamina",
  label: "Dreamina",
  models: IMAGE_MODELS.map(({ id, label, note }) => ({ id, label, note })),
  capabilities: { freeform: true, textToImage: true, multiImage: true, maxReferenceImages: MAX_REFERENCE_IMAGES, aspectRatio: true, local: false },
  async getConfiguredModel() { return IMAGE_MODELS[0].id; },
  isReady: () => account.readiness("image"),
  quoteUsage,
  generateFreeform,
  modelDefinition: imageModel,
};

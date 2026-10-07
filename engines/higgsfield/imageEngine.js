const sharp = require("sharp");
const client = require("./client");
const billing = require("./billing");
const { IMAGE_MODELS, imageModel } = require("./models");

const QUOTE_IMAGE_URL = "https://example.com/poseforge-input.png";

function requireModel(model, referencePaths = []) {
  const definition = imageModel(model) || IMAGE_MODELS[0];
  if (referencePaths.length > definition.maxReferenceImages && definition.maxReferenceImages > 0) {
    throw new Error(`${definition.label} accepts at most ${definition.maxReferenceImages} reference images.`);
  }
  return definition;
}

async function requireCredentials(apiKey) {
  const credentials = await client.resolveCredentials(apiKey);
  if (!credentials) throw new Error("Add Higgsfield credentials in Settings to generate images.");
  if (!client.validCredentials(credentials)) throw new Error("Higgsfield credentials must be in key-id:key-secret format.");
  return credentials;
}

function buildInput(definition, { prompt, outputSettings = {} }) {
  const input = { prompt, resolution: definition.resolutionFor(outputSettings.quality) };
  if (definition.aspectRatios.includes(outputSettings.aspectRatio)) input.aspect_ratio = outputSettings.aspectRatio;
  if (outputSettings.seed != null && definition.id.startsWith("higgsfield-ai/soul")) input.seed = Number(outputSettings.seed);
  return input;
}

function usedReferences(definition, referencePaths = []) {
  return definition.maxReferenceImages > 0 ? referencePaths : [];
}

async function quoteUsage(request, { enforce = true } = {}) {
  const definition = requireModel(request.model, request.referencePaths);
  const credentials = await requireCredentials(request.apiKey);
  const input = buildInput(definition, request);
  const references = usedReferences(definition, request.referencePaths);
  if (references.length) input.image_urls = references.map(() => QUOTE_IMAGE_URL);
  const usage = await billing.quote({ credentials, model: definition, input, label: "image" });
  if (enforce) await billing.authorize(usage);
  return usage;
}

const engine = {
  key: "higgsfield",
  label: "Higgsfield",
  credentialSetting: client.CREDENTIAL_SETTING,
  models: IMAGE_MODELS.map(({ id, label, note }) => ({ id, label, note })),
  capabilities: { freeform: true, textToImage: true, multiImage: true, maxReferenceImages: 10, aspectRatio: true, local: false },
  async getConfiguredModel() { return IMAGE_MODELS[0].id; },
  isReady: client.readiness,
  quoteUsage,
  async generateFreeform(request) {
    const { referencePaths = [], outputPath, apiKey, idempotencyKey, usage } = request;
    const definition = requireModel(request.model, referencePaths);
    const credentials = await requireCredentials(apiKey);
    const quoted = usage?.billing === "higgsfield" ? usage : await quoteUsage(request);
    const input = buildInput(definition, request);
    try {
      const references = usedReferences(definition, referencePaths);
      if (references.length) {
        input.image_urls = await Promise.all(references.map((referencePath) => client.uploadImage(credentials, referencePath)));
      }
      const result = await client.run(credentials, definition.id, input, {
        idempotencyKey,
        label: "image",
        timeoutMs: Number(process.env.HIGGSFIELD_IMAGE_TIMEOUT_MS || 600_000),
      });
      const imageUrl = result.images?.[0]?.url;
      if (!imageUrl) {
        throw new client.HiggsfieldError(`Higgsfield returned no image URL (request ${result.request_id}).`, { code: "failed", requestId: result.request_id, charged: true });
      }
      const buffer = await client.download(imageUrl);
      await sharp(buffer).rotate().png().toFile(outputPath);
      return { usage: { ...quoted, source: "provider-estimate", providerRequestId: result.request_id } };
    } catch (error) {
      error.usage = error.charged ? { ...quoted, providerRequestId: error.requestId || null } : billing.refundedUsage(quoted, error);
      throw error;
    }
  },
};

module.exports = engine;

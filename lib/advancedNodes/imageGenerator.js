const storage = require("../storage");
const {
  activeResult,
  engineRegistry,
  finiteNumber,
  generationRunner,
  nodeError,
  sanitizeFallbacks,
  sanitizeInputBindings,
  sanitizeRunState,
  shortText,
} = require("./shared");
const { withFallbacks } = require("./fallbacks");

const BINDABLE = ["model", "aspectRatio", "resolution", "outputs"];

function imageSettings(engineKey) {
  return require("../advancedCapabilities").imageSettingsFor(engineKey);
}

/** Generates images from a prompt and any connected reference images. */
module.exports = {
  type: "imageGenerator",
  engineKind: "image",
  inputs: [
    { id: "prompt", dataType: "text" },
    { id: "image", dataType: "image" },
  ],
  outputs: ["image"],
  sanitize(value) {
    const data = {};
    const engine = shortText(value.engine, 32);
    if (engine) data.engine = engine;
    const model = shortText(value.model, 128);
    if (model) data.model = model;
    const aspectRatio = shortText(value.aspectRatio, 12);
    if (/^\d{1,2}:\d{1,2}$/.test(aspectRatio)) data.aspectRatio = aspectRatio;
    const resolution = shortText(value.resolution, 12);
    if (resolution) data.resolution = resolution;
    data.outputs = finiteNumber(value.outputs, 1, 1, 4);
    const fallbacks = sanitizeFallbacks(value.fallbacks);
    if (fallbacks.length) data.fallbacks = fallbacks;
    const bindings = sanitizeInputBindings(value.inputBindings, BINDABLE);
    if (bindings) data.inputBindings = bindings;
    return sanitizeRunState(value, data);
  },
  items(node) {
    const result = activeResult(node.data);
    return result?.imageUrl ? [{ image: result.imageUrl }] : [];
  },
  /** What each bindable setting accepts, from the chosen engine's catalog. */
  bindable: {
    model(data) {
      const engine = engineRegistry()[data.engine];
      return { type: "enum", options: (engine?.models || []).map((model) => model.id) };
    },
    aspectRatio(data) {
      return { type: "enum", options: imageSettings(data.engine)?.aspectRatios || [] };
    },
    resolution(data) {
      return { type: "enum", options: (imageSettings(data.engine)?.resolutions || []).map((entry) => entry.id) };
    },
    outputs() {
      return { type: "number", min: 1, max: 4 };
    },
  },
  async execute(node, inputs, { requestId, runId }) {
    const { data } = node;
    const prompt = (inputs.prompt || []).join("\n\n");
    const imageUrls = inputs.image || [];
    const outputs = Math.min(Math.max(Number(data.outputs) || 1, 1), 4);
    const registry = engineRegistry();

    const results = await withFallbacks(data, async ({ engine: engineKey, model }) => {
      const engine = engineKey ? registry[engineKey] : null;
      if (!engine) throw new Error("Choose a model for this node before generating.");
      const ready = await engine.isReady();
      if (!ready.ready) throw new Error(ready.reason || `${engine.label} is not ready.`);
      if (!prompt.trim()) throw nodeError("Connect a prompt with some text before generating.");
      const maxImages = Number(engine.capabilities?.maxReferenceImages) || 1;
      if (imageUrls.length > maxImages) throw new Error(`${engine.label} accepts at most ${maxImages} reference images.`);
      const referencePaths = imageUrls.map((url) => storage.absolutePathFromPublicUrl(url));
      if (referencePaths.some((referencePath) => !referencePath)) throw nodeError("One of the connected images could not be resolved.");

      const engineModel = model || (engine.getConfiguredModel ? await engine.getConfiguredModel() : null);
      const generated = [];
      for (let index = 0; index < outputs; index += 1) {
        const result = await generationRunner().createAdvancedImageGeneration({
          engineKey,
          engine,
          engineModel,
          prompt,
          referencePaths,
          aspectRatio: data.aspectRatio,
          resolution: data.resolution,
          requestId,
          runId,
        });
        generated.push({ imageUrl: result.imageUrl, generationId: result.id, engine: engineKey, ...(engineModel ? { model: engineModel } : {}) });
      }
      return generated;
    });
    return { results, item: { image: results[results.length - 1].imageUrl } };
  },
};

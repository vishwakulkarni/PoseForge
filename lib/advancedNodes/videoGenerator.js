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

const BINDABLE = ["model", "aspectRatio", "resolution", "duration"];

function modelDefinition(data) {
  return engineRegistry()[data.engine]?.modelDefinition?.(data.model) || null;
}

/** Generates a clip from a prompt, optional start/end frames and references. */
module.exports = {
  type: "videoGenerator",
  engineKind: "video",
  inputs: [
    { id: "prompt", dataType: "text" },
    { id: "startFrame", dataType: "image" },
    { id: "endFrame", dataType: "image" },
    { id: "reference", dataType: "image" },
    { id: "referenceVideo", dataType: "video" },
    { id: "referenceAudio", dataType: "audio" },
  ],
  outputs: ["video"],
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
    data.duration = finiteNumber(value.duration, 5, 1, 60);
    if (value.sound === true) data.sound = true;
    data.outputs = finiteNumber(value.outputs, 1, 1, 4);
    const fallbacks = sanitizeFallbacks(value.fallbacks);
    if (fallbacks.length) data.fallbacks = fallbacks;
    const bindings = sanitizeInputBindings(value.inputBindings, BINDABLE);
    if (bindings) data.inputBindings = bindings;
    return sanitizeRunState(value, data);
  },
  items(node) {
    const result = activeResult(node.data);
    return result?.videoUrl ? [{ video: result.videoUrl }] : [];
  },
  bindable: {
    model(data) {
      const engine = engineRegistry()[data.engine];
      return { type: "enum", options: (engine?.videoModels || []).map((model) => model.id) };
    },
    aspectRatio(data) {
      return { type: "enum", options: modelDefinition(data)?.aspectRatios || [] };
    },
    resolution(data) {
      return { type: "enum", options: modelDefinition(data)?.resolutions || [] };
    },
    duration(data) {
      return { type: "enum", options: modelDefinition(data)?.durations || [] };
    },
  },
  async execute(node, inputs, { requestId, runId }) {
    const { data } = node;
    const prompt = (inputs.prompt || []).join("\n\n");
    const startFrameUrl = (inputs.startFrame || [])[0];
    const endFrameUrl = (inputs.endFrame || [])[0];
    const registry = engineRegistry();

    const results = await withFallbacks(data, async ({ engine: engineKey, model }) => {
      const engine = engineKey ? registry[engineKey] : null;
      const definition = engine?.modelDefinition?.(model);
      if (!engine || typeof engine.generateVideo !== "function") throw new Error("Choose a video model before generating.");
      if (!definition) throw new Error("That video model is no longer available. Choose another.");
      const ready = await engine.isReady();
      if (!ready.ready) throw new Error(ready.reason || `${engine.label} is not ready.`);
      if (!prompt.trim()) throw nodeError("Connect a prompt with some text before generating.");
      if (definition.inputs.includes("startFrame") && !startFrameUrl) {
        throw new Error(`${definition.label} requires a connected start frame.`);
      }
      const resolve = (url) => storage.absolutePathFromPublicUrl(url);
      const framePaths = [startFrameUrl, endFrameUrl, ...(inputs.reference || [])].filter(Boolean).map(resolve);
      if (framePaths.some((framePath) => !framePath)) throw nodeError("One of the connected frames could not be resolved.");
      const referenceVideoPaths = (inputs.referenceVideo || []).map(resolve);
      const referenceAudioPaths = (inputs.referenceAudio || []).map(resolve);
      if ([...referenceVideoPaths, ...referenceAudioPaths].some((mediaPath) => !mediaPath)) {
        throw nodeError("One of the connected video or audio clips could not be resolved.");
      }

      const frameCount = (startFrameUrl ? 1 : 0) + (endFrameUrl ? 1 : 0);
      const result = await generationRunner().createAdvancedVideoGeneration({
        engineKey: engine.key,
        engine,
        engineModel: definition.id,
        prompt,
        startFramePath: startFrameUrl ? framePaths[0] : undefined,
        endFramePath: endFrameUrl ? framePaths[startFrameUrl ? 1 : 0] : undefined,
        referencePaths: framePaths.slice(frameCount),
        referenceVideoPaths,
        referenceAudioPaths,
        duration: definition.durations.includes(Number(data.duration)) ? Number(data.duration) : definition.defaultDuration,
        aspectRatio: definition.aspectRatios.includes(data.aspectRatio) ? data.aspectRatio : definition.defaultAspectRatio,
        resolution: definition.resolutions.includes(data.resolution) ? data.resolution : definition.defaultResolution,
        sound: definition.sound && data.sound === true,
        requestId,
        runId,
      });
      return [{ videoUrl: result.videoUrl, generationId: result.id, engine: engine.key, model: definition.id }];
    });
    return { results, item: { video: results[0].videoUrl } };
  },
};

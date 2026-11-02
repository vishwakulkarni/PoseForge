/**
 * Capability catalog for Advanced Studio nodes.
 *
 * The node UI is generated entirely from this descriptor: aspect ratios,
 * resolutions and reference-image limits come from what the engine can
 * actually do, never from a global hardcoded list. Each engine module
 * declares its own catalog — `imageSettings` for images, `videoModels` for
 * video, `assistPrompt` for text, `transformImage` for instruction-driven
 * image edits — so adding a provider is one engine file
 * registered in engines/index.js.
 *
 * `imageSettings.resolutions[].quality` is the engine-facing knob; `id` and
 * `label` are what the node shows, which lets each provider express its real
 * output tiers instead of pretending they share one vocabulary.
 */
const engines = require("../engines");
const { definition: nodeDefinition } = require("./advancedNodes");
const registry = engines.advancedRegistry || engines.registry;

/** The engine's image catalog, or null when it has none. */
function imageSettingsFor(engineKey) {
  return registry[engineKey]?.imageSettings || null;
}

const MAX_OUTPUTS = 4;

function imageCapability(engine) {
  const catalog = engine.imageSettings;
  if (!catalog || !engine.capabilities?.freeform || typeof engine.generateFreeform !== "function") return null;
  return {
    supported: true,
    textToImage: engine.capabilities.textToImage === true,
    // True when the provider has no API parameters for these settings and
    // receives them as prompt text instead. The node uses it to explain why.
    promptDrivenSettings: engine.capabilities.promptDrivenSettings === true,
    maxImages: Number(engine.capabilities.maxReferenceImages) || 1,
    aspectRatios: catalog.aspectRatios,
    defaultAspectRatio: catalog.aspectRatios.includes("1:1") ? "1:1" : catalog.aspectRatios[0],
    resolutions: catalog.resolutions,
    defaultResolution: catalog.defaultResolution,
    maxOutputs: MAX_OUTPUTS,
  };
}

function videoCapability(engine) {
  if (!engine.capabilities?.video || typeof engine.generateVideo !== "function") return null;
  const models = Array.isArray(engine.videoModels) ? engine.videoModels : [];
  return {
    supported: true,
    maxOutputs: 1,
    models: models.map((model) => ({
      id: model.id,
      inputs: model.inputs,
      durations: model.durations,
      defaultDuration: model.defaultDuration,
      aspectRatios: model.aspectRatios,
      defaultAspectRatio: model.defaultAspectRatio,
      resolutions: model.resolutions,
      defaultResolution: model.defaultResolution,
      sound: model.sound === true,
      ...(model.maxReferences ? { maxReferences: model.maxReferences } : {}),
      ...(model.maxReferenceVideos ? { maxReferenceVideos: model.maxReferenceVideos } : {}),
      ...(model.maxReferenceAudios ? { maxReferenceAudios: model.maxReferenceAudios } : {}),
      ...(model.audioOnlyReferences ? { audioOnlyReferences: true } : {}),
    })),
  };
}

/** Resolves an engine-facing quality value from a node's resolution id. Falls
 * back to the engine default when the stored id is not supported — which is
 * what keeps a selection stable when the user switches models. */
function qualityForResolution(engineKey, resolutionId) {
  const catalog = imageSettingsFor(engineKey);
  if (!catalog) return "medium";
  const match = catalog.resolutions.find((entry) => entry.id === resolutionId)
    || catalog.resolutions.find((entry) => entry.id === catalog.defaultResolution);
  return match ? match.quality : "medium";
}

function supportsAspectRatio(engineKey, aspectRatio) {
  const catalog = imageSettingsFor(engineKey);
  return Boolean(catalog && catalog.aspectRatios.includes(aspectRatio));
}

async function listAdvancedCapabilities() {
  const engines = await Promise.all(Object.values(registry).map(async (engine) => {
    const image = imageCapability(engine);
    const video = videoCapability(engine);
    const text = typeof engine.assistPrompt === "function";
    const transform = typeof engine.transformImage === "function";
    if (!image && !video && !text && !transform) return null;
    const ready = await engine.isReady();
    const catalog = engine.imageSettings || {};
    // Some engines are a single local tool rather than a list of hosted models
    // (Codex CLI). Synthesize one entry so the node's model menu is uniform.
    const models = engine.models?.length
      ? engine.models
      : [{ id: engine.key, label: engine.label, ...(catalog.note ? { note: catalog.note } : {}) }];
    return {
      key: engine.key,
      label: engine.label,
      ready: ready.ready === true,
      reason: ready.reason || null,
      models,
      defaultModel: engine.getConfiguredModel ? await engine.getConfiguredModel() : null,
      image: image || {
        supported: false,
        textToImage: false,
        maxImages: 0,
        aspectRatios: [],
        defaultAspectRatio: "16:9",
        resolutions: [],
        defaultResolution: "720p",
        maxOutputs: 0,
      },
      video: video || { supported: false },
      // Engines that can write text for LLM Text nodes, and edit images from
      // an instruction for Image Transform nodes.
      text: { supported: text },
      transform: { supported: transform },
    };
  }));
  return engines.filter(Boolean);
}

/**
 * Flags generator settings the engine will not honour. The run path quietly
 * falls back to defaults for these (see qualityForResolution and the video
 * route), which is right for the canvas — its menus only offer valid values —
 * but leaves a hand-written document with no hint of why its output differs.
 * Uses static catalogs only, so it never waits on an engine readiness probe.
 */
function diagnoseGeneratorSettings(document) {
  const warnings = [];
  for (const node of document.nodes || []) {
    const where = `Node ${node.id}`;
    for (const fallback of node.data?.fallbacks || []) {
      if (!registry[fallback.engine]) warnings.push(`${where}: fallback engine "${fallback.engine}" does not exist. See advanced_list_capabilities.`);
    }
    if (node.type === "imageTransform") {
      if (node.data?.engine && typeof registry[node.data.engine]?.transformImage !== "function") {
        warnings.push(`${where}: "${node.data.engine}" cannot edit images. Use an engine whose transform.supported is true, or no engine for the built-in transform.`);
      }
      continue;
    }
    if (node.type === "llmText") {
      const engine = registry[node.data?.engine];
      if (node.data?.engine && typeof engine?.assistPrompt !== "function") {
        warnings.push(`${where}: "${node.data.engine}" cannot write text. Use an engine whose text.supported is true.`);
      }
      continue;
    }
    if (!nodeDefinition(node.type)?.engineKind) continue;
    const { engine: engineKey, model, aspectRatio, resolution } = node.data || {};
    if (!engineKey) continue;
    const engine = registry[engineKey];
    if (node.type === "imageGenerator") {
      const capability = engine && imageCapability(engine);
      if (!capability) {
        warnings.push(`${where}: "${engineKey}" is not an image engine. See advanced_list_capabilities.`);
        continue;
      }
      const models = engine.models?.map((entry) => entry.id) || [];
      if (model && models.length && !models.includes(model)) warnings.push(`${where}: unknown model "${model}" for ${engineKey}.`);
      if (aspectRatio && !capability.aspectRatios.includes(aspectRatio)) {
        warnings.push(`${where}: ${engineKey} does not support aspect ratio ${aspectRatio}; it will be ignored.`);
      }
      if (resolution && !capability.resolutions.some((entry) => entry.id === resolution)) {
        warnings.push(`${where}: ${engineKey} has no resolution "${resolution}"; ${capability.defaultResolution} will be used.`);
      }
      continue;
    }
    const definition = engine?.modelDefinition?.(model);
    if (!engine || typeof engine.generateVideo !== "function") {
      warnings.push(`${where}: "${engineKey}" is not a video engine. See advanced_list_capabilities.`);
    } else if (!definition) {
      warnings.push(`${where}: unknown video model "${model}" for ${engineKey}.`);
    } else {
      if (aspectRatio && !definition.aspectRatios.includes(aspectRatio)) {
        warnings.push(`${where}: ${model} does not support aspect ratio ${aspectRatio}; ${definition.defaultAspectRatio} will be used.`);
      }
      if (resolution && !definition.resolutions.includes(resolution)) {
        warnings.push(`${where}: ${model} has no resolution "${resolution}"; ${definition.defaultResolution} will be used.`);
      }
    }
  }
  return warnings;
}

function pick(current, supported, fallback) {
  return current != null && supported.includes(current) ? current : fallback;
}

/**
 * The settings a generator keeps when it switches to another model: each
 * value the new model supports stays, anything else takes that model's
 * default. Same rules as the node bodies apply on the canvas (`coerce` in
 * image-generator-node-body.tsx, `coerceVideoSettings` for video), so a
 * switch made at import time matches one made by hand. `capability` is an
 * entry of `listAdvancedCapabilities()`; returns null for an unknown model.
 */
function coerceGeneratorSettings(nodeType, data, capability, modelId) {
  if (nodeType === "imageGenerator") {
    const image = capability?.image;
    if (!image?.supported) return null;
    return {
      aspectRatio: pick(data.aspectRatio, image.aspectRatios, image.defaultAspectRatio),
      resolution: pick(data.resolution, image.resolutions.map((entry) => entry.id), image.defaultResolution),
      outputs: Math.min(Number(data.outputs) || 1, image.maxOutputs),
    };
  }
  const model = capability?.video?.supported ? capability.video.models.find((entry) => entry.id === modelId) : null;
  if (!model) return null;
  return {
    duration: pick(Number(data.duration), model.durations, model.defaultDuration),
    aspectRatio: pick(data.aspectRatio, model.aspectRatios, model.defaultAspectRatio),
    resolution: pick(data.resolution, model.resolutions, model.defaultResolution),
    sound: model.sound ? data.sound === true : false,
    outputs: 1,
  };
}

module.exports = {
  coerceGeneratorSettings,
  diagnoseGeneratorSettings,
  imageSettingsFor,
  videoCapability,
  MAX_OUTPUTS,
  listAdvancedCapabilities,
  qualityForResolution,
  supportsAspectRatio,
};

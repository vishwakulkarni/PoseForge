/**
 * Capability catalog for Advanced Studio generator nodes.
 *
 * The node UI is generated entirely from this descriptor: aspect ratios,
 * resolutions and reference-image limits come from what the engine can
 * actually do, never from a global hardcoded list. An engine only appears here
 * if it implements `generateFreeform` (see engines/*.js), so adding a provider
 * is a matter of implementing that method and adding one entry below.
 *
 * `resolutions[].quality` is the engine-facing knob; `id`/`label` are what the
 * node shows. Keeping the mapping here lets each provider express its real
 * output tiers instead of pretending they share one vocabulary.
 */
const { registry } = require("../engines");

const FAL_RATIOS = ["21:9", "16:9", "3:2", "4:3", "5:4", "1:1", "4:5", "3:4", "2:3", "9:16"];
const CORE_RATIOS = ["1:1", "4:5", "16:9", "9:16"];

const IMAGE_CAPABILITIES = {
  // Codex runs locally through the CLI and has no API parameters for aspect
  // ratio or resolution: the engine declares both as "prompt", so the values
  // below are expressed in the instruction it receives (see codexEngine).
  codex: {
    aspectRatios: CORE_RATIOS,
    resolutions: [
      { id: "1K", label: "Standard", quality: "medium" },
      { id: "2K", label: "High detail", quality: "high" },
    ],
    defaultResolution: "1K",
    note: "Runs locally through the Codex CLI. Aspect ratio and detail are expressed in the prompt.",
  },
  gemini: {
    aspectRatios: CORE_RATIOS,
    resolutions: [
      { id: "1K", label: "1K", quality: "medium" },
      { id: "2K", label: "2K", quality: "high" },
    ],
    defaultResolution: "1K",
  },
  openai: {
    aspectRatios: CORE_RATIOS,
    resolutions: [
      { id: "standard", label: "Standard", quality: "low" },
      { id: "high", label: "High", quality: "medium" },
      { id: "max", label: "Maximum", quality: "high" },
    ],
    defaultResolution: "high",
  },
  fal: {
    aspectRatios: FAL_RATIOS,
    resolutions: [
      { id: "1K", label: "1K", quality: "medium" },
      { id: "2K", label: "2K", quality: "high" },
    ],
    defaultResolution: "1K",
  },
};

const MAX_OUTPUTS = 4;

function imageCapability(engine) {
  const catalog = IMAGE_CAPABILITIES[engine.key];
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

/** Resolves an engine-facing quality value from a node's resolution id. Falls
 * back to the engine default when the stored id is not supported — which is
 * what keeps a selection stable when the user switches models. */
function qualityForResolution(engineKey, resolutionId) {
  const catalog = IMAGE_CAPABILITIES[engineKey];
  if (!catalog) return "medium";
  const match = catalog.resolutions.find((entry) => entry.id === resolutionId)
    || catalog.resolutions.find((entry) => entry.id === catalog.defaultResolution);
  return match ? match.quality : "medium";
}

function supportsAspectRatio(engineKey, aspectRatio) {
  const catalog = IMAGE_CAPABILITIES[engineKey];
  return Boolean(catalog && catalog.aspectRatios.includes(aspectRatio));
}

async function listAdvancedCapabilities() {
  const engines = await Promise.all(Object.values(registry).map(async (engine) => {
    const image = imageCapability(engine);
    if (!image) return null;
    const ready = await engine.isReady();
    const catalog = IMAGE_CAPABILITIES[engine.key];
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
      image,
      video: { supported: false },
    };
  }));
  return engines.filter(Boolean);
}

module.exports = {
  IMAGE_CAPABILITIES,
  MAX_OUTPUTS,
  listAdvancedCapabilities,
  qualityForResolution,
  supportsAspectRatio,
};

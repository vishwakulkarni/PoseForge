const codex = require("./codexEngine");
const antigravity = require("./antigravityEngine");
const openai = require("./openaiEngine");
const replicate = require("./replicateEngine");
const fal = require("./falEngine");
const falVideo = require("./falVideoEngine");
const higgsfield = require("./higgsfield/imageEngine");
const higgsfieldVideo = require("./higgsfield/videoEngine");
const dreamina = require("./dreamina/imageEngine");
const dreaminaVideo = require("./dreamina/videoEngine");
const gemini = require("./geminiEngine");
const comfy = require("./comfyEngine");
const registry = { codex, antigravity, openai, gemini, comfy, replicate, fal };
const advancedRegistry = { ...registry, higgsfield, "fal-video": falVideo, "higgsfield-video": higgsfieldVideo, dreamina, "dreamina-video": dreaminaVideo };
async function listEngines() {
  return Promise.all(Object.values(registry).map(async (engine) => ({
    key: engine.key,
    label: engine.label,
    capabilities: engine.capabilities || {},
    models: engine.models || [],
    selectedModel: engine.getConfiguredModel ? await engine.getConfiguredModel() : null,
    ...(await engine.isReady()),
  })));
}
module.exports = { registry, advancedRegistry, listEngines };

const codex = require("./codexEngine");
const antigravity = require("./antigravityEngine");
const openai = require("./openaiEngine");
const replicate = require("./replicateEngine");
const gemini = require("./geminiEngine");
const comfy = require("./comfyEngine");
const registry = { codex, antigravity, openai, gemini, comfy, replicate };
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
module.exports = { registry, listEngines };

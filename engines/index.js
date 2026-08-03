const codex = require("./codexEngine");
const openai = require("./openaiEngine");
const replicate = require("./replicateEngine");
const registry = { codex, openai, replicate };
async function listEngines() {
  return Promise.all(Object.values(registry).map(async (engine) => ({ key: engine.key, label: engine.label, ...(await engine.isReady()) })));
}
module.exports = { registry, listEngines };

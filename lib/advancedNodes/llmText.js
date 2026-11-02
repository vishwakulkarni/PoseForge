const { MAX_PROMPT_LENGTH, activeResult, engineRegistry, nodeError, sanitizeFallbacks, sanitizeRunState, shortText } = require("./shared");
const { withFallbacks } = require("./fallbacks");

const SYSTEM_PROMPT = `You write text inside a content-creation workflow: captions, hooks, prompts for image and
video models, variations and translations. Follow the instruction exactly. Reply with only the requested text —
no preamble, no explanation, no surrounding quotation marks. When asked for several items, put each on its own line.`;

/** Writes text with a language model from an instruction and any connected text. */
module.exports = {
  type: "llmText",
  inputs: [{ id: "text", dataType: "text" }],
  outputs: ["text"],
  templateFields: ["instruction"],
  sanitize(value) {
    const data = { instruction: shortText(value.instruction, MAX_PROMPT_LENGTH) };
    const engine = shortText(value.engine, 32);
    if (engine) data.engine = engine;
    const fallbacks = sanitizeFallbacks(value.fallbacks);
    if (fallbacks.length) data.fallbacks = fallbacks;
    return sanitizeRunState(value, data);
  },
  items(node) {
    const result = activeResult(node.data);
    return result?.text ? [{ text: result.text }] : [];
  },
  async execute(node, inputs) {
    const { data } = node;
    const context = (inputs.text || []).join("\n\n").trim();
    if (!data.instruction && !context) throw nodeError("Write an instruction or connect some text before running.");
    const message = [data.instruction, context && `Input:\n${context}`].filter(Boolean).join("\n\n");
    const registry = engineRegistry();

    const results = await withFallbacks(data, async ({ engine: engineKey }) => {
      const engine = engineKey ? registry[engineKey] : null;
      if (!engine || typeof engine.assistPrompt !== "function") throw new Error("Choose a text model for this node before running.");
      const ready = await engine.isReady();
      if (!ready.ready) throw new Error(ready.reason || `${engine.label} is not ready.`);
      const { text } = await engine.assistPrompt({ instruction: message, system: SYSTEM_PROMPT });
      return [{ text: String(text).slice(0, MAX_PROMPT_LENGTH), engine: engineKey }];
    });
    return { results, item: { text: results[0].text } };
  },
};

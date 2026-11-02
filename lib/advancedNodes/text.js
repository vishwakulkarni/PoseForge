const { MAX_PROMPT_LENGTH, inputName, shortText } = require("./shared");

const TEXT_MODES = new Set(["plain", "structured"]);

/** A prompt. Structured mode is the same string parsed as JSON/YAML in the
 * editor; downstream nodes always receive text. */
module.exports = {
  type: "text",
  inputs: [],
  outputs: ["text"],
  inputKind: "text",
  templateFields: ["text"],
  sanitize(value) {
    const data = { text: shortText(value.text, MAX_PROMPT_LENGTH) };
    const mode = shortText(value.mode, 16);
    data.mode = TEXT_MODES.has(mode) ? mode : "plain";
    const name = inputName(value.inputName);
    if (name) data.inputName = name;
    return data;
  },
  items(node) {
    return node.data?.text ? [{ text: node.data.text }] : [];
  },
};

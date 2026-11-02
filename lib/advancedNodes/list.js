const { MAX_PROMPT_LENGTH, inputName, nodeError, shortText } = require("./shared");

/** Upper bound on one list's fan-out: every item runs every node downstream. */
const MAX_LIST_ITEMS = 25;
const BULLET = /^\s*(?:[-*•]|\d{1,3}[.)])\s+/;

function splitItems(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, "").trim())
    .filter(Boolean);
}

/**
 * Fans a workflow out: one text in, one item per line out, and every node
 * downstream runs once per item. Connected text (say, an LLM's list of
 * ideas) wins over the node's own lines. Bullets and numbering are dropped
 * so a model's "1. …" list works as written.
 */
module.exports = {
  type: "list",
  inputs: [{ id: "text", dataType: "text" }],
  outputs: ["text"],
  inputKind: "text",
  MAX_LIST_ITEMS,
  splitItems,
  templateFields: ["text"],
  sanitize(value) {
    const data = { text: shortText(value.text, MAX_PROMPT_LENGTH) };
    const name = inputName(value.inputName);
    if (name) data.inputName = name;
    return data;
  },
  /** Items from connected text when there is any, else the node's own lines. */
  derive(node, collected) {
    const connected = collected.text || [];
    const items = connected.length ? connected.flatMap(splitItems) : splitItems(node.data?.text);
    if (items.length > MAX_LIST_ITEMS) {
      throw nodeError(`List ${node.label || node.id} has ${items.length} items; a list runs at most ${MAX_LIST_ITEMS}.`);
    }
    return items.map((text) => ({ text }));
  },
};

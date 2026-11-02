/**
 * The Advanced Studio node registry: everything the server knows about a
 * node type lives in that type's module, and everything else — the document
 * sanitizer, run planning, input resolution, versions, sharing, the
 * capabilities endpoint — reads it from here. Adding a node type is one
 * module below plus its UI (web/lib/advanced-studio/registry and
 * web/components/advanced-studio/nodes).
 *
 * A definition has:
 * - `type`, `inputs` ([{ id, dataType }] — the target handles it reads) and
 *   `outputs` (the data types it offers downstream);
 * - `sanitize(value, limits)` → its persisted data;
 * - `items(node)` → what it offers downstream from its saved data, as a list
 *   of `{ text?, image?, video?, audio? }` (one entry, or none);
 * - `derive(node, collected)`, for a node computed from its inputs whenever
 *   it is read (a list), or `execute(node, inputs, ctx)` → `{ results, item }`
 *   for a node a run executes (generators, LLM text, transforms, outputs);
 * - optionally `inputKind` (it can be a named run input), `bindable` (settings
 *   a run input can set, each a function of the node's data returning what it
 *   accepts) and `engineKind` (it generates with an engine from the catalog).
 */
const text = require("./text");
const imageInput = require("./imageInput");
const { videoInput, audioInput } = require("./mediaInput");
const imageGenerator = require("./imageGenerator");
const videoGenerator = require("./videoGenerator");
const group = require("./group");
const llmText = require("./llmText");
const list = require("./list");
const imageTransform = require("./imageTransform");
const output = require("./output");

const DEFINITIONS = Object.fromEntries(
  [text, imageInput, videoInput, audioInput, imageGenerator, videoGenerator, group, llmText, list, imageTransform, output]
    .map((entry) => [entry.type, entry])
);

const NODE_TYPES = new Set(Object.keys(DEFINITIONS));
const DATA_TYPES = new Set(["text", "image", "video", "audio"]);
/** Every target handle some node reads. */
const TARGET_HANDLES = new Set(Object.values(DEFINITIONS).flatMap((entry) => entry.inputs.map((input) => input.id)));

function definition(type) {
  return Object.prototype.hasOwnProperty.call(DEFINITIONS, type) ? DEFINITIONS[type] : null;
}

/** True for a node a run executes, as opposed to one that only holds or
 * derives a value. */
function isExecutable(node) {
  return typeof definition(node?.type)?.execute === "function";
}

/** The registry as data, for the capabilities endpoint and agents. */
function describeNodeTypes() {
  return Object.values(DEFINITIONS).map((entry) => ({
    type: entry.type,
    inputs: entry.inputs,
    outputs: entry.outputs,
    runs: typeof entry.execute === "function",
    ...(entry.inputKind ? { inputKind: entry.inputKind } : {}),
    ...(entry.bindable ? { bindableSettings: Object.keys(entry.bindable) } : {}),
  }));
}

module.exports = { DATA_TYPES, NODE_TYPES, TARGET_HANDLES, definition, describeNodeTypes, isExecutable };

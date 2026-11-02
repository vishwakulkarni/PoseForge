/**
 * Helpers every Advanced Studio node definition shares: value sanitizers,
 * run-state sanitizers, and late-bound access to the engine registry and the
 * generation runner.
 *
 * The engines and the runner are required at call time rather than at load
 * time so a test that swaps either module in `require.cache` is seen by
 * every node definition, however early that definition was loaded.
 */
const MAX_COORDINATE = 1_000_000;
const MAX_PROMPT_LENGTH = 20_000;
const MAX_RESULT_TEXT = 20_000;
const MAX_FALLBACKS = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NODE_STATUSES = new Set(["idle", "queued", "running", "done", "error"]);
/** A workflow input name: `{{name}}` in prompts, `inputName` on nodes. */
const INPUT_NAME_PATTERN = /^[A-Za-z][\w-]{0,63}$/;

function finiteNumber(value, fallback, min = -MAX_COORDINATE, max = MAX_COORDINATE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function shortText(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength);
}

function inputName(value) {
  const name = shortText(value, 64);
  return INPUT_NAME_PATTERN.test(name) ? name : null;
}

function idList(value, limit) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  for (const candidate of value.slice(0, limit)) {
    const id = shortText(candidate, 128);
    if (id) seen.add(id);
  }
  return [...seen];
}

function sanitizeResults(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const result = {};
    const imageUrl = shortText(entry.imageUrl, 2_048);
    if (imageUrl) result.imageUrl = imageUrl;
    const videoUrl = shortText(entry.videoUrl, 2_048);
    if (videoUrl) result.videoUrl = videoUrl;
    // Text results keep their whitespace: a caption's line breaks are content.
    const text = typeof entry.text === "string" ? entry.text.slice(0, MAX_RESULT_TEXT) : "";
    if (text.trim()) result.text = text;
    const generationId = shortText(entry.generationId, 64);
    if (generationId && UUID_PATTERN.test(generationId)) result.generationId = generationId;
    const engine = shortText(entry.engine, 32);
    if (engine) result.engine = engine;
    const model = shortText(entry.model, 128);
    if (model) result.model = model;
    const width = finiteNumber(entry.width, 0, 0, 16_384);
    const height = finiteNumber(entry.height, 0, 0, 16_384);
    if (width > 0) result.width = width;
    if (height > 0) result.height = height;
    const error = shortText(entry.error, 500);
    if (error) result.error = error;
    return result.imageUrl || result.videoUrl || result.text || result.error ? result : null;
  }).filter(Boolean);
}

/** status / error / results / activeResultIndex, for any node that runs. */
function sanitizeRunState(value, data) {
  const status = shortText(value.status, 16);
  if (NODE_STATUSES.has(status)) data.status = status;
  const error = shortText(value.error, 500);
  if (error) data.error = error;
  const results = sanitizeResults(value.results);
  if (results.length) data.results = results;
  data.activeResultIndex = finiteNumber(value.activeResultIndex, 0, 0, Math.max(results.length - 1, 0));
  return data;
}

/** Ordered `{ engine, model }` alternatives tried when the node's own model
 * is not set up or fails. */
function sanitizeFallbacks(value) {
  if (!Array.isArray(value)) return [];
  const fallbacks = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const engine = shortText(entry.engine, 32);
    if (!engine) continue;
    const model = shortText(entry.model, 128);
    fallbacks.push(model ? { engine, model } : { engine });
    if (fallbacks.length === MAX_FALLBACKS) break;
  }
  return fallbacks;
}

/** `{ setting: inputName }` for the settings a run may fill in. */
function sanitizeInputBindings(value, allowedFields) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const bindings = {};
  for (const field of allowedFields) {
    const name = inputName(value[field]);
    if (name) bindings[field] = name;
  }
  return Object.keys(bindings).length ? bindings : null;
}

/** The result a node offers downstream: the one the user picked, else the newest. */
function activeResult(data) {
  const results = data?.results || [];
  return results[data?.activeResultIndex ?? 0] || results[results.length - 1] || null;
}

function engineRegistry() {
  const engines = require("../../engines");
  return engines.advancedRegistry || engines.registry;
}

function generationRunner() {
  return require("../advancedGenerationRunner");
}

/** A failure that belongs to the node's inputs or settings: no other model
 * would do better, so fallbacks are not tried. */
function nodeError(message) {
  const error = new Error(message);
  error.nodeInput = true;
  return error;
}

module.exports = {
  INPUT_NAME_PATTERN,
  MAX_PROMPT_LENGTH,
  MAX_COORDINATE,
  UUID_PATTERN,
  activeResult,
  engineRegistry,
  finiteNumber,
  generationRunner,
  idList,
  inputName,
  nodeError,
  sanitizeFallbacks,
  sanitizeInputBindings,
  sanitizeResults,
  sanitizeRunState,
  shortText,
};

/**
 * Workflow inputs and media sources for Advanced Studio runs.
 *
 * Inputs make a workflow a template: `{{name}}` in a text field, `inputName`
 * on a text, list, image, video or audio input node, or an `inputBindings`
 * entry naming a node setting (a generator's aspect ratio or model, a
 * transform's preset) is filled per run without touching the saved workflow
 * — the canvas value is the default. Which nodes take which kind comes from
 * the node registry (`inputKind`, `templateFields`, `bindable`).
 *
 * Image inputs may point at more than stored files: a character (its
 * primary photo *at run time*), a pose library entry, or a web URL, which is
 * downloaded once into the project's storage; video and audio inputs may be
 * web URLs too. Everything resolves to a `/storage/...` URL before the nodes
 * see it, so the run path itself is unchanged.
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pool } = require("../db/pool");
const storage = require("./storage");
const { normalizeToPng } = require("./imageNormalizer");
const { definition } = require("./advancedNodes");

const PLACEHOLDER = /\{\{\s*([A-Za-z][\w-]{0,63})\s*\}\}/g;
const MAX_REMOTE_BYTES = { image: 25 * 1024 * 1024, video: 200 * 1024 * 1024, audio: 200 * 1024 * 1024 };
const REMOTE_TIMEOUT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Video and audio formats Video Input and Audio Input nodes accept. */
const MEDIA_TYPES = {
  video: { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v" },
  audio: { ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac" },
};

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

/** What a bound setting accepts on this node right now: `{ type: "enum",
 * options }` or `{ type: "number", min, max }`. */
function settingSpec(node, field) {
  return definition(node.type)?.bindable?.[field]?.(node.data || {}) || null;
}

/** Every input a workflow accepts, with the nodes it feeds and its default.
 * A setting input also says which setting it sets and what it accepts. */
function declaredInputs(document) {
  const inputs = new Map();
  const declare = (name, kind, nodeId, defaultValue, extra = {}) => {
    const entry = inputs.get(name) || { name, kind, nodeIds: [], default: null, ...extra };
    if (!entry.nodeIds.includes(nodeId)) entry.nodeIds.push(nodeId);
    if (entry.default == null && defaultValue != null && defaultValue !== "") entry.default = defaultValue;
    inputs.set(name, entry);
  };
  for (const node of document.nodes || []) {
    const entry = definition(node.type);
    if (!entry) continue;
    const data = node.data || {};
    if (data.inputName && entry.inputKind === "text") declare(data.inputName, "text", node.id, data.text || null);
    if (data.inputName && entry.inputKind === "image") {
      const { imageUrl, characterId, poseId } = data;
      declare(data.inputName, "image", node.id, characterId ? { characterId } : poseId ? { poseId } : imageUrl || null);
    }
    if (data.inputName && (entry.inputKind === "video" || entry.inputKind === "audio")) {
      declare(data.inputName, entry.inputKind, node.id, data.mediaUrl || null);
    }
    for (const field of entry.templateFields || []) {
      for (const match of String(data[field] || "").matchAll(PLACEHOLDER)) declare(match[1], "text", node.id, null);
    }
    for (const [field, name] of Object.entries(data.inputBindings || {})) {
      const spec = settingSpec(node, field);
      if (!spec) continue;
      const { type: valueType, ...accepts } = spec;
      declare(name, "setting", node.id, data[field] ?? null, { setting: field, valueType, ...accepts });
    }
  }
  return [...inputs.values()];
}

/** Turns an image input value into image input node data. */
function imageSource(name, value) {
  if (typeof value === "string" && value.trim()) return { imageUrl: value.trim() };
  if (value && typeof value === "object") {
    if (UUID.test(String(value.characterId || ""))) return { characterId: value.characterId };
    if (UUID.test(String(value.poseId || ""))) return { poseId: value.poseId };
    if (typeof value.url === "string" && value.url.trim()) return { imageUrl: value.url.trim() };
  }
  throw inputError(`Input "${name}" must be an image URL, { characterId }, { poseId } or { url }.`);
}

function mediaSource(name, kind, value) {
  const url = typeof value === "string" ? value.trim() : typeof value?.url === "string" ? value.url.trim() : "";
  if (!url) throw inputError(`Input "${name}" must be a ${kind} URL (a /storage URL or an http(s) URL) or { url }.`);
  return url;
}

/** A setting value checked against what the node accepts. */
function settingValue(name, value, node, field) {
  const spec = settingSpec(node, field);
  if (spec?.type === "number") {
    const number = Number(value);
    if (!Number.isInteger(number) || number < spec.min || number > spec.max) {
      throw inputError(`Input "${name}" sets ${field} on node ${node.id}: use a whole number from ${spec.min} to ${spec.max}.`);
    }
    return number;
  }
  const options = spec?.options || [];
  if (!options.length) throw inputError(`Input "${name}" sets ${field} on node ${node.id}, which has no choices yet — choose the node's model first.`);
  const match = options.find((option) => String(option) === String(value).trim());
  if (match === undefined) throw inputError(`Input "${name}" sets ${field} on node ${node.id}: use one of ${options.join(", ")}.`);
  return match;
}

/**
 * Returns a copy of the document with `inputs` applied. Unknown names,
 * invalid setting values and placeholders left without a value are 422s:
 * in a batch, a typo should stop the batch, not produce a hundred images of
 * a literal "{{subjct}}".
 */
function applyInputs(document, inputs = {}) {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) throw inputError("inputs must be an object.");
  const declared = new Map(declaredInputs(document).map((input) => [input.name, input]));
  const unknown = Object.keys(inputs).filter((name) => !declared.has(name));
  if (unknown.length) {
    const known = [...declared.keys()];
    throw inputError(`Unknown input${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")}. This workflow takes ${known.length ? known.join(", ") : "no inputs"}.`);
  }

  const missing = new Set();
  const given = (name) => name && inputs[name] != null;
  const nodes = (document.nodes || []).map((node) => {
    const entry = definition(node.type);
    if (!entry) return node;
    let data = { ...node.data };
    if (entry.inputKind === "text" && given(data.inputName)) data.text = String(inputs[data.inputName]);
    if (entry.inputKind === "image" && given(data.inputName)) data = { inputName: data.inputName, ...imageSource(data.inputName, inputs[data.inputName]) };
    if ((entry.inputKind === "video" || entry.inputKind === "audio") && given(data.inputName)) {
      data = { inputName: data.inputName, mediaUrl: mediaSource(data.inputName, entry.inputKind, inputs[data.inputName]) };
    }
    for (const field of entry.templateFields || []) {
      if (typeof data[field] !== "string") continue;
      data[field] = data[field].replace(PLACEHOLDER, (placeholder, name) => {
        if (inputs[name] != null) return String(inputs[name]);
        missing.add(name);
        return placeholder;
      });
    }
    // In declaration order, so a bound model is set before the settings
    // whose choices depend on it are checked.
    for (const [field, name] of Object.entries(data.inputBindings || {})) {
      if (given(name)) data[field] = settingValue(name, inputs[name], { ...node, data }, field);
    }
    return { ...node, data };
  });
  if (missing.size) throw inputError(`Missing value for input ${[...missing].join(", ")}.`);
  return { ...document, nodes };
}

async function characterPhotoUrl(characterId) {
  const result = await pool.query(
    "SELECT file_path FROM character_photos WHERE character_id = $1 ORDER BY is_primary DESC, created_at ASC LIMIT 1",
    [characterId]
  );
  return result.rowCount ? storage.publicUrl(result.rows[0].file_path) : null;
}

async function poseImageUrl(poseId) {
  const result = await pool.query("SELECT file_path, source_url FROM pose_references WHERE id = $1", [poseId]);
  if (!result.rowCount) return null;
  const { file_path: filePath, source_url: sourceUrl } = result.rows[0];
  return filePath ? storage.publicUrl(filePath) : sourceUrl;
}

/** Downloads in progress, so concurrent runs fetch a URL once. */
const downloads = new Map();

/** Downloads a web image, clip or audio file into the project's storage
 * once; the same URL is served from disk on every later run. Images are
 * normalized to PNG, video and audio are stored as they are. */
async function downloadRemote(projectId, url, kind = "image") {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw inputError(`"${url}" is not a valid ${kind} URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw inputError(`Only http and https ${kind} URLs are supported (${url}).`);

  const key = crypto.createHash("sha256").update(parsed.href).digest("hex").slice(0, 24);
  const cached = (kind === "image" ? [".png"] : Object.keys(MEDIA_TYPES[kind]))
    .map((extension) => storage.getAdvancedAssetPath(projectId, `remote-${key}`, extension))
    .find((relativePath) => fs.existsSync(storage.absolutePath(relativePath)));
  if (cached) return storage.publicUrl(cached);

  // Batch rows start together and often share a URL (a pose, a logo): they
  // share one download instead of racing to write the same file.
  const flightKey = `${projectId}:${kind}:${key}`;
  if (!downloads.has(flightKey)) {
    downloads.set(flightKey, storeRemote(projectId, url, parsed, kind, key).finally(() => downloads.delete(flightKey)));
  }
  return downloads.get(flightKey);
}

async function storeRemote(projectId, url, parsed, kind, key) {
  const response = await fetch(parsed, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) }).catch((error) => {
    throw inputError(`Could not download ${url}: ${error.message}`);
  });
  if (!response.ok) throw inputError(`Could not download ${url}: the server answered ${response.status}.`);
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!type.startsWith(`${kind}/`)) throw inputError(`${url} is not ${kind === "audio" ? "an audio file" : `a ${kind}`} (${type || "unknown type"}).`);
  const extension = kind === "image" ? ".png" : Object.entries(MEDIA_TYPES[kind]).find(([, mime]) => mime === type)?.[0];
  if (!extension) throw inputError(`${url} is a ${type} file; use ${Object.keys(MEDIA_TYPES[kind]).join(", ")}.`);
  const relativePath = storage.getAdvancedAssetPath(projectId, `remote-${key}`, extension);
  const destination = storage.absolutePath(relativePath);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_REMOTE_BYTES[kind]) throw inputError(`${url} is larger than ${MAX_REMOTE_BYTES[kind] / 1024 / 1024}MB.`);

  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  if (kind !== "image") {
    await fs.promises.writeFile(destination, bytes);
    return storage.publicUrl(relativePath);
  }
  const temporary = path.join(os.tmpdir(), `poseforge-remote-${key}-${process.pid}`);
  await fs.promises.writeFile(temporary, bytes);
  try {
    await normalizeToPng(temporary, destination, { originalName: path.basename(parsed.pathname) || "image", mimeType: type });
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return storage.publicUrl(relativePath);
}

/**
 * Resolves every input node of `document` (mutated in place) to a stored
 * file: a character's current primary photo, a pose's image, or a downloaded
 * web image, clip or audio file. A character that has since been deleted
 * falls back to the photo the node already shows.
 */
async function resolveSources(document, projectId) {
  for (const node of document.nodes || []) {
    const data = node.data || (node.data = {});
    if (node.type === "videoInput" || node.type === "audioInput") {
      if (data.mediaUrl && /^https?:\/\//i.test(data.mediaUrl)) {
        data.mediaUrl = await downloadRemote(projectId, data.mediaUrl, node.type === "videoInput" ? "video" : "audio");
      }
      continue;
    }
    if (node.type !== "imageInput") continue;
    if (data.characterId) {
      const url = await characterPhotoUrl(data.characterId);
      if (url) data.imageUrl = url;
      else if (!data.imageUrl) throw inputError(`Character ${data.characterId} (node ${node.id}) no longer exists.`);
    } else if (data.poseId) {
      const url = await poseImageUrl(data.poseId);
      if (!url) throw inputError(`Pose ${data.poseId} (node ${node.id}) is not in the pose library.`);
      data.imageUrl = url;
    }
    if (data.imageUrl && /^https?:\/\//i.test(data.imageUrl)) {
      data.imageUrl = await downloadRemote(projectId, data.imageUrl, "image");
    }
  }
  return document;
}

module.exports = { MEDIA_TYPES, applyInputs, declaredInputs, resolveSources, downloadRemote, characterPhotoUrl, poseImageUrl };

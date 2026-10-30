/**
 * Workflow inputs and image sources for Advanced Studio runs.
 *
 * Inputs make a workflow a template: `{{name}}` in a text node, or
 * `inputName` on a text or image input node, is filled per run without
 * touching the saved workflow — the canvas value is the default.
 *
 * Image inputs may point at more than stored files: a character (its
 * primary photo *at run time*), a pose library entry, or a web URL, which is
 * downloaded once into the project's storage. Everything resolves to a
 * `/storage/...` URL before the generators see it, so the run path itself is
 * unchanged.
 */
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pool } = require("../db/pool");
const storage = require("./storage");
const { normalizeToPng } = require("./imageNormalizer");

const PLACEHOLDER = /\{\{\s*([A-Za-z][\w-]{0,63})\s*\}\}/g;
const MAX_REMOTE_BYTES = 25 * 1024 * 1024;
const REMOTE_TIMEOUT_MS = 30_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function inputError(message) {
  const error = new Error(message);
  error.statusCode = 422;
  return error;
}

/** Every input a workflow accepts, with the nodes it feeds and its default. */
function declaredInputs(document) {
  const inputs = new Map();
  const declare = (name, kind, nodeId, defaultValue) => {
    const entry = inputs.get(name) || { name, kind, nodeIds: [], default: null };
    if (!entry.nodeIds.includes(nodeId)) entry.nodeIds.push(nodeId);
    if (entry.default == null && defaultValue) entry.default = defaultValue;
    inputs.set(name, entry);
  };
  for (const node of document.nodes || []) {
    if (node.type === "text") {
      if (node.data?.inputName) declare(node.data.inputName, "text", node.id, node.data.text || null);
      for (const match of String(node.data?.text || "").matchAll(PLACEHOLDER)) declare(match[1], "text", node.id, null);
    } else if (node.type === "imageInput" && node.data?.inputName) {
      const { imageUrl, characterId, poseId } = node.data;
      declare(node.data.inputName, "image", node.id, characterId ? { characterId } : poseId ? { poseId } : imageUrl || null);
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

/**
 * Returns a copy of the document with `inputs` applied. Unknown names and
 * placeholders left without a value are 422s: in a batch, a typo should stop
 * the batch, not produce a hundred images of a literal "{{subjct}}".
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
  const nodes = (document.nodes || []).map((node) => {
    if (node.type === "text") {
      let text = node.data?.inputName && inputs[node.data.inputName] != null
        ? String(inputs[node.data.inputName])
        : String(node.data?.text || "");
      text = text.replace(PLACEHOLDER, (placeholder, name) => {
        if (inputs[name] != null) return String(inputs[name]);
        missing.add(name);
        return placeholder;
      });
      return { ...node, data: { ...node.data, text } };
    }
    if (node.type === "imageInput" && node.data?.inputName && inputs[node.data.inputName] != null) {
      const { inputName } = node.data;
      return { ...node, data: { inputName, ...imageSource(inputName, inputs[inputName]) } };
    }
    return node;
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

/** Downloads a web image into the project's storage once; the same URL is
 * served from disk on every later run. */
async function downloadRemoteImage(projectId, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw inputError(`"${url}" is not a valid image URL.`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw inputError(`Only http and https image URLs are supported (${url}).`);

  const key = crypto.createHash("sha256").update(parsed.href).digest("hex").slice(0, 24);
  const relativePath = storage.getAdvancedAssetPath(projectId, `remote-${key}`, ".png");
  const destination = storage.absolutePath(relativePath);
  if (fs.existsSync(destination)) return storage.publicUrl(relativePath);

  const response = await fetch(parsed, { signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) }).catch((error) => {
    throw inputError(`Could not download ${url}: ${error.message}`);
  });
  if (!response.ok) throw inputError(`Could not download ${url}: the server answered ${response.status}.`);
  const type = response.headers.get("content-type") || "";
  if (!type.startsWith("image/")) throw inputError(`${url} is not an image (${type || "unknown type"}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_REMOTE_BYTES) throw inputError(`${url} is larger than 25MB.`);

  const temporary = path.join(os.tmpdir(), `poseforge-remote-${key}-${process.pid}`);
  await fs.promises.writeFile(temporary, bytes);
  try {
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await normalizeToPng(temporary, destination, { originalName: path.basename(parsed.pathname) || "image", mimeType: type });
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return storage.publicUrl(relativePath);
}

/**
 * Resolves every image input of `document` (mutated in place) to a stored
 * file: a character's current primary photo, a pose's image, or a downloaded
 * web URL. A character that has since been deleted falls back to the photo
 * the node already shows.
 */
async function resolveImageSources(document, projectId) {
  for (const node of document.nodes || []) {
    if (node.type !== "imageInput") continue;
    const data = node.data || (node.data = {});
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
      data.imageUrl = await downloadRemoteImage(projectId, data.imageUrl);
    }
  }
  return document;
}

module.exports = { applyInputs, declaredInputs, resolveImageSources, downloadRemoteImage };

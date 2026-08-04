const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

function normalizeComfyEndpoint(value, { allowRemote = false } = {}) {
  let url;
  try { url = new URL(String(value || "http://127.0.0.1:8188").trim()); }
  catch (_) { throw new Error("ComfyUI endpoint must be a valid URL."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("ComfyUI endpoint must use http or https.");
  if (url.username || url.password) throw new Error("ComfyUI endpoint cannot contain credentials.");
  if (!allowRemote && !LOOPBACK_HOSTS.has(url.hostname)) throw new Error("ComfyUI must use localhost or a loopback address. Set COMFYUI_ALLOW_REMOTE=true only for a secured private deployment.");
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function parseWorkflowTemplate(value) {
  let workflow = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) throw new Error("ComfyUI API workflow JSON is required.");
    try { workflow = JSON.parse(trimmed); }
    catch (_) { throw new Error("ComfyUI workflow must be valid JSON exported in API format."); }
  }
  if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) throw new Error("ComfyUI workflow must be a JSON object.");
  if (!Object.keys(workflow).length) throw new Error("ComfyUI workflow cannot be empty.");
  return workflow;
}

function tokenPresent(serialized, token) {
  return serialized.includes(`{{${token}}}`);
}

function validateWorkflowContract(value) {
  const workflow = parseWorkflowTemplate(value);
  const serialized = JSON.stringify(workflow);
  const missing = ["PROMPT", "POSE_IMAGE"].filter((token) => !tokenPresent(serialized, token));
  if (!tokenPresent(serialized, "IDENTITY_IMAGE") && !tokenPresent(serialized, "IDENTITY_IMAGE_1")) missing.push("IDENTITY_IMAGE or IDENTITY_IMAGE_1");
  if (missing.length) throw new Error(`ComfyUI workflow is missing required placeholder${missing.length === 1 ? "" : "s"}: ${missing.map((token) => `{{${token}}}`).join(", ")}.`);
  return workflow;
}

function replaceTokens(value, replacements) {
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, replacements));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, replacements)]));
  if (typeof value !== "string") return value;
  const exact = value.match(/^\{\{([A-Z0-9_]+)\}\}$/);
  if (exact && Object.prototype.hasOwnProperty.call(replacements, exact[1])) return replacements[exact[1]];
  return value.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : match);
}

function renderWorkflowTemplate(template, replacements, requiredTokens = []) {
  const workflow = parseWorkflowTemplate(template);
  const serialized = JSON.stringify(workflow);
  const missing = requiredTokens.filter((token) => !tokenPresent(serialized, token));
  if (missing.length) throw new Error(`ComfyUI workflow is missing required placeholder${missing.length === 1 ? "" : "s"}: ${missing.map((token) => `{{${token}}}`).join(", ")}.`);
  return replaceTokens(workflow, replacements);
}

function uploadedImageName(upload) {
  if (!upload?.name) throw new Error("ComfyUI did not return an uploaded image name.");
  return upload.subfolder ? `${upload.subfolder}/${upload.name}` : upload.name;
}

function firstOutputImage(history, promptId) {
  const entry = history?.[promptId] || history;
  for (const output of Object.values(entry?.outputs || {})) {
    const image = output?.images?.[0];
    if (image?.filename) return image;
  }
  return null;
}

module.exports = {
  normalizeComfyEndpoint,
  parseWorkflowTemplate,
  tokenPresent,
  validateWorkflowContract,
  renderWorkflowTemplate,
  uploadedImageName,
  firstOutputImage,
};

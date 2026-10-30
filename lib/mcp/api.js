/**
 * Loopback client for PoseForge's own HTTP API.
 *
 * MCP tools deliberately call the API instead of the modules behind it: the
 * routes own every business rule (validation, revision conflicts, spending
 * limits), so a tool can never drift from what the UI gets.
 */
const fs = require("fs");
const path = require("path");

class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `PoseForge API answered ${status}.`);
    this.status = status;
    this.body = body;
  }
}

function fillPath(template, params) {
  return template.replace(/:([A-Za-z]+)/g, (_, name) => {
    if (params[name] == null || params[name] === "") throw new ApiError(400, { error: `Missing ${name}.` });
    return encodeURIComponent(String(params[name]));
  });
}

/** Upload routes check the MIME type (the media route rejects anything not
 * video/* or audio/*), and a blob read from disk has none of its own. */
const MIME_TYPES = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".heic": "image/heic", ".heif": "image/heif", ".avif": "image/avif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac",
  ".ogg": "audio/ogg", ".flac": "audio/flac",
};

async function readLocalFile(filePath) {
  const resolved = path.resolve(String(filePath));
  try {
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile()) throw new Error();
  } catch {
    throw new ApiError(400, { error: `No readable file at ${resolved}.` });
  }
  const type = MIME_TYPES[path.extname(resolved).toLowerCase()] || "application/octet-stream";
  return { blob: await fs.openAsBlob(resolved, { type }), name: path.basename(resolved) };
}

/**
 * `call(route, { params, query, body, files })` where `route` is "METHOD
 * /api/path/:param" and `files` maps multipart field names to local paths.
 * Resolves to the parsed JSON body (or `{ ok: true }` for 204); rejects with
 * `ApiError` for any non-2xx answer.
 */
function createApiClient(baseUrl) {
  async function call(route, { params = {}, query = {}, body, files } = {}) {
    const [method, template] = route.split(" ");
    const url = new URL(fillPath(template, params), baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value != null && value !== "") url.searchParams.set(key, String(value));
    }

    const init = { method, headers: { accept: "application/json" } };
    if (files && Object.keys(files).length) {
      const form = new FormData();
      for (const [key, value] of Object.entries(body || {})) {
        if (value != null) form.append(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
      for (const [field, filePath] of Object.entries(files)) {
        const { blob, name } = await readLocalFile(filePath);
        form.append(field, blob, name);
      }
      init.body = form;
    } else if (body !== undefined) {
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);
    if (response.status === 204) return { ok: true };
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { error: text.slice(0, 500) };
    }
    if (!response.ok) throw new ApiError(response.status, parsed);
    return parsed;
  }
  return { call, baseUrl };
}

module.exports = { ApiError, createApiClient };

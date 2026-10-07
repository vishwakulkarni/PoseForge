/**
 * The single gateway between PoseForge and the Higgsfield API.
 *
 * Every Higgsfield call — credential checks, uploads, price estimates,
 * submissions, polling, cancellation and downloads — goes through this module
 * so authentication, error mapping, idempotency and retry policy live in one
 * place. Engine adapters (imageEngine.js, videoEngine.js) only build model
 * inputs. Behavior follows https://docs.higgsfield.ai/docs/llms.txt.
 */
const fs = require("fs");
const path = require("path");
const { pool } = require("../../db/pool");
const logger = require("../../lib/logger");

const API_URL = "https://api.higgsfield.ai";
const CONSOLE_URL = "https://console.higgsfield.ai";
const CREDENTIAL_SETTING = "higgsfield_api_key";
const TERMINAL_STATUSES = new Set(["completed", "failed", "nsfw", "canceled"]);

/** `charged` tells billing whether credits may have been spent: Higgsfield
 * refunds failed, moderated and canceled requests, and never charges requests
 * it rejected before acceptance. Only a local timeout leaves it unknown. */
class HiggsfieldError extends Error {
  constructor(message, { code, status = null, requestId = null, correlationId = null, charged = false } = {}) {
    super(message);
    this.name = "HiggsfieldError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.correlationId = correlationId;
    this.charged = charged;
  }
}

function validCredentials(credentials) {
  const parts = String(credentials || "").split(":");
  return parts.length === 2 && parts.every((part) => part.trim() && !/\s/.test(part));
}

/** Environment wins over an explicit value, which wins over the saved
 * setting — matching how Settings shows an environment key as locked. */
async function resolveCredentials(explicit) {
  if (process.env.HF_CREDENTIALS?.trim()) return process.env.HF_CREDENTIALS.trim();
  if (explicit?.trim()) return explicit.trim();
  const result = await pool.query("SELECT value FROM settings WHERE key = $1", [CREDENTIAL_SETTING]);
  return (result.rows[0]?.value || "").trim();
}

async function readiness() {
  const credentials = await resolveCredentials();
  if (!credentials) return { ready: false, reason: "Add Higgsfield credentials in Settings." };
  if (!validCredentials(credentials)) return { ready: false, reason: "Higgsfield credentials must be in key-id:key-secret format." };
  return { ready: true };
}

function detailMessage(detail) {
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg || item?.message || String(item)).filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  return typeof detail === "string" && detail ? detail : null;
}

/** Maps the documented status codes to actionable messages. Raw provider
 * text is appended for context but never used for control flow. */
function httpError(status, body, correlationId) {
  const detail = detailMessage(body?.detail);
  const options = { status, correlationId };
  if (status === 401) return new HiggsfieldError("Higgsfield rejected the credentials. Check the key in Settings.", { ...options, code: "auth" });
  if (status === 402 || status === 403) {
    return new HiggsfieldError(`Not enough Higgsfield credits. Top up at ${CONSOLE_URL} and try again.`, { ...options, code: "insufficient-credits" });
  }
  if (status === 400 && /concurrent/i.test(detail || "")) {
    return new HiggsfieldError("Higgsfield's concurrent request limit is reached. Wait for a running generation to finish.", { ...options, code: "concurrency" });
  }
  if (status === 404) return new HiggsfieldError(`Higgsfield could not find that model or request${detail ? ` (${detail})` : ""}.`, { ...options, code: "not-found" });
  if (status === 423 || status === 503) {
    return new HiggsfieldError("This Higgsfield model is temporarily unavailable. Try again later or choose another model.", { ...options, code: "model-unavailable" });
  }
  if (status === 400 || status === 422) return new HiggsfieldError(`Higgsfield rejected the request: ${detail || "invalid parameters"}.`, { ...options, code: "validation" });
  return new HiggsfieldError(`Higgsfield returned an error (${status})${detail ? `: ${detail}` : ""}.`, { ...options, code: "server" });
}

async function call(credentials, method, apiPath, { body, idempotencyKey, signal } = {}) {
  const url = apiPath.startsWith("https://") ? apiPath : `${API_URL}${apiPath}`;
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Key ${credentials}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new HiggsfieldError(`Could not reach Higgsfield: ${error.message}`, { code: "network" });
  }
  const correlationId = response.headers.get("x-correlation-id");
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!response.ok) throw httpError(response.status, parsed, correlationId);
  return parsed;
}

const retryable = (error) => error.code === "network" || error.code === "server";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Higgsfield model inputs take public URLs, so local files go through the
 * presigned-upload flow. Credentials are never sent to the storage URL. */
async function uploadImage(credentials, imagePath) {
  const contentType = path.extname(imagePath).toLowerCase() === ".jpg" ? "image/jpeg" : "image/png";
  const target = await call(credentials, "POST", "/files/generate-upload-url", { body: { content_type: contentType } });
  let uploaded;
  try {
    uploaded = await fetch(target.upload_url, {
      method: "PUT",
      headers: target.upload_headers || { "Content-Type": contentType },
      body: await fs.promises.readFile(imagePath),
    });
  } catch (error) {
    throw new HiggsfieldError(`Could not upload an input image to Higgsfield: ${error.message}`, { code: "network" });
  }
  if (!uploaded.ok) throw new HiggsfieldError(`Could not upload an input image to Higgsfield (${uploaded.status}).`, { code: "upload" });
  return target.public_url;
}

/** Free price check. Returns `{ credits, usd, discountUsd }` when Higgsfield
 * prices the exact request, `{ description }` when the model only publishes
 * a rate card, or throws. */
async function estimate(credentials, endpoint, input) {
  const result = await call(credentials, "POST", `/estimate/${endpoint}`, { body: input });
  if (result?.type === "estimate") {
    const credits = Number(result.credits);
    const usd = Number(result.usd);
    return {
      credits: Number.isFinite(credits) ? credits : null,
      usd: Number.isFinite(usd) ? usd : null,
      discountUsd: Number.isFinite(Number(result.discount?.usd)) ? Number(result.discount.usd) : null,
    };
  }
  return { description: typeof result?.pricing_description === "string" ? result.pricing_description : null };
}

/** Submits once per generation intent. The idempotency key makes retries
 * after a network failure or 5xx safe: Higgsfield returns the original
 * request instead of charging for a duplicate. */
async function submit(credentials, endpoint, input, { idempotencyKey, attempts = 3, retryDelayMs = 1_000 } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const accepted = await call(credentials, "POST", `/${endpoint}`, { body: input, idempotencyKey });
      if (!accepted?.request_id) throw new HiggsfieldError("Higgsfield accepted the request but returned no request id.", { code: "server" });
      return accepted;
    } catch (error) {
      if (!retryable(error) || attempt >= attempts) throw error;
      logger.warn("Higgsfield submission retrying", { endpoint, attempt, code: error.code });
      await sleep(retryDelayMs * 2 ** (attempt - 1));
    }
  }
}

/** Status URLs come from the API response, but credentials must only ever go
 * to the API host, so anything else falls back to the documented path. */
function statusUrl(submission) {
  try {
    if (new URL(submission.status_url).origin === API_URL) return submission.status_url;
  } catch { /* fall through */ }
  return `/requests/${submission.request_id}/status`;
}

async function cancel(credentials, requestId) {
  try {
    await call(credentials, "POST", `/requests/${requestId}/cancel`);
    return true;
  } catch {
    // 400 means processing already started; cancellation is best-effort.
    return false;
  }
}

async function waitForResult(credentials, submission, { timeoutMs = 1_200_000, pollIntervalMs = 2_000, maxPollIntervalMs = 10_000 } = {}) {
  const requestId = submission.request_id;
  const deadline = Date.now() + timeoutMs;
  let delay = pollIntervalMs;
  let current = submission;
  while (!TERMINAL_STATUSES.has(current?.status)) {
    if (Date.now() > deadline) {
      const canceled = current?.status === "queued" && await cancel(credentials, requestId);
      throw new HiggsfieldError(
        canceled
          ? `Higgsfield did not start the request in time, so it was canceled (request ${requestId}).`
          : `Higgsfield is still generating after ${Math.round(timeoutMs / 60_000)} minutes (request ${requestId}). Check ${CONSOLE_URL} for the result.`,
        { code: "timeout", requestId, charged: !canceled },
      );
    }
    await sleep(delay);
    delay = Math.min(delay * 1.5, maxPollIntervalMs);
    try {
      current = await call(credentials, "GET", statusUrl(submission));
    } catch (error) {
      if (!retryable(error)) throw Object.assign(error, { requestId });
    }
  }
  return current;
}

function terminalError(result, label) {
  const requestId = result.request_id;
  const note = ` (request ${requestId})`;
  if (result.status === "nsfw") return new HiggsfieldError(`Higgsfield content moderation rejected this ${label}${note}. No credits were charged.`, { code: "moderation", requestId });
  if (result.status === "canceled") return new HiggsfieldError(`The Higgsfield request was canceled${note}. No credits were charged.`, { code: "canceled", requestId });
  const detail = detailMessage(result.error) || detailMessage(result.detail) || "generation failed";
  return new HiggsfieldError(`Higgsfield ${label} failed${note}: ${detail}. No credits were charged.`, { code: "failed", requestId });
}

/** Submit + wait. Resolves with the completed response or throws a
 * HiggsfieldError whose `charged` flag drives refund accounting. */
async function run(credentials, endpoint, input, { idempotencyKey, label = "generation", ...waitOptions } = {}) {
  const submission = await submit(credentials, endpoint, input, { idempotencyKey });
  logger.info("Higgsfield request accepted", { endpoint, requestId: submission.request_id });
  const result = await waitForResult(credentials, submission, waitOptions);
  logger.info("Higgsfield request finished", { endpoint, requestId: result.request_id, status: result.status });
  if (result.status !== "completed") throw terminalError(result, label);
  return result;
}

/** Output URLs expire after seven days, so results are always copied into
 * PoseForge storage. */
async function download(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new HiggsfieldError(`Could not download the Higgsfield output (${response.status}).`, { code: "download", charged: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (outputPath) {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, buffer);
  }
  return buffer;
}

/** Proves the credentials work without spending credits: estimates are free
 * and require the same authentication as generation. */
async function verifyCredentials(credentials) {
  if (!validCredentials(credentials)) {
    return { ok: false, code: "format", message: "Credentials must be in key-id:key-secret format." };
  }
  try {
    await estimate(credentials, "xai/grok-imagine-image-2.0", { prompt: "PoseForge connection check" });
    return { ok: true, message: "Connected to Higgsfield." };
  } catch (error) {
    return { ok: false, code: error.code || "unknown", message: error.message };
  }
}

module.exports = {
  API_URL,
  CONSOLE_URL,
  CREDENTIAL_SETTING,
  HiggsfieldError,
  validCredentials,
  resolveCredentials,
  readiness,
  uploadImage,
  estimate,
  submit,
  waitForResult,
  cancel,
  run,
  download,
  verifyCredentials,
};

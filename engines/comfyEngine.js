const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const { pool } = require("../db/pool");
const { RATE_DATE } = require("../lib/usageEstimator");
const {
  normalizeComfyEndpoint,
  parseWorkflowTemplate,
  validateWorkflowContract,
  tokenPresent,
  renderWorkflowTemplate,
  uploadedImageName,
  firstOutputImage,
} = require("../lib/comfyWorkflow");

const models = [
  { id: "flux2-klein-4b", label: "FLUX.2 Klein 4B", tier: "local-default", note: "Commercial-friendly local default; approximately 8–13 GB VRAM." },
  { id: "qwen-image-edit-2511", label: "Qwen Image Edit 2511", tier: "identity", note: "Best local multi-person and identity-editing profile; approximately 14–40 GB depending on quantization." },
  { id: "sdxl-openpose", label: "SDXL + OpenPose", tier: "exact-pose", note: "Most literal skeletal pose control; approximately 8 GB VRAM floor." },
];
const DEFAULT_MODEL = models[0].id;
const DEFAULT_ENDPOINT = "http://127.0.0.1:8188";

async function setting(key) { const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]); return result.rows[0]?.value || ""; }
function validModel(value) { return models.some((item) => item.id === value) ? value : DEFAULT_MODEL; }
async function configuredModel() { return validModel(process.env.COMFYUI_MODEL || await setting("comfy_model")); }
async function configuredEndpoint() { return normalizeComfyEndpoint(process.env.COMFYUI_URL || await setting("comfy_endpoint") || DEFAULT_ENDPOINT, { allowRemote: process.env.COMFYUI_ALLOW_REMOTE === "true" }); }
async function configuredWorkflow() {
  if (process.env.COMFYUI_WORKFLOW_PATH) return fs.promises.readFile(process.env.COMFYUI_WORKFLOW_PATH, "utf8");
  return setting("comfy_workflow");
}

function dimensions(aspectRatio, quality) {
  const sizes = {
    low: { "1:1": [768, 768], "4:5": [640, 800], "16:9": [1024, 576], "9:16": [576, 1024] },
    medium: { "1:1": [1024, 1024], "4:5": [1024, 1280], "16:9": [1344, 768], "9:16": [768, 1344] },
    high: { "1:1": [1536, 1536], "4:5": [1216, 1536], "16:9": [1536, 864], "9:16": [864, 1536] },
  };
  const [width, height] = (sizes[quality] || sizes.medium)[aspectRatio] || sizes.medium["1:1"];
  return { width, height };
}

async function montage(paths) {
  if (paths.length === 1) return fs.promises.readFile(paths[0]);
  const targetHeight = 768;
  const images = await Promise.all(paths.map(async (imagePath) => {
    const input = await sharp(imagePath).rotate().resize({ height: targetHeight, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const metadata = await sharp(input).metadata();
    return { input, width: metadata.width, height: metadata.height };
  }));
  const gap = 12;
  const width = images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length - 1);
  let left = 0;
  const composite = images.map((image) => { const entry = { input: image.input, left, top: Math.floor((targetHeight - image.height) / 2) }; left += image.width + gap; return entry; });
  return sharp({ create: { width, height: targetHeight, channels: 4, background: { r: 245, g: 246, b: 248, alpha: 1 } } }).composite(composite).png().toBuffer();
}

async function uploadImage(endpoint, input, filename) {
  const buffer = Buffer.isBuffer(input) ? input : await fs.promises.readFile(input);
  const form = new FormData();
  form.append("image", new Blob([buffer], { type: "image/png" }), filename);
  form.append("type", "input");
  form.append("overwrite", "true");
  const response = await fetch(`${endpoint}/upload/image`, { method: "POST", body: form });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || result.message || `ComfyUI image upload failed (${response.status}).`);
  return uploadedImageName(result);
}

async function waitForOutput(endpoint, promptId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${endpoint}/history/${encodeURIComponent(promptId)}`);
    const history = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(history.error || `ComfyUI history request failed (${response.status}).`);
    const image = firstOutputImage(history, promptId);
    if (image) return image;
    const entry = history?.[promptId] || history;
    const status = entry?.status?.status_str;
    if (status === "error" || (entry?.status?.completed && !image)) throw new Error("ComfyUI completed without an output image. Check the workflow output node.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`ComfyUI generation timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
}

const engine = {
  key: "comfy",
  label: "ComfyUI Local",
  models,
  capabilities: { multiImage: "workflow", exactPose: true, aspectRatio: true, quality: true, variants: true, local: true },
  getConfiguredModel: configuredModel,
  async isReady() {
    let workflow;
    let endpoint;
    try {
      workflow = await configuredWorkflow();
      if (!workflow) return { ready: false, reason: "No ComfyUI API workflow configured" };
      validateWorkflowContract(workflow);
      endpoint = await configuredEndpoint();
      const response = await fetch(`${endpoint}/system_stats`, { signal: AbortSignal.timeout(1800) });
      return response.ok ? { ready: true } : { ready: false, reason: `ComfyUI returned HTTP ${response.status}` };
    } catch (error) {
      return { ready: false, reason: endpoint ? `ComfyUI is not reachable at ${endpoint}` : error.message };
    }
  },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings = {}, model }) {
    const startedAt = Date.now();
    const endpoint = await configuredEndpoint();
    const template = await configuredWorkflow();
    if (!template) throw new Error("No ComfyUI API workflow configured. Open Settings → Local engine setup.");
    const selectedModel = validModel(model || await configuredModel());
    const characterPaths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    const serialized = JSON.stringify(parseWorkflowTemplate(template));
    const replacements = {};
    const requiredTokens = ["PROMPT", "POSE_IMAGE"];
    const hasIndividualInputs = characterPaths.every((_, index) => tokenPresent(serialized, `IDENTITY_IMAGE_${index + 1}`));
    if (hasIndividualInputs) {
      for (const [index, imagePath] of characterPaths.entries()) {
        const token = `IDENTITY_IMAGE_${index + 1}`;
        replacements[token] = await uploadImage(endpoint, imagePath, `poseforge-identity-${index + 1}-${crypto.randomUUID()}.png`);
        requiredTokens.push(token);
      }
    } else {
      replacements.IDENTITY_IMAGE = await uploadImage(endpoint, await montage(characterPaths), `poseforge-identities-${crypto.randomUUID()}.png`);
      requiredTokens.push("IDENTITY_IMAGE");
    }
    replacements.POSE_IMAGE = await uploadImage(endpoint, posePhotoPath, `poseforge-pose-${crypto.randomUUID()}.png`);
    const { width, height } = dimensions(outputSettings.aspectRatio, outputSettings.quality);
    replacements.PROMPT = prompt;
    replacements.NEGATIVE_PROMPT = outputSettings.negativePrompt || "low quality, malformed anatomy, duplicate people, extra limbs, identity drift";
    replacements.WIDTH = width;
    replacements.HEIGHT = height;
    replacements.SEED = outputSettings.seed == null ? crypto.randomInt(0, 2147483647) : Number(outputSettings.seed);
    replacements.OUTPUT_PREFIX = `poseforge-${crypto.randomUUID()}`;
    replacements.MODEL_PROFILE = selectedModel;
    const workflow = renderWorkflowTemplate(template, replacements, requiredTokens);
    const clientId = crypto.randomUUID();
    const response = await fetch(`${endpoint}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: clientId }) });
    const submitted = await response.json().catch(() => ({}));
    if (!response.ok || !submitted.prompt_id) {
      const nodeErrors = submitted.node_errors && Object.keys(submitted.node_errors).length ? ` ${JSON.stringify(submitted.node_errors).slice(0, 1200)}` : "";
      throw new Error(`${submitted.error || submitted.message || `ComfyUI workflow submission failed (${response.status}).`}${nodeErrors}`);
    }
    const image = await waitForOutput(endpoint, submitted.prompt_id, Number(process.env.COMFYUI_TIMEOUT_MS || 600000));
    const params = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || "", type: image.type || "output" });
    const imageResponse = await fetch(`${endpoint}/view?${params}`);
    if (!imageResponse.ok) throw new Error(`Could not download the ComfyUI output (${imageResponse.status}).`);
    await sharp(Buffer.from(await imageResponse.arrayBuffer())).rotate().png().toFile(outputPath);
    return { usage: {
      source: "local",
      rateDate: RATE_DATE,
      model: selectedModel,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      runtimeSeconds: Math.round(((Date.now() - startedAt) / 1000) * 100) / 100,
      pricingNote: "Generated by the local ComfyUI runtime; no provider tokens or API charges. Electricity and hardware costs are not included.",
    } };
  },
};

module.exports = engine;

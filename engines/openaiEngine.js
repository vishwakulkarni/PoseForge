const fs = require("fs");
const { pool } = require("../db/pool");
const { RATE_DATE } = require("../lib/usageEstimator");

const MODEL_ID = "gpt-image-2";
const models = [{
  id: MODEL_ID,
  label: "GPT Image 2",
  tier: "quality",
  note: "High-fidelity multi-reference image editing.",
}];

async function configured() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const result = await pool.query("SELECT value FROM settings WHERE key = 'openai_api_key'");
  return result.rows[0]?.value || "";
}

function selectedModel(value) {
  return models.some((item) => item.id === value) ? value : MODEL_ID;
}

function outputSize(outputSettings = {}) {
  if (/^\d{3,4}x\d{3,4}$/.test(String(outputSettings.size || ""))) return outputSettings.size;
  const sizeMap = {
    "1:1": "1024x1024",
    "4:5": "1024x1536",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
  };
  return sizeMap[outputSettings.aspectRatio] || "1024x1024";
}

function outputQuality(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function outputCost(size, quality) {
  const table = size === "1024x1024"
    ? { low: 0.006, medium: 0.053, high: 0.211 }
    : { low: 0.005, medium: 0.041, high: 0.165 };
  return table[quality];
}

async function editImage({ referencePaths, prompt, outputPath, outputSettings = {}, apiKey, model }) {
  const key = apiKey || await configured();
  if (!key) throw new Error("No OpenAI API key configured.");
  const paths = (Array.isArray(referencePaths) ? referencePaths : [referencePaths]).filter(Boolean);
  if (!paths.length) throw new Error("At least one OpenAI image reference is required.");
  if (paths.length > 16) throw new Error("GPT Image supports at most sixteen reference images.");

  const quality = outputQuality(outputSettings.quality);
  const size = outputSize(outputSettings);
  const form = new FormData();
  form.append("model", selectedModel(model));
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", quality);
  form.append("output_format", "png");
  for (const [index, referencePath] of paths.entries()) {
    form.append("image[]", new Blob([await fs.promises.readFile(referencePath)]), `reference-${index + 1}.png`);
  }

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || `OpenAI request failed (${response.status}).`);
  const image = body.data?.[0]?.b64_json;
  if (!image) throw new Error("OpenAI returned no image data.");
  await fs.promises.writeFile(outputPath, Buffer.from(image, "base64"));

  const usage = body.usage || {};
  const details = usage.input_tokens_details || {};
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const totalTokens = Number(usage.total_tokens || inputTokens + outputTokens);
  return { usage: {
    source: totalTokens ? "actual" : "provider-estimate",
    rateDate: RATE_DATE,
    model: MODEL_ID,
    inputTokens,
    outputTokens,
    totalTokens,
    textInputTokens: Number(details.text_tokens || 0) || undefined,
    imageInputTokens: Number(details.image_tokens || 0) || undefined,
    estimatedCostUsd: outputCost(size, quality),
    pricingNote: "GPT Image 2 output estimate for the selected size and quality; reference-image input tokens are additional.",
  } };
}

const engine = {
  key: "openai",
  label: "OpenAI API",
  models,
  capabilities: {
    multiImage: true,
    maxReferenceImages: 16,
    identityReferenceMode: "sheet",
    angleProfiles: true,
    aspectRatio: true,
    quality: true,
    variants: true,
  },
  async getConfiguredModel() { return MODEL_ID; },
  async isReady() {
    return (await configured())
      ? { ready: true }
      : { ready: false, reason: "No API key configured" };
  },
  editImage,
  async generateProfileView({ sourcePath, prompt, outputPath, outputSettings = {}, apiKey, model }) {
    return editImage({
      referencePaths: [sourcePath],
      prompt,
      outputPath,
      outputSettings,
      apiKey,
      model,
    });
  },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings = {}, apiKey, model }) {
    const paths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    return editImage({
      referencePaths: [...paths, posePhotoPath],
      prompt,
      outputPath,
      outputSettings,
      apiKey,
      model,
    });
  },
};

module.exports = engine;

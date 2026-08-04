const fs = require("fs");
const sharp = require("sharp");
const { pool } = require("../db/pool");
const { RATE_DATE } = require("../lib/usageEstimator");

const models = [
  { id: "gemini-3-pro-image-preview", label: "Gemini 3 Pro Image", tier: "quality", note: "Highest-fidelity identity and portrait tier; preview model." },
  { id: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image", tier: "fast", note: "Faster, lower-cost Nano Banana 2 tier; preview model." },
];
const DEFAULT_MODEL = models[0].id;

async function setting(key) { const result = await pool.query("SELECT value FROM settings WHERE key = $1", [key]); return result.rows[0]?.value || ""; }
async function configuredKey() { return process.env.GEMINI_API_KEY || await setting("gemini_api_key"); }
function validModel(value) { return models.some((item) => item.id === value) ? value : DEFAULT_MODEL; }
async function configuredModel() { return validModel(process.env.GEMINI_IMAGE_MODEL || await setting("gemini_model")); }

function roughCost(model, quality) {
  if (model === "gemini-3-pro-image-preview") return 0.134;
  return quality === "low" ? 0.04 : 0.067;
}

const engine = {
  key: "gemini",
  label: "Google Gemini",
  models,
  capabilities: { multiImage: true, maxReferenceImages: 5, aspectRatio: true, quality: true, variants: true, local: false },
  getConfiguredModel: configuredModel,
  async isReady() {
    const apiKey = await configuredKey();
    return apiKey ? { ready: true } : { ready: false, reason: "No Gemini API key configured" };
  },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings = {}, apiKey, model }) {
    const key = apiKey || await configuredKey();
    if (!key) throw new Error("No Gemini API key configured.");
    const selectedModel = validModel(model || await configuredModel());
    const characterPaths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    const referencePaths = [...characterPaths, posePhotoPath];
    if (referencePaths.length > 5) throw new Error("Gemini supports at most five reference images for this workflow.");
    const parts = [];
    for (const imagePath of referencePaths) {
      parts.push({ inlineData: { mimeType: "image/png", data: (await fs.promises.readFile(imagePath)).toString("base64") } });
    }
    parts.push({ text: prompt });
    const ratioMap = { "1:1": "1:1", "4:5": "3:4", "16:9": "16:9", "9:16": "9:16" };
    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: ratioMap[outputSettings.aspectRatio] || "1:1",
          imageSize: outputSettings.quality === "high" ? "2K" : "1K",
        },
      },
    };
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `Gemini request failed (${response.status}).`);
    const responseParts = result.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const imagePart = responseParts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const imageData = imagePart?.inlineData?.data || imagePart?.inline_data?.data;
    if (!imageData) {
      const providerText = responseParts.map((part) => part.text).filter(Boolean).join(" ").slice(0, 500);
      throw new Error(providerText ? `Gemini returned no image: ${providerText}` : "Gemini returned no image data.");
    }
    await sharp(Buffer.from(imageData, "base64")).rotate().png().toFile(outputPath);
    const usage = result.usageMetadata || result.usage_metadata || {};
    const inputTokens = Number(usage.promptTokenCount || usage.prompt_token_count || 0);
    const outputTokens = Number(usage.candidatesTokenCount || usage.candidates_token_count || 0);
    const totalTokens = Number(usage.totalTokenCount || usage.total_token_count || inputTokens + outputTokens);
    return { usage: {
      source: totalTokens ? "actual" : "provider-estimate",
      rateDate: RATE_DATE,
      model: selectedModel,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd: roughCost(selectedModel, outputSettings.quality),
      pricingNote: selectedModel === "gemini-3-pro-image-preview"
        ? "Provider token counts when available; rough Gemini 3 Pro Image cost assumes a 1K/2K output. Preview pricing can change."
        : "Provider token counts when available; rough Gemini 3.1 Flash Image per-output estimate. Preview pricing can change.",
    } };
  },
};

module.exports = engine;

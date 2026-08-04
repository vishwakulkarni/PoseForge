const fs = require("fs");
const { pool } = require("../db/pool");
const { RATE_DATE } = require("../lib/usageEstimator");

async function configured() { const result = await pool.query("SELECT value FROM settings WHERE key = 'openai_api_key'"); return result.rows[0]?.value || ""; }
const engine = {
  key: "openai", label: "OpenAI API",
  capabilities: { multiImage: true, aspectRatio: true, quality: true, variants: true },
  async isReady() { return (await configured()) ? { ready: true } : { ready: false, reason: "No API key configured" }; },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings = {}, apiKey }) {
    const key = apiKey || await configured();
    if (!key) throw new Error("No OpenAI API key configured.");
    const paths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
    const sizeMap = { "1:1": "1024x1024", "4:5": "1024x1536", "16:9": "1536x1024", "9:16": "1024x1536" };
    form.append("size", sizeMap[outputSettings.aspectRatio] || "1024x1024");
    form.append("quality", ["low", "medium", "high"].includes(outputSettings.quality) ? outputSettings.quality : "medium");
    for (const [index, characterPhotoPath] of paths.entries()) {
      form.append("image[]", new Blob([await fs.promises.readFile(characterPhotoPath)]), `character-${index + 1}.png`);
    }
    form.append("image[]", new Blob([await fs.promises.readFile(posePhotoPath)]), "pose.png");
    const response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || `OpenAI request failed (${response.status}).`);
    const image = body.data?.[0]?.b64_json;
    if (!image) throw new Error("OpenAI returned no image data.");
    await fs.promises.writeFile(outputPath, Buffer.from(image, "base64"));
    const usage = body.usage || {};
    const details = usage.input_tokens_details || {};
    const textTokens = Number(details.text_tokens || 0);
    const imageTokens = Number(details.image_tokens || 0);
    const outputTokens = Number(usage.output_tokens || 0);
    const estimatedCostUsd = usage.total_tokens
      ? Math.round(((textTokens * 5 + imageTokens * 10 + outputTokens * 40) / 1_000_000) * 10000) / 10000
      : undefined;
    return usage.total_tokens ? { usage: {
      source: "actual",
      rateDate: RATE_DATE,
      inputTokens: Number(usage.input_tokens || 0),
      outputTokens,
      totalTokens: Number(usage.total_tokens || 0),
      textInputTokens: textTokens || undefined,
      imageInputTokens: imageTokens || undefined,
      estimatedCostUsd,
      pricingNote: "Token counts reported by OpenAI; dollar amount uses PoseForge's dated rough pricing assumptions.",
    } } : {};
  },
};
module.exports = engine;

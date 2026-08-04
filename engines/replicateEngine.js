const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { pool } = require("../db/pool");

// This model accepts an input image and prompt; the prompt includes both local references conceptually.
// Keep the slug centralized because Replicate model versions change independently of this app.
const MODEL_SLUG = "black-forest-labs/flux-kontext-pro";
async function configured() { const result = await pool.query("SELECT value FROM settings WHERE key = 'replicate_api_key'"); return result.rows[0]?.value || ""; }

// REASONABLE CHOICE, documented: flux-kontext-pro's schema only accepts a
// single `input_image`, unlike Codex/OpenAI which can take one reference
// image per person. With more than one character photo, we composite them
// side-by-side into a single montage image locally (via sharp) before
// sending it as input_image — imperfect (the model sees a collage rather
// than distinct references), but it's the only way to give this model any
// signal about every person rather than silently dropping all but the first.
// If Replicate later exposes a multi-image-capable model, swap the model
// slug and this composite step can go away.
async function compositeCharacters(paths) {
  if (paths.length === 1) return paths[0];
  const targetHeight = 768;
  const buffers = await Promise.all(paths.map(async (p) => {
    const resized = await sharp(p).resize({ height: targetHeight, fit: "cover" }).png().toBuffer();
    const meta = await sharp(resized).metadata();
    return { buffer: resized, width: meta.width, height: meta.height };
  }));
  const totalWidth = buffers.reduce((sum, b) => sum + b.width, 0);
  let left = 0;
  const composite = buffers.map((b) => { const entry = { input: b.buffer, left, top: 0 }; left += b.width; return entry; });
  const outputPath = path.join(os.tmpdir(), `poseforge-replicate-montage-${crypto.randomUUID()}.png`);
  await sharp({ create: { width: totalWidth, height: targetHeight, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite(composite)
    .png()
    .toFile(outputPath);
  return outputPath;
}

const engine = {
  key: "replicate", label: "Replicate",
  capabilities: { multiImage: "montage", aspectRatio: true, quality: false, variants: true },
  async isReady() { return (await configured()) ? { ready: true } : { ready: false, reason: "No API key configured" }; },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, outputSettings = {}, apiKey }) {
    const key = apiKey || await configured();
    if (!key) throw new Error("No Replicate API key configured.");
    const paths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    const compositePath = await compositeCharacters(paths);
    const character = `data:image/png;base64,${(await fs.promises.readFile(compositePath)).toString("base64")}`;
    if (compositePath !== paths[0]) await fs.promises.rm(compositePath, { force: true }).catch(() => {});
    const pose = `data:image/png;base64,${(await fs.promises.readFile(posePhotoPath)).toString("base64")}`;
    const replicateInput = { prompt: `${prompt} Use this character reference and pose reference.`, input_image: character, pose_image: pose, aspect_ratio: outputSettings.aspectRatio || "1:1" };
    if (outputSettings.seed != null) replicateInput.seed = outputSettings.seed;
    const response = await fetch(`https://api.replicate.com/v1/models/${MODEL_SLUG}/predictions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ input: replicateInput }) });
    let prediction = await response.json();
    if (!response.ok) throw new Error(prediction.detail || `Replicate request failed (${response.status}).`);
    const deadline = Date.now() + Number(process.env.REPLICATE_TIMEOUT_MS || 300000);
    while (["starting", "processing", "queued"].includes(prediction.status)) {
      if (Date.now() > deadline) throw new Error("Replicate request timed out.");
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const poll = await fetch(prediction.urls.get, { headers: { Authorization: `Bearer ${key}` } });
      prediction = await poll.json();
    }
    if (prediction.status !== "succeeded") throw new Error(prediction.error || `Replicate generation ${prediction.status}.`);
    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) throw new Error("Replicate returned no image URL.");
    const image = await fetch(url);
    if (!image.ok) throw new Error("Could not download Replicate output.");
    await fs.promises.writeFile(outputPath, Buffer.from(await image.arrayBuffer()));
    return { usage: prediction.metrics ? { source: "provider-metric", predictTimeSeconds: Number(prediction.metrics.predict_time || 0) || undefined } : {} };
  },
};
module.exports = engine;

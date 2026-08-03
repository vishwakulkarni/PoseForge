const fs = require("fs");
const { pool } = require("../db/pool");

// This model accepts an input image and prompt; the prompt includes both local references conceptually.
// Keep the slug centralized because Replicate model versions change independently of this app.
const MODEL_SLUG = "black-forest-labs/flux-kontext-pro";
async function configured() { const result = await pool.query("SELECT value FROM settings WHERE key = 'replicate_api_key'"); return result.rows[0]?.value || ""; }
const engine = {
  key: "replicate", label: "Replicate",
  async isReady() { return (await configured()) ? { ready: true } : { ready: false, reason: "No API key configured" }; },
  async generate({ characterPhotoPath, posePhotoPath, prompt, outputPath, apiKey }) {
    const key = apiKey || await configured();
    if (!key) throw new Error("No Replicate API key configured.");
    const character = `data:image/png;base64,${(await fs.promises.readFile(characterPhotoPath)).toString("base64")}`;
    const pose = `data:image/png;base64,${(await fs.promises.readFile(posePhotoPath)).toString("base64")}`;
    const response = await fetch(`https://api.replicate.com/v1/models/${MODEL_SLUG}/predictions`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ input: { prompt: `${prompt} Use this character reference and pose reference.`, input_image: character, pose_image: pose } }) });
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
  },
};
module.exports = engine;

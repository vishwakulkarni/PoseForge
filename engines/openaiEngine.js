const fs = require("fs");
const { pool } = require("../db/pool");

async function configured() { const result = await pool.query("SELECT value FROM settings WHERE key = 'openai_api_key'"); return result.rows[0]?.value || ""; }
const engine = {
  key: "openai", label: "OpenAI API",
  async isReady() { return (await configured()) ? { ready: true } : { ready: false, reason: "No API key configured" }; },
  async generate({ characterPhotoPaths, posePhotoPath, prompt, outputPath, apiKey }) {
    const key = apiKey || await configured();
    if (!key) throw new Error("No OpenAI API key configured.");
    const paths = Array.isArray(characterPhotoPaths) ? characterPhotoPaths : [characterPhotoPaths];
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append("prompt", prompt);
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
  },
};
module.exports = engine;

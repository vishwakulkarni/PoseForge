const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const gemini = require("../engines/geminiEngine");

test("Gemini sends identity and pose references with the selected image model", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-gemini-test-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const characterPath = path.join(directory, "character.png");
  const posePath = path.join(directory, "pose.png");
  const outputPath = path.join(directory, "output.png");
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#7467ff" } }).png().toFile(characterPath);
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#f0d7a5" } }).png().toFile(posePath);
  const generatedImage = await sharp({ create: { width: 12, height: 16, channels: 4, background: "#53b88b" } }).png().toBuffer();

  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: generatedImage.toString("base64") } }] } }],
      usageMetadata: { promptTokenCount: 200, candidatesTokenCount: 100, totalTokenCount: 300 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  t.after(() => { global.fetch = originalFetch; });

  const result = await gemini.generate({
    characterPhotoPaths: [characterPath],
    posePhotoPath: posePath,
    prompt: "Preserve identity and use the pose reference.",
    outputPath,
    outputSettings: { aspectRatio: "4:5", quality: "high" },
    apiKey: "test-gemini-key",
    model: "gemini-3.1-flash-image-preview",
  });

  assert.match(request.url, /gemini-3\.1-flash-image-preview:generateContent$/);
  assert.equal(request.options.headers["x-goog-api-key"], "test-gemini-key");
  assert.equal(request.body.contents[0].parts.length, 3);
  assert.equal(request.body.generationConfig.imageConfig.aspectRatio, "3:4");
  assert.equal(request.body.generationConfig.imageConfig.imageSize, "2K");
  assert.equal(result.usage.model, "gemini-3.1-flash-image-preview");
  assert.equal(result.usage.totalTokens, 300);
  assert.equal((await sharp(outputPath).metadata()).format, "png");
});

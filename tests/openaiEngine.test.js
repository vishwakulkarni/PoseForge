const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const openai = require("../engines/openaiEngine");

test("OpenAI uses GPT Image 2 high-fidelity edits without the legacy fidelity parameter", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-openai-test-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const referencePath = path.join(directory, "reference.png");
  const outputPath = path.join(directory, "output.png");
  await sharp({ create: { width: 16, height: 16, channels: 4, background: "#7467ff" } }).png().toFile(referencePath);
  const generated = await sharp({ create: { width: 12, height: 16, channels: 4, background: "#53b88b" } }).png().toBuffer();

  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({
      data: [{ b64_json: generated.toString("base64") }],
      usage: { input_tokens: 20, output_tokens: 30, total_tokens: 50 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  t.after(() => { global.fetch = originalFetch; });

  const result = await openai.editImage({
    referencePaths: [referencePath],
    prompt: "Preserve identity and create a front-facing portrait.",
    outputPath,
    outputSettings: { size: "1024x1536", quality: "medium" },
    apiKey: "test-openai-key",
  });

  assert.equal(request.url, "https://api.openai.com/v1/images/edits");
  assert.equal(request.options.headers.Authorization, "Bearer test-openai-key");
  assert.equal(request.options.body.get("model"), "gpt-image-2");
  assert.equal(request.options.body.get("size"), "1024x1536");
  assert.equal(request.options.body.get("quality"), "medium");
  assert.equal(request.options.body.get("input_fidelity"), null);
  assert.equal(request.options.body.getAll("image[]").length, 1);
  assert.equal(result.usage.model, "gpt-image-2");
  assert.equal(result.usage.totalTokens, 50);
  assert.equal((await sharp(outputPath).metadata()).format, "png");
});

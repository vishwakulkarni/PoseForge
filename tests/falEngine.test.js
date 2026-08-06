const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { fal: falClient } = require("@fal-ai/client");
const falEngine = require("../engines/falEngine");

test("fal.ai sends every identity and pose reference to Nano Banana Pro Edit", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-fal-test-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const characterPath = path.join(directory, "character.png");
  const secondCharacterPath = path.join(directory, "character-2.png");
  const posePath = path.join(directory, "pose.png");
  const outputPath = path.join(directory, "output.png");
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#7467ff" } }).png().toFile(characterPath);
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#d477ff" } }).png().toFile(secondCharacterPath);
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#f0d7a5" } }).png().toFile(posePath);
  const generatedImage = await sharp({ create: { width: 12, height: 16, channels: 4, background: "#53b88b" } }).png().toBuffer();

  const originalFetch = global.fetch;
  const originalSubscribe = falClient.subscribe;
  const originalConfig = falClient.config;
  let request;
  let configuredKey;
  falClient.config = ({ credentials }) => { configuredKey = credentials; };
  falClient.subscribe = async (endpoint, options) => {
    request = { endpoint, options };
    options.onEnqueue("test-request");
    options.onQueueUpdate({ status: "IN_PROGRESS", logs: [{ message: "Generating image" }] });
    return { data: { images: [{ url: "https://example.test/generated.png" }] }, requestId: "test-request" };
  };
  global.fetch = async () => {
    return new Response(new Blob([generatedImage], { type: "image/png" }), { status: 200, headers: { "Content-Type": "image/png" } });
  };
  t.after(() => { global.fetch = originalFetch; falClient.subscribe = originalSubscribe; falClient.config = originalConfig; });

  const result = await falEngine.generate({
    characterPhotoPaths: [characterPath, secondCharacterPath],
    posePhotoPath: posePath,
    prompt: "Preserve identity and use the pose reference.",
    outputPath,
    outputSettings: { aspectRatio: "4:5", quality: "high", seed: 123 },
    apiKey: "test-fal-key",
  });

  assert.equal(request.endpoint, "fal-ai/nano-banana-pro/edit");
  assert.equal(configuredKey, "test-fal-key");
  assert.equal(request.options.logs, true);
  assert.equal(request.options.input.image_urls.length, 3);
  assert.ok(request.options.input.image_urls.every((image) => image instanceof Blob));
  assert.match(request.options.input.prompt, /Images 1 through 2 are the IDENTITY DONORS/);
  assert.match(request.options.input.prompt, /Image 3, the final image, is the TARGET CANVAS/);
  assert.match(request.options.input.prompt, /Never output the target person's identity/);
  assert.match(request.options.input.prompt, /Never retain an identity donor's original pose/);
  assert.match(request.options.input.prompt, /clothing unless the user's request explicitly asks for different clothing/);
  assert.match(request.options.input.system_prompt, /Earlier images are identity donors only/);
  assert.match(request.options.input.system_prompt, /final image is the target canvas/);
  assert.match(request.options.input.system_prompt, /Never copy the final image's person's identity/);
  assert.equal(request.options.input.aspect_ratio, "4:5");
  assert.equal(request.options.input.resolution, "2K");
  assert.equal(request.options.input.limit_generations, true);
  assert.equal(request.options.input.seed, 123);
  assert.equal(result.usage.model, "fal-ai/nano-banana-pro/edit");
  assert.equal(result.usage.providerRequestId, "test-request");
  assert.equal((await sharp(outputPath).metadata()).format, "png");

  falClient.subscribe = async () => {
    const error = new Error("Request failed");
    error.body = { detail: [{ msg: "Invalid image input" }] };
    throw error;
  };
  await assert.rejects(falEngine.generate({
    characterPhotoPaths: [characterPath],
    posePhotoPath: posePath,
    prompt: "Use the pose reference.",
    outputPath,
    apiKey: "test-fal-key",
  }), /fal-ai\/nano-banana-pro\/edit failed: Invalid image input/);
});

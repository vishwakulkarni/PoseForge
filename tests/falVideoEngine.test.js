const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { fal: falClient } = require("@fal-ai/client");
const falVideoEngine = require("../engines/falVideoEngine");

test("fal.ai video request follows the selected model capability", async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "poseforge-fal-video-test-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const startFramePath = path.join(directory, "start.png");
  const outputPath = path.join(directory, "output.mp4");
  await sharp({ create: { width: 8, height: 8, channels: 4, background: "#7467ff" } }).png().toFile(startFramePath);

  const originalFetch = global.fetch;
  const originalSubscribe = falClient.subscribe;
  const originalConfig = falClient.config;
  let request;
  let configuredKey;
  falClient.config = ({ credentials }) => { configuredKey = credentials; };
  falClient.subscribe = async (endpoint, options) => {
    request = { endpoint, options };
    options.onEnqueue("video-request");
    return { requestId: "video-request", data: { video: { url: "https://example.test/output.mp4" } } };
  };
  global.fetch = async () => new Response(Buffer.from("fake-mp4"), { status: 200, headers: { "content-type": "video/mp4" } });
  t.after(() => {
    global.fetch = originalFetch;
    falClient.subscribe = originalSubscribe;
    falClient.config = originalConfig;
  });

  const model = "fal-ai/veo3.1/fast/image-to-video";
  const result = await falVideoEngine.generateVideo({
    model,
    prompt: "A slow camera push toward the lighthouse.",
    startFramePath,
    duration: 99,
    aspectRatio: "1:1",
    resolution: "1080p",
    sound: true,
    outputPath,
    apiKey: "test-fal-key",
  });

  assert.equal(configuredKey, "test-fal-key");
  assert.equal(request.endpoint, model);
  assert.ok(request.options.input.image_url instanceof Blob);
  assert.equal(request.options.input.duration, "8s");
  assert.equal(request.options.input.aspect_ratio, "16:9");
  assert.equal(request.options.input.resolution, "1080p");
  assert.equal(request.options.input.generate_audio, true);
  assert.equal(result.usage.providerRequestId, "video-request");
  assert.equal((await fs.promises.readFile(outputPath)).toString(), "fake-mp4");
});

test("image-to-video rejects a missing start frame before queueing", async () => {
  await assert.rejects(
    falVideoEngine.generateVideo({
      model: "fal-ai/kling-video/v2.1/master/image-to-video",
      prompt: "Move gently.",
      outputPath: "/tmp/unused.mp4",
      apiKey: "test-fal-key",
    }),
    /requires a connected start frame/i,
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { IMAGE_CAPABILITIES, qualityForResolution, supportsAspectRatio } = require("../lib/advancedCapabilities");
const codexEngine = require("../engines/codexEngine");
const falVideoEngine = require("../engines/falVideoEngine");

test("the Codex CLI is offered for Advanced Studio image generation", () => {
  assert.ok(IMAGE_CAPABILITIES.codex, "codex must have an image capability entry");
  assert.equal(codexEngine.capabilities.freeform, true);
  assert.equal(codexEngine.capabilities.textToImage, true);
  assert.equal(typeof codexEngine.generateFreeform, "function");
});

test("Codex resolutions map to the engine-facing quality knob", () => {
  assert.equal(qualityForResolution("codex", "2K"), "high");
  assert.equal(qualityForResolution("codex", "1K"), "medium");
  // An unsupported id falls back to the provider default rather than failing.
  assert.equal(qualityForResolution("codex", "8K"), "medium");
});

test("Codex advertises the app's core aspect ratios", () => {
  assert.equal(supportsAspectRatio("codex", "16:9"), true);
  assert.equal(supportsAspectRatio("codex", "21:9"), false);
});

test("every engine with an image capability entry implements generateFreeform", () => {
  const { registry } = require("../engines");
  for (const key of Object.keys(IMAGE_CAPABILITIES)) {
    const engine = registry[key];
    assert.ok(engine, `${key} must exist in the engine registry`);
    assert.equal(typeof engine.generateFreeform, "function", `${key} must implement generateFreeform`);
    assert.equal(engine.capabilities.freeform, true, `${key} must declare the freeform capability`);
  }
});

test("Codex expresses aspect ratio and resolution in the prompt", () => {
  const { freeformSettingsLine } = codexEngine;
  const high = freeformSettingsLine({ aspectRatio: "16:9", quality: "high" });
  assert.match(high, /Aspect ratio: 16:9\./);
  assert.match(high, /2K/);

  const standard = freeformSettingsLine({ aspectRatio: "1:1", quality: "medium" });
  assert.match(standard, /Aspect ratio: 1:1\./);
  assert.match(standard, /1K/);

  // Nothing selected yet must not append a stray instruction.
  assert.equal(freeformSettingsLine({}), "");
});

test("fal.ai video models expose model-specific inputs and settings", () => {
  assert.equal(falVideoEngine.capabilities.video, true);
  assert.equal(typeof falVideoEngine.generateVideo, "function");
  const textModel = falVideoEngine.videoModels.find((model) => model.id.includes("text-to-video"));
  const imageModel = falVideoEngine.videoModels.find((model) => model.id.includes("image-to-video"));
  assert.deepEqual(textModel.inputs, ["prompt"]);
  assert.ok(imageModel.inputs.includes("startFrame"));
  assert.ok(imageModel.durations.length > 0);
  assert.ok(imageModel.aspectRatios.length > 0);
  assert.ok(imageModel.resolutions.length > 0);
});

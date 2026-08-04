const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeAdvancedSettings, buildAdvancedPromptFragment, outputSettings } = require("../lib/studioSettings");

test("sanitizeAdvancedSettings clamps values and strips unsupported choices", () => {
  const settings = sanitizeAdvancedSettings({
    identityFidelity: 140,
    poseFidelity: -20,
    subjects: [{ direction: "  blue jacket  ", expression: "smile" }, { direction: "second" }],
    ageFidelity: 77,
    hairFidelity: 74,
    preserveSkinTexture: false,
    correctHands: true,
    camera: { framing: "full-body", angle: "invalid", lens: "85mm", depthOfField: "shallow", aperture: "f/2.8" },
    lighting: "golden-hour",
    lightingTemperature: "warm",
    timeOfDay: "sunset",
    composition: { spacing: "airy", crop: "safe", backgroundSeparation: "strong", mirrorPose: true },
    finish: { retouch: "polished", colorGrade: "cinematic", grain: "subtle", sharpness: 73 },
    output: { aspectRatio: "4:5", quality: "ultra", variantCount: 9, variationStrength: 61, seed: 42 },
  }, 2);

  assert.equal(settings.identityFidelity, 100);
  assert.equal(settings.poseFidelity, 0);
  assert.equal(settings.ageFidelity, 77);
  assert.equal(settings.preserveSkinTexture, false);
  assert.equal(settings.subjects.length, 2);
  assert.equal(settings.subjects[0].direction, "blue jacket");
  assert.equal(settings.camera.angle, "auto");
  assert.equal(settings.camera.aperture, "f/2.8");
  assert.equal(settings.composition.mirrorPose, true);
  assert.equal(settings.finish.colorGrade, "cinematic");
  assert.equal(settings.output.aspectRatio, "4:5");
  assert.equal(settings.output.quality, "medium");
  assert.equal(settings.output.variantCount, 6);
  assert.deepEqual(settings.poseCollage, { enabled: false, count: 2, layout: "auto" });
});

test("buildAdvancedPromptFragment expresses per-person and camera direction", () => {
  const settings = sanitizeAdvancedSettings({
    identityFidelity: 90,
    poseFidelity: 70,
    subjects: [{ direction: "stand on the left", expression: "relaxed" }],
    camera: { framing: "full-body", angle: "eye-level", lens: "50mm", depthOfField: "balanced" },
    lighting: "soft-studio",
    negativePrompt: "text and watermarks",
    output: { aspectRatio: "16:9", quality: "high", variantCount: 2 },
  }, 1);
  const prompt = buildAdvancedPromptFragment(settings);

  assert.match(prompt, /person 1: stand on the left/);
  assert.match(prompt, /50mm lens character/);
  assert.match(prompt, /16:9 aspect ratio/);
  assert.match(prompt, /Avoid: text and watermarks/);
  assert.deepEqual(outputSettings(settings), { aspectRatio: "16:9", quality: "high", variationStrength: 35, seed: null, negativePrompt: "text and watermarks" });
});

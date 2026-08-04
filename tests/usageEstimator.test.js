const test = require("node:test");
const assert = require("node:assert/strict");
const { RATE_DATE, estimateGenerationUsage, mergeActualUsage, batchEstimate } = require("../lib/usageEstimator");

test("OpenAI usage estimate includes token detail, rough cost, and dated rates", () => {
  const usage = estimateGenerationUsage({ engine: "openai", prompt: "portrait direction", imageCount: 2, quality: "high", aspectRatio: "4:5" });
  assert.equal(usage.source, "estimated");
  assert.equal(usage.rateDate, RATE_DATE);
  assert.ok(usage.inputTokens > 2000);
  assert.ok(usage.outputTokens > 4000);
  assert.equal(usage.totalTokens, usage.inputTokens + usage.outputTokens);
  assert.ok(usage.estimatedCostUsd > 0);
});

test("batch estimate multiplies per-image tokens and costs", () => {
  const batch = batchEstimate({ engine: "replicate", prompt: "test", imageCount: 2 }, 4);
  assert.equal(batch.variants, 4);
  assert.equal(batch.totalTokens, batch.perImage.totalTokens * 4);
  assert.equal(batch.estimatedCostUsd, 0.16);
});

test("batch estimate supports and caps six parallel outputs", () => {
  const batch = batchEstimate({ engine: "replicate", prompt: "test", imageCount: 2 }, 12);
  assert.equal(batch.variants, 6);
  assert.equal(batch.estimatedCostUsd, 0.24);
});

test("actual provider usage supersedes estimates", () => {
  const estimate = estimateGenerationUsage({ engine: "openai" });
  const merged = mergeActualUsage(estimate, { inputTokens: 120, outputTokens: 450, totalTokens: 570, source: "actual" });
  assert.equal(merged.source, "actual");
  assert.equal(merged.totalTokens, 570);
  assert.equal(merged.rateDate, RATE_DATE);
});

test("Gemini estimates follow the selected model tier", () => {
  const pro = estimateGenerationUsage({ engine: "gemini", model: "gemini-3-pro-image-preview", quality: "high" });
  const flash = estimateGenerationUsage({ engine: "gemini", model: "gemini-3.1-flash-image-preview", quality: "medium" });
  assert.equal(pro.model, "gemini-3-pro-image-preview");
  assert.equal(pro.estimatedCostUsd, 0.134);
  assert.equal(flash.estimatedCostUsd, 0.067);
});

test("ComfyUI reports no provider tokens or API cost", () => {
  const usage = estimateGenerationUsage({ engine: "comfy", model: "sdxl-openpose" });
  assert.equal(usage.model, "sdxl-openpose");
  assert.equal(usage.inputTokens, 0);
  assert.equal(usage.outputTokens, 0);
  assert.equal(usage.totalTokens, 0);
  assert.equal(usage.estimatedCostUsd, 0);
});

test("Antigravity estimates tokens while leaving plan cost undisclosed", () => {
  const usage = estimateGenerationUsage({ engine: "antigravity", model: "gemini-3.6-flash-high" });
  assert.equal(usage.model, "gemini-3.6-flash-high");
  assert.ok(usage.totalTokens > 0);
  assert.equal(usage.estimatedCostUsd, null);
  assert.match(usage.pricingNote, /G1 credit/);
});

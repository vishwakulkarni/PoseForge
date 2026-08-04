const RATE_DATE = "2026-08-03";

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function outputTokenEstimate(quality = "medium", aspectRatio = "1:1") {
  const square = { low: 272, medium: 1056, high: 4160 }[quality] || 1056;
  return Math.round(square * (aspectRatio === "1:1" ? 1 : 1.5));
}

function estimateGenerationUsage({ engine, prompt = "", imageCount = 2, quality = "medium", aspectRatio = "1:1" }) {
  const textInputTokens = Math.max(1, Math.ceil(String(prompt).length / 4));
  const imageInputTokens = Math.max(1, Number(imageCount) || 2) * 1050;
  const inputTokens = textInputTokens + imageInputTokens;
  const outputTokens = outputTokenEstimate(quality, aspectRatio);
  const totalTokens = inputTokens + outputTokens;
  let estimatedCostUsd = null;
  let pricingNote;

  if (engine === "openai") {
    estimatedCostUsd = round((textInputTokens * 5 + imageInputTokens * 10 + outputTokens * 40) / 1_000_000);
    pricingNote = "Rough GPT Image estimate: text input $5/M, image input $10/M, image output $40/M tokens.";
  } else if (engine === "replicate") {
    estimatedCostUsd = 0.04;
    pricingNote = "Rough FLUX Kontext Pro estimate of $0.04 per generated image; provider billing can change.";
  } else {
    pricingNote = "Codex CLI usage is estimated for context; dollar cost depends on your Codex plan and is not exposed to PoseForge.";
  }

  return {
    source: "estimated",
    rateDate: RATE_DATE,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    pricingNote,
  };
}

function mergeActualUsage(estimate, actual = {}) {
  if (!actual || !Object.keys(actual).length) return estimate;
  return {
    ...estimate,
    ...actual,
    source: actual.source || "actual",
    rateDate: actual.rateDate || RATE_DATE,
  };
}

function batchEstimate(input, variants = 1) {
  const perImage = estimateGenerationUsage(input);
  const count = Math.min(Math.max(Number(variants) || 1, 1), 6);
  return {
    ...perImage,
    variants: count,
    inputTokens: perImage.inputTokens * count,
    outputTokens: perImage.outputTokens * count,
    totalTokens: perImage.totalTokens * count,
    estimatedCostUsd: perImage.estimatedCostUsd == null ? null : round(perImage.estimatedCostUsd * count),
    perImage,
  };
}

module.exports = { RATE_DATE, estimateGenerationUsage, mergeActualUsage, batchEstimate };

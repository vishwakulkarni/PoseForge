/**
 * Higgsfield spend control.
 *
 * Higgsfield bills credits per successful generation and exposes no balance
 * API, so PoseForge prices every request *before* submitting it (the
 * estimate endpoint is free), enforces the user's spending limits on that
 * price, records it on the generation, and zeroes it again when Higgsfield
 * refunds a failed, moderated or canceled request. Month-to-date spend is
 * derived from those records.
 */
const { pool } = require("../../db/pool");
const logger = require("../../lib/logger");
const client = require("./client");
const { PRICING_RATE_DATE } = require("./models");

const ENGINE_KEYS = ["higgsfield", "higgsfield-video"];
const LIMIT_SETTINGS = {
  maxUsdPerGeneration: "higgsfield_max_usd_per_generation",
  monthlyBudgetUsd: "higgsfield_monthly_budget_usd",
};

const round = (value) => Math.round(value * 10_000) / 10_000;

function parseLimit(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function spendLimits() {
  const result = await pool.query("SELECT key, value FROM settings WHERE key = ANY($1)", [Object.values(LIMIT_SETTINGS)]);
  const values = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));
  return {
    maxUsdPerGeneration: parseLimit(values[LIMIT_SETTINGS.maxUsdPerGeneration]),
    monthlyBudgetUsd: parseLimit(values[LIMIT_SETTINGS.monthlyBudgetUsd]),
  };
}

/** Running and pending generations count toward the month: their credits
 * are committed even though the result has not arrived yet. */
async function monthToDateSpend() {
  const result = await pool.query(
    `SELECT usage_metrics FROM generations
     WHERE engine = ANY($1) AND status <> 'failed' AND created_at >= date_trunc('month', now())`,
    [ENGINE_KEYS]
  );
  let usd = 0;
  let credits = 0;
  for (const { usage_metrics: usage } of result.rows) {
    usd += Number(usage?.estimatedCostUsd) || 0;
    credits += Number(usage?.estimatedCredits) || 0;
  }
  return { usd: round(usd), credits: round(credits), runs: result.rows.length };
}

/** Prices one request. Prefers Higgsfield's exact estimate, falls back to the
 * model's published rate card, and returns `estimatedCostUsd: null` only
 * when neither is available. */
async function quote({ credentials, model, input, label }) {
  let estimate = null;
  try {
    estimate = await client.estimate(credentials, model.id, input);
  } catch (error) {
    // Bad credentials or an unknown model would fail the real submission
    // too, so surface those now instead of after spending time on uploads.
    if (["auth", "insufficient-credits", "not-found"].includes(error.code)) throw error;
    logger.warn("Higgsfield estimate unavailable", { model: model.id, code: error.code });
  }
  const base = { source: "estimated", rateDate: PRICING_RATE_DATE, model: model.id, billing: "higgsfield", inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  if (estimate?.usd != null) {
    const discount = estimate.discountUsd ? ` including a $${estimate.discountUsd.toFixed(3)} discount` : "";
    return {
      ...base,
      estimatedCostUsd: estimate.usd,
      estimatedCredits: estimate.credits,
      pricingSource: "higgsfield-estimate",
      pricingNote: `Higgsfield quoted ${estimate.credits ?? "?"} credits ($${estimate.usd.toFixed(3)})${discount} for this ${label}. Charged only if it succeeds.`,
    };
  }
  const perSecond = model.pricing?.usdPerSecond?.[input.resolution];
  if (perSecond && input.duration) {
    return {
      ...base,
      estimatedCostUsd: round(perSecond * input.duration),
      estimatedCredits: null,
      pricingSource: "published-rate",
      pricingNote: `Approximate: Higgsfield's published rate of $${perSecond}/s at ${input.resolution} × ${input.duration}s, before discounts. Charged only if it succeeds.`,
    };
  }
  return {
    ...base,
    estimatedCostUsd: null,
    estimatedCredits: null,
    pricingSource: "unavailable",
    pricingNote: estimate?.description || "Higgsfield did not return a price for this request; check console.higgsfield.ai for usage.",
  };
}

function limitError(message) {
  return new client.HiggsfieldError(message, { code: "spend-limit" });
}

/** Throws before anything is submitted when the quote breaks a limit. With a
 * limit set, an unpriceable request is refused rather than allowed. */
async function authorize(usage) {
  const limits = await spendLimits();
  if (limits.maxUsdPerGeneration == null && limits.monthlyBudgetUsd == null) return;
  const cost = usage.estimatedCostUsd;
  if (cost == null) {
    throw limitError("Higgsfield could not price this request, and a spending limit is set. Raise or clear the limit in Settings to run it.");
  }
  if (limits.maxUsdPerGeneration != null && cost > limits.maxUsdPerGeneration) {
    throw limitError(`This Higgsfield generation is estimated at $${cost.toFixed(2)}, above your $${limits.maxUsdPerGeneration.toFixed(2)} per-generation limit. Adjust it in Settings.`);
  }
  if (limits.monthlyBudgetUsd != null) {
    const spent = await monthToDateSpend();
    if (spent.usd + cost > limits.monthlyBudgetUsd) {
      throw limitError(`This Higgsfield generation ($${cost.toFixed(2)}) would take this month's spend to $${(spent.usd + cost).toFixed(2)}, above your $${limits.monthlyBudgetUsd.toFixed(2)} monthly budget. Adjust it in Settings.`);
    }
  }
}

/** Usage to store when a request ends without a charge. */
function refundedUsage(usage, error) {
  return {
    ...usage,
    estimatedCostUsd: 0,
    estimatedCredits: 0,
    quotedCostUsd: usage?.estimatedCostUsd ?? null,
    refunded: true,
    providerRequestId: error?.requestId || usage?.providerRequestId || null,
    pricingNote: "Not charged: Higgsfield does not bill requests that fail, are moderated, are canceled or are rejected before starting.",
  };
}

module.exports = { ENGINE_KEYS, LIMIT_SETTINGS, parseLimit, spendLimits, monthToDateSpend, quote, authorize, refundedUsage };

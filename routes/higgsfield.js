const express = require("express");
const higgsfield = require("../engines/higgsfield/client");
const billing = require("../engines/higgsfield/billing");
const { advancedRegistry } = require("../engines");
const { asyncHandler } = require("./helpers");
const router = express.Router();

/** Connection and spend overview for the Settings page. Never calls a
 * billable endpoint. */
router.get("/status", asyncHandler(async (req, res) => {
  const [ready, limits, monthToDate] = await Promise.all([higgsfield.readiness(), billing.spendLimits(), billing.monthToDateSpend()]);
  res.json({ ...ready, limits, monthToDate, consoleUrl: higgsfield.CONSOLE_URL });
}));

/** Checks typed credentials before they are saved, or the saved ones when
 * the body is empty. Uses the free estimate endpoint. */
router.post("/verify", asyncHandler(async (req, res) => {
  const typed = String(req.body?.credentials || "").trim();
  const credentials = typed || await higgsfield.resolveCredentials();
  if (!credentials) return res.json({ ok: false, code: "missing", message: "No Higgsfield credentials are configured." });
  res.json(await higgsfield.verifyCredentials(credentials));
}));

/** Prices a generator node's current settings without running it, and
 * reports whether the spending limits would allow it. */
router.post("/estimate", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const engine = advancedRegistry[body.engine];
  if (!engine || !billing.ENGINE_KEYS.includes(engine.key)) return res.status(400).json({ error: "Unknown Higgsfield engine." });
  // Quotes depend only on how many images are connected, never their
  // contents, so placeholders stand in for the frames.
  const placeholder = "estimate-only";
  const referencePaths = Array.from({ length: Math.min(Number(body.referenceCount) || 0, 10) }, () => placeholder);
  const request = {
    model: body.model,
    prompt: "Estimate",
    referencePaths,
    startFramePath: body.hasStartFrame ? placeholder : undefined,
    endFramePath: body.hasEndFrame ? placeholder : undefined,
    duration: body.duration,
    aspectRatio: body.aspectRatio,
    resolution: body.resolution,
    sound: body.sound === true,
    outputSettings: { aspectRatio: body.aspectRatio, quality: body.quality },
  };
  try {
    const usage = await engine.quoteUsage(request, { enforce: false });
    let blockedReason = null;
    try { await billing.authorize(usage); } catch (error) { blockedReason = error.message; }
    res.json({
      estimatedCostUsd: usage.estimatedCostUsd,
      estimatedCredits: usage.estimatedCredits,
      pricingSource: usage.pricingSource,
      pricingNote: usage.pricingNote,
      blockedReason,
    });
  } catch (error) {
    res.status(error.code === "auth" ? 401 : 400).json({ error: error.message });
  }
}));

module.exports = router;

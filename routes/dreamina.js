const express = require("express");
const cli = require("../engines/dreamina/cli");
const account = require("../engines/dreamina/account");
const { asyncHandler } = require("./helpers");
const router = express.Router();

// The device code completes sign-in, so it stays on the server; the browser
// only gets the code the user types and the verification link.
let pendingLogin = null;

/** Install, sign-in, canvas and credit overview for the Settings page. Only
 * runs read-only CLI commands. */
router.get("/status", asyncHandler(async (req, res) => {
  const [canvas, limits, monthToDate] = await Promise.all([account.canvas(), account.limits(), account.monthToDateCredits()]);
  const base = { installed: cli.installed(), canvas, limits, monthToDate };
  if (!base.installed) return res.json({ ...base, loggedIn: false });
  try {
    const auth = await account.authStatus();
    let membership = null;
    if (auth.loggedIn) {
      const { envelope } = await cli.run(["auth", "account"], { timeoutMs: 20_000 }).catch(() => ({ envelope: null }));
      if (envelope?.data) membership = { isVip: envelope.data.isVip === true, vipLevel: envelope.data.vipLevel || null };
    }
    res.json({ ...base, version: auth.version || null, loggedIn: auth.loggedIn === true, expiresAt: auth.expiresAt || null, region: auth.region || null, membership });
  } catch (error) {
    res.json({ ...base, loggedIn: false, error: error.message });
  }
}));

/** Starts browser sign-in and returns the code to show the user. */
router.post("/login", asyncHandler(async (req, res) => {
  const { envelope } = await cli.run(["auth", "login"], { accept: [cli.EXIT.incomplete], timeoutMs: 60_000 });
  const data = envelope?.data || envelope?.partialData || {};
  if (data.state?.loggedIn || data.loggedIn) {
    account.clearReadiness();
    return res.json({ status: "signed-in" });
  }
  const challenge = data.challenge;
  if (!challenge?.deviceCode) return res.status(502).json({ error: "Dreamina did not return a sign-in code." });
  pendingLogin = { deviceCode: challenge.deviceCode, expiresAt: challenge.expiresAt || null };
  res.json({
    status: "pending",
    userCode: challenge.userCode,
    verificationUri: challenge.verificationUriComplete || challenge.verificationUri,
    pollSeconds: challenge.pollSeconds || 5,
    expiresAt: challenge.expiresAt || null,
  });
}));

/** Checks once whether the user finished signing in in the browser. */
router.post("/login/wait", asyncHandler(async (req, res) => {
  if (!pendingLogin) return res.status(400).json({ error: "Start Dreamina sign-in first." });
  const { envelope } = await cli.run(
    ["auth", "wait", "--device-code", pendingLogin.deviceCode, "--timeout", "0"],
    { accept: [cli.EXIT.incomplete], timeoutMs: 30_000 }
  );
  const data = envelope?.data || envelope?.partialData || {};
  if (data.state?.loggedIn) {
    pendingLogin = null;
    account.clearReadiness();
    return res.json({ status: "signed-in" });
  }
  res.json({ status: "pending" });
}));

/** Creates the dedicated PoseForge canvas. Only reached from the explicit
 * Settings button; creating a canvas costs no credits. */
router.post("/canvas", asyncHandler(async (req, res) => {
  res.json(await account.createCanvas());
}));

router.use((error, req, res, next) => {
  if (!(error instanceof cli.DreaminaError)) return next(error);
  res.status(error.exitCode === cli.EXIT.loginRequired ? 401 : 502).json({ error: error.message, requestId: error.requestId || null });
});

module.exports = router;

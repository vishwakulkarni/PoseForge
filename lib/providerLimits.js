const {
  getCachedCodexRateLimits,
  getCodexRateLimits,
} = require("./codexRateLimits");
const {
  getCachedAntigravityRateLimits,
  getAntigravityRateLimits,
} = require("./antigravityRateLimits");

let refreshPromise = null;

/**
 * Refresh both CLI providers without making an HTTP request wait for either
 * process. Concurrent callers share the same refresh operation.
 */
function prefetchProviderLimits() {
  if (!refreshPromise) {
    refreshPromise = Promise.all([
      getCodexRateLimits(),
      getAntigravityRateLimits(),
    ]).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Return immediately with the last completed refresh and update in background. */
function getProviderLimitsSnapshot() {
  void prefetchProviderLimits();
  return {
    codexLimits: getCachedCodexRateLimits(),
    antigravityLimits: getCachedAntigravityRateLimits(),
  };
}

module.exports = { getProviderLimitsSnapshot, prefetchProviderLimits };

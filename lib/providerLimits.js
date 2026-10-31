const {
  getCachedCodexRateLimits,
  getCodexRateLimits,
} = require("./codexRateLimits");

let refreshPromise = null;

/**
 * Refresh the CLI provider limits without making an HTTP request wait for the
 * process. Concurrent callers share the same refresh operation.
 */
function prefetchProviderLimits() {
  if (!refreshPromise) {
    refreshPromise = getCodexRateLimits().finally(() => {
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
  };
}

module.exports = { getProviderLimitsSnapshot, prefetchProviderLimits };

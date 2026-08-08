const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

const ROOT = path.join(__dirname, "..");

function stub(relativePath, exports) {
  const resolved = require.resolve(path.join(ROOT, relativePath));
  const stubModule = new Module(resolved, null);
  stubModule.exports = exports;
  stubModule.loaded = true;
  require.cache[resolved] = stubModule;
  return resolved;
}

test("provider limit snapshots return cached data without awaiting CLI refreshes", () => {
  const never = new Promise(() => {});
  const codexPath = stub("lib/codexRateLimits.js", {
    getCachedCodexRateLimits: () => ({ available: true, weekly: { remainingPercent: 45 } }),
    getCodexRateLimits: () => never,
  });
  const antigravityPath = stub("lib/antigravityRateLimits.js", {
    getCachedAntigravityRateLimits: () => ({ available: true, groups: [] }),
    getAntigravityRateLimits: () => never,
  });
  const providerPath = require.resolve(path.join(ROOT, "lib/providerLimits.js"));
  delete require.cache[providerPath];

  try {
    const { getProviderLimitsSnapshot } = require(providerPath);
    const snapshot = getProviderLimitsSnapshot();
    assert.equal(snapshot.codexLimits.weekly.remainingPercent, 45);
    assert.equal(snapshot.antigravityLimits.available, true);
  } finally {
    delete require.cache[codexPath];
    delete require.cache[antigravityPath];
    delete require.cache[providerPath];
  }
});

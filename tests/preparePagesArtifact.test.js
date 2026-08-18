const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  APPLICATION_ROUTES,
  pruneApplicationRoutes,
} = require("../scripts/prepare-pages-artifact");

test("Pages artifact keeps landing/docs and removes every local-app route", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-pages-test-"));
  try {
    fs.writeFileSync(path.join(output, "index.html"), "landing");
    fs.mkdirSync(path.join(output, "docs"));
    fs.writeFileSync(path.join(output, "docs", "index.html"), "docs");
    for (const route of APPLICATION_ROUTES) {
      fs.mkdirSync(path.join(output, route));
      fs.writeFileSync(path.join(output, route, "index.html"), route);
    }

    assert.deepEqual(pruneApplicationRoutes(output), APPLICATION_ROUTES);
    assert.equal(fs.existsSync(path.join(output, "index.html")), true);
    assert.equal(fs.existsSync(path.join(output, "docs", "index.html")), true);
    for (const route of APPLICATION_ROUTES) {
      assert.equal(fs.existsSync(path.join(output, route)), false);
    }
  } finally {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

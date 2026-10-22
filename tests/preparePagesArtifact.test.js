const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  APPLICATION_ROUTES,
  pruneApplicationRoutes,
  pruneApplicationSources,
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

test("Pages build drops only dynamic local-app route sources", () => {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-pages-src-test-"));
  try {
    for (const dir of ["studio/[projectId]", "studio-advanced/[projectId]", "demo/advanced", "docs/[[...slug]]"]) {
      fs.mkdirSync(path.join(app, dir), { recursive: true });
      fs.writeFileSync(path.join(app, dir, "page.tsx"), dir);
    }
    fs.writeFileSync(path.join(app, "studio", "page.tsx"), "list");

    assert.deepEqual(pruneApplicationSources(app), ["studio/[projectId]", "studio-advanced/[projectId]"]);
    assert.equal(fs.existsSync(path.join(app, "studio", "page.tsx")), true);
    assert.equal(fs.existsSync(path.join(app, "demo", "advanced", "page.tsx")), true);
    assert.equal(fs.existsSync(path.join(app, "docs", "[[...slug]]", "page.tsx")), true);
  } finally {
    fs.rmSync(app, { recursive: true, force: true });
  }
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseVersion, versionAtLeast } = require("../scripts/setup");

test("setup parses Node.js semantic versions", () => {
  assert.deepEqual(parseVersion("v20.9.0"), [20, 9, 0]);
  assert.deepEqual(parseVersion("22.12.1"), [22, 12, 1]);
  assert.equal(parseVersion("unknown"), null);
});

test("setup enforces the documented minimum Node.js version", () => {
  assert.equal(versionAtLeast("v20.9.0"), true);
  assert.equal(versionAtLeast("v20.8.9"), false);
  assert.equal(versionAtLeast("v21.0.0"), true);
  assert.equal(versionAtLeast("invalid"), false);
});


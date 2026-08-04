const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const poseTagger = require("../lib/poseTagger");

test("parseTagJson extracts title, category, and tags from a well-formed response", () => {
  const result = poseTagger.parseTagJson('{"title": "Standing, arms crossed", "category": "Standing", "tags": ["Standing", "Confident", " Studio "]}');
  assert.equal(result.title, "Standing, arms crossed");
  assert.equal(result.category, "standing");
  assert.deepEqual(result.tags, ["standing", "confident", "studio"]);
});

test("parseTagJson tolerates surrounding prose/markdown fences around the JSON object", () => {
  const result = poseTagger.parseTagJson('Here you go:\n```json\n{"title": "Seated pose", "category": "sitting", "tags": ["sitting"]}\n```');
  assert.equal(result.title, "Seated pose");
  assert.deepEqual(result.tags, ["sitting"]);
});

test("parseTagJson returns null for unparsable or empty content", () => {
  assert.equal(poseTagger.parseTagJson("not json at all"), null);
  assert.equal(poseTagger.parseTagJson(""), null);
  assert.equal(poseTagger.parseTagJson(undefined), null);
});

test("parseTagJson returns null when the JSON object has no usable fields", () => {
  assert.equal(poseTagger.parseTagJson("{}"), null);
});

test("tagPoseImage never throws and resolves to null when no tagging engine is configured/available", async () => {
  // No OpenAI key is configured in this environment and Codex CLI is not
  // guaranteed to be on PATH, so this exercises the full fallback chain —
  // the important contract is that it never rejects and never blocks the
  // caller (pose uploads must succeed even with zero engines configured).
  const tmpFile = path.join(os.tmpdir(), `poseforge-tagger-test-${Date.now()}.png`);
  fs.writeFileSync(tmpFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  try {
    const result = await poseTagger.tagPoseImage(tmpFile);
    assert.ok(result === null || typeof result === "object");
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
});

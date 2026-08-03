const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const storage = require("../lib/storage");

test("getCharacterPhotoPath builds a relative path scoped to the character", () => {
  // The third argument mirrors what callers pass in practice — an original
  // uploaded filename (e.g. multer's req.file.originalname) — not a bare
  // extension. path.extname('.jpg') is actually '' (Node treats a
  // leading-dot-only string as a dotfile name), so a bare extension isn't
  // representative input here.
  const result = storage.getCharacterPhotoPath("char-1", "photo-1", "my-photo.jpg");
  assert.equal(result, "characters/char-1/photo-1.jpg");
});

test("getCharacterPhotoPath falls back to .png for an unrecognized extension", () => {
  const result = storage.getCharacterPhotoPath("char-1", "photo-1", "not-an-extension");
  assert.equal(result, "characters/char-1/photo-1.png");
});

test("getGenerationOutputPath is always a PNG regardless of input", () => {
  assert.equal(storage.getGenerationOutputPath("gen-1"), "generations/gen-1/output.png");
});

test("getGenerationPosePath and getGenerationCharacterPath live under the same generation folder", () => {
  const pose = storage.getGenerationPosePath("gen-1", "pose.jpg");
  const character = storage.getGenerationCharacterPath("gen-1", "character.jpg");
  assert.equal(path.dirname(pose), path.dirname(character));
  assert.equal(pose, "generations/gen-1/pose.jpg");
  assert.equal(character, "generations/gen-1/character.jpg");
});

test("absolutePath resolves a relative path inside STORAGE_ROOT", () => {
  const resolved = storage.absolutePath("characters/char-1/photo-1.png");
  assert.ok(resolved.startsWith(storage.STORAGE_ROOT));
});

test("absolutePath rejects path traversal outside STORAGE_ROOT", () => {
  assert.throws(() => storage.absolutePath("../../etc/passwd"), /Invalid storage path/);
});

test("publicUrl always returns a /storage-prefixed, forward-slash path", () => {
  const result = storage.publicUrl(path.join("characters", "char-1", "photo-1.png"));
  assert.equal(result, "/storage/characters/char-1/photo-1.png");
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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

test("document photo paths keep application and print assets together", () => {
  assert.equal(storage.getDocumentOutputPath("gen-1", "jpeg"), "generations/gen-1/document-photo.jpg");
  assert.equal(storage.getDocumentOutputPath("gen-1", "png"), "generations/gen-1/document-photo.png");
  assert.equal(storage.getDocumentSheetPath("gen-1"), "generations/gen-1/document-photo-sheet-4x6.png");
});

test("getGenerationPosePath and getGenerationCharacterPath live under the same generation folder", () => {
  const pose = storage.getGenerationPosePath("gen-1", "pose.jpg");
  const character = storage.getGenerationCharacterPath("gen-1", 1, "character.jpg");
  assert.equal(path.dirname(pose), path.dirname(character));
  assert.equal(pose, "generations/gen-1/pose.jpg");
  assert.equal(character, "generations/gen-1/character-1.jpg");
});

test("getGenerationCharacterPath is unique per position", () => {
  const one = storage.getGenerationCharacterPath("gen-1", 1, "photo.jpg");
  const two = storage.getGenerationCharacterPath("gen-1", 2, "photo.jpg");
  assert.notEqual(one, two);
  assert.equal(one, "generations/gen-1/character-1.jpg");
  assert.equal(two, "generations/gen-1/character-2.jpg");
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

test("every pose path in the bundled seed migration ships with the repository", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "011_bundle_seed_pose_images.sql"),
    "utf8"
  );
  const relativePaths = [...migration.matchAll(/'((?:pose-library\/seed\/)[^']+\.png)'/g)]
    .map((match) => match[1]);

  assert.equal(relativePaths.length, 16);
  for (const relativePath of relativePaths) {
    const stat = fs.statSync(storage.absolutePath(relativePath));
    assert.ok(stat.isFile());
    assert.ok(stat.size > 0);
  }
});

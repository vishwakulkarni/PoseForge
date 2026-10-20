const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_MODE = "pglite";
process.env.PGLITE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-examples-"));

const storageRoot = path.join(__dirname, "..", "storage");
const { pool } = require("../db/pool");
const { runMigrations } = require("../db/migrate");
const { seedExampleProjects } = require("../lib/exampleProjects");
const { sanitizeStudioDocument } = require("../lib/studioProject");
const { resolveGenerateInputs } = require("../lib/studioPipeline");
const { sanitizeAdvancedDocument } = require("../lib/advancedStudioProject");

test.before(runMigrations);
test.after(async () => {
  // The seed copies photos into the real storage root; leave none behind.
  const rows = (await pool.query(
    "SELECT file_path FROM character_photos UNION ALL SELECT document->'nodes'->1->'data'->>'imageUrl' FROM studio_projects WHERE workspace = 'advanced'"
  )).rows;
  for (const { file_path } of rows) {
    const rel = String(file_path).replace(/^\/storage\//, "");
    fs.rmSync(path.dirname(path.join(storageRoot, rel)), { recursive: true, force: true });
  }
  await pool.end();
});

test("seeds a runnable example into each studio exactly once", async () => {
  assert.equal(await seedExampleProjects(), true);
  assert.equal(await seedExampleProjects(), false);

  const studio = (await pool.query("SELECT document FROM studio_projects WHERE workspace = 'studio'")).rows;
  assert.equal(studio.length, 1);
  const doc = sanitizeStudioDocument(studio[0].document);
  const inputs = resolveGenerateInputs(doc, "generate");
  assert.deepEqual(inputs.errors, []);
  assert.equal(inputs.characterSources.length, 2);
  assert.ok(inputs.characterSources.every((source) => source.characterId));
  assert.ok(inputs.poseSource.referenceId);

  const adv = (await pool.query("SELECT document FROM studio_projects WHERE workspace = 'advanced'")).rows;
  assert.equal(adv.length, 1);
  const advanced = sanitizeAdvancedDocument(adv[0].document);
  assert.equal(advanced.nodes.length, 5);
  assert.equal(advanced.edges.length, 4);

  const photos = (await pool.query("SELECT file_path FROM character_photos")).rows;
  assert.equal(photos.length, 2);
  for (const { file_path } of photos) assert.ok(fs.existsSync(path.join(__dirname, "..", "storage", file_path)));
});

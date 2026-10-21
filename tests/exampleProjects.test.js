const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.DATABASE_MODE = "pglite";
process.env.PGLITE_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "poseforge-examples-"));

const storageRoot = path.join(__dirname, "..", "storage");
const publicRoot = path.join(__dirname, "..", "web", "public");
const { pool } = require("../db/pool");
const { runMigrations } = require("../db/migrate");
const { seedExampleProjects, EXAMPLES } = require("../lib/exampleProjects");
const { sanitizeStudioDocument } = require("../lib/studioProject");
const { resolveGenerateInputs } = require("../lib/studioPipeline");
const { sanitizeAdvancedDocument } = require("../lib/advancedStudioProject");

test.before(runMigrations);
test.after(async () => {
  // The seed copies photos into the real storage root; leave none behind.
  const files = [
    ...(await pool.query("SELECT file_path FROM character_photos")).rows,
    ...(await pool.query("SELECT file_path FROM pose_references WHERE category = 'Example'")).rows,
  ].map((row) => path.join(storageRoot, row.file_path));
  const dirs = (await pool.query("SELECT id FROM studio_projects WHERE workspace = 'advanced'")).rows
    .map((row) => path.join(storageRoot, "advanced", row.id));
  const characterDirs = (await pool.query("SELECT character_id FROM character_photos")).rows
    .map((row) => path.join(storageRoot, "characters", row.character_id));
  const generationDirs = (await pool.query("SELECT id FROM generations")).rows
    .map((row) => path.join(storageRoot, "generations", row.id));
  for (const target of [...files, ...dirs, ...characterDirs, ...generationDirs]) fs.rmSync(target, { recursive: true, force: true });
  await pool.end();
});

const projects = async (workspace) => (await pool.query(
  "SELECT name, document FROM studio_projects WHERE workspace = $1 ORDER BY created_at, name",
  [workspace]
)).rows;

test("seeds a runnable example per entry into each studio exactly once", async () => {
  assert.equal(await seedExampleProjects(), EXAMPLES.length);
  assert.equal(await seedExampleProjects(), 0);

  const studio = await projects("studio");
  assert.equal(studio.length, EXAMPLES.length);
  for (const row of studio) {
    const doc = sanitizeStudioDocument(row.document);
    const inputs = resolveGenerateInputs(doc, "generate");
    assert.deepEqual(inputs.errors, [], row.name);
    assert.ok(inputs.characterSources.every((source) => source.characterId), row.name);
    assert.ok(inputs.poseSource.referenceId, row.name);
  }

  const advanced = await projects("advanced");
  assert.equal(advanced.length, EXAMPLES.length);
  for (const [index, row] of advanced.entries()) {
    const doc = sanitizeAdvancedDocument(row.document);
    const generators = doc.nodes.filter((node) => node.type === "imageGenerator");
    assert.equal(generators.length, EXAMPLES[index].poses.length, row.name);
    // Every generator is fed the prompt, every character, and its own pose.
    for (const generator of generators) {
      const incoming = doc.edges.filter((edge) => edge.target === generator.id);
      assert.equal(incoming.length, 2 + EXAMPLES[index].characters.length, row.name);
    }
  }
});

test("saves the home-page family example with its poses, character and result", async () => {
  const family = EXAMPLES.find((example) => example.flag.endsWith("nri-family"));
  const studio = sanitizeStudioDocument((await projects("studio")).find((row) => row.name === family.name).document);

  // The result is a real generation: an ordinary result node, a history row,
  // and an output file in storage (not a shipped demo file a delete could remove).
  const result = studio.nodes.find((node) => node.kind === "result");
  assert.equal(result.id, `result-${result.generationId}`);
  assert.ok(fs.existsSync(path.join(storageRoot, result.imageUrl.replace(/^\/storage\//, ""))));
  assert.equal((await pool.query("SELECT 1 FROM generations WHERE id = $1 AND status = 'completed'", [result.generationId])).rowCount, 1);
  assert.equal((await pool.query("SELECT 1 FROM generation_characters WHERE generation_id = $1", [result.generationId])).rowCount, 1);
  assert.ok(fs.existsSync(path.join(publicRoot, "demo", family.poses[0].result)), "demo result ships with the repo");
  assert.equal((await pool.query("SELECT 1 FROM characters WHERE name = $1", [family.characters[0].name])).rowCount, 1);
  assert.equal((await pool.query("SELECT 1 FROM pose_references WHERE title = $1 AND file_path IS NOT NULL", [family.poses[0].title])).rowCount, 1);
});

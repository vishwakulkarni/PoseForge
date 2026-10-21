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
const { seedExampleProjects, EXAMPLES, ADVANCED_SNAPSHOTS } = require("../lib/exampleProjects");
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
  assert.equal(await seedExampleProjects(), EXAMPLES.length + ADVANCED_SNAPSHOTS.length);
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

  // Advanced Studio: each generated example, then the saved snapshots. The
  // family example is Studio only.
  const advancedExamples = EXAMPLES.filter((example) => example.advanced !== false);
  const advanced = await projects("advanced");
  assert.equal(advanced.length, advancedExamples.length + ADVANCED_SNAPSHOTS.length);
  assert.ok(!advanced.some((row) => row.name === "Example: family, walking pose"));
  assert.ok(advanced.some((row) => row.name === "Example: two characters, hand in hand"));
  for (const [index, example] of advancedExamples.entries()) {
    const row = advanced.find((item) => item.name === example.name);
    const doc = sanitizeAdvancedDocument(row.document);
    const generators = doc.nodes.filter((node) => node.type === "imageGenerator");
    assert.equal(generators.length, example.poses.length, row.name);
    // Every generator is fed its prompt, every character, and its own pose.
    for (const generator of generators) {
      const incoming = doc.edges.filter((edge) => edge.target === generator.id);
      assert.equal(incoming.length, 2 + example.characters.length, row.name);
    }
    // One structured (JSON) prompt per generator, detailed enough to steer the output.
    const prompts = doc.nodes.filter((node) => node.type === "text");
    assert.equal(prompts.length, example.poses.length, row.name);
    for (const prompt of prompts) {
      assert.equal(prompt.data.mode, "structured", row.name);
      const spec = JSON.parse(prompt.data.text);
      for (const key of ["task", "inputs", "pose", "camera", "environment", "lighting", "style", "constraints", "avoid", "output"]) {
        assert.ok(key in spec, `${row.name}: prompt has "${key}"`);
      }
      assert.ok(spec.constraints.length >= 3, row.name);
    }
  }
});

test("seeds the baby-running workflow with its media copied into the project", async () => {
  const snapshot = ADVANCED_SNAPSHOTS.find((item) => item.flag.endsWith("baby-running"));
  const row = (await pool.query(
    "SELECT id, document FROM studio_projects WHERE workspace = 'advanced' AND name = $1", [snapshot.name]
  )).rows[0];
  const doc = sanitizeAdvancedDocument(row.document);
  assert.equal(doc.nodes.filter((node) => node.type === "imageGenerator").length, 6);
  assert.equal(doc.nodes.filter((node) => node.type === "videoGenerator").length, 3);

  const urls = [];
  for (const node of doc.nodes) {
    for (const result of node.data.results || []) {
      // Keep each file's real type: videos stay .mp4, images stay .jpg.
      if (result.videoUrl) assert.match(result.videoUrl, /\.mp4$/);
      if (result.imageUrl) assert.match(result.imageUrl, /\.jpg$/);
      urls.push(result.imageUrl || result.videoUrl);
    }
  }
  assert.ok(urls.length >= 9);
  for (const url of urls) {
    assert.ok(url.startsWith(`/storage/advanced/${row.id}/`), url);
    assert.ok(fs.existsSync(path.join(storageRoot, url.replace(/^\/storage\//, ""))), url);
  }
  assert.ok(!JSON.stringify(row.document).includes("/demo/"), "no shipped-demo URL left in the project");
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

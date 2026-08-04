/**
 * Smoke tests against a real database. These validate that migrations
 * actually produce a usable schema — but a contributor without Postgres
 * running locally shouldn't have `npm test` fail outright, so every test
 * here skips itself gracefully if the database isn't reachable.
 *
 * CI runs these against a real Postgres service container (see
 * .github/workflows/ci.yml) after running `npm run migrate`, so they do
 * get exercised for real on every PR.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { pool } = require("../db/pool");

async function databaseReachable() {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch (_) {
    return false;
  }
}

test("database schema and seed data", async (t) => {
  if (!(await databaseReachable())) {
    t.skip("No reachable Postgres database (DATABASE_URL) — skipping DB smoke tests.");
    return;
  }

  await t.test("core tables exist", async () => {
    const tables = ["characters", "character_photos", "presets", "settings", "generations", "pose_references", "generation_characters", "studio_recipes"];
    for (const table of tables) {
      const result = await pool.query("SELECT to_regclass($1) AS exists", [table]);
      assert.ok(result.rows[0].exists, `expected table "${table}" to exist — did you run npm run migrate?`);
    }
  });

  await t.test("presets seed data is present", async () => {
    const result = await pool.query("SELECT type, COUNT(*)::int AS count FROM presets GROUP BY type");
    const counts = Object.fromEntries(result.rows.map((row) => [row.type, row.count]));
    assert.ok((counts.background || 0) >= 1, "expected at least one seeded background preset");
    assert.ok((counts.style || 0) >= 1, "expected at least one seeded style preset");
  });

  await t.test("generations.character_id uses ON DELETE SET NULL", async () => {
    const result = await pool.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'generations'::regclass AND conname LIKE '%character_id%'
    `);
    const hasSetNull = result.rows.some((row) => row.confdeltype === "n");
    assert.ok(hasSetNull, "expected generations.character_id foreign key to be ON DELETE SET NULL");
  });

  await t.test("pose reference seed data is present", async () => {
    const result = await pool.query("SELECT COUNT(*)::int AS count FROM pose_references WHERE is_custom = false");
    assert.ok(result.rows[0].count >= 70, "expected the original 20 plus 50 curated pose references");
    const audiences = await pool.query("SELECT tag, COUNT(*)::int AS count FROM unnest(ARRAY['male','female','couple','family']) tag GROUP BY tag ORDER BY tag");
    for (const audience of audiences.rows) {
      const tagged = await pool.query("SELECT COUNT(*)::int AS count FROM pose_references WHERE $1 = ANY(tags)", [audience.tag]);
      assert.ok(tagged.rows[0].count >= 10, `expected at least 10 ${audience.tag} pose references`);
    }
  });

  await t.test("pose sources keep provider and canonical-page provenance", async () => {
    const result = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'pose_references' AND column_name = ANY($1::text[])`, [["source_provider", "source_page_url"]]);
    assert.equal(result.rowCount, 2);
    const unsplash = await pool.query("SELECT COUNT(*)::int AS count FROM pose_references WHERE source_provider = 'Unsplash' AND source_page_url LIKE 'https://unsplash.com/photos/%'");
    assert.equal(unsplash.rows[0].count, 50);
  });

  await t.test("generations.pose_reference_id uses ON DELETE SET NULL", async () => {
    const result = await pool.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'generations'::regclass AND conname LIKE '%pose_reference_id%'
    `);
    const hasSetNull = result.rows.some((row) => row.confdeltype === "n");
    assert.ok(hasSetNull, "expected generations.pose_reference_id foreign key to be ON DELETE SET NULL");
  });

  await t.test("generation_characters.generation_id cascades on delete, character_id sets null", async () => {
    const genResult = await pool.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'generation_characters'::regclass AND conname LIKE '%generation_id%'
    `);
    assert.ok(genResult.rows.some((row) => row.confdeltype === "c"), "expected generation_characters.generation_id to be ON DELETE CASCADE");
    const charResult = await pool.query(`
      SELECT confdeltype FROM pg_constraint
      WHERE conrelid = 'generation_characters'::regclass AND conname LIKE '%character_id%' AND conname NOT LIKE '%generation_id%'
    `);
    assert.ok(charResult.rows.some((row) => row.confdeltype === "n"), "expected generation_characters.character_id to be ON DELETE SET NULL");
  });

  await t.test("generation_characters.position is constrained to 1-4", async () => {
    const result = await pool.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid = 'generation_characters'::regclass AND contype = 'c'
    `);
    const hasRangeCheck = result.rows.some((row) => /position/.test(row.def) && /[1-4]/.test(row.def));
    assert.ok(hasRangeCheck, "expected a CHECK constraint bounding generation_characters.position to 1-4");
  });

  await t.test("advanced Studio columns are available on generations", async () => {
    const result = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'generations' AND column_name = ANY($1::text[])
    `, [["studio_mode", "advanced_settings", "batch_id"]]);
    const columns = Object.fromEntries(result.rows.map((row) => [row.column_name, row.data_type]));
    assert.equal(columns.studio_mode, "text");
    assert.equal(columns.advanced_settings, "jsonb");
    assert.equal(columns.batch_id, "uuid");
  });

  await t.test("generation usage metadata is available", async () => {
    const result = await pool.query(`
      SELECT data_type, column_default FROM information_schema.columns
      WHERE table_name = 'generations' AND column_name = 'usage_metrics'
    `);
    assert.equal(result.rows[0]?.data_type, "jsonb");
    assert.match(result.rows[0]?.column_default || "", /jsonb/);
  });
});

test.after(async () => {
  await pool.end().catch(() => {});
});

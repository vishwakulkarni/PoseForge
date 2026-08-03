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
    const tables = ["characters", "character_photos", "presets", "settings", "generations"];
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
});

test.after(async () => {
  await pool.end().catch(() => {});
});

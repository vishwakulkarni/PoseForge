#!/usr/bin/env node
require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

async function runMigrations() {
  await pool.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, run_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );

  const directory = path.join(__dirname, "migrations");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
  const applied = new Set(
    (await pool.query("SELECT filename FROM schema_migrations")).rows.map((row) => row.filename)
  );

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = fs.readFileSync(path.join(directory, filename), "utf8");
    try {
      await pool.transaction(async (transaction) => {
        await transaction.exec(sql);
        await transaction.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      });
      console.log(`[db] applied ${filename}`);
    } catch (error) {
      throw new Error(`Migration ${filename} failed: ${error.message}`);
    }
  }

  console.log("[db] migrations complete");
}

if (require.main === module) {
  runMigrations()
    .catch((error) => {
      console.error(`[db] migration failed: ${error.message || error.code || String(error)}`);
      process.exitCode = 1;
    })
    .finally(() => pool.end().catch(() => {}));
}

module.exports = { runMigrations };

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { pool } = require("./pool");

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, run_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const dir = path.join(__dirname, "migrations");
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".sql")).sort();
    const applied = new Set((await client.query("SELECT filename FROM schema_migrations")).rows.map((row) => row.filename));
    for (const filename of files) {
      if (applied.has(filename)) continue;
      const sql = fs.readFileSync(path.join(dir, filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log(`[db] applied ${filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${filename} failed: ${err.message}`);
      }
    }
    console.log("[db] migrations complete");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error(`[db] migration failed: ${err.message || err.code || String(err)}`);
  process.exitCode = 1;
});

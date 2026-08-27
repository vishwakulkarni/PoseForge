#!/usr/bin/env node

require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { pool } = require("../db/pool");

const ROOT = path.resolve(__dirname, "..");
const SEED_DIRECTORY = path.join(ROOT, "storage", "pose-library", "seed");

async function verify() {
  const files = fs.readdirSync(SEED_DIRECTORY).filter((file) => file.endsWith(".png"));
  if (files.length < 16) {
    throw new Error(`Expected at least 16 bundled pose images, found ${files.length}. Restore storage/pose-library/seed from Git.`);
  }
  const result = await pool.query(
    "SELECT file_path FROM pose_references WHERE file_path LIKE 'pose-library/seed/%' ORDER BY file_path"
  );
  if (result.rowCount < 16) {
    throw new Error(`Expected at least 16 bundled poses in the database, found ${result.rowCount}. Run npm run migrate and retry.`);
  }
  const missing = result.rows
    .map((row) => path.join(ROOT, "storage", row.file_path))
    .filter((filePath) => !fs.existsSync(filePath));
  if (missing.length) {
    throw new Error(`The database references ${missing.length} missing bundled pose file(s). Restore storage/pose-library/seed from Git.`);
  }
  console.log(`[setup] Verified the database and ${result.rowCount} bundled offline poses.`);
}

verify()
  .catch((error) => {
    console.error(`[setup] Verification failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end().catch(() => {}));

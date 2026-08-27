#!/usr/bin/env node
require("dotenv").config({ quiet: true });

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { Pool } = require("pg");
const { PGlite } = require("@electric-sql/pglite");
const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");

const ROOT = path.resolve(__dirname, "..");
const TABLES = [
  "characters",
  "character_photos",
  "presets",
  "settings",
  "pose_references",
  "studio_recipes",
  "studio_projects",
  "studio_composition_revisions",
  "studio_runs",
  "generations",
  "generation_characters",
  "character_profile_sets",
  "character_profile_views",
];

function quoteIdentifier(identifier) {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe database identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

function normalizeValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : value;
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return Buffer.from(value).toString("base64");
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalizeValue(value[key])])
    );
  }
  return value;
}

function tableDigest(rows) {
  const canonicalRows = rows.map((row) => JSON.stringify(normalizeValue(row))).sort();
  return crypto.createHash("sha256").update(canonicalRows.join("\n")).digest("hex");
}

function migrationTimestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

async function listApplicationTables(database) {
  const result = await database.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = $2 ORDER BY table_name",
    ["public", "BASE TABLE"]
  );
  return result.rows.map((row) => row.table_name).filter((table) => table !== "schema_migrations");
}

async function columnMetadata(database, table) {
  const result = await database.query(
    `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  return result.rows;
}

function valueForTarget(value, column) {
  if (value === null || value === undefined) return value;
  if (column.data_type === "json" || column.data_type === "jsonb") {
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function readTable(database, table) {
  return (await database.query(`SELECT * FROM ${quoteIdentifier(table)}`)).rows;
}

async function insertRows(transaction, table, columns, rows) {
  if (!rows.length) return;
  const names = columns.map((column) => quoteIdentifier(column.column_name));
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const sql = `INSERT INTO ${quoteIdentifier(table)} (${names.join(", ")}) VALUES (${placeholders.join(", ")})`;

  for (const row of rows) {
    const values = columns.map((column) => {
      if (table === "generations" && column.column_name === "parent_generation_id") return null;
      return valueForTarget(row[column.column_name], column);
    });
    await transaction.query(sql, values);
  }

  if (table === "generations") {
    for (const row of rows) {
      if (!row.parent_generation_id) continue;
      await transaction.query(
        "UPDATE generations SET parent_generation_id = $2 WHERE id = $1",
        [row.id, row.parent_generation_id]
      );
    }
  }
}

function applyMigrations(targetDirectory) {
  const result = spawnSync(process.execPath, [path.join(ROOT, "db", "migrate.js")], {
    cwd: ROOT,
    env: {
      ...process.env,
      DATABASE_MODE: "pglite",
      PGLITE_DATA_DIR: targetDirectory,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Could not initialize the temporary PGlite database.");
}

async function validateCopy(target, sourceRows) {
  const counts = {};
  for (const table of TABLES) {
    const targetRows = await readTable(target, table);
    const expectedRows = sourceRows.get(table);
    if (targetRows.length !== expectedRows.length) {
      throw new Error(`${table}: expected ${expectedRows.length} rows, copied ${targetRows.length}.`);
    }
    if (tableDigest(targetRows) !== tableDigest(expectedRows)) {
      throw new Error(`${table}: copied rows do not match PostgreSQL.`);
    }
    counts[table] = targetRows.length;
  }
  return counts;
}

function swapDirectories(targetDirectory, temporaryDirectory) {
  const backupDirectory = `${targetDirectory}.backup-${migrationTimestamp()}`;
  const targetExists = fs.existsSync(targetDirectory);
  if (targetExists) fs.renameSync(targetDirectory, backupDirectory);
  try {
    fs.renameSync(temporaryDirectory, targetDirectory);
  } catch (error) {
    if (targetExists && fs.existsSync(backupDirectory) && !fs.existsSync(targetDirectory)) {
      fs.renameSync(backupDirectory, targetDirectory);
    }
    throw error;
  }
  return targetExists ? backupDirectory : null;
}

async function main() {
  if (!process.argv.includes("--yes")) {
    throw new Error("This command replaces the PGlite data directory after backing it up. Rerun with --yes to continue.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must point to the PostgreSQL database to import.");
  }

  const configuredTarget = process.env.PGLITE_DATA_DIR || "storage/pglite";
  if (configuredTarget === ":memory:") throw new Error("PGLITE_DATA_DIR must be persistent for an import.");
  const targetDirectory = path.isAbsolute(configuredTarget)
    ? configuredTarget
    : path.resolve(ROOT, configuredTarget);
  fs.mkdirSync(path.dirname(targetDirectory), { recursive: true });
  const temporaryDirectory = fs.mkdtempSync(path.join(path.dirname(targetDirectory), ".pglite-import-"));

  const sourcePool = new Pool({ connectionString: process.env.DATABASE_URL });
  let source;
  let temporaryTarget;
  try {
    source = await sourcePool.connect();
    await source.query("SELECT 1");
    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const discoveredTables = await listApplicationTables(source);
    const expectedTables = [...TABLES].sort();
    if (JSON.stringify(discoveredTables) !== JSON.stringify(expectedTables)) {
      throw new Error(
        `PostgreSQL table set differs from the importer. Found: ${discoveredTables.join(", ")}`
      );
    }

    const sourceRows = new Map();
    const columns = new Map();
    for (const table of TABLES) {
      sourceRows.set(table, await readTable(source, table));
      columns.set(table, await columnMetadata(source, table));
    }
    await source.query("COMMIT");
    source.release();
    source = null;
    await sourcePool.end();

    applyMigrations(temporaryDirectory);
    temporaryTarget = new PGlite(temporaryDirectory, { extensions: { pgcrypto } });
    await temporaryTarget.waitReady;

    await temporaryTarget.transaction(async (transaction) => {
      await transaction.exec(`TRUNCATE TABLE ${TABLES.map(quoteIdentifier).join(", ")} CASCADE`);
      for (const table of TABLES) {
        await insertRows(transaction, table, columns.get(table), sourceRows.get(table));
      }
    });

    const counts = await validateCopy(temporaryTarget, sourceRows);
    await temporaryTarget.close();
    temporaryTarget = null;

    const backupDirectory = swapDirectories(targetDirectory, temporaryDirectory);
    const installed = new PGlite(targetDirectory, { extensions: { pgcrypto } });
    await installed.waitReady;
    try {
      await validateCopy(installed, sourceRows);
    } finally {
      await installed.close();
    }

    console.log(`[db-import] PostgreSQL data copied to ${targetDirectory}`);
    if (backupDirectory) console.log(`[db-import] Previous PGlite backup: ${backupDirectory}`);
    console.log(`[db-import] Row counts: ${JSON.stringify(counts)}`);
  } catch (error) {
    if (temporaryTarget) await temporaryTarget.close().catch(() => {});
    if (source) {
      await source.query("ROLLBACK").catch(() => {});
      source.release();
    }
    await sourcePool.end().catch(() => {});
    if (fs.existsSync(temporaryDirectory)) fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[db-import] failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { TABLES, normalizeValue, tableDigest, valueForTarget };

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const mode = String(process.env.DATABASE_MODE || "pglite").trim().toLowerCase();

if (!["pglite", "postgres"].includes(mode)) {
  throw new Error(`Unsupported DATABASE_MODE "${mode}". Use "pglite" or "postgres".`);
}

const configuredDataDir = process.env.PGLITE_DATA_DIR || "storage/pglite";
const pgliteInMemory = configuredDataDir === ":memory:";
const pgliteDataDir = pgliteInMemory
  ? null
  : path.isAbsolute(configuredDataDir)
    ? configuredDataDir
    : path.resolve(ROOT, configuredDataDir);

let backendPromise;

function normalizeResult(result = {}) {
  const rows = result.rows || [];
  return {
    ...result,
    rows,
    rowCount: result.rowCount ?? result.affectedRows ?? rows.length,
  };
}

function postgresClient(client) {
  return {
    query: async (sql, params = []) => normalizeResult(await client.query(sql, params)),
    exec: async (sql) => normalizeResult(await client.query(sql)),
  };
}

function pgliteClient(client) {
  return {
    query: async (sql, params = []) => normalizeResult(await client.query(sql, params)),
    exec: async (sql) => client.exec(sql),
  };
}

async function createBackend() {
  if (mode === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when DATABASE_MODE=postgres.");
    }
    const { Pool } = require("pg");
    const clientPool = new Pool({ connectionString: process.env.DATABASE_URL });
    clientPool.on("error", (error) => console.error("[db] idle PostgreSQL client error:", error.message));
    return { kind: "postgres", client: clientPool };
  }

  if (pgliteDataDir) fs.mkdirSync(path.dirname(pgliteDataDir), { recursive: true });
  const { PGlite } = require("@electric-sql/pglite");
  const { pgcrypto } = require("@electric-sql/pglite/contrib/pgcrypto");
  const options = { extensions: { pgcrypto } };
  const client = pgliteDataDir ? new PGlite(pgliteDataDir, options) : new PGlite(options);
  await client.waitReady;
  return { kind: "pglite", client };
}

function getBackend() {
  backendPromise ||= createBackend();
  return backendPromise;
}

const pool = {
  mode,
  dataDir: mode === "pglite" ? pgliteDataDir : null,

  async query(sql, params = []) {
    const backend = await getBackend();
    return backend.kind === "postgres"
      ? postgresClient(backend.client).query(sql, params)
      : pgliteClient(backend.client).query(sql, params);
  },

  async transaction(callback) {
    const backend = await getBackend();
    if (backend.kind === "postgres") {
      const client = await backend.client.connect();
      try {
        await client.query("BEGIN");
        const result = await callback(postgresClient(client));
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }

    return backend.client.transaction((transaction) => callback(pgliteClient(transaction)));
  },

  async end() {
    if (!backendPromise) return;
    const backend = await backendPromise;
    if (typeof backend.client.end === "function") await backend.client.end();
    else if (typeof backend.client.close === "function") await backend.client.close();
  },
};

module.exports = {
  pool,
  databaseConfig: { mode, pgliteDataDir: mode === "pglite" ? pgliteDataDir : null },
};

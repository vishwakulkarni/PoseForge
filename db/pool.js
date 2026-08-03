require("dotenv").config({ quiet: true });
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (err) => console.error("[db] idle client error:", err.message));

module.exports = { pool };

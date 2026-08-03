/**
 * Generation run history — both successes and failures — so the UI can show
 * "previous runs" and let the user redo a past character/pose combination.
 * Backed by `data/runs.json` via JsonStore. Capped at MAX_RUNS, oldest
 * dropped first.
 */

const path = require("path");
const crypto = require("crypto");

const { JsonStore } = require("./jsonStore");

const ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT, "data", "runs.json");
const MAX_RUNS = 200;

const store = new JsonStore(DATA_FILE, []);

/**
 * @param {object} entry
 * @param {"ok"|"error"} entry.status
 * @param {number} entry.durationMs
 * @param {{type:"saved"|"upload", name?:string, uploadId?:string, thumbUrl?:string}} entry.character
 * @param {{uploadId?:string, thumbUrl?:string}} entry.pose
 * @param {string} [entry.resultUrl]
 * @param {string} [entry.error]
 */
async function recordRun(entry) {
  const run = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  await store.update((runs) => [run, ...runs].slice(0, MAX_RUNS));
  return run;
}

/** @param {number} [limit] */
async function listRuns(limit = 50) {
  const runs = await store.read();
  return runs.slice(0, limit);
}

module.exports = { recordRun, listRuns };

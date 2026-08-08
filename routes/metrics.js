const express = require("express");
const { pool } = require("../db/pool");
const { listEngines } = require("../engines");
const { stats: queueStats } = require("../lib/generationQueue");
const { getProviderLimitsSnapshot } = require("../lib/providerLimits");
const { asyncHandler } = require("./helpers");
const {
  buildAllSeries,
  computeEngineBreakdown,
  computeFailures,
  computeTotals,
  summarizeHealth,
} = require("../lib/metricsAggregator");

const router = express.Router();

/**
 * Process start time. `session` scope reports only work done since the server
 * came up, which is what the Session/Historical toggle in the dashboard means.
 */
const SESSION_STARTED_AT = new Date();

const METRIC_COLUMNS = `
  id, engine, status, created_at, started_at, completed_at,
  usage_metrics, error_message, studio_mode, batch_id
`;

async function loadLibraryStats() {
  const [characters, poses, recipes, topCharacter, topPose] = await Promise.all([
    pool.query("SELECT count(*)::int AS count FROM characters"),
    pool.query(
      "SELECT count(*)::int AS total, count(*) FILTER (WHERE is_custom)::int AS custom FROM pose_references"
    ),
    pool.query("SELECT count(*)::int AS count FROM studio_recipes"),
    pool.query(
      `SELECT c.id, c.name, count(*)::int AS runs
       FROM generation_characters gc
       JOIN characters c ON c.id = gc.character_id
       GROUP BY c.id, c.name
       ORDER BY runs DESC
       LIMIT 1`
    ),
    pool.query(
      `SELECT pr.id, pr.title, count(*)::int AS runs
       FROM generations g
       JOIN pose_references pr ON pr.id = g.pose_reference_id
       GROUP BY pr.id, pr.title
       ORDER BY runs DESC
       LIMIT 1`
    ),
  ]);

  return {
    characters: characters.rows[0]?.count ?? 0,
    poseReferences: poses.rows[0]?.total ?? 0,
    customPoseReferences: poses.rows[0]?.custom ?? 0,
    recipes: recipes.rows[0]?.count ?? 0,
    mostUsedCharacter: topCharacter.rows[0]
      ? {
          id: topCharacter.rows[0].id,
          name: topCharacter.rows[0].name,
          runs: topCharacter.rows[0].runs,
        }
      : null,
    mostUsedPose: topPose.rows[0]
      ? {
          id: topPose.rows[0].id,
          title: topPose.rows[0].title,
          runs: topPose.rows[0].runs,
        }
      : null,
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const scope = req.query.scope === "session" ? "session" : "historical";

    const params = [];
    let where = "";
    if (scope === "session") {
      params.push(SESSION_STARTED_AT.toISOString());
      where = "WHERE created_at >= $1";
    }

    const [generations, engines, library] = await Promise.all([
      pool.query(
        `SELECT ${METRIC_COLUMNS} FROM generations ${where} ORDER BY created_at ASC`,
        params
      ),
      listEngines().catch(() => []),
      loadLibraryStats(),
    ]);

    const rows = generations.rows;
    const { codexLimits, antigravityLimits } = getProviderLimitsSnapshot();

    res.json({
      scope,
      generatedAt: new Date().toISOString(),
      sessionStartedAt: SESSION_STARTED_AT.toISOString(),
      health: summarizeHealth({ engines, queue: queueStats() }),
      totals: computeTotals(rows),
      series: buildAllSeries(rows),
      engines: computeEngineBreakdown(rows),
      failures: computeFailures(rows),
      library,
      codexLimits,
      antigravityLimits,
    });
  })
);

module.exports = router;
module.exports.SESSION_STARTED_AT = SESSION_STARTED_AT;

// Seeds SAMPLE usage rows so the Metrics page has a cost curve worth filming.
// Run with PGLITE_DATA_DIR pointing at a throwaway directory, never the real one.
const { randomUUID } = require('node:crypto');

if (!process.env.PGLITE_DATA_DIR || !process.env.PGLITE_DATA_DIR.includes('demo')) {
  throw new Error('Refusing to seed: set PGLITE_DATA_DIR to a throwaway "demo" directory.');
}

const { pool } = require('../db/pool');
const { runMigrations } = require('../db/migrate');

// [engine, model, runs, costPerRun, inTokens, outTokens, latencySeconds]
const PLAN = [
  ['openai', 'gpt-image-1', 11, 0.17, 1800, 4200, 42],
  ['gemini', 'gemini-2.5-flash-image', 14, 0.039, 1500, 1290, 19],
  ['fal-video', 'kling-2.5-turbo-pro', 5, 0.45, 600, 0, 88],
  ['codex', null, 7, 0, 0, 0, 55],
];
const DAYS = 14;

(async () => {
  await runMigrations();
  const now = Date.now();
  let n = 0;
  for (const [engine, model, runs, cost, tokensIn, tokensOut, latency] of PLAN) {
    for (let i = 0; i < runs; i++) {
      // Spread runs over the window, weighted toward recent days so the curve bends upward.
      const age = Math.pow(Math.random(), 1.6) * DAYS * 86400e3;
      const created = new Date(now - age);
      const queueMs = 1000 + Math.round(Math.random() * 3000);
      const runMs = Math.round(latency * 1000 * (0.8 + Math.random() * 0.4));
      const started = new Date(created.getTime() + queueMs);
      const completed = new Date(started.getTime() + runMs);
      const failed = engine === 'gemini' && i === 0;
      const usage = {
        model,
        source: 'provider-reported',
        inputTokens: tokensIn,
        outputTokens: tokensOut,
        totalTokens: tokensIn + tokensOut,
        actualCostUsd: failed ? 0 : cost,
      };
      await pool.query(
        `INSERT INTO generations (id, pose_photo_path, engine, prompt, status, created_at, started_at, completed_at, usage_metrics, error_message)
         VALUES ($1, 'sample/pose.jpg', $2, 'Sample demo run', $3, $4, $5, $6, $7::jsonb, $8)`,
        [randomUUID(), engine, failed ? 'failed' : 'completed', created, started, completed, JSON.stringify(usage), failed ? 'Sample failure' : null],
      );
      n++;
    }
  }
  console.log(`seeded ${n} sample generations`);
  await pool.end();
})().catch((error) => { console.error(error); process.exit(1); });

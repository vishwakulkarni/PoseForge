const queue = [];
const logger = require("./logger");
const MAX_CONCURRENCY = Math.min(Math.max(Number(process.env.GENERATION_CONCURRENCY) || 6, 1), 6);
let active = 0;

function drain() {
  while (active < MAX_CONCURRENCY && queue.length) {
    const job = queue.shift();
    active += 1;
    logger.info("generation started", { generationId: job.generationId, queueDepth: queue.length, active, maxConcurrency: MAX_CONCURRENCY });
    Promise.resolve()
      .then(job.runFn)
      .then(() => logger.info("generation job finished", { generationId: job.generationId }))
      .catch((err) => logger.error("generation job failed", { generationId: job.generationId, error: err.message }))
      .finally(() => { active -= 1; drain(); });
  }
}
function enqueue(generationId, runFn) {
  queue.push({ generationId, runFn });
  logger.info("generation queued", { generationId, queueDepth: queue.length, active, maxConcurrency: MAX_CONCURRENCY });
  drain();
}
function stats() { return { queued: queue.length, active, maxConcurrency: MAX_CONCURRENCY }; }
module.exports = { enqueue, stats };

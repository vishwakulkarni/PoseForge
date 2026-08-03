const queue = [];
const logger = require("./logger");
let running = false;
async function drain() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    logger.info("generation started", { generationId: job.generationId, queueDepth: queue.length });
    try { await job.runFn(); logger.info("generation job finished", { generationId: job.generationId }); }
    catch (err) { logger.error("generation job failed", { generationId: job.generationId, error: err.message }); }
  }
  running = false;
}
function enqueue(generationId, runFn) {
  queue.push({ generationId, runFn });
  logger.info("generation queued", { generationId, queueDepth: queue.length, running });
  void drain();
}
module.exports = { enqueue };

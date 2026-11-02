/**
 * Provider fallback for generator nodes. `attempt(candidate)` generates with
 * one `{ engine, model }` or throws; the node's own model goes first, then
 * each of `data.fallbacks` in order. An error marked `nodeInput` (a missing
 * prompt, an unreadable file) stops at once, since no other model would fix it.
 */
async function withFallbacks(data, attempt) {
  const candidates = [{ engine: data.engine, model: data.model }, ...(data.fallbacks || [])];
  const failures = [];
  for (const candidate of candidates) {
    try {
      return await attempt(candidate);
    } catch (error) {
      if (error.nodeInput) throw error;
      failures.push({ candidate, message: error.message });
    }
  }
  const [first, ...rest] = failures;
  if (!rest.length) throw new Error(first.message);
  const tried = rest.map(({ candidate, message }) => `${candidate.engine}${candidate.model ? ` (${candidate.model})` : ""}: ${message}`);
  throw new Error(`${first.message} Fallbacks also failed: ${tried.join("; ")}`);
}

module.exports = { withFallbacks };

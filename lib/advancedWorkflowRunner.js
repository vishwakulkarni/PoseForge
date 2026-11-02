/**
 * Whole-workflow execution order for Advanced Studio.
 *
 * A node that runs (see lib/advancedNodes: generators, LLM text, transforms,
 * outputs) depends on every running node upstream of it, looking through
 * nodes that only hold or derive a value (text, inputs, lists). A run is a
 * sequence of waves: each wave's nodes only consume results produced by
 * earlier waves and can therefore run in parallel. Planning is pure — the
 * caller owns loading, running and persisting each node.
 */
const { isExecutable } = require("./advancedNodes");

/** Running-node dependencies, keyed by target. */
function runDependencies(document) {
  const byId = new Map((document.nodes || []).map((node) => [node.id, node]));
  const sources = new Map();
  for (const edge of document.edges || []) {
    if (!sources.has(edge.target)) sources.set(edge.target, []);
    sources.get(edge.target).push(edge.source);
  }
  const upstream = new Map();
  for (const node of document.nodes || []) {
    if (!isExecutable(node)) continue;
    const found = new Set();
    const seen = new Set();
    const stack = [...(sources.get(node.id) || [])];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      const source = byId.get(id);
      if (!source) continue;
      if (isExecutable(source)) found.add(id);
      else stack.push(...(sources.get(id) || []));
    }
    upstream.set(node.id, found);
  }
  return upstream;
}

/**
 * Groups the selected nodes into waves. Every running node in the graph gets
 * a level (its longest upstream chain), and the selection is grouped by it, so
 * ordering holds even through nodes that are not selected: with A → B → C
 * and only A and C selected, C still waits for A.
 *
 * `nodeIds` omitted means every running node. Throws `statusCode` 422 errors
 * for a cycle or for an id that is not a running node in this document.
 */
function planWaves(document, nodeIds) {
  const upstream = runDependencies(document);
  const selected = nodeIds?.length ? [...new Set(nodeIds)] : [...upstream.keys()];
  const unknown = selected.filter((id) => !upstream.has(id));
  if (unknown.length) {
    const error = new Error(`Not a node that runs in this workflow: ${unknown.join(", ")}.`);
    error.statusCode = 422;
    throw error;
  }

  const levels = new Map();
  const visiting = new Set();
  const levelOf = (id) => {
    if (levels.has(id)) return levels.get(id);
    if (visiting.has(id)) {
      const error = new Error("This workflow has a cycle, so it has no run order.");
      error.statusCode = 422;
      throw error;
    }
    visiting.add(id);
    let level = 0;
    for (const parent of upstream.get(id)) level = Math.max(level, levelOf(parent) + 1);
    visiting.delete(id);
    levels.set(id, level);
    return level;
  };
  for (const id of upstream.keys()) levelOf(id);

  const waves = new Map();
  for (const id of selected) {
    const level = levels.get(id);
    if (!waves.has(level)) waves.set(level, []);
    waves.get(level).push(id);
  }
  return [...waves.keys()].sort((a, b) => a - b).map((level) => waves.get(level));
}

/** Every running node downstream of `nodeId`. */
function downstreamOf(document, nodeId) {
  const upstream = runDependencies(document);
  const found = new Set();
  const visit = (id) => {
    for (const [target, parents] of upstream) {
      if (parents.has(id) && !found.has(target)) {
        found.add(target);
        visit(target);
      }
    }
  };
  visit(nodeId);
  return found;
}

/**
 * Runs the waves in order with `runNode(nodeId)` → `{ ok, error? }`. When a
 * node fails, selected nodes downstream of it are not run; `skipNode(nodeId,
 * failedId)` records why. Resolves to `{ [nodeId]: "done" | "error" | "skipped" }`.
 */
async function runWaves(document, waves, { runNode, skipNode }) {
  const outcome = {};
  const blockedBy = new Map();
  for (const wave of waves) {
    const runnable = wave.filter((id) => !blockedBy.has(id));
    for (const id of wave) {
      if (!blockedBy.has(id)) continue;
      outcome[id] = "skipped";
      await skipNode(id, blockedBy.get(id));
    }
    const results = await Promise.all(runnable.map(async (id) => {
      try {
        return [id, await runNode(id)];
      } catch (error) {
        return [id, { ok: false, error: error.message }];
      }
    }));
    for (const [id, result] of results) {
      outcome[id] = result.ok ? "done" : "error";
      if (result.ok) continue;
      for (const downstream of downstreamOf(document, id)) {
        if (!blockedBy.has(downstream)) blockedBy.set(downstream, id);
      }
    }
  }
  return outcome;
}

module.exports = { planWaves, runWaves, downstreamOf };

/**
 * Whole-workflow execution order for Advanced Studio.
 *
 * A generator node depends on every generator upstream of it, so a graph run
 * is a sequence of waves: each wave's nodes only consume results produced by
 * earlier waves and can therefore run in parallel. Planning is pure — the
 * route owns loading, running and persisting each node.
 */
const GENERATOR_TYPES = new Set(["imageGenerator", "videoGenerator"]);

function isGenerator(node) {
  return GENERATOR_TYPES.has(node?.type);
}

/** Generator-to-generator dependencies, keyed by target. Edges from text and
 * input nodes carry no ordering: those nodes hold their value already. */
function generatorDependencies(document) {
  const generators = new Map((document.nodes || []).filter(isGenerator).map((node) => [node.id, node]));
  const upstream = new Map([...generators.keys()].map((id) => [id, new Set()]));
  for (const edge of document.edges || []) {
    if (generators.has(edge.source) && generators.has(edge.target)) upstream.get(edge.target).add(edge.source);
  }
  return upstream;
}

/**
 * Groups the selected generators into waves. Every generator in the graph gets
 * a level (its longest upstream chain), and the selection is grouped by it, so
 * ordering holds even through generators that are not selected: with A → B → C
 * and only A and C selected, C still waits for A.
 *
 * `nodeIds` omitted means every generator. Throws `statusCode` 422 errors for a
 * cycle or for an id that is not a generator in this document.
 */
function planWaves(document, nodeIds) {
  const upstream = generatorDependencies(document);
  const selected = nodeIds?.length ? [...new Set(nodeIds)] : [...upstream.keys()];
  const unknown = selected.filter((id) => !upstream.has(id));
  if (unknown.length) {
    const error = new Error(`Not a generator node in this workflow: ${unknown.join(", ")}.`);
    error.statusCode = 422;
    throw error;
  }

  const levels = new Map();
  const visiting = new Set();
  const levelOf = (id) => {
    if (levels.has(id)) return levels.get(id);
    if (visiting.has(id)) {
      const error = new Error("This workflow has a cycle between generator nodes, so it has no run order.");
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

/** Every generator reachable downstream of `nodeId`. */
function downstreamGenerators(document, nodeId) {
  const upstream = generatorDependencies(document);
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
      for (const downstream of downstreamGenerators(document, id)) {
        if (!blockedBy.has(downstream)) blockedBy.set(downstream, id);
      }
    }
  }
  return outcome;
}

module.exports = { planWaves, runWaves, downstreamGenerators, isGenerator };

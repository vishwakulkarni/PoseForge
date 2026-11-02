/**
 * What flows along a workflow's edges.
 *
 * Every node offers a list of items downstream, each `{ text?, image?,
 * video?, audio? }`: one item normally, one per line for a list node, and
 * one per iteration for a node downstream of a list. A node that receives
 * an n-item list runs n times, and its own output becomes n items, so a fan
 * out carries on through the graph until it reaches an output. Two lists of
 * different lengths meeting at one node are an error rather than a guess.
 *
 * `state.items` holds what nodes executed in this run produced; anything
 * not in it is read from the node's saved data.
 */
const { definition } = require("./index");
const { nodeError } = require("./shared");

function createRunState(seed = {}) {
  return { items: new Map(Object.entries(seed)) };
}

function findNode(document, nodeId) {
  return (document.nodes || []).find((node) => node.id === nodeId) || null;
}

/** Incoming edges whose target handle the node reads, in document order —
 * which is the order references reach the engine. */
function readableEdges(document, nodeId) {
  const target = findNode(document, nodeId);
  const inputs = definition(target?.type)?.inputs || [];
  return (document.edges || []).flatMap((edge) => {
    if (edge.target !== nodeId) return [];
    const handle = inputs.find((input) => input.id === edge.targetHandle);
    return handle ? [{ edge, dataType: handle.dataType }] : [];
  });
}

function sourceItems(document, nodeId, state, visiting = new Set()) {
  if (state.items.has(nodeId)) return state.items.get(nodeId);
  const node = findNode(document, nodeId);
  const entry = definition(node?.type);
  if (!entry) return [];
  if (!entry.derive) return entry.items(node);
  if (visiting.has(nodeId)) throw nodeError(`Node ${node.label || nodeId} feeds back into itself.`);
  visiting.add(nodeId);
  try {
    // Derived values are recomputed on every read, never cached: what they
    // derive from may be produced later in the same run.
    return entry.derive(node, collect(document, nodeId, state, visiting));
  } finally {
    visiting.delete(nodeId);
  }
}

/** Every value reaching each target handle, all items flattened. */
function collect(document, nodeId, state = createRunState(), visiting = new Set()) {
  const values = {};
  for (const { edge, dataType } of readableEdges(document, nodeId)) {
    for (const item of sourceItems(document, edge.source, state, visiting)) {
      if (item?.[dataType]) (values[edge.targetHandle] ||= []).push(item[dataType]);
    }
  }
  return values;
}

/** How many times the node runs: the length of the lists reaching it, or 1. */
function iterationCount(document, nodeId, state = createRunState()) {
  const lengths = new Set();
  for (const { edge } of readableEdges(document, nodeId)) {
    const count = sourceItems(document, edge.source, state).length;
    if (count > 1) lengths.add(count);
  }
  if (lengths.size > 1) {
    const node = findNode(document, nodeId);
    throw nodeError(`Lists of different lengths (${[...lengths].join(" and ")}) meet at ${node?.label || nodeId}.`);
  }
  return lengths.size ? [...lengths][0] : 1;
}

/** The values reaching each target handle for one iteration: item `index` of
 * a list, the single item of anything else. */
function resolveInputs(document, nodeId, state = createRunState(), index = 0) {
  const values = {};
  for (const { edge, dataType } of readableEdges(document, nodeId)) {
    const items = sourceItems(document, edge.source, state);
    const value = (items.length > 1 ? items[index] : items[0])?.[dataType];
    if (value) (values[edge.targetHandle] ||= []).push(value);
  }
  return values;
}

/**
 * Runs one executable node once per iteration (in parallel; the generation
 * queue bounds provider concurrency) and records its items in `state`. The
 * node's data in `document` gets its new results and status. Resolves to
 * `{ ok, error?, results }`; results that finished are kept even when
 * another iteration failed.
 */
async function executeNode(document, nodeId, state, ctx) {
  const node = findNode(document, nodeId);
  const entry = definition(node?.type);
  if (!entry?.execute) return { ok: false, error: "This node does not run.", results: [] };
  const fail = (message, results = []) => {
    node.data.status = "error";
    node.data.error = message;
    return { ok: false, error: message, results };
  };

  let count;
  try {
    count = iterationCount(document, nodeId, state);
  } catch (error) {
    return fail(error.message);
  }
  node.data.status = "running";
  delete node.data.error;
  const settled = await Promise.allSettled(
    Array.from({ length: count }, (_, index) => index).map(async (index) => entry.execute(node, resolveInputs(document, nodeId, state, index), ctx))
  );

  const results = settled.flatMap((outcome) => (outcome.status === "fulfilled" ? outcome.value.results : []));
  const items = settled.map((outcome) => (outcome.status === "fulfilled" ? outcome.value.item : {}));
  state.items.set(nodeId, items);
  if (results.length) {
    node.data.results = [...(node.data.results || []), ...results].slice(-8);
    node.data.activeResultIndex = node.data.results.length - 1;
  }
  const failedAt = settled.findIndex((outcome) => outcome.status === "rejected");
  if (failedAt >= 0) {
    const { message } = settled[failedAt].reason;
    return fail(count > 1 ? `Item ${failedAt + 1} of ${count}: ${message}` : message, results);
  }
  node.data.status = "done";
  return { ok: true, results, items };
}

module.exports = { collect, createRunState, executeNode, findNode, iterationCount, resolveInputs, sourceItems };

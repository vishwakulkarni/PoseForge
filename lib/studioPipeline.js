const MAX_CHARACTER_INPUTS = 4;

/** Returns waves of generate-node ids in dependency order. Nodes in the same
 * wave have no inter-dependencies and can run in parallel; each wave must
 * finish before the next starts. */
function buildWaves(document) {
  const genIds = new Set((document.nodes || []).filter((n) => n.kind === "generate").map((n) => n.id));
  if (genIds.size === 0) return [];

  const deps = new Map();
  for (const id of genIds) deps.set(id, new Set());
  for (const edge of document.edges || []) {
    if (genIds.has(edge.source) && genIds.has(edge.target)) {
      deps.get(edge.target).add(edge.source);
    }
  }

  const waves = [];
  const remaining = new Set(genIds);
  while (remaining.size > 0) {
    const wave = [...remaining].filter((id) => [...deps.get(id)].every((dep) => !remaining.has(dep)));
    if (wave.length === 0) break; // cycle guard
    waves.push(wave);
    for (const id of wave) remaining.delete(id);
  }
  return waves;
}

function nodeById(document, id) {
  return (document.nodes || []).find((n) => n.id === id) || null;
}

/** Resolves the ordered character sources, pose source, and prompt text feeding
 * a `generate` node from its incoming edges. Any image-bearing node
 * (character, pose, or a prior result) may feed the character/pose handles,
 * which is what makes chaining possible. Returns `errors` instead of throwing
 * so a run endpoint can report per-node problems without aborting the run. */
function resolveGenerateInputs(document, nodeId) {
  const node = nodeById(document, nodeId);
  const errors = [];
  if (!node || node.kind !== "generate") {
    return { characterSources: [], poseSource: null, prompt: "", errors: ["Node is not a generate node."] };
  }

  const incoming = (document.edges || []).filter((edge) => edge.target === nodeId);
  const characterSources = [];
  let poseSource = null;
  let prompt = "";

  for (const edge of incoming) {
    const src = nodeById(document, edge.source);
    if (!src) continue;

    if (edge.targetHandle === "character" && ["character", "pose", "result"].includes(src.kind) && src.imageUrl) {
      characterSources.push({
        sourceNodeId: src.id,
        imageUrl: src.imageUrl,
        characterId: src.assetType === "character" ? src.assetId || null : null,
        referenceKind: src.kind === "result" ? "generation" : "photo",
      });
    }

    if (edge.targetHandle === "pose" && ["character", "pose", "result"].includes(src.kind) && src.imageUrl) {
      poseSource = {
        sourceNodeId: src.id,
        imageUrl: src.imageUrl,
        referenceId: src.assetType === "pose" ? src.assetId || null : null,
        referenceKind: src.kind === "result" ? "generation" : "photo",
      };
    }

    if (edge.targetHandle === "prompt") {
      if (src.kind === "prompt" && src.text) prompt = src.text;
      else if (src.kind === "assistant" && src.outputText) prompt = src.outputText;
      else if (src.kind === "generate" && src.prompt && !prompt) prompt = src.prompt;
    }
  }

  if (!prompt && node.prompt) prompt = node.prompt;

  if (characterSources.length === 0) errors.push("Connect at least one character, pose, or result node to the character input.");
  if (characterSources.length > MAX_CHARACTER_INPUTS) errors.push(`At most ${MAX_CHARACTER_INPUTS} character inputs are supported.`);
  if (!poseSource) errors.push("Connect a pose or result node to the pose input.");

  return { characterSources: characterSources.slice(0, MAX_CHARACTER_INPUTS), poseSource, prompt, errors };
}

module.exports = { buildWaves, resolveGenerateInputs, MAX_CHARACTER_INPUTS };

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWaves, resolveGenerateInputs } = require("../lib/studioPipeline");

function doc(nodes, edges) {
  return { nodes, edges };
}

test("buildWaves returns empty for a document with no generate nodes", () => {
  assert.deepEqual(buildWaves(doc([{ id: "c1", kind: "character" }], [])), []);
});

test("buildWaves puts independent generate nodes in a single wave", () => {
  const waves = buildWaves(doc([
    { id: "g1", kind: "generate" },
    { id: "g2", kind: "generate" },
  ], []));
  assert.equal(waves.length, 1);
  assert.deepEqual(new Set(waves[0]), new Set(["g1", "g2"]));
});

test("buildWaves sequences a chained pair of generate nodes into two waves", () => {
  const waves = buildWaves(doc([
    { id: "g1", kind: "generate" },
    { id: "g2", kind: "generate" },
  ], [
    { id: "e1", source: "g1", target: "g2", targetHandle: "character" },
  ]));
  assert.deepEqual(waves, [["g1"], ["g2"]]);
});

test("buildWaves handles a diamond of dependencies (parallel branches converging)", () => {
  const waves = buildWaves(doc([
    { id: "g1", kind: "generate" },
    { id: "g2", kind: "generate" },
    { id: "g3", kind: "generate" },
  ], [
    { id: "e1", source: "g1", target: "g2", targetHandle: "character" },
    { id: "e2", source: "g1", target: "g3", targetHandle: "character" },
  ]));
  assert.equal(waves.length, 2);
  assert.deepEqual(waves[0], ["g1"]);
  assert.deepEqual(new Set(waves[1]), new Set(["g2", "g3"]));
});

test("buildWaves breaks on a cycle rather than looping forever", () => {
  const waves = buildWaves(doc([
    { id: "g1", kind: "generate" },
    { id: "g2", kind: "generate" },
  ], [
    { id: "e1", source: "g1", target: "g2", targetHandle: "character" },
    { id: "e2", source: "g2", target: "g1", targetHandle: "character" },
  ]));
  assert.deepEqual(waves, []);
});

test("resolveGenerateInputs collects character and pose sources with a direct prompt", () => {
  const document = doc([
    { id: "c1", kind: "character", imageUrl: "/storage/c1.png", assetType: "character", assetId: "char-1" },
    { id: "p1", kind: "pose", imageUrl: "/storage/p1.png", assetType: "pose", assetId: "pose-1" },
    { id: "g1", kind: "generate", prompt: "fallback prompt" },
  ], [
    { id: "e1", source: "c1", target: "g1", targetHandle: "character" },
    { id: "e2", source: "p1", target: "g1", targetHandle: "pose" },
  ]);
  const result = resolveGenerateInputs(document, "g1");
  assert.equal(result.errors.length, 0);
  assert.equal(result.characterSources.length, 1);
  assert.equal(result.characterSources[0].characterId, "char-1");
  assert.equal(result.poseSource.referenceId, "pose-1");
  assert.equal(result.prompt, "fallback prompt");
});

test("resolveGenerateInputs chains a prior result node as a character/pose source", () => {
  const document = doc([
    { id: "r1", kind: "result", imageUrl: "/storage/output.png", generationId: "123e4567-e89b-12d3-a456-426614174000" },
    { id: "g1", kind: "generate" },
  ], [
    { id: "e1", source: "r1", target: "g1", targetHandle: "character" },
    { id: "e2", source: "r1", target: "g1", targetHandle: "pose" },
  ]);
  const result = resolveGenerateInputs(document, "g1");
  assert.equal(result.characterSources[0].characterId, null);
  assert.equal(result.characterSources[0].referenceKind, "generation");
  assert.equal(result.poseSource.referenceKind, "generation");
});

test("resolveGenerateInputs prefers a connected prompt node over the node's own prompt", () => {
  const document = doc([
    { id: "prompt-1", kind: "prompt", text: "Use dramatic lighting" },
    { id: "g1", kind: "generate", prompt: "ignored fallback" },
  ], [
    { id: "e1", source: "prompt-1", target: "g1", targetHandle: "prompt" },
  ]);
  const result = resolveGenerateInputs(document, "g1");
  assert.equal(result.prompt, "Use dramatic lighting");
});

test("resolveGenerateInputs uses an assistant node's refined output text", () => {
  const document = doc([
    { id: "assistant-1", kind: "assistant", outputText: "A moody portrait" },
    { id: "g1", kind: "generate" },
  ], [
    { id: "e1", source: "assistant-1", target: "g1", targetHandle: "prompt" },
  ]);
  const result = resolveGenerateInputs(document, "g1");
  assert.equal(result.prompt, "A moody portrait");
});

test("resolveGenerateInputs reports missing character and pose inputs", () => {
  const document = doc([{ id: "g1", kind: "generate" }], []);
  const result = resolveGenerateInputs(document, "g1");
  assert.ok(result.errors.some((e) => e.includes("character")));
  assert.ok(result.errors.some((e) => e.includes("pose")));
});

test("resolveGenerateInputs caps character sources at four and reports an error beyond that", () => {
  const characterNodes = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, kind: "character", imageUrl: `/storage/c${i}.png` }));
  const poseNode = { id: "p1", kind: "pose", imageUrl: "/storage/p1.png" };
  const edges = characterNodes.map((n) => ({ id: `e-${n.id}`, source: n.id, target: "g1", targetHandle: "character" }));
  edges.push({ id: "e-pose", source: "p1", target: "g1", targetHandle: "pose" });
  const document = doc([...characterNodes, poseNode, { id: "g1", kind: "generate" }], edges);
  const result = resolveGenerateInputs(document, "g1");
  assert.equal(result.characterSources.length, 4);
  assert.ok(result.errors.some((e) => e.includes("At most 4")));
});

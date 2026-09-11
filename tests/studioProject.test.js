const test = require("node:test");
const assert = require("node:assert/strict");
const {
  defaultStudioDocument,
  sanitizeStudioDocument,
} = require("../lib/studioProject");

test("default Studio document is versioned and empty", () => {
  assert.deepEqual(defaultStudioDocument(), {
    schemaVersion: 1,
    viewport: null,
    nodes: [],
    edges: [],
    locked: false,
  });
});

test("Studio document sanitizer keeps safe graph geometry and valid edges", () => {
  const document = sanitizeStudioDocument({
    schemaVersion: 99,
    viewport: { x: "25", y: -40, zoom: 20 },
    locked: true,
    nodes: [
      {
        id: "character-1",
        kind: "character",
        position: { x: 10, y: 20 },
        custom: true,
        width: 330,
        height: 420,
        collapsed: true,
        lastExpandedWidth: 410,
        lastExpandedHeight: 520,
        imageFit: "fill",
        label: "Editorial portrait",
        labelEdited: true,
        meta: "Saved character",
        imageUrl: "/storage/characters/portrait.png",
        assetType: "character",
        assetId: "asset-1",
      },
      { id: "generate", kind: "generate", position: { x: 500, y: 450 } },
      { id: "generate", kind: "generate", position: { x: 900, y: 900 } },
      { id: "invalid", kind: "script", position: { x: 0, y: 0 } },
    ],
    edges: [
      {
        id: "character-generate",
        source: "character-1",
        target: "generate",
        targetHandle: "character",
      },
      { id: "dangling", source: "missing", target: "generate" },
    ],
  });

  assert.equal(document.schemaVersion, 1);
  assert.deepEqual(document.viewport, { x: 25, y: -40, zoom: 4 });
  assert.equal(document.locked, true);
  assert.equal(document.nodes.length, 2);
  assert.equal(document.nodes[0].width, 330);
  assert.deepEqual(document.nodes[0], {
    id: "character-1",
    kind: "character",
    position: { x: 10, y: 20 },
    custom: true,
    width: 330,
    height: 420,
    collapsed: true,
    lastExpandedWidth: 410,
    lastExpandedHeight: 520,
    imageFit: "fill",
    label: "Editorial portrait",
    labelEdited: true,
    meta: "Saved character",
    imageUrl: "/storage/characters/portrait.png",
    assetType: "character",
    assetId: "asset-1",
  });
  assert.deepEqual(document.edges, [{
    id: "character-generate",
    source: "character-1",
    target: "generate",
    targetHandle: "character",
  }]);
});

test("Studio document sanitizer tolerates malformed input", () => {
  assert.deepEqual(sanitizeStudioDocument(null), defaultStudioDocument());
  const document = sanitizeStudioDocument({
    viewport: { zoom: "nope" },
    nodes: [{
      id: "pose-block-invalid-fields",
      kind: "pose",
      position: { x: 1, y: 2 },
      custom: "yes",
      imageFit: "crop",
      assetType: "external-script",
      labelEdited: "yes",
    }],
  });
  assert.deepEqual(document.viewport, {
    x: 0,
    y: 0,
    zoom: 1,
  });
  assert.deepEqual(document.nodes, [{
    id: "pose-block-invalid-fields",
    kind: "pose",
    position: { x: 1, y: 2 },
  }]);
});

test("Studio document sanitizer accepts generate node pipeline fields", () => {
  const document = sanitizeStudioDocument({
    nodes: [
      {
        id: "generate-1",
        kind: "generate",
        position: { x: 0, y: 0 },
        prompt: "A cinematic portrait",
        engine: "gemini",
        status: "running",
        generationId: "123e4567-e89b-12d3-a456-426614174000",
        advancedSettings: { identityFidelity: 50 },
      },
    ],
  });
  assert.equal(document.nodes.length, 1);
  const node = document.nodes[0];
  assert.equal(node.prompt, "A cinematic portrait");
  assert.equal(node.engine, "gemini");
  assert.equal(node.status, "running");
  assert.equal(node.generationId, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(node.advancedSettings.identityFidelity, 50);
});

test("Studio document sanitizer rejects bad status and generationId on generate nodes", () => {
  const document = sanitizeStudioDocument({
    nodes: [
      {
        id: "generate-1",
        kind: "generate",
        position: { x: 0, y: 0 },
        status: "not-a-real-status",
        generationId: "not-a-uuid",
      },
    ],
  });
  const node = document.nodes[0];
  assert.equal(Object.hasOwn(node, "status"), false);
  assert.equal(Object.hasOwn(node, "generationId"), false);
});

test("Studio document sanitizer accepts prompt and assistant node kinds", () => {
  const document = sanitizeStudioDocument({
    nodes: [
      { id: "prompt-1", kind: "prompt", position: { x: 0, y: 0 }, text: "Make it moody" },
      {
        id: "assistant-1",
        kind: "assistant",
        position: { x: 100, y: 0 },
        instruction: "Improve this prompt",
        outputText: "A moody, cinematic scene",
        engine: "gemini",
        status: "done",
      },
    ],
  });
  assert.equal(document.nodes.length, 2);
  assert.deepEqual(document.nodes[0], { id: "prompt-1", kind: "prompt", position: { x: 0, y: 0 }, text: "Make it moody" });
  assert.equal(document.nodes[1].instruction, "Improve this prompt");
  assert.equal(document.nodes[1].outputText, "A moody, cinematic scene");
  assert.equal(document.nodes[1].engine, "gemini");
  assert.equal(document.nodes[1].status, "done");
});

test("Studio document sanitizer preserves only an explicit edge-state marker", () => {
  const explicit = sanitizeStudioDocument({ edgeState: "explicit" });
  assert.equal(explicit.edgeState, "explicit");

  const unknown = sanitizeStudioDocument({ edgeState: "legacy" });
  assert.equal(Object.hasOwn(unknown, "edgeState"), false);
});

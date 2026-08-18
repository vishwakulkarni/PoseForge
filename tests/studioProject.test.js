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

test("Studio document sanitizer preserves only an explicit edge-state marker", () => {
  const explicit = sanitizeStudioDocument({ edgeState: "explicit" });
  assert.equal(explicit.edgeState, "explicit");

  const unknown = sanitizeStudioDocument({ edgeState: "legacy" });
  assert.equal(Object.hasOwn(unknown, "edgeState"), false);
});

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
      { id: "character-1", kind: "character", position: { x: 10, y: 20 }, width: 330 },
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
  assert.deepEqual(document.edges, [{
    id: "character-generate",
    source: "character-1",
    target: "generate",
    targetHandle: "character",
  }]);
});

test("Studio document sanitizer tolerates malformed input", () => {
  assert.deepEqual(sanitizeStudioDocument(null), defaultStudioDocument());
  assert.deepEqual(sanitizeStudioDocument({ viewport: { zoom: "nope" } }).viewport, {
    x: 0,
    y: 0,
    zoom: 1,
  });
});


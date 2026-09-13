const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ADVANCED_SCHEMA_VERSION,
  defaultAdvancedDocument,
  sanitizeAdvancedDocument,
  migrateAdvancedDocument,
  templateDocument,
} = require("../lib/advancedStudioProject");

test("a blank Advanced Studio document is versioned and empty", () => {
  const document = defaultAdvancedDocument();
  assert.equal(document.schemaVersion, ADVANCED_SCHEMA_VERSION);
  assert.equal(document.template, "blank");
  assert.deepEqual(document.nodes, []);
  assert.deepEqual(document.edges, []);
  assert.equal(document.viewport, null);
});

test("sanitizer keeps known node types and drops unknown ones", () => {
  const document = sanitizeAdvancedDocument({
    schemaVersion: 2,
    nodes: [
      { id: "a", type: "text", position: { x: 10, y: 20 }, data: { text: "hello", mode: "plain" } },
      { id: "b", type: "imageGenerator", position: { x: 400, y: 0 }, data: { engine: "gemini", aspectRatio: "16:9", outputs: 2 } },
      { id: "c", type: "somethingElse", position: { x: 0, y: 0 }, data: {} },
      { id: "", type: "text", position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [],
  });
  assert.deepEqual(document.nodes.map((node) => node.id), ["a", "b"]);
  assert.equal(document.nodes[0].data.text, "hello");
  assert.equal(document.nodes[1].data.aspectRatio, "16:9");
  assert.equal(document.nodes[1].data.outputs, 2);
});

test("sanitizer drops edges pointing at missing nodes and keeps typed edges", () => {
  const document = sanitizeAdvancedDocument({
    schemaVersion: 2,
    nodes: [
      { id: "a", type: "text", position: { x: 0, y: 0 }, data: { text: "x" } },
      { id: "b", type: "imageGenerator", position: { x: 1, y: 1 }, data: {} },
    ],
    edges: [
      { id: "e1", source: "a", target: "b", sourceHandle: "text", targetHandle: "prompt", dataType: "text" },
      { id: "e2", source: "a", target: "ghost", targetHandle: "prompt" },
      { id: "e3", source: "a", target: "a" },
      { id: "e1", source: "a", target: "b" },
    ],
  });
  assert.deepEqual(document.edges.map((edge) => edge.id), ["e1"]);
  assert.equal(document.edges[0].dataType, "text");
});

test("image input character associations round-trip only when they are valid UUIDs", () => {
  const validCharacterId = "11111111-1111-4111-8111-111111111111";
  const document = sanitizeAdvancedDocument({
    nodes: [
      {
        id: "valid",
        type: "imageInput",
        position: { x: 0, y: 0 },
        data: { imageUrl: "/storage/characters/maya/photo.png", characterId: validCharacterId },
      },
      {
        id: "invalid",
        type: "imageInput",
        position: { x: 1, y: 1 },
        data: { imageUrl: "/storage/uploads/photo.png", characterId: "not-a-character-id" },
      },
    ],
    edges: [],
  });

  assert.equal(document.nodes[0].data.characterId, validCharacterId);
  assert.equal(document.nodes[1].data.characterId, undefined);
});

test("collapsed nodes retain the size needed to expand again", () => {
  const document = sanitizeAdvancedDocument({
    nodes: [{
      id: "prompt",
      type: "text",
      position: { x: 0, y: 0 },
      width: 320,
      height: 68,
      collapsed: true,
      expandedWidth: 620,
      expandedHeight: 410,
      data: { text: "hello" },
    }],
    edges: [],
  });

  assert.equal(document.nodes[0].collapsed, true);
  assert.equal(document.nodes[0].expandedWidth, 620);
  assert.equal(document.nodes[0].expandedHeight, 410);
});

test("group membership is pruned to surviving nodes", () => {
  const document = sanitizeAdvancedDocument({
    schemaVersion: 2,
    nodes: [
      { id: "g", type: "group", position: { x: 0, y: 0 }, data: { memberIds: ["a", "ghost", "g"] }, label: "Scene 1" },
      { id: "a", type: "text", position: { x: 0, y: 0 }, data: { text: "" } },
    ],
    edges: [],
  });
  const group = document.nodes.find((node) => node.id === "g");
  assert.deepEqual(group.data.memberIds, ["a"]);
  assert.equal(group.label, "Scene 1");
});

test("out-of-range numbers are clamped rather than rejected", () => {
  const document = sanitizeAdvancedDocument({
    schemaVersion: 2,
    viewport: { x: 10, y: -20, zoom: 99 },
    nodes: [{ id: "a", type: "imageGenerator", position: { x: NaN, y: 5 }, data: { outputs: 99 } }],
    edges: [],
  });
  assert.equal(document.viewport.zoom, 4);
  assert.equal(document.nodes[0].position.x, 0);
  assert.equal(document.nodes[0].data.outputs, 4);
});

test("a version 1 document migrates to an empty version 2 graph instead of losing the viewport", () => {
  const migrated = migrateAdvancedDocument({
    schemaVersion: 1,
    viewport: { x: 5, y: 6, zoom: 1.5 },
    nodes: [{ id: "old", kind: "character", position: { x: 0, y: 0 } }],
    edges: [],
    locked: true,
  });
  assert.equal(migrated.schemaVersion, ADVANCED_SCHEMA_VERSION);
  assert.deepEqual(migrated.nodes, []);
  assert.equal(migrated.locked, true);
  assert.deepEqual(migrated.viewport, { x: 5, y: 6, zoom: 1.5 });
});

test("a document from a newer build is sanitized at the current version rather than rejected", () => {
  const document = sanitizeAdvancedDocument({
    schemaVersion: 99,
    nodes: [{ id: "a", type: "text", position: { x: 0, y: 0 }, data: { text: "keep me" } }],
    edges: [],
  });
  assert.equal(document.schemaVersion, ADVANCED_SCHEMA_VERSION);
  assert.equal(document.nodes[0].data.text, "keep me");
});

test("partially populated documents do not throw", () => {
  assert.doesNotThrow(() => sanitizeAdvancedDocument(null));
  assert.doesNotThrow(() => sanitizeAdvancedDocument({}));
  assert.doesNotThrow(() => sanitizeAdvancedDocument({ nodes: "nope", edges: 5 }));
  assert.deepEqual(sanitizeAdvancedDocument({ nodes: "nope" }).nodes, []);
});

test("the image template wires a prompt into an image generator", () => {
  const document = templateDocument("image");
  assert.equal(document.template, "image");
  assert.deepEqual(document.nodes.map((node) => node.type), ["text", "imageGenerator"]);
  assert.equal(document.edges.length, 1);
  assert.equal(document.edges[0].targetHandle, "prompt");
  assert.equal(document.edges[0].dataType, "text");
});

test("the video template wires a prompt into a video generator", () => {
  const document = templateDocument("video");
  assert.deepEqual(document.nodes.map((node) => node.type), ["text", "videoGenerator"]);
  assert.equal(document.nodes[1].data.duration, 5);
});

test("the storyboard template builds ordered scene groups on the shared canvas", () => {
  const document = templateDocument("storyboard");
  const groups = document.nodes.filter((node) => node.type === "group");
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.map((group) => group.data.scene), [1, 2, 3]);
  assert.deepEqual(groups.map((group) => group.label), ["Scene 1", "Scene 2", "Scene 3"]);
  for (const group of groups) assert.equal(group.data.memberIds.length, 2);
  assert.equal(document.edges.length, 3);
});

test("an unknown template id falls back to a blank project", () => {
  const document = templateDocument("nope");
  assert.equal(document.template, "blank");
  assert.deepEqual(document.nodes, []);
});

test("documents round-trip through the sanitizer unchanged", () => {
  const first = templateDocument("storyboard");
  assert.deepEqual(sanitizeAdvancedDocument(first), first);
});

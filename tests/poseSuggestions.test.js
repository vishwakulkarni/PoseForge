const test = require("node:test");
const assert = require("node:assert/strict");
const { selectPoseSuggestions } = require("../lib/poseSuggestions");

function pose(id, category, isCustom = false) {
  return { id, category, is_custom: isCustom };
}

test("single-person suggestions are diverse and exclude group poses", () => {
  const rows = [
    pose("standing-1", "standing"),
    pose("standing-2", "standing"),
    pose("sitting-1", "sitting"),
    pose("action-1", "action"),
    pose("portrait-1", "portrait"),
    pose("group-1", "group"),
  ];

  const result = selectPoseSuggestions(rows, { subjectCount: 1, limit: 4, seed: "anika" });

  assert.equal(result.length, 4);
  assert.deepEqual(new Set(result.map((item) => item.category)), new Set(["standing", "sitting", "action", "portrait"]));
  assert.ok(result.every((item) => item.category !== "group"));
});

test("multi-person suggestions only return compatible group poses", () => {
  const rows = [
    pose("single", "standing"),
    pose("group-curated", "group"),
    pose("group-custom", "group", true),
  ];

  const result = selectPoseSuggestions(rows, { subjectCount: 2, limit: 5 });

  assert.deepEqual(result.map((item) => item.id), ["group-curated", "group-custom"]);
});

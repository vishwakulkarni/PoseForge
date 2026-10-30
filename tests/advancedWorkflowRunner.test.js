const test = require("node:test");
const assert = require("node:assert/strict");
const { planWaves, runWaves, downstreamGenerators } = require("../lib/advancedWorkflowRunner");

const generator = (id) => ({ id, type: "imageGenerator", data: {} });
const edge = (source, target) => ({ id: `${source}-${target}`, source, target, targetHandle: "image" });

/** p → a → b → c, with d independent and a also feeding d2. */
const document = {
  nodes: [{ id: "p", type: "text", data: { text: "x" } }, generator("a"), generator("b"), generator("c"), generator("d"), generator("d2")],
  edges: [edge("p", "a"), edge("a", "b"), edge("b", "c"), edge("p", "d"), edge("a", "d2")],
};

test("waves follow generator dependencies and group independent nodes", () => {
  assert.deepEqual(planWaves(document), [["a", "d"], ["b", "d2"], ["c"]]);
});

test("a partial selection keeps order through unselected generators", () => {
  assert.deepEqual(planWaves(document, ["c", "a"]), [["a"], ["c"]]);
});

test("cycles and non-generator ids are rejected with 422", () => {
  const cyclic = { nodes: [generator("x"), generator("y")], edges: [edge("x", "y"), edge("y", "x")] };
  assert.throws(() => planWaves(cyclic), (error) => error.statusCode === 422 && /cycle/.test(error.message));
  assert.throws(() => planWaves(document, ["p"]), (error) => error.statusCode === 422);
});

test("downstream generators are found transitively", () => {
  assert.deepEqual([...downstreamGenerators(document, "a")].sort(), ["b", "c", "d2"]);
});

test("a failure skips everything downstream but not independent nodes", async () => {
  const ran = [];
  const skipped = [];
  const outcome = await runWaves(document, planWaves(document), {
    runNode: async (id) => {
      ran.push(id);
      if (id === "a") throw new Error("boom");
      return { ok: true };
    },
    skipNode: async (id, failed) => skipped.push([id, failed]),
  });
  assert.deepEqual(ran.sort(), ["a", "d"]);
  assert.deepEqual(skipped.sort(), [["b", "a"], ["c", "a"], ["d2", "a"]]);
  assert.deepEqual(outcome, { a: "error", d: "done", b: "skipped", d2: "skipped", c: "skipped" });
});

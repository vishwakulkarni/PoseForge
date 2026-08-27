const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeValue, tableDigest, valueForTarget } = require("../scripts/import-postgres-to-pglite");

test("PostgreSQL import digest normalizes equivalent driver values", () => {
  const postgresRows = [{ id: "one", revision: "12", document: { b: 2, a: 1 } }];
  const pgliteRows = [{ document: { a: 1, b: 2 }, revision: 12n, id: "one" }];
  assert.equal(tableDigest(postgresRows), tableDigest(pgliteRows));
});

test("PostgreSQL import serializes JSON and timestamps for PGlite", () => {
  assert.equal(valueForTarget({ enabled: true }, { data_type: "jsonb" }), '{"enabled":true}');
  assert.equal(
    valueForTarget(new Date("2026-08-26T12:00:00.000Z"), { data_type: "timestamp with time zone" }),
    "2026-08-26T12:00:00.000Z"
  );
  assert.deepEqual(normalizeValue({ count: 2, nested: [1, 3n] }), {
    count: "2",
    nested: ["1", "3"],
  });
});

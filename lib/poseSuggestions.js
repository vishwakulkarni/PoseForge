const crypto = require("crypto");

const SINGLE_CATEGORY_ORDER = ["standing", "sitting", "action", "portrait"];
const GROUP_CATEGORY_ORDER = ["group", "action", "standing", "sitting"];

function stableOffset(seed, length) {
  if (!seed || length < 2) return 0;
  const digest = crypto.createHash("sha256").update(String(seed)).digest();
  return digest.readUInt32BE(0) % length;
}

function rotate(items, offset) {
  if (!items.length || !offset) return items;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

/**
 * Picks a compact, varied set of pose nodes for the Studio canvas. Curated
 * poses are preferred, while a stable per-subject rotation prevents every
 * identity from opening on the exact same suggestions.
 */
function selectPoseSuggestions(rows, { subjectCount = 1, limit = 5, seed = "" } = {}) {
  const wantsGroup = Number(subjectCount) > 1;
  const categoryOrder = wantsGroup ? GROUP_CATEGORY_ORDER : SINGLE_CATEGORY_ORDER;
  const eligible = rows
    .filter((row) => wantsGroup ? row.category === "group" : row.category !== "group")
    .sort((left, right) => Number(left.is_custom) - Number(right.is_custom));

  const buckets = new Map();
  for (const row of eligible) {
    const category = row.category || "other";
    const bucket = buckets.get(category) || [];
    bucket.push(row);
    buckets.set(category, bucket);
  }

  for (const [category, bucket] of buckets) {
    const categorySeed = seed ? `${seed}:${category}` : "";
    buckets.set(category, rotate(bucket, stableOffset(categorySeed, bucket.length)));
  }

  const orderedCategories = [
    ...categoryOrder.filter((category) => buckets.has(category)),
    ...[...buckets.keys()].filter((category) => !categoryOrder.includes(category)).sort(),
  ];
  const picked = [];
  let round = 0;
  while (picked.length < limit) {
    let added = false;
    for (const category of orderedCategories) {
      const candidate = buckets.get(category)?.[round];
      if (!candidate) continue;
      picked.push(candidate);
      added = true;
      if (picked.length === limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return picked;
}

module.exports = { selectPoseSuggestions };

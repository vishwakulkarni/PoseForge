#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const inputPath = path.resolve(__dirname, "..", "launch-readiness.json");
const checklist = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const statusValue = { done: 1, partial: 0.5, not_started: 0 };
const results = [];
const blockers = [];

for (const [category, items] of Object.entries(checklist)) {
  let earned = 0;
  let possible = 0;
  for (const item of items) {
    const weight = Number(item.weight || 1);
    if (!(item.status in statusValue)) {
      throw new Error(`Invalid status "${item.status}" for ${item.item}`);
    }
    earned += weight * statusValue[item.status];
    possible += weight;
    if (item.status === "not_started" && weight >= 3) blockers.push(item.item);
  }
  results.push({ category, score: Math.round((earned / possible) * 100) });
}

const overall = Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length);
console.log(`PoseForge launch readiness: ${overall}/100`);
for (const result of results) console.log(`- ${result.category}: ${result.score}/100`);

if (blockers.length) {
  console.log("Blockers:");
  for (const blocker of blockers) console.log(`- ${blocker}`);
  process.exitCode = 2;
} else if (overall < 80) {
  console.log("Decision: conditional; resolve partial items before launch.");
  process.exitCode = 1;
} else {
  console.log("Decision: launch-ready.");
}

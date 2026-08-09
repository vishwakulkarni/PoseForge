#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const tag = process.env.GITHUB_REF_NAME || process.argv[2] || `v${pkg.version}`;
const requiredFiles = [
  "CHANGELOG.md",
  "RELEASE_NOTES.md",
  "LICENSE",
  "SECURITY.md",
  "SUPPORT.md",
  "launch-readiness.json",
  "demo-output/poseforge-generation-walkthrough-15s.mp4",
  "web/public/demo/poseforge-readme-demo.gif",
  "web/public/demo/poseforge-readme-demo.mp4",
];

const errors = [];
if (tag !== `v${pkg.version}`) {
  errors.push(`Tag ${tag} does not match package version v${pkg.version}.`);
}

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).size === 0) {
    errors.push(`Required release file is missing or empty: ${relativePath}`);
  }
}

const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## [${pkg.version}]`)) {
  errors.push(`CHANGELOG.md has no ${pkg.version} release heading.`);
}

const notes = fs.readFileSync(path.join(root, "RELEASE_NOTES.md"), "utf8");
if (!notes.includes(`v${pkg.version}`)) {
  errors.push(`RELEASE_NOTES.md does not identify v${pkg.version}.`);
}
if (/\b(Draft|Placeholder|TBD|TODO)\b/i.test(notes)) {
  errors.push("RELEASE_NOTES.md still contains a draft placeholder.");
}

if (errors.length) {
  console.error(`Release verification failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Release v${pkg.version} is internally consistent and required media is present.`);

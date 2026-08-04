const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildMergePrompt } = require("../lib/promptTemplate");

test("buildMergePrompt includes base merge instructions for a single character", () => {
  const prompt = buildMergePrompt({});
  assert.match(prompt, /CHARACTER reference/);
  assert.match(prompt, /POSE reference/);
  assert.match(prompt, /photorealistic/i);
  assert.match(prompt, /You are given two images/);
});

test("buildMergePrompt defaults to a single character when characterCount is omitted", () => {
  const prompt = buildMergePrompt({});
  assert.match(prompt, /Image 1 is the CHARACTER reference/);
  assert.match(prompt, /Image 2 is the POSE reference/);
});

test("buildMergePrompt enumerates multiple character images and the correct pose image number", () => {
  const prompt = buildMergePrompt({ characterCount: 3 });
  assert.match(prompt, /You are given 4 images/);
  assert.match(prompt, /Images 1 through 3 are CHARACTER references/);
  assert.match(prompt, /Image 4 is the POSE reference/);
  assert.match(prompt, /all 3 people from Images 1-3/);
  assert.match(prompt, /Do not swap, blend, or merge features/);
});

test("buildMergePrompt clamps characterCount to the 1-4 range", () => {
  const low = buildMergePrompt({ characterCount: 0 });
  assert.match(low, /You are given two images/);
  const high = buildMergePrompt({ characterCount: 9 });
  assert.match(high, /Images 1 through 4 are CHARACTER references/);
  assert.match(high, /Image 5 is the POSE reference/);
});

test("buildMergePrompt appends background and style preset fragments in order", () => {
  const prompt = buildMergePrompt({
    backgroundPresetFragment: "BACKGROUND_FRAGMENT",
    stylePresetFragment: "STYLE_FRAGMENT",
  });
  const bgIndex = prompt.indexOf("BACKGROUND_FRAGMENT");
  const styleIndex = prompt.indexOf("STYLE_FRAGMENT");
  assert.ok(bgIndex > -1, "background fragment missing");
  assert.ok(styleIndex > -1, "style fragment missing");
  assert.ok(bgIndex < styleIndex, "background fragment should come before style fragment");
});

test("buildMergePrompt appends custom instructions last", () => {
  const prompt = buildMergePrompt({
    backgroundPresetFragment: "BACKGROUND_FRAGMENT",
    customInstructions: "make the sky purple",
  });
  assert.match(prompt, /Additional instructions from the user: make the sky purple/);
  assert.ok(prompt.indexOf("BACKGROUND_FRAGMENT") < prompt.indexOf("make the sky purple"));
});

test("buildMergePrompt omits optional fragments entirely when not provided", () => {
  const prompt = buildMergePrompt({});
  assert.doesNotMatch(prompt, /Additional instructions from the user/);
});

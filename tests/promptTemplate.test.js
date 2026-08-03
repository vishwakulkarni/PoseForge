const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildMergePrompt } = require("../lib/promptTemplate");

test("buildMergePrompt includes base merge instructions", () => {
  const prompt = buildMergePrompt({});
  assert.match(prompt, /CHARACTER reference/);
  assert.match(prompt, /POSE reference/);
  assert.match(prompt, /photorealistic/i);
});

test("buildMergePrompt references the character name when provided", () => {
  const prompt = buildMergePrompt({ characterName: "Daksh" });
  assert.match(prompt, /"Daksh"/);
});

test("buildMergePrompt omits a name reference when none is given", () => {
  const prompt = buildMergePrompt({});
  assert.doesNotMatch(prompt, /\(""\)/);
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

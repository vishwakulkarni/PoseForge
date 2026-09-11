const test = require("node:test");
const assert = require("node:assert/strict");
const { describeCodexFailure } = require("../engines/codexEngine");

test("describeCodexFailure surfaces a usage-limit message with the retry time", () => {
  const stderr = [
    "warning: Skill descriptions were shortened to fit the skills context budget.",
    "ERROR: You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 5:15 PM.",
  ].join("\n");

  const message = describeCodexFailure(stderr, "", 1);

  assert.match(message, /usage limit reached/i);
  assert.match(message, /try again at 5:15 PM/i);
  assert.match(message, /chatgpt\.com\/explore\/pro/);
  assert.doesNotMatch(message, /skill descriptions/i);
});

test("describeCodexFailure falls back to the last ERROR: line when there is no usage limit", () => {
  const stderr = "some unrelated warning\nERROR: Model access denied for this account.";
  assert.equal(describeCodexFailure(stderr, "", 1), "Codex CLI failed: ERROR: Model access denied for this account.");
});

test("describeCodexFailure falls back to the exit code when stderr has no usable detail", () => {
  assert.equal(describeCodexFailure("", "", 1), "Codex CLI exited with code 1.");
});

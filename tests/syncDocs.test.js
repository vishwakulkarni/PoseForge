const test = require("node:test");
const assert = require("node:assert/strict");
const { rewriteDocumentLinks } = require("../scripts/sync-docs");

test("documentation sync rewrites repository markdown links to app routes", () => {
  const markdown = [
    "See [Security](../SECURITY.md), [Privacy](../PRIVACY.md#providers), and [Support](../SUPPORT.md).",
    "Keep [external links](https://example.com/SECURITY.md) unchanged.",
  ].join("\n");

  assert.equal(
    rewriteDocumentLinks(markdown, { src: "docs/TROUBLESHOOTING.md" }),
    [
      "See [Security](/docs/security), [Privacy](/docs/privacy#providers), and [Support](/docs/support).",
      "Keep [external links](https://example.com/SECURITY.md) unchanged.",
    ].join("\n"),
  );
});

test("documentation sync does not rewrite links inside fenced examples", () => {
  const markdown = [
    "```md",
    "[Security](../SECURITY.md)",
    "```",
  ].join("\n");

  assert.equal(
    rewriteDocumentLinks(markdown, { src: "docs/TROUBLESHOOTING.md" }),
    markdown,
  );
});

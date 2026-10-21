const test = require("node:test");
const assert = require("node:assert/strict");
const { smartThumbnailsEnabled, thumbnailUrl, sourceThumbnails } = require("../lib/thumbnails");

function withFlag(value, run) {
  const previous = process.env.SMART_THUMBNAILS;
  if (value === undefined) delete process.env.SMART_THUMBNAILS;
  else process.env.SMART_THUMBNAILS = value;
  try { run(); } finally {
    if (previous === undefined) delete process.env.SMART_THUMBNAILS;
    else process.env.SMART_THUMBNAILS = previous;
  }
}

test("smart thumbnails are off unless SMART_THUMBNAILS=true", () => {
  withFlag(undefined, () => assert.equal(smartThumbnailsEnabled(), false));
  withFlag("false", () => assert.equal(smartThumbnailsEnabled(), false));
  withFlag("true", () => assert.equal(smartThumbnailsEnabled(), true));
});

test("stored images go through the thumbnail route when the flag is on", () => {
  withFlag("true", () => {
    assert.equal(
      thumbnailUrl("/storage/generations/a b/output.png", 760.4, 570),
      "/api/thumbnails?url=%2Fstorage%2Fgenerations%2Fa%20b%2Foutput.png&w=760&h=570",
    );
    // Source strips share the card width between their images.
    assert.match(sourceThumbnails(["/storage/a.png", "/storage/b.png", "/storage/c.png"])[0], /&w=240&h=540$/);
  });
});

test("the flag off (the default), or an image PoseForge does not store, keeps the original URL", () => {
  withFlag(undefined, () => assert.equal(thumbnailUrl("/storage/a.png", 100, 100), "/storage/a.png"));
  withFlag("true", () => {
    assert.equal(thumbnailUrl("/demo/x.png", 100, 100), "/demo/x.png");
    assert.equal(thumbnailUrl(null, 100, 100), null);
  });
});

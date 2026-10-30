/**
 * Lists every stored file a tool result mentions, with an absolute URL and the
 * file's path on disk. A local agent usually wants the file itself (to post,
 * edit or hand to another tool), and `/storage/...` alone is neither.
 *
 * The result itself is left untouched: agents send documents back through
 * update_workflow, and those must keep their `/storage/...` URLs.
 */
const storage = require("../storage");

function collectStorageUrls(value, found = new Set()) {
  if (typeof value === "string") {
    if (value.startsWith("/storage/")) found.add(value.split("?")[0]);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStorageUrls(item, found);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStorageUrls(item, found);
  }
  return found;
}

function describeFiles(value, baseUrl) {
  return [...collectStorageUrls(value)].map((url) => ({
    url,
    absoluteUrl: new URL(url, baseUrl).href,
    path: storage.absolutePathFromPublicUrl(url),
  }));
}

module.exports = { describeFiles };

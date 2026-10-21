/**
 * Gallery thumbnail URLs.
 *
 * By default the gallery gets the original image URLs and the client crops
 * them from the top (`object-top`). Set SMART_THUMBNAILS=true to serve stored
 * images through /api/thumbnails instead, which crops around the subject at
 * the card's exact size.
 */
function smartThumbnailsEnabled() {
  return process.env.SMART_THUMBNAILS === "true";
}

function thumbnailUrl(url, width, height) {
  if (!smartThumbnailsEnabled() || !String(url || "").startsWith("/storage/")) return url;
  return `/api/thumbnails?url=${encodeURIComponent(url)}&w=${Math.round(width)}&h=${Math.round(height)}`;
}

// Card image slot: one result fills the 4:3 card; source images share its width.
const CARD_WIDTH = 760;
const CARD_HEIGHT = 570;

const resultThumbnail = (url) => (url ? thumbnailUrl(url, CARD_WIDTH, CARD_HEIGHT) : url);
const sourceThumbnails = (urls) => urls.map((url) => thumbnailUrl(url, 720 / urls.length, 540));

module.exports = { smartThumbnailsEnabled, thumbnailUrl, resultThumbnail, sourceThumbnails };

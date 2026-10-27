/**
 * Where the public site lives, for the metadata that must be absolute:
 * canonical links, Open Graph images, robots and the sitemap. The full app
 * runs locally; only the GitHub Pages build is public, so that is the default
 * production origin. NEXT_PUBLIC_SITE_URL overrides it (a custom domain).
 */
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';
const ORIGIN = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.GITHUB_PAGES === 'true' ? 'https://vishwakulkarni.github.io' : 'http://localhost:3000');

export const SITE_ORIGIN = ORIGIN.replace(/\/$/, '');
export const SITE_URL = `${SITE_ORIGIN}${BASE_PATH}`;
export const SITE_NAME = 'PoseForge';
export const SITE_TITLE = 'PoseForge — Your local-first AI studio';
export const SITE_DESCRIPTION =
  'A local-first, open-source AI studio for images and video. Your characters and results stay on your machine; switch between Codex, Gemini, OpenAI, ComfyUI, Higgsfield, Dreamina and more without re-uploading or setting up again.';

/** Absolute URL for a site path such as "/docs/privacy". The static export
 * serves every page as a directory, so its URLs end in a slash. */
export function absoluteUrl(path: string) {
  const trailingSlash = process.env.GITHUB_PAGES === 'true' && !path.endsWith('/') ? '/' : '';
  return `${SITE_URL}${path}${trailingSlash}`;
}

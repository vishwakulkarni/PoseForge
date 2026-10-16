import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadSite(env: Record<string, string>) {
  vi.resetModules();
  for (const key of ['GITHUB_PAGES', 'NEXT_PUBLIC_BASE_PATH', 'NEXT_PUBLIC_SITE_URL']) {
    vi.stubEnv(key, env[key] ?? '');
  }
  return import('@/lib/site');
}

afterEach(() => vi.unstubAllEnvs());

describe('site URLs', () => {
  it('uses the Pages origin and base path for the GitHub Pages build', async () => {
    const site = await loadSite({ GITHUB_PAGES: 'true', NEXT_PUBLIC_BASE_PATH: '/PoseForge' });
    expect(site.SITE_ORIGIN).toBe('https://vishwakulkarni.github.io');
    expect(site.absoluteUrl('/')).toBe('https://vishwakulkarni.github.io/PoseForge/');
    expect(site.absoluteUrl('/docs/privacy')).toBe('https://vishwakulkarni.github.io/PoseForge/docs/privacy/');
  });

  it('falls back to the local origin without trailing slashes outside the export', async () => {
    const site = await loadSite({});
    expect(site.SITE_URL).toBe('http://localhost:3000');
    expect(site.absoluteUrl('/docs/privacy')).toBe('http://localhost:3000/docs/privacy');
  });

  it('lets a custom domain override the origin', async () => {
    const site = await loadSite({ NEXT_PUBLIC_SITE_URL: 'https://poseforge.app/', GITHUB_PAGES: 'true' });
    expect(site.SITE_ORIGIN).toBe('https://poseforge.app');
  });
});

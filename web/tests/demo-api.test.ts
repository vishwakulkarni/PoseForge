import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoAutosave, isDemoAutosave, readDemoFixture } from '@/lib/api/demo';

function stubFixtures(files: Record<string, unknown>) {
  const requested: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requested.push(url);
    const body = files[url];
    return body === undefined
      ? { ok: false, text: async () => '' }
      : { ok: true, text: async () => JSON.stringify(body) };
  }));
  return requested;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('static demo API', () => {
  it('shares one fixture per path, except for presets and metrics which depend on their query', async () => {
    const requested = stubFixtures({
      '/demo-api/generations.json': { generations: [] },
      '/demo-api/presets@type=style.json': { presets: [] },
    });
    await readDemoFixture('/api/generations?limit=30&status=completed');
    await readDemoFixture('/api/presets?type=style');
    expect(requested).toEqual(['/demo-api/generations.json', '/demo-api/presets@type=style.json']);
  });

  it('resolves null when a fixture does not exist', async () => {
    stubFixtures({});
    expect(await readDemoFixture('/api/nothing')).toBeNull();
  });

  it('serves from, and prefixes media URLs with, the site base path', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/PoseForge');
    vi.resetModules();
    const { readDemoFixture: readWithBase } = await import('@/lib/api/demo');
    const requested = stubFixtures({ '/PoseForge/demo-api/characters.json': { photo: '/demo-media/a.webp', example: '/demo/b.jpg' } });
    expect(await readWithBase('/api/characters')).toEqual({
      photo: '/PoseForge/demo-media/a.webp',
      example: '/PoseForge/demo/b.jpg',
    });
    expect(requested).toEqual(['/PoseForge/demo-api/characters.json']);
  });

  it('treats only a PUT to a project as autosave', () => {
    expect(isDemoAutosave('/api/advanced-studio-projects/abc', 'PUT')).toBe(true);
    expect(isDemoAutosave('/api/studio-projects/abc', 'PUT')).toBe(true);
    expect(isDemoAutosave('/api/studio-projects/abc', 'GET')).toBe(false);
    expect(isDemoAutosave('/api/studio-projects', 'POST')).toBe(false);
    expect(isDemoAutosave('/api/studio-projects/abc/run', 'POST')).toBe(false);
    expect(isDemoAutosave('/api/advanced-studio-projects/abc/nodes/n1/run', 'PUT')).toBe(false);
  });

  it('acknowledges an autosave by echoing the saved document at the next revision', async () => {
    stubFixtures({ '/demo-api/studio-projects/abc.json': { id: 'abc', name: 'Example', revision: 3, document: { old: true } } });
    const saved = await demoAutosave<{ revision: number; document: unknown; name: string }>(
      '/api/studio-projects/abc',
      JSON.stringify({ expectedRevision: 5, document: { fresh: true } }),
    );
    expect(saved).toMatchObject({ id: 'abc', name: 'Example', revision: 6, document: { fresh: true } });
  });
});

import * as React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import type { StudioProjectDocument } from '@/lib/api/types';
import {
  STUDIO_PROJECT_SAVE_DELAY_MS,
  useStudioProjectWorkspace,
} from '@/lib/studio/project-workspace';
import { makeTestQueryClient } from './helpers/render';
import { server } from './helpers/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => server.close());

const projectId = '33333333-3333-4333-8333-333333333333';

function projectDocument(overrides: Partial<StudioProjectDocument> = {}): StudioProjectDocument {
  return {
    schemaVersion: 1,
    viewport: { x: 12, y: 24, zoom: 0.9 },
    nodes: [
      { id: 'generate', kind: 'generate', position: { x: 100, y: 200 } },
    ],
    edges: [],
    locked: false,
    ...overrides,
  };
}

function projectResponse(revision: number, document: StudioProjectDocument) {
  return {
    id: projectId,
    name: 'My Studio',
    schemaVersion: 1,
    revision,
    document,
    isDefault: true,
    createdAt: '2026-08-17T10:00:00.000Z',
    updatedAt: '2026-08-17T10:05:00.000Z',
  };
}

function wrapper() {
  const queryClient = makeTestQueryClient();
  function StudioProjectTestProvider({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return StudioProjectTestProvider;
}

describe('Studio project save queue', () => {
  it('uses a five-second quiet window in production', () => {
    expect(STUDIO_PROJECT_SAVE_DELAY_MS).toBe(5_000);
  });

  it('does not write a snapshot that is already acknowledged', async () => {
    const document = projectDocument();
    let updates = 0;
    server.use(
      http.get('/api/studio-projects/default', () =>
        HttpResponse.json(projectResponse(3, document)),
      ),
      http.put('/api/studio-projects/:id', () => {
        updates += 1;
        return HttpResponse.json(projectResponse(4, document));
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 25 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.revision).toBe(3));

    act(() => result.current.save(document));
    await act(async () => delay(20));

    expect(updates).toBe(0);
    expect(result.current.saveState).toBe('saved');
  });

  it('serializes rapid edits and coalesces them to the newest pending snapshot', async () => {
    const initial = projectDocument();
    const requests: Array<{ expectedRevision: number; document: StudioProjectDocument }> = [];
    let concurrent = 0;
    let maximumConcurrent = 0;
    server.use(
      http.get('/api/studio-projects/default', () =>
        HttpResponse.json(projectResponse(10, initial)),
      ),
      http.put('/api/studio-projects/:id', async ({ request }) => {
        const body = await request.json() as {
          expectedRevision: number;
          document: StudioProjectDocument;
        };
        requests.push(body);
        concurrent += 1;
        maximumConcurrent = Math.max(maximumConcurrent, concurrent);
        await delay(30);
        concurrent -= 1;
        return HttpResponse.json(projectResponse(body.expectedRevision + 1, body.document));
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 40 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.revision).toBe(10));
    const first = projectDocument({ locked: true });
    const second = projectDocument({ viewport: { x: 50, y: 60, zoom: 1.1 } });
    const latest = projectDocument({ viewport: { x: 90, y: 120, zoom: 1.3 } });

    act(() => result.current.save(first));
    await act(async () => delay(15));
    act(() => result.current.save(second));
    await act(async () => delay(15));
    act(() => result.current.save(latest));

    await act(async () => delay(20));
    expect(requests).toHaveLength(0);
    expect(result.current.saveState).toBe('pending');

    await waitFor(() => expect(result.current.saveState).toBe('saved'));
    expect(maximumConcurrent).toBe(1);
    expect(requests).toHaveLength(1);
    expect(requests.map((request) => request.expectedRevision)).toEqual([10]);
    expect(requests.at(-1)?.document).toEqual(latest);
  });

  it('retries the newest edit when a conflict refresh overlaps another save', async () => {
    const initial = projectDocument();
    const olderEdit = projectDocument({ locked: true });
    const newestEdit = projectDocument({ viewport: { x: 300, y: 400, zoom: 1.5 } });
    const requests: Array<{ expectedRevision: number; document: StudioProjectDocument }> = [];
    let gets = 0;
    server.use(
      http.get('/api/studio-projects/default', async () => {
        gets += 1;
        if (gets > 1) await delay(50);
        return HttpResponse.json(projectResponse(gets > 1 ? 8 : 4, initial));
      }),
      http.put('/api/studio-projects/:id', async ({ request }) => {
        const body = await request.json() as {
          expectedRevision: number;
          document: StudioProjectDocument;
        };
        requests.push(body);
        if (body.expectedRevision < 8) {
          return HttpResponse.json(
            { error: 'This Studio project changed in another tab.', currentRevision: 8 },
            { status: 409 },
          );
        }
        return HttpResponse.json(projectResponse(9, body.document));
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 20 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.revision).toBe(4));

    act(() => result.current.save(olderEdit));
    await waitFor(() => expect(result.current.saveState).toBe('conflict'));

    let retry: Promise<void>;
    act(() => {
      retry = result.current.retry();
    });
    await act(async () => delay(10));
    act(() => result.current.save(newestEdit));
    await act(async () => retry!);

    await waitFor(() => expect(result.current.saveState).toBe('saved'));
    expect(requests.at(-1)).toEqual({ expectedRevision: 8, document: newestEdit });
    expect(requests.at(-1)?.document).not.toEqual(olderEdit);
  });

  it('flushes pending edits before switching to a cached project selection', async () => {
    const initial = projectDocument();
    const pendingEdit = projectDocument({ viewport: { x: 410, y: 220, zoom: 1.4 } });
    const secondId = '44444444-4444-4444-8444-444444444444';
    const secondDocument = projectDocument({
      nodes: [{ id: 'generate', kind: 'generate', position: { x: 700, y: 200 } }],
    });
    const events: string[] = [];
    server.use(
      http.get('/api/studio-projects/default', () =>
        HttpResponse.json(projectResponse(2, initial)),
      ),
      http.get('/api/studio-projects', () => HttpResponse.json({
        projects: [
          { ...projectResponse(2, initial), document: undefined },
          {
            id: secondId,
            name: 'Campaign concepts',
            schemaVersion: 1,
            revision: 5,
            isDefault: false,
            createdAt: '2026-08-18T10:00:00.000Z',
            updatedAt: '2026-08-18T11:00:00.000Z',
          },
        ],
      })),
      http.put('/api/studio-projects/:id', async ({ request }) => {
        events.push('save');
        const body = await request.json() as {
          expectedRevision: number;
          document: StudioProjectDocument;
        };
        return HttpResponse.json(projectResponse(body.expectedRevision + 1, body.document));
      }),
      http.get(`/api/studio-projects/${secondId}`, () => {
        events.push('open');
        return HttpResponse.json({
          id: secondId,
          name: 'Campaign concepts',
          schemaVersion: 1,
          revision: 5,
          document: secondDocument,
          isDefault: false,
          createdAt: '2026-08-18T10:00:00.000Z',
          updatedAt: '2026-08-18T11:00:00.000Z',
        });
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 5_000 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.id).toBe(projectId));

    act(() => result.current.save(pendingEdit));
    expect(result.current.saveState).toBe('pending');
    await act(async () => result.current.switchProject(secondId));

    await waitFor(() => expect(result.current.project?.id).toBe(secondId));
    expect(events).toEqual(['save', 'open']);
    expect(result.current.project?.document).toEqual(secondDocument);
    expect(result.current.saveState).toBe('saved');
  });

  it('creates a blank named project and makes it the active workspace', async () => {
    const initial = projectDocument();
    const createdId = '55555555-5555-4555-8555-555555555555';
    let submittedName = '';
    let created = false;
    server.use(
      http.get('/api/studio-projects/default', () =>
        HttpResponse.json(projectResponse(1, initial)),
      ),
      http.get('/api/studio-projects', () => HttpResponse.json({
        projects: [
          {
            id: projectId,
            name: 'My Studio',
            schemaVersion: 1,
            revision: 1,
            isDefault: true,
            createdAt: '2026-08-17T10:00:00.000Z',
            updatedAt: '2026-08-17T10:05:00.000Z',
          },
          ...(created ? [{
            id: createdId,
            name: 'Holiday launch',
            schemaVersion: 1,
            revision: 0,
            isDefault: false,
            createdAt: '2026-08-19T10:00:00.000Z',
            updatedAt: '2026-08-19T10:00:00.000Z',
          }] : []),
        ],
      })),
      http.post('/api/studio-projects', async ({ request }) => {
        const body = await request.json() as { name: string };
        submittedName = body.name;
        created = true;
        return HttpResponse.json({
          id: createdId,
          name: body.name,
          schemaVersion: 1,
          revision: 0,
          document: projectDocument({ viewport: null, nodes: [], edges: [] }),
          isDefault: false,
          createdAt: '2026-08-19T10:00:00.000Z',
          updatedAt: '2026-08-19T10:00:00.000Z',
        }, { status: 201 });
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 25 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.id).toBe(projectId));

    await act(async () => result.current.createProject('  Holiday launch  '));

    await waitFor(() => expect(result.current.project?.id).toBe(createdId));
    expect(submittedName).toBe('Holiday launch');
    expect(result.current.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: createdId, name: 'Holiday launch' }),
    ]));
  });

  it('keeps a newly created project visible when the server list is temporarily stale', async () => {
    const initial = projectDocument();
    const createdId = '66666666-6666-4666-8666-666666666666';
    let listRequests = 0;
    server.use(
      http.get('/api/studio-projects/default', () =>
        HttpResponse.json(projectResponse(1, initial)),
      ),
      http.get('/api/studio-projects', async () => {
        listRequests += 1;
        await delay(60);
        return HttpResponse.json({
          projects: [{
            id: projectId,
            name: 'My Studio',
            schemaVersion: 1,
            revision: 1,
            isDefault: true,
            createdAt: '2026-08-17T10:00:00.000Z',
            updatedAt: '2026-08-17T10:05:00.000Z',
          }],
        });
      }),
      http.post('/api/studio-projects', async ({ request }) => {
        const body = await request.json() as { name: string };
        return HttpResponse.json({
          id: createdId,
          name: body.name,
          schemaVersion: 1,
          revision: 0,
          document: projectDocument({ viewport: null, nodes: [], edges: [] }),
          isDefault: false,
          createdAt: '2026-08-19T10:00:00.000Z',
          updatedAt: '2026-08-19T10:00:00.000Z',
        }, { status: 201 });
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 25 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.id).toBe(projectId));

    await act(async () => result.current.createProject('New campaign'));
    await act(async () => delay(100));

    expect(listRequests).toBe(1);
    expect(result.current.project?.id).toBe(createdId);
    expect(result.current.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: createdId, name: 'New campaign' }),
    ]));
  });

  it('does not report creation as failed when local storage is unavailable', async () => {
    const initial = projectDocument();
    const createdId = '77777777-7777-4777-8777-777777777777';
    const storageFailure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is unavailable.', 'SecurityError');
    });
    server.use(
      http.get('/api/studio-projects/default', () =>
        HttpResponse.json(projectResponse(1, initial)),
      ),
      http.post('/api/studio-projects', async ({ request }) => {
        const body = await request.json() as { name: string };
        return HttpResponse.json({
          id: createdId,
          name: body.name,
          schemaVersion: 1,
          revision: 0,
          document: projectDocument({ viewport: null, nodes: [], edges: [] }),
          isDefault: false,
          createdAt: '2026-08-19T10:00:00.000Z',
          updatedAt: '2026-08-19T10:00:00.000Z',
        }, { status: 201 });
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 25 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.id).toBe(projectId));

    await expect(act(async () => result.current.createProject('Private session')))
      .resolves.toMatchObject({ id: createdId });
    await waitFor(() => expect(result.current.project?.id).toBe(createdId));
    expect(result.current.projectActionError).toBeNull();
    storageFailure.mockRestore();
  });

  it('deletes the active user project and returns to My Studio', async () => {
    const userProjectId = '99999999-9999-4999-8999-999999999999';
    const initial = projectDocument({ nodes: [] });
    const userProject = {
      id: userProjectId,
      name: 'Temporary shoot',
      schemaVersion: 1,
      revision: 0,
      document: initial,
      isDefault: false,
      createdAt: '2026-08-19T10:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
    };
    let deletedId = '';
    server.use(
      http.get(`/api/studio-projects/${userProjectId}`, () => HttpResponse.json(userProject)),
      http.get('/api/studio-projects/default', () =>
        HttpResponse.json(projectResponse(1, initial)),
      ),
      http.get('/api/studio-projects', () => HttpResponse.json({
        projects: [
          { ...userProject, document: undefined },
          {
            id: projectId,
            name: 'My Studio',
            schemaVersion: 1,
            revision: 1,
            isDefault: true,
            createdAt: '2026-08-17T10:00:00.000Z',
            updatedAt: '2026-08-17T10:05:00.000Z',
          },
        ],
      })),
      http.delete(`/api/studio-projects/${userProjectId}`, () => {
        deletedId = userProjectId;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { result } = renderHook(
      () => useStudioProjectWorkspace({ saveDelayMs: 25 }),
      { wrapper: wrapper() },
    );
    await waitFor(() => expect(result.current.project?.id).toBe(projectId));
    await act(async () => result.current.switchProject(userProjectId));
    await waitFor(() => expect(result.current.project?.id).toBe(userProjectId));

    await act(async () => result.current.deleteProject(userProjectId));

    await waitFor(() => expect(result.current.project?.id).toBe(projectId));
    expect(deletedId).toBe(userProjectId);
    expect(result.current.projects).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: userProjectId }),
    ]));
    expect(result.current.projects).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: projectId, isDefault: true }),
    ]));
  });
});

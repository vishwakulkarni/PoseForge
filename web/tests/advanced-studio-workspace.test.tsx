import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { makeTestQueryClient } from './helpers/render';
import { server } from './helpers/server';
import { useAdvancedWorkspace } from '@/lib/advanced-studio/use-advanced-workspace';
import type { AdvDocument } from '@/lib/advanced-studio/types';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const PROJECT_ID = 'project-1';

function document(overrides: Partial<AdvDocument> = {}): AdvDocument {
  return {
    schemaVersion: 2,
    template: 'image',
    viewport: { x: 0, y: 0, zoom: 1 },
    locked: false,
    nodes: [],
    edges: [],
    ...overrides,
  };
}

function projectResponse(revision: number, doc = document()) {
  return {
    id: PROJECT_ID,
    name: 'Lighthouse run',
    workspace: 'advanced',
    template: doc.template,
    schemaVersion: 2,
    revision,
    document: doc,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = makeTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function serveProject(revision = 2) {
  server.use(http.get(`/api/advanced-studio-projects/${PROJECT_ID}`, () =>
    HttpResponse.json(projectResponse(revision))));
}

describe('Advanced Studio autosave', () => {
  it('loads the project and reports it as saved', async () => {
    serveProject();
    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 10), { wrapper });
    await waitFor(() => expect(result.current.project?.id).toBe(PROJECT_ID));
    expect(result.current.saveState).toBe('saved');
  });

  it('debounces edits into a single revision-checked save', async () => {
    serveProject(2);
    const bodies: Record<string, unknown>[] = [];
    server.use(http.put(`/api/advanced-studio-projects/${PROJECT_ID}`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      bodies.push(body);
      return HttpResponse.json(projectResponse(3, body.document as AdvDocument));
    }));

    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 20), { wrapper });
    await waitFor(() => expect(result.current.project).not.toBeNull());

    act(() => {
      result.current.save(document({ nodes: [{ id: 'a', type: 'text', position: { x: 0, y: 0 }, data: { text: 'one', mode: 'plain' } }] }));
      result.current.save(document({ nodes: [{ id: 'a', type: 'text', position: { x: 0, y: 0 }, data: { text: 'two', mode: 'plain' } }] }));
    });

    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    await waitFor(() => expect(result.current.saveState).toBe('saved'));
    // Only the latest intent reaches the server, pinned to the loaded revision.
    expect(bodies).toHaveLength(1);
    expect(bodies[0].expectedRevision).toBe(2);
    const saved = bodies[0].document as AdvDocument;
    expect((saved.nodes[0].data as { text: string }).text).toBe('two');
  });

  it('skips a save that would not change anything', async () => {
    serveProject(2);
    let puts = 0;
    server.use(http.put(`/api/advanced-studio-projects/${PROJECT_ID}`, async ({ request }) => {
      puts += 1;
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json(projectResponse(3, body.document as AdvDocument));
    }));

    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 10), { wrapper });
    await waitFor(() => expect(result.current.project).not.toBeNull());
    act(() => { result.current.save(document()); });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(puts).toBe(0);
  });

  // Regression: the hook treated any accompanying name as a change, so the
  // canvas passing the current project name on every autosave wrote forever.
  it('does not write when only an unchanged name accompanies the save', async () => {
    serveProject(2);
    let puts = 0;
    server.use(http.put(`/api/advanced-studio-projects/${PROJECT_ID}`, async ({ request }) => {
      puts += 1;
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json(projectResponse(3, body.document as AdvDocument));
    }));

    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 10), { wrapper });
    await waitFor(() => expect(result.current.project).not.toBeNull());
    act(() => { result.current.save(document(), 'Lighthouse run'); });
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(puts).toBe(0);

    // An actual rename still saves.
    act(() => { result.current.save(document(), 'Harbour run'); });
    await waitFor(() => expect(puts).toBe(1));
  });

  it('surfaces a concurrent edit as a recoverable conflict', async () => {
    serveProject(2);
    server.use(http.put(`/api/advanced-studio-projects/${PROJECT_ID}`, () =>
      HttpResponse.json({ error: 'This project changed in another tab.', currentRevision: 7 }, { status: 409 })));

    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 10), { wrapper });
    await waitFor(() => expect(result.current.project).not.toBeNull());
    act(() => { result.current.save(document({ locked: true })); });
    await waitFor(() => expect(result.current.saveState).toBe('conflict'));
  });

  it('retries the newest intent after a failed save', async () => {
    serveProject(2);
    let attempts = 0;
    server.use(http.put(`/api/advanced-studio-projects/${PROJECT_ID}`, async ({ request }) => {
      attempts += 1;
      if (attempts === 1) return HttpResponse.json({ error: 'offline' }, { status: 500 });
      const body = await request.json() as Record<string, unknown>;
      return HttpResponse.json(projectResponse(3, body.document as AdvDocument));
    }));

    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 10), { wrapper });
    await waitFor(() => expect(result.current.project).not.toBeNull());
    act(() => { result.current.save(document({ locked: true })); });
    await waitFor(() => expect(result.current.saveState).toBe('error'));

    await act(async () => { await result.current.retry(); });
    await waitFor(() => expect(result.current.saveState).toBe('saved'));
    expect(attempts).toBe(2);
  });

  it('reports a missing project instead of hanging', async () => {
    server.use(http.get(`/api/advanced-studio-projects/${PROJECT_ID}`, () =>
      HttpResponse.json({ error: 'not found' }, { status: 404 })));
    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 10), { wrapper });
    await waitFor(() => expect(result.current.projectMissing).toBe(true));
  });

  it('adopts the revision returned by a server-side node run', async () => {
    serveProject(2);
    const bodies: Record<string, unknown>[] = [];
    server.use(http.put(`/api/advanced-studio-projects/${PROJECT_ID}`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      bodies.push(body);
      return HttpResponse.json(projectResponse(9, body.document as AdvDocument));
    }));

    const { result } = renderHook(() => useAdvancedWorkspace(PROJECT_ID, 10), { wrapper });
    await waitFor(() => expect(result.current.project).not.toBeNull());

    // A node run bumps the revision server-side; the next autosave must pin to
    // that revision instead of the one loaded with the project.
    act(() => { result.current.adoptProject(projectResponse(8) as never); });
    act(() => { result.current.save(document({ locked: true })); });
    await waitFor(() => expect(bodies.length).toBe(1));
    expect(bodies[0].expectedRevision).toBe(8);
  });
});

import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers/render';
import { server } from './helpers/server';
import { PosesView } from '@/app/poses/poses-view';
import type { AdvDocument } from '@/lib/advanced-studio/types';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  push.mockReset();
});
afterAll(() => server.close());

const pose = {
  id: 'pose-9',
  title: 'Seated pose',
  category: 'seated',
  tags: [],
  tagStatus: 'tagged',
  imageUrl: '/storage/poses/seated.png',
  sourceProvider: null,
  sourcePageUrl: null,
  isCustom: false,
  createdAt: '2026-09-01T10:00:00.000Z',
};

const starter: AdvDocument = {
  schemaVersion: 2,
  template: 'image',
  viewport: null,
  locked: false,
  nodes: [
    { id: 'text-1', type: 'text', position: { x: 0, y: 0 }, data: { text: '', mode: 'plain' } },
    { id: 'gen-1', type: 'imageGenerator', position: { x: 520, y: 0 }, data: { outputs: 1, activeResultIndex: 0 } },
  ],
  edges: [],
};

function advancedProject(document: AdvDocument, revision: number) {
  return {
    id: 'adv-1', name: 'Seated pose', workspace: 'advanced', template: 'image',
    schemaVersion: 2, revision, document,
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  };
}

async function openChooser() {
  server.use(http.get('/api/pose-references', () => HttpResponse.json({ poseReferences: [pose] })));
  const user = userEvent.setup();
  renderWithProviders(<PosesView />);
  await user.click(await screen.findByRole('button', { name: 'Use in Studio' }));
  expect(await screen.findByRole('heading', { name: 'Use this pose in…' })).toBeInTheDocument();
  return user;
}

describe('Use a pose from the library', () => {
  it('creates a Studio project and opens it with the pose selected', async () => {
    let created: { name?: string; document?: { nodes: Array<Record<string, unknown>> } } | null = null;
    server.use(http.post('/api/studio-projects', async ({ request }) => {
      created = await request.json() as NonNullable<typeof created>;
      return HttpResponse.json({
        id: 'studio-1', name: 'Seated pose', schemaVersion: 1, revision: 1, isDefault: false,
        document: { schemaVersion: 1, viewport: null, nodes: [], edges: [], locked: false },
        createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
      }, { status: 201 });
    }));
    const user = await openChooser();

    await user.click(screen.getByRole('button', { name: /^Studio/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/studio/studio-1'));
    expect(created!.name).toBe('Seated pose');
    expect(created!.document!.nodes).toEqual([
      expect.objectContaining({ id: 'pose-pose-9', kind: 'pose', assetType: 'pose', assetId: 'pose-9', imageUrl: '/storage/poses/seated.png' }),
    ]);
  });

  it('creates an image workflow with the pose wired in as a reference image', async () => {
    let saved: { expectedRevision: number; document: AdvDocument } | null = null;
    server.use(
      http.post('/api/advanced-studio-projects', () => HttpResponse.json(advancedProject(starter, 1), { status: 201 })),
      http.put('/api/advanced-studio-projects/adv-1', async ({ request }) => {
        saved = await request.json() as { expectedRevision: number; document: AdvDocument };
        return HttpResponse.json(advancedProject(saved.document, 2));
      }),
    );
    const user = await openChooser();

    await user.click(screen.getByRole('button', { name: /^Advanced Studio/ }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/studio-advanced/adv-1'));
    expect(saved!.expectedRevision).toBe(1);
    expect(saved!.document.nodes.find((node) => node.type === 'imageInput')).toMatchObject({
      data: { imageUrl: '/storage/poses/seated.png' },
    });
    expect(saved!.document.edges).toEqual([
      expect.objectContaining({ target: 'gen-1', targetHandle: 'image' }),
    ]);
  });

  it('stays on the page and reports the failure when creation fails', async () => {
    server.use(http.post('/api/studio-projects', () => HttpResponse.json({ error: 'No database.' }, { status: 500 })));
    const user = await openChooser();

    await user.click(screen.getByRole('button', { name: /^Studio/ }));

    expect(await screen.findByText(/No database|could not be created/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

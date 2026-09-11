import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers/render';
import { server } from './helpers/server';
import { AdvancedProjectsView } from '@/app/studio-advanced/advanced-projects-view';
import type { AdvProjectSummary } from '@/lib/advanced-studio/types';

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

function summary(overrides: Partial<AdvProjectSummary> = {}): AdvProjectSummary {
  return {
    id: 'project-1',
    name: 'Lighthouse run',
    workspace: 'advanced',
    template: 'image',
    schemaVersion: 2,
    revision: 4,
    nodeCount: 2,
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    preview: { generatedImageUrl: null, loadedImageUrls: [] },
    ...overrides,
  };
}

function listReturns(projects: AdvProjectSummary[]) {
  server.use(http.get('/api/advanced-studio-projects', () => HttpResponse.json({ projects })));
}

describe('Advanced Studio project gallery', () => {
  it('lists only Advanced Studio workflows with their template and node count', async () => {
    listReturns([summary(), summary({ id: 'project-2', name: 'Trailer', template: 'storyboard', nodeCount: 9 })]);
    renderWithProviders(<AdvancedProjectsView />);

    expect(await screen.findByText('Lighthouse run')).toBeInTheDocument();
    expect(screen.getByText('Trailer')).toBeInTheDocument();
    expect(screen.getByText('Storyboard')).toBeInTheDocument();
    expect(screen.getByText(/9 nodes/)).toBeInTheDocument();
  });

  it('invites the first workflow when the workspace is empty', async () => {
    listReturns([]);
    renderWithProviders(<AdvancedProjectsView />);
    expect(await screen.findByText('No workflows yet')).toBeInTheDocument();
  });

  it('offers image, video, storyboard and blank starting points', async () => {
    listReturns([]);
    const user = userEvent.setup();
    renderWithProviders(<AdvancedProjectsView />);

    await user.click(await screen.findByRole('button', { name: /New project/ }));
    const dialog = await screen.findByRole('dialog');
    const choices = within(dialog).getAllByRole('radio').map((option) => option.textContent);
    expect(choices.some((choice) => choice?.includes('Image generation'))).toBe(true);
    expect(choices.some((choice) => choice?.includes('Video generation'))).toBe(true);
    expect(choices.some((choice) => choice?.includes('Storyboard'))).toBe(true);
    expect(choices.some((choice) => choice?.includes('Blank canvas'))).toBe(true);
  });

  it('creates the chosen template and opens the new workflow', async () => {
    listReturns([]);
    const requests: Record<string, unknown>[] = [];
    server.use(http.post('/api/advanced-studio-projects', async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      requests.push(body);
      return HttpResponse.json({
        id: 'project-new', name: body.name, workspace: 'advanced', template: body.template,
        schemaVersion: 2, revision: 0,
        document: { schemaVersion: 2, template: body.template, viewport: null, nodes: [], edges: [], locked: false },
        createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
      }, { status: 201 });
    }));

    const user = userEvent.setup();
    renderWithProviders(<AdvancedProjectsView />);
    await user.click(await screen.findByRole('button', { name: /New project/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /Storyboard/ }));
    await user.click(within(dialog).getByRole('button', { name: /Create workflow/ }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].template).toBe('storyboard');
    expect(push).toHaveBeenCalledWith('/studio-advanced/project-new');
  });

  it('defaults a blank project to a sensible name', async () => {
    listReturns([]);
    const requests: Record<string, unknown>[] = [];
    server.use(http.post('/api/advanced-studio-projects', async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      requests.push(body);
      return HttpResponse.json({
        id: 'project-blank', name: body.name, workspace: 'advanced', template: 'blank',
        schemaVersion: 2, revision: 0,
        document: { schemaVersion: 2, template: 'blank', viewport: null, nodes: [], edges: [], locked: false },
        createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
      }, { status: 201 });
    }));

    const user = userEvent.setup();
    renderWithProviders(<AdvancedProjectsView />);
    await user.click(await screen.findByRole('button', { name: /New project/ }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('radio', { name: /Blank canvas/ }));
    await user.click(within(dialog).getByRole('button', { name: /Create workflow/ }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toEqual({ name: 'Blank canvas', template: 'blank' });
  });

  it('reports a failure to load without losing the page', async () => {
    server.use(http.get('/api/advanced-studio-projects', () =>
      HttpResponse.json({ error: 'Advanced Studio is disabled.' }, { status: 404 })));
    renderWithProviders(<AdvancedProjectsView />);
    expect(await screen.findByText('Workflows could not be loaded')).toBeInTheDocument();
  });

  it('confirms before deleting a workflow', async () => {
    listReturns([summary()]);
    const user = userEvent.setup();
    renderWithProviders(<AdvancedProjectsView />);
    await user.click(await screen.findByRole('button', { name: 'Delete Lighthouse run' }));
    expect(await screen.findByText('Delete Lighthouse run?')).toBeInTheDocument();
  });
});

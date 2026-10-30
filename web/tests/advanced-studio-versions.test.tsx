import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers/render';
import { server } from './helpers/server';
import { AdvVersionMenu } from '@/components/advanced-studio/version-menu';
import type { AdvVersionSummary, AdvVersionsResponse } from '@/lib/advanced-studio/types';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const PROJECT_ID = 'project-1';
const V1 = '00000000-0000-4000-8000-000000000001';
const V2 = '00000000-0000-4000-8000-000000000002';
const V3 = '00000000-0000-4000-8000-000000000003';
const now = new Date().toISOString();

function version(overrides: Partial<AdvVersionSummary>): AdvVersionSummary {
  return {
    id: V1,
    version: 1,
    createdAt: now,
    runCount: 1,
    lastRunAt: now,
    costUsd: null,
    generationCount: 1,
    pricedGenerationCount: 0,
    ...overrides,
  };
}

const versions: AdvVersionsResponse = {
  currentVersionId: V3,
  versions: [
    version({ id: V3, version: 3, runCount: 3, costUsd: 0.402, generationCount: 3, pricedGenerationCount: 3 }),
    version({ id: V2, version: 2, runCount: 2, costUsd: 0.134, generationCount: 2, pricedGenerationCount: 1 }),
    version({ id: V1, version: 1 }),
  ],
};

function serve(response: AdvVersionsResponse) {
  server.use(http.get(`/api/advanced-studio-projects/${PROJECT_ID}/versions`, () => HttpResponse.json(response)));
}

async function openMenu(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(await screen.findByRole('button', { name: `Versions: ${label}` }));
  return screen.getByRole('dialog', { name: 'Versions' });
}

describe('AdvVersionMenu', () => {
  it('labels the toolbar button with the version on the canvas', async () => {
    serve(versions);
    renderWithProviders(<AdvVersionMenu projectId={PROJECT_ID} onRestore={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Versions: v3' })).toBeInTheDocument();
  });

  it('lists what each version cost, and no outputs', async () => {
    const user = userEvent.setup();
    serve(versions);
    renderWithProviders(<AdvVersionMenu projectId={PROJECT_ID} onRestore={vi.fn()} />);
    const dialog = await openMenu(user, 'v3');
    const rows = within(dialog).getAllByRole('listitem');

    expect(within(rows[0]).getByText('$0.402')).toBeInTheDocument();
    expect(within(rows[0]).getByText('On canvas')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/3 runs/)).toBeInTheDocument();
    // Partly priced: one generation was billed through a provider plan.
    expect(within(rows[1]).getByText('$0.134+')).toBeInTheDocument();
    // Codex-only versions record no price.
    expect(within(rows[2]).getByText('Not priced')).toBeInTheDocument();
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
  });

  it('restores an older version straight away when the canvas matches a version', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);
    serve(versions);
    renderWithProviders(<AdvVersionMenu projectId={PROJECT_ID} onRestore={onRestore} />);
    const dialog = await openMenu(user, 'v3');

    expect(within(dialog).queryByRole('button', { name: 'Restore version 3 to the canvas' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Restore version 1 to the canvas' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(V1));
  });

  it('asks before replacing canvas edits that never ran', async () => {
    const user = userEvent.setup();
    const onRestore = vi.fn().mockResolvedValue(undefined);
    serve({ ...versions, currentVersionId: null });
    renderWithProviders(<AdvVersionMenu projectId={PROJECT_ID} onRestore={onRestore} />);
    const dialog = await openMenu(user, 'v3 · edited');

    await user.click(within(dialog).getByRole('button', { name: 'Restore version 2 to the canvas' }));
    expect(onRestore).not.toHaveBeenCalled();
    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(V2));
  });

  it('shows an unknown cost, not $0, when the server sends no cost', async () => {
    const user = userEvent.setup();
    const { costUsd, generationCount, pricedGenerationCount, ...withoutCost } = version({ id: V1, version: 1 });
    void costUsd; void generationCount; void pricedGenerationCount;
    serve({ currentVersionId: V1, versions: [withoutCost as AdvVersionSummary] });
    renderWithProviders(<AdvVersionMenu projectId={PROJECT_ID} onRestore={vi.fn()} />);
    const dialog = await openMenu(user, 'v1');
    expect(within(dialog).getByText('—')).toBeInTheDocument();
    expect(within(dialog).queryByText('$0')).not.toBeInTheDocument();
  });

  it('shows $0 only for a version that generated nothing', async () => {
    const user = userEvent.setup();
    serve({ currentVersionId: V1, versions: [version({ id: V1, version: 1, generationCount: 0, pricedGenerationCount: 0 })] });
    renderWithProviders(<AdvVersionMenu projectId={PROJECT_ID} onRestore={vi.fn()} />);
    const dialog = await openMenu(user, 'v1');
    expect(within(dialog).getByText('$0')).toBeInTheDocument();
  });

  it('explains versions before anything has run', async () => {
    const user = userEvent.setup();
    serve({ currentVersionId: null, versions: [] });
    renderWithProviders(<AdvVersionMenu projectId={PROJECT_ID} onRestore={vi.fn()} />);
    await openMenu(user, 'No runs yet');
    expect(screen.getByText(/record the first version/)).toBeInTheDocument();
  });
});

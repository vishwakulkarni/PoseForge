import * as React from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers/render';
import { server } from './helpers/server';
import { ImportWorkflowDialog } from '@/app/studio-advanced/import-workflow-dialog';
import { AdvShareMenu } from '@/components/advanced-studio/share-menu';
import { withUnavailableOption } from '@/components/advanced-studio/pill-menu';
import type { AdvDocument, AdvImportPreview } from '@/lib/advanced-studio/types';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const preview: AdvImportPreview = {
  name: 'Paris reel',
  nodeCount: 5,
  generatorCount: 2,
  embeddedFiles: 2,
  inputs: [{ name: 'city', kind: 'text', nodeIds: ['prompt'], default: null }],
  report: {
    generators: [
      {
        nodeId: 'still', label: 'Still', kind: 'image', engine: 'fal', engineLabel: 'fal.ai',
        model: 'edit', modelLabel: 'Nano Banana Pro Edit', status: 'ready', reason: null, issues: [], alternatives: [],
      },
      {
        nodeId: 'clip', label: 'Clip', kind: 'video', engine: 'higgsfield-video', engineLabel: 'Higgsfield Video',
        model: 'seedance-i2v', modelLabel: 'Seedance 2.5 — Image to Video', status: 'needs-setup',
        reason: 'Add a Higgsfield API key in Settings.', issues: [],
        alternatives: [{ engine: 'fal-video', engineLabel: 'fal.ai Video', model: 'kling-i2v', label: 'Kling 2.1 — Image to Video' }],
      },
    ],
    warnings: [],
  },
  warnings: ['Node "old" was dropped: type must be one of text, imageInput.'],
};

function workflowFile() {
  return new File([JSON.stringify({ format: 'poseforge.workflow' })], 'paris.poseforge.json', { type: 'application/json' });
}

describe('ImportWorkflowDialog', () => {
  it('shows how each generator fits this machine and keeps the original by default', async () => {
    server.use(http.post('/api/advanced-studio-projects/import/preview', () => HttpResponse.json(preview)));
    renderWithProviders(<ImportWorkflowDialog file={workflowFile()} onOpenChange={vi.fn()} onImported={vi.fn()} />);

    const rows = within(await screen.findByRole('list', { name: 'Generators' })).getAllByRole('listitem');
    expect(within(rows[0]).getByText('Ready')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Needs setup')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('link', { name: 'Set up in Settings' })).toHaveAttribute('href', '/settings#api-keys');
    expect(within(rows[1]).getByRole('combobox', { name: 'Model for Clip' })).toHaveValue('');
    expect(within(rows[1]).getByRole('option', { name: 'Keep Higgsfield Video · Seedance 2.5 — Image to Video' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Paris reel')).toBeInTheDocument();
    expect(screen.getByText(/1 note about this file/)).toBeInTheDocument();
  });

  it('sends only the switches the user chose', async () => {
    const user = userEvent.setup();
    const onImported = vi.fn();
    // Raw multipart text: undici's form parser rejects jsdom's File objects.
    let sent = '';
    server.use(
      http.post('/api/advanced-studio-projects/import/preview', () => HttpResponse.json(preview)),
      http.post('/api/advanced-studio-projects/import', async ({ request }) => {
        sent = await request.text();
        return HttpResponse.json({ id: 'new-project', name: 'Rome', document: { nodes: [], edges: [] }, report: preview.report, warnings: [] }, { status: 201 });
      }),
    );
    renderWithProviders(<ImportWorkflowDialog file={workflowFile()} onOpenChange={vi.fn()} onImported={onImported} />);

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Model for Clip' }), 'fal-video::kling-i2v');
    const name = screen.getByDisplayValue('Paris reel');
    await user.clear(name);
    await user.type(name, 'Rome');
    await user.click(screen.getByRole('button', { name: 'Import workflow' }));

    await waitFor(() => expect(onImported).toHaveBeenCalledWith('new-project'));
    const field = (name: string) => sent.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))?.[1];
    expect(field('name')).toBe('Rome');
    expect(JSON.parse(field('replacements') ?? 'null')).toEqual({ clip: { engine: 'fal-video', model: 'kling-i2v' } });
  });

  it('explains a file that is not a workflow', async () => {
    server.use(http.post('/api/advanced-studio-projects/import/preview', () =>
      HttpResponse.json({ error: 'This is not a PoseForge workflow file (expected "format": "poseforge.workflow").' }, { status: 400 })));
    renderWithProviders(<ImportWorkflowDialog file={workflowFile()} onOpenChange={vi.fn()} onImported={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('not a PoseForge workflow file');
    expect(screen.getByRole('button', { name: 'Import workflow' })).toBeDisabled();
  });
});

describe('AdvShareMenu', () => {
  const document: AdvDocument = {
    schemaVersion: 2,
    template: 'blank',
    viewport: null,
    locked: false,
    nodes: [
      { id: 'who', type: 'imageInput', position: { x: 0, y: 0 }, data: { characterId: '00000000-0000-4000-8000-000000000001' } },
      { id: 'style', type: 'imageInput', position: { x: 0, y: 0 }, data: { imageUrl: '/storage/advanced/p/a.png' } },
      { id: 'gen', type: 'imageGenerator', position: { x: 0, y: 0 }, data: { engine: 'fal', model: 'edit', outputs: 1 } },
    ],
    edges: [],
  } as AdvDocument;

  it('warns when library photos go into the file and downloads from the export route', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdvShareMenu projectId="p1" projectName="Paris" document={document} capabilities={[]} />);
    await user.click(screen.getByRole('button', { name: 'Share' }));

    expect(screen.getByText('2 input files embedded')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('1 photo from your Characters or Pose library');
    expect(screen.getByRole('link', { name: 'Download file' })).toHaveAttribute('href', '/api/advanced-studio-projects/p1/export');
  });
});

describe('withUnavailableOption', () => {
  it('keeps a model this build cannot offer visible but not selectable', () => {
    const options = [{ value: 'fal::edit', label: 'Edit' }];
    expect(withUnavailableOption(options, 'fal::edit', 'Edit')).toBe(options);
    expect(withUnavailableOption(options, 'antigravity::gemini', 'gemini')).toEqual([
      ...options,
      { value: 'antigravity::gemini', label: 'gemini', note: 'Not available in this PoseForge. Choose another model.', disabled: true },
    ]);
  });
});

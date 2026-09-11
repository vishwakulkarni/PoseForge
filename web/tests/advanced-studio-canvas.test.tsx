import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/controls';
import { AdvCanvas } from '@/components/advanced-studio/canvas';
import type { AdvDocument, AdvEngineCapability, AdvProject } from '@/lib/advanced-studio/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function capability(overrides: Partial<AdvEngineCapability> = {}): AdvEngineCapability {
  return {
    key: 'gemini',
    label: 'Google Gemini',
    ready: true,
    reason: null,
    models: [{ id: 'gemini-3-pro-image-preview', label: 'Gemini 3 Pro Image' }],
    defaultModel: 'gemini-3-pro-image-preview',
    image: {
      supported: true,
      textToImage: true,
      maxImages: 5,
      aspectRatios: ['1:1', '16:9', '9:16'],
      defaultAspectRatio: '1:1',
      resolutions: [{ id: '1K', label: '1K', quality: 'medium' }, { id: '2K', label: '2K', quality: 'high' }],
      defaultResolution: '1K',
      maxOutputs: 4,
    },
    video: { supported: false },
    ...overrides,
  };
}

function codexCapability(overrides: Partial<AdvEngineCapability> = {}): AdvEngineCapability {
  return {
    key: 'codex',
    label: 'Codex CLI',
    ready: true,
    reason: null,
    models: [{ id: 'codex', label: 'Codex CLI', note: 'Runs locally through the Codex CLI.' }],
    defaultModel: 'codex',
    image: {
      supported: true,
      textToImage: true,
      promptDrivenSettings: true,
      maxImages: 6,
      aspectRatios: ['1:1', '4:5', '16:9', '9:16'],
      defaultAspectRatio: '1:1',
      resolutions: [{ id: '1K', label: 'Standard', quality: 'medium' }, { id: '2K', label: 'High detail', quality: 'high' }],
      defaultResolution: '1K',
      maxOutputs: 4,
    },
    video: { supported: false },
    ...overrides,
  };
}

function advDocument(overrides: Partial<AdvDocument> = {}): AdvDocument {
  return {
    schemaVersion: 2,
    template: 'image',
    viewport: null,
    locked: false,
    nodes: [
      { id: 'text-1', type: 'text', position: { x: 0, y: 0 }, label: 'Prompt #1', data: { text: 'a lighthouse at dusk', mode: 'plain' } },
      { id: 'gen-1', type: 'imageGenerator', position: { x: 520, y: 0 }, label: 'Image Generator #1', data: { engine: 'gemini', model: 'gemini-3-pro-image-preview', outputs: 1, activeResultIndex: 0 } },
    ],
    edges: [
      { id: 'e1', source: 'text-1', sourceHandle: 'text', target: 'gen-1', targetHandle: 'prompt', dataType: 'text' },
    ],
    ...overrides,
  };
}

function project(overrides: Partial<AdvProject> = {}): AdvProject {
  return {
    id: 'project-1',
    name: 'Lighthouse run',
    workspace: 'advanced',
    template: 'image',
    schemaVersion: 2,
    revision: 3,
    document: advDocument(),
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderCanvas(overrides: Partial<React.ComponentProps<typeof AdvCanvas>> = {}) {
  const onSave = vi.fn();
  const onRunNode = vi.fn().mockResolvedValue(null);
  const onRetry = vi.fn();
  const view = render(
    <TooltipProvider>
      <ToastProvider>
        <AdvCanvas
          project={project()}
          capabilities={[capability()]}
          saveState="saved"
          onSave={onSave}
          onRetry={onRetry}
          onRunNode={onRunNode}
          {...overrides}
        />
      </ToastProvider>
    </TooltipProvider>,
  );
  return { ...view, onSave, onRunNode, onRetry };
}

describe('Advanced Studio canvas', () => {
  it('renders the project name, save state and the nodes from the document', async () => {
    renderCanvas();
    expect(screen.getByLabelText('Project name')).toHaveValue('Lighthouse run');
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
    await waitFor(() => {
      expect(screen.getByText('Prompt #1')).toBeInTheDocument();
      expect(screen.getByText('Image Generator #1')).toBeInTheDocument();
    });
  });

  it('has no permanent side panels — only the toolbar and the canvas', () => {
    const { container } = renderCanvas();
    expect(container.querySelector('.adv-toolbar')).toBeInTheDocument();
    expect(container.querySelector('.adv-canvas')).toBeInTheDocument();
    expect(container.querySelector('.studio-panel')).toBeNull();
    expect(container.querySelector('.inspector-panel')).toBeNull();
  });

  it('renders typed handles with distinct data types', async () => {
    const { container } = renderCanvas();
    await waitFor(() => {
      const handles = [...container.querySelectorAll('.adv-handle')];
      expect(handles.some((handle) => handle.getAttribute('data-adv-type') === 'text')).toBe(true);
      expect(handles.some((handle) => handle.getAttribute('data-adv-type') === 'image')).toBe(true);
    });
  });

  it('opens a searchable, categorised add-node menu and creates the chosen node', async () => {
    const user = userEvent.setup();
    renderCanvas();
    await user.click(screen.getAllByRole('button', { name: 'Add node' })[0]);

    const menu = await screen.findByRole('dialog', { name: 'Add a node' });
    expect(within(menu).getByText('Inputs')).toBeInTheDocument();
    expect(within(menu).getByText('Generation')).toBeInTheDocument();

    await user.type(within(menu).getByLabelText('Search nodes'), 'image inp');
    const option = within(menu).getByText('Image Input');
    await user.click(option);

    await waitFor(() => expect(screen.getByText('Image #1')).toBeInTheDocument());
  });

  it('says so when a search matches no node', async () => {
    const user = userEvent.setup();
    renderCanvas();
    await user.click(screen.getAllByRole('button', { name: 'Add node' })[0]);
    const menu = await screen.findByRole('dialog', { name: 'Add a node' });
    await user.type(within(menu).getByLabelText('Search nodes'), 'zzzz');
    expect(within(menu).getByText(/No node matches/)).toBeInTheDocument();
  });

  it('opens the add-node menu from a right-click on empty canvas', async () => {
    const { container } = renderCanvas();
    const pane = container.querySelector('.react-flow__pane');
    expect(pane).not.toBeNull();
    fireEvent.contextMenu(pane!, { clientX: 200, clientY: 200 });
    expect(await screen.findByRole('dialog', { name: 'Add a node' })).toBeInTheDocument();
  });

  it('duplicates a node from its menu with a fresh name', async () => {
    const user = userEvent.setup();
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Prompt #1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Prompt #1 actions' }));
    await user.click(screen.getByRole('menuitem', { name: /Duplicate/ }));
    await waitFor(() => expect(screen.getByText('Prompt #2')).toBeInTheDocument());
  });

  it('deletes a node from its menu', async () => {
    const user = userEvent.setup();
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Prompt #1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Prompt #1 actions' }));
    await user.click(screen.getByRole('menuitem', { name: /Delete/ }));
    await waitFor(() => expect(screen.queryByText('Prompt #1')).not.toBeInTheDocument());
  });

  it('renames a node in place', async () => {
    const user = userEvent.setup();
    renderCanvas();
    await waitFor(() => expect(screen.getByText('Prompt #1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Prompt #1 actions' }));
    await user.click(screen.getByRole('menuitem', { name: /Rename/ }));
    const input = screen.getByLabelText('Node name');
    await user.clear(input);
    await user.type(input, 'Opening line');
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(screen.getByText('Opening line')).toBeInTheDocument());
  });

  it('persists prompt edits through the autosave callback', async () => {
    const { onSave } = renderCanvas();
    const textarea = await screen.findByLabelText('Prompt #1 text');
    fireEvent.change(textarea, { target: { value: 'a harbour at dawn' } });
    fireEvent.blur(textarea);
    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0] as AdvDocument;
      const node = saved.nodes.find((item) => item.id === 'text-1');
      expect((node?.data as { text: string }).text).toBe('a harbour at dawn');
    });
  });

  it('enforces the prompt maximum length', async () => {
    renderCanvas();
    const textarea = await screen.findByLabelText('Prompt #1 text');
    expect(textarea).toHaveAttribute('maxlength', '20000');
  });

  it('offers only the selected model’s aspect ratios and resolutions', async () => {
    const user = userEvent.setup();
    renderCanvas();
    await user.click(await screen.findByRole('button', { name: 'Aspect ratio' }));
    const ratios = screen.getByRole('listbox', { name: 'Aspect ratio' });
    expect(within(ratios).getAllByRole('option').map((option) => option.textContent)).toEqual(['1:1', '16:9', '9:16']);
  });

  it('lists every configured provider in the model menu, including the Codex CLI', async () => {
    const user = userEvent.setup();
    renderCanvas({ capabilities: [capability(), codexCapability()] });
    await user.click(await screen.findByRole('button', { name: 'Model' }));
    const menu = screen.getByRole('listbox', { name: 'Model' });
    expect(within(menu).getByText('Google Gemini')).toBeInTheDocument();
    expect(within(menu).getByText('Gemini 3 Pro Image')).toBeInTheDocument();
    // A single-tool provider is listed once, not as both a group and an option.
    expect(within(menu).getAllByText('Codex CLI')).toHaveLength(1);
    expect(within(menu).getByRole('option', { name: /Codex CLI/ })).toBeInTheDocument();
    expect(within(menu).getByText('Runs locally through the Codex CLI.')).toBeInTheDocument();
  });

  it('switches to the Codex CLI, keeping supported settings and coercing the rest', async () => {
    const user = userEvent.setup();
    // Codex here supports 2K but not 9:16, so one selection survives the
    // switch and the other falls back to that provider's default.
    const codex = codexCapability({
      image: { ...codexCapability().image, aspectRatios: ['1:1', '16:9'], defaultAspectRatio: '1:1' },
    });
    const document = advDocument();
    document.nodes[1].data = { ...document.nodes[1].data, aspectRatio: '9:16', resolution: '2K' };
    const { onSave } = renderCanvas({
      capabilities: [capability(), codex],
      project: project({ document }),
    });

    await user.click(await screen.findByRole('button', { name: 'Model' }));
    await user.click(within(screen.getByRole('listbox', { name: 'Model' })).getByRole('option', { name: /Codex CLI/ }));

    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0] as AdvDocument;
      const node = saved.nodes.find((item) => item.id === 'gen-1');
      expect((node?.data as { engine?: string }).engine).toBe('codex');
      expect((node?.data as { resolution?: string }).resolution).toBe('2K');
      expect((node?.data as { aspectRatio?: string }).aspectRatio).toBe('1:1');
    });
  });

  it('disables a provider that is not installed and says why', async () => {
    const user = userEvent.setup();
    renderCanvas({
      capabilities: [capability(), codexCapability({ ready: false, reason: 'Codex CLI is not installed or not on PATH' })],
    });
    await user.click(await screen.findByRole('button', { name: 'Model' }));
    const menu = screen.getByRole('listbox', { name: 'Model' });
    expect(within(menu).getByText('Codex CLI is not installed or not on PATH')).toBeInTheDocument();
    expect(within(menu).getByRole('option', { name: /Codex CLI/ })).toBeDisabled();
  });

  it('runs a generation for a single node and shows it running', async () => {
    const user = userEvent.setup();
    let resolveRun: (value: null) => void = () => {};
    const onRunNode = vi.fn(() => new Promise<null>((resolve) => { resolveRun = resolve; }));
    renderCanvas({ onRunNode });

    const generate = await screen.findByRole('button', { name: /Generate/ });
    await user.click(generate);
    expect(onRunNode).toHaveBeenCalledWith('gen-1');
    await waitFor(() => expect(screen.getByText('Generating…')).toBeInTheDocument());

    resolveRun(null);
    await waitFor(() => expect(screen.queryByText('Generating…')).not.toBeInTheDocument());
  });

  // Regression: the client used to write status: 'running' into the node, which
  // queued an autosave during the generation and made the server race its own
  // client for the project's revision — the run then failed with a conflict and
  // the finished image was discarded.
  it('does not write the transient running state into the saved document', async () => {
    const user = userEvent.setup();
    const onRunNode = vi.fn(() => new Promise<null>(() => {}));
    const { onSave } = renderCanvas({ onRunNode });
    await user.click(await screen.findByRole('button', { name: /Generate/ }));
    await waitFor(() => expect(screen.getByText('Generating…')).toBeInTheDocument());

    for (const [saved] of onSave.mock.calls) {
      const node = (saved as AdvDocument).nodes.find((item) => item.id === 'gen-1');
      expect((node?.data as { status?: string }).status).not.toBe('running');
    }
  });

  it('does not submit twice while a generation is in flight', async () => {
    const user = userEvent.setup();
    const onRunNode = vi.fn(() => new Promise<null>(() => {}));
    renderCanvas({ onRunNode });
    const generate = await screen.findByRole('button', { name: /Generate/ });
    await user.click(generate);
    await waitFor(() => expect(generate).toBeDisabled());
    expect(onRunNode).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed node recoverable and retries only that node', async () => {
    const user = userEvent.setup();
    const onRunNode = vi.fn()
      .mockRejectedValueOnce(new Error('Provider rejected the request.'))
      .mockResolvedValueOnce(null);
    const { container } = renderCanvas({ onRunNode });

    await user.click(await screen.findByRole('button', { name: /Generate/ }));
    // The node states the failure, and a toast repeats it.
    await waitFor(() => expect(screen.getAllByText('Provider rejected the request.').length).toBeGreaterThan(0));
    expect(container.querySelector('.adv-state.is-error')).toHaveTextContent('Provider rejected the request.');
    // The rest of the graph is untouched by one node's failure.
    expect(screen.getByText('Prompt #1')).toBeInTheDocument();

    const retry = container.querySelector('.adv-generate-button') as HTMLButtonElement;
    expect(retry).toHaveTextContent('Retry');
    await user.click(retry);
    await waitFor(() => expect(onRunNode).toHaveBeenCalledTimes(2));
  });

  it('shows a generated result and offers to open or download it', async () => {
    const document = advDocument();
    document.nodes[1].data = {
      ...document.nodes[1].data,
      status: 'done',
      results: [{ imageUrl: '/storage/generations/abc/output.png', generationId: 'abc', width: 1024, height: 1024 }],
      activeResultIndex: 0,
    };
    renderCanvas({ project: project({ document }) });

    const image = await screen.findByAltText('Image Generator #1 result 1');
    expect(image).toHaveAttribute('src', '/storage/generations/abc/output.png');
    expect(screen.getByText('1024 × 1024')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download image' })).toHaveAttribute('href', '/storage/generations/abc/output.png');
  });

  it('explains a result whose file cannot be loaded instead of showing a broken image', async () => {
    const document = advDocument();
    document.nodes[1].data = {
      ...document.nodes[1].data,
      status: 'done',
      results: [{ imageUrl: '/storage/generations/gone/output.png', generationId: 'gone' }],
      activeResultIndex: 0,
    };
    renderCanvas({ project: project({ document }) });

    const image = await screen.findByAltText('Image Generator #1 result 1');
    fireEvent.error(image);
    expect(await screen.findByText('This result could not be loaded')).toBeInTheDocument();
    expect(screen.queryByAltText('Image Generator #1 result 1')).not.toBeInTheDocument();
  });

  it('blocks generation and explains why when no prompt is connected', async () => {
    renderCanvas({
      project: project({ document: advDocument({ edges: [] }) }),
    });
    expect(await screen.findByText('Connect a prompt with some text.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate/ })).toBeDisabled();
  });

  it('explains an unconfigured provider instead of offering to generate', async () => {
    renderCanvas({ capabilities: [capability({ ready: false, reason: 'No Gemini API key configured' })] });
    expect(await screen.findByText('No Gemini API key configured')).toBeInTheDocument();
  });

  it('shows an empty-canvas prompt for a blank project', async () => {
    renderCanvas({
      project: project({ template: 'blank', document: advDocument({ template: 'blank', nodes: [], edges: [] }) }),
    });
    expect(await screen.findByText('This canvas is empty.')).toBeInTheDocument();
  });

  it('renders storyboard scene groups in order', async () => {
    renderCanvas({
      project: project({
        template: 'storyboard',
        document: advDocument({
          template: 'storyboard',
          edges: [],
          nodes: [1, 2, 3].map((scene) => ({
            id: `group-${scene}`,
            type: 'group' as const,
            position: { x: scene * 1200, y: 0 },
            label: `Scene ${scene}`,
            data: { memberIds: [], scene },
          })),
        }),
      }),
    });
    await waitFor(() => {
      expect(screen.getByText('Scene 1')).toBeInTheDocument();
      expect(screen.getByText('Scene 2')).toBeInTheDocument();
      expect(screen.getByText('Scene 3')).toBeInTheDocument();
    });
  });

  it('asks for confirmation before deleting a group that contains nodes', async () => {
    const user = userEvent.setup();
    renderCanvas({
      project: project({
        document: advDocument({
          nodes: [
            ...advDocument().nodes,
            { id: 'group-1', type: 'group', position: { x: -40, y: -40 }, label: 'Scene 1', data: { memberIds: ['text-1'] } },
          ],
        }),
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Scene 1 actions' }));
    await user.click(screen.getByRole('menuitem', { name: /Delete/ }));
    expect(await screen.findByText('Delete Scene 1?')).toBeInTheDocument();
    expect(screen.getByText(/contains 1 node/)).toBeInTheDocument();
  });

  // Regression: hydration used to be marked complete in a ref before the
  // hydrated nodes were applied, so the save effect could persist the empty
  // pre-hydration graph over a real project.
  it('never persists an empty graph while hydrating', async () => {
    const { onSave } = renderCanvas();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    for (const [saved] of onSave.mock.calls) {
      expect((saved as AdvDocument).nodes.length).toBe(2);
    }
  });

  // Regression: the save effect depended on the parent's callback identity, so
  // each acknowledged save triggered the next one and autosave never settled.
  it('settles instead of re-saving when nothing has changed', async () => {
    const { onSave, rerender } = renderCanvas();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const before = onSave.mock.calls.length;
    // A new callback identity from the parent (as happens on every render of
    // the view) must not queue another save.
    rerender(
      <TooltipProvider>
        <ToastProvider>
          <AdvCanvas
            project={project()}
            capabilities={[capability()]}
            saveState="saved"
            onSave={onSave}
            onRetry={vi.fn()}
            onRunNode={vi.fn().mockResolvedValue(null)}
          />
        </ToastProvider>
      </TooltipProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(onSave.mock.calls.length).toBe(before);
  });

  it('renders the on-canvas control cluster with tools, view, history and help', async () => {
    renderCanvas();
    const cluster = await screen.findByLabelText('Canvas controls');
    for (const label of [
      'Select tool', 'Hand tool', 'Zoom in', 'Zoom out', 'Fit to view',
      'Lock canvas', 'Undo', 'Redo', 'Arrange nodes in a grid', 'Add node', 'Keyboard shortcuts',
    ]) {
      expect(within(cluster).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(within(cluster).getByRole('button', { name: /Reset to 100/ })).toHaveTextContent('%');
  });

  it('switches between the select and hand tools, by click and by keyboard', async () => {
    const user = userEvent.setup();
    renderCanvas();
    const cluster = await screen.findByLabelText('Canvas controls');
    const select = within(cluster).getByRole('button', { name: 'Select tool' });
    const hand = within(cluster).getByRole('button', { name: 'Hand tool' });

    expect(select).toHaveAttribute('aria-pressed', 'true');
    await user.click(hand);
    expect(hand).toHaveAttribute('aria-pressed', 'true');
    expect(select).toHaveAttribute('aria-pressed', 'false');

    fireEvent.keyDown(document, { key: 'v' });
    await waitFor(() => expect(select).toHaveAttribute('aria-pressed', 'true'));
    fireEvent.keyDown(document, { key: 'h' });
    await waitFor(() => expect(hand).toHaveAttribute('aria-pressed', 'true'));
  });

  it('opens the shortcut reference from the cluster and with ?', async () => {
    const user = userEvent.setup();
    renderCanvas();
    await user.click(within(await screen.findByLabelText('Canvas controls')).getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByText('Keyboard shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Fit all nodes')).toBeInTheDocument();
    expect(screen.getByText('Arrange in a grid')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Fit all nodes')).not.toBeInTheDocument());

    fireEvent.keyDown(document, { key: '?' });
    expect(await screen.findByText('Fit all nodes')).toBeInTheDocument();
  });

  it('locks the canvas, persists it, and refuses edits while locked', async () => {
    const user = userEvent.setup();
    const { onSave } = renderCanvas();
    const cluster = await screen.findByLabelText('Canvas controls');
    await user.click(within(cluster).getByRole('button', { name: 'Lock canvas' }));

    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0] as AdvDocument;
      expect(saved.locked).toBe(true);
    });
    expect(await screen.findByText('Locked')).toBeInTheDocument();
    expect(within(cluster).getByRole('button', { name: 'Unlock canvas' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Add node' })[0]).toBeDisabled();

    // A delete shortcut must not remove anything while locked.
    fireEvent.keyDown(document, { key: 'Delete' });
    expect(screen.getByText('Prompt #1')).toBeInTheDocument();
  });

  it('restores a project that was saved locked', async () => {
    renderCanvas({ project: project({ document: advDocument({ locked: true }) }) });
    expect(await screen.findByText('Locked')).toBeInTheDocument();
  });

  it('arranges nodes into a grid and the move is undoable', async () => {
    const user = userEvent.setup();
    const { onSave } = renderCanvas();
    const cluster = await screen.findByLabelText('Canvas controls');
    await user.click(within(cluster).getByRole('button', { name: 'Arrange nodes in a grid' }));

    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0] as AdvDocument;
      const positions = saved.nodes.map((node) => `${node.position.x},${node.position.y}`);
      // Both nodes moved onto a shared grid row rather than keeping the
      // authored 0,0 / 520,0 layout.
      expect(positions.join(' ')).not.toBe('0,0 520,0');
    });

    await user.click(within(cluster).getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0] as AdvDocument;
      expect(saved.nodes.find((node) => node.id === 'text-1')?.position).toEqual({ x: 0, y: 0 });
    });
  });

  it('nudges the selection with the arrow keys', async () => {
    const document = advDocument();
    document.nodes[0] = { ...document.nodes[0], position: { x: 100, y: 100 } };
    const { onSave, container } = renderCanvas({ project: project({ document }) });
    await waitFor(() => expect(screen.getByText('Prompt #1')).toBeInTheDocument());

    // Select the prompt node, then nudge it.
    fireEvent.click(container.querySelector('[data-id="text-1"]')!);
    fireEvent.keyDown(window.document, { key: 'ArrowRight' });
    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0] as AdvDocument;
      expect(saved.nodes.find((node) => node.id === 'text-1')?.position.x).toBe(110);
    });

    fireEvent.keyDown(window.document, { key: 'ArrowDown', shiftKey: true });
    await waitFor(() => {
      const saved = onSave.mock.calls.at(-1)?.[0] as AdvDocument;
      expect(saved.nodes.find((node) => node.id === 'text-1')?.position.y).toBe(140);
    });
  });

  it('selects everything with the select-all shortcut and clears it with Escape', async () => {
    const { container } = renderCanvas();
    await waitFor(() => expect(screen.getByText('Prompt #1')).toBeInTheDocument());

    fireEvent.keyDown(document, { key: 'a', metaKey: true });
    await waitFor(() => expect(container.querySelectorAll('.react-flow__node.selected')).toHaveLength(2));

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(container.querySelectorAll('.react-flow__node.selected')).toHaveLength(0));
  });

  it('keeps view shortcuts working while the canvas is locked', async () => {
    const user = userEvent.setup();
    renderCanvas({ project: project({ document: advDocument({ locked: true }) }) });
    const cluster = await screen.findByLabelText('Canvas controls');
    // Zoom and the shortcut sheet are not edits, so the lock leaves them alone.
    expect(within(cluster).getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    expect(within(cluster).getByRole('button', { name: 'Arrange nodes in a grid' })).toBeDisabled();
    await user.click(within(cluster).getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByText('Fit all nodes')).toBeInTheDocument();
  });

  it('does not fire canvas shortcuts while typing a prompt', async () => {
    const user = userEvent.setup();
    renderCanvas();
    const textarea = await screen.findByLabelText('Prompt #1 text');
    await user.click(textarea);
    await user.type(textarea, 'have a hand in it');

    // 'h' and 'v' are tool shortcuts; inside a textarea they are just letters.
    expect((textarea as HTMLTextAreaElement).value).toContain('have a hand in it');
    const cluster = screen.getByLabelText('Canvas controls');
    expect(within(cluster).getByRole('button', { name: 'Select tool' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renames the project from the toolbar and saves it', async () => {
    const { onSave } = renderCanvas();
    const input = screen.getByLabelText('Project name');
    fireEvent.change(input, { target: { value: 'Harbour run' } });
    fireEvent.blur(input);
    await waitFor(() => expect(onSave.mock.calls.at(-1)?.[1]).toBe('Harbour run'));
  });

  it('surfaces a failed save with a retry action', async () => {
    const { onRetry } = renderCanvas({ saveState: 'error' });
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  CanvasPanel,
  type CanvasPanelProps,
  type StudioCanvasEvent,
} from '@/components/studio/canvas';
import type { Generation, StudioProject } from '@/lib/api/types';

function generation(overrides: Partial<Generation>): Generation {
  return {
    id: 'generation-1',
    status: 'pending',
    engine: 'codex',
    characters: [],
    posePhotoUrl: '/storage/pose.png',
    poseReferenceId: null,
    poseTitle: null,
    outputUrl: null,
    backgroundPreset: null,
    stylePreset: null,
    prompt: 'Generate',
    studioMode: 'normal',
    advancedSettings: {},
    batchId: null,
    usage: {},
    documentSheetUrl: null,
    passportSheetUrl: null,
    errorMessage: null,
    createdAt: '2026-08-05T10:00:00.000Z',
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function props(overrides: Partial<CanvasPanelProps> = {}): CanvasPanelProps {
  return {
    aspectRatio: '1:1',
    status: 'ready',
    subjects: [
      { id: 'subject-1', label: 'Anika', imageUrl: '/storage/anika.png' },
      { id: 'subject-2', label: 'Ravi', imageUrl: '/storage/ravi.png' },
    ],
    pose: { label: 'Arms crossed', imageUrl: '/storage/pose.png' },
    generations: [],
    plannedOutputs: 1,
    activeIndex: 0,
    onSelectVariant: vi.fn(),
    onRegenerate: vi.fn(),
    tip: 'Keep identity photos clear.',
    ...overrides,
  };
}

function project(overrides: Partial<StudioProject> = {}): StudioProject {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'My Studio',
    schemaVersion: 1,
    revision: 4,
    document: {
      schemaVersion: 1,
      viewport: { x: 20, y: 30, zoom: 1.2 },
      nodes: [
        { id: 'character-subject-1', kind: 'character', position: { x: 40, y: 60 } },
        { id: 'generate', kind: 'generate', position: { x: 777, y: 888 } },
      ],
      edges: [],
      locked: false,
    },
    isDefault: true,
    createdAt: '2026-08-17T10:00:00.000Z',
    updatedAt: '2026-08-17T10:05:00.000Z',
    ...overrides,
  };
}

describe('PoseForge workflow canvas', () => {
  it('renders character and pose sources wired through generate to a result node', () => {
    const { container } = render(<CanvasPanel {...props()} />);

    expect(container.querySelector('[data-id="character-subject-1"]')).toHaveTextContent('Anika');
    expect(container.querySelector('[data-id="character-subject-2"]')).toHaveTextContent('Ravi');
    expect(container.querySelector('[data-id="pose-manual"]')).toHaveTextContent('Arms crossed');
    expect(container.querySelector('[data-id="generate"]')).toHaveTextContent('Forge composition');
    expect(container.querySelectorAll('.poseforge-handle')).toHaveLength(8);
    const arrowhead = container.querySelector<SVGPolylineElement>(
      '.react-flow__arrowhead polyline.arrowclosed',
    );
    expect(arrowhead).toBeInTheDocument();
    expect(arrowhead?.style.fill).toBe('var(--pf-canvas-edge)');
    expect(screen.getByText('Result will appear here')).toBeInTheDocument();
  });

  it('summarizes the complete Forge configuration at compact node sizes', () => {
    const { container } = render(
      <CanvasPanel
        {...props({
          mode: 'advanced',
          engineLabel: 'Codex CLI',
          forgeValidation: 'Ready to generate',
          plannedOutputs: 3,
          aspectRatio: '4:5',
        })}
      />,
    );

    const generate = container.querySelector('[data-id="generate"]') as HTMLElement;
    expect(generate).toHaveTextContent('Advanced');
    expect(generate).toHaveTextContent('Codex CLI');
    expect(generate).toHaveTextContent('3 outputs');
    expect(generate).toHaveTextContent('4:5');
    expect(generate).toHaveTextContent('3 inputs');
    expect(generate).toHaveTextContent('Ready to generate');
    expect(within(generate).getByLabelText(/advanced mode, codex cli, 3 outputs, 4:5, 3 inputs/i))
      .toBeInTheDocument();
  });

  it('shows one in-progress placeholder for every planned output', () => {
    render(
      <CanvasPanel
        {...props({ status: 'running', generations: [], plannedOutputs: 3 })}
      />,
    );

    expect(screen.getAllByText('Forging result')).toHaveLength(3);
    expect(screen.getAllByText('Preserving identity and pose')).toHaveLength(3);
  });

  it('keeps completed and failed variants together after the equals sign', () => {
    render(
      <CanvasPanel
        {...props({
          status: 'done',
          plannedOutputs: 2,
          generations: [
            generation({
              id: 'completed',
              status: 'completed',
              outputUrl: '/storage/output.png',
            }),
            generation({
              id: 'failed',
              status: 'failed',
              errorMessage: 'Provider unavailable',
            }),
          ],
        })}
      />,
    );

    const outputs = document.querySelectorAll('.poseforge-node-result');
    expect(outputs).toHaveLength(2);
    expect(within(outputs[0] as HTMLElement).getByAltText('Generated result 1')).toBeInTheDocument();
    expect(within(outputs[1] as HTMLElement).getByText('Generation failed')).toBeInTheDocument();
    expect(within(outputs[1] as HTMLElement).getByText('Provider unavailable')).toBeInTheDocument();
    expect((outputs[0] as HTMLElement).querySelector('a[download]')).toHaveTextContent('Download');
  });

  it('provides the full canvas control cluster and toggles the lock state', () => {
    render(<CanvasPanel {...props()} />);
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset zoom from/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit all nodes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo canvas move' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo canvas move' })).toBeDisabled();
    const reset = screen.getByRole('button', { name: 'Reset canvas' });
    const lock = screen.getByRole('button', { name: 'Lock canvas' });
    expect(reset).toBeInTheDocument();
    expect(reset.nextElementSibling).toBe(lock);

    fireEvent.click(lock);
    expect(screen.getByRole('button', { name: 'Unlock canvas' })).toBeInTheDocument();
  });

  it('resets the canvas to the empty default graph and clears photo selection', async () => {
    const onProjectChange = vi.fn();
    const onResetCanvas = vi.fn();
    render(
      <CanvasPanel
        {...props({
          project: project({
            document: {
              ...project().document,
              nodes: [{ id: 'custom-block', kind: 'character', custom: true, position: { x: 900, y: 900 } }],
            },
          }),
          onProjectChange,
          onResetCanvas,
          generations: [generation({ id: 'completed', status: 'completed', outputUrl: '/result.png' })],
        })}
      />,
    );

    const resetButton = screen.getByRole('button', { name: 'Reset canvas' });
    await waitFor(() => expect(resetButton).toBeEnabled());
    fireEvent.click(resetButton);
    const confirm = screen.getByRole('alertdialog', { name: 'Reset canvas?' });
    expect(confirm).toHaveTextContent('clears every character, pose, result, and canvas change');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Reset canvas' }));

    expect(onResetCanvas).toHaveBeenCalledTimes(1);
    expect(onProjectChange).toHaveBeenLastCalledWith(expect.objectContaining({
      locked: false,
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: 'character-empty', kind: 'character' }),
        expect.objectContaining({ id: 'pose-empty', kind: 'pose' }),
        expect.objectContaining({ id: 'generate', kind: 'generate' }),
        expect.objectContaining({ id: 'result-placeholder-0', kind: 'result' }),
      ]),
    }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toHaveLength(4);
    await waitFor(() => {
      expect(screen.getByText('Add a character')).toBeInTheDocument();
      expect(screen.getByText('Add a pose')).toBeInTheDocument();
    });
  });

  it('cold-opens legacy saved geometry with authored arrows and keeps inspection controls available', async () => {
    const onProjectChange = vi.fn();
    const { container } = render(
      <CanvasPanel
        {...props({
          project: project(),
          projectSaveState: 'saved',
          onProjectChange,
        })}
      />,
    );

    expect((container.querySelector('[data-id="generate"]') as HTMLElement).style.transform)
      .toBe('translate(777px,888px)');
    expect(screen.getByRole('button', { name: 'Reset zoom from 120%' })).toBeInTheDocument();
    expect(screen.getByLabelText('Studio project: Saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lock canvas' }));
    expect(onProjectChange).toHaveBeenCalled();
    expect(onProjectChange.mock.lastCall?.[0]).toMatchObject({ locked: true });
    expect(onProjectChange.mock.lastCall?.[0].edges).toHaveLength(4);
    await waitFor(() => {
      expect(container.querySelector('.react-flow__arrowhead polyline.arrowclosed')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fit all nodes' })).toBeEnabled();
  });

  it('switches and creates Studio projects from the control beside save status', async () => {
    const user = userEvent.setup();
    const current = project();
    const second = project({
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Campaign concepts',
      isDefault: false,
      updatedAt: '2026-08-18T12:00:00.000Z',
    });
    const created = project({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Holiday launch',
      isDefault: false,
      updatedAt: '2026-08-19T12:00:00.000Z',
    });
    const onSwitchProject = vi.fn(async () => {});
    const onCreateProject = vi.fn(async () => created);
    const onDeleteProject = vi.fn(async () => {});
    render(
      <CanvasPanel
        {...props({
          project: current,
          projectSaveState: 'saved',
          onProjectChange: vi.fn(),
          projects: [current, second],
          onSwitchProject,
          onCreateProject,
          onDeleteProject,
        })}
      />,
    );

    const trigger = screen.getByRole('button', {
      name: 'Switch Studio project. Current project: My Studio',
    });
    await user.click(trigger);
    const projectMenu = await screen.findByRole('dialog', { name: 'Studio projects' });
    const currentItem = within(projectMenu).getByText('My Studio').closest('button') as HTMLElement;
    expect(within(currentItem).getByLabelText('Current project')).toBeInTheDocument();
    expect(within(projectMenu).queryByRole('button', { name: 'Delete My Studio' })).not.toBeInTheDocument();
    expect(within(projectMenu).getByRole('button', { name: 'Delete Campaign concepts' })).toBeInTheDocument();

    fireEvent.click(within(projectMenu).getByText('Campaign concepts').closest('button') as HTMLElement);
    await waitFor(() => expect(onSwitchProject).toHaveBeenCalledWith(second.id));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Studio projects' })).not.toBeInTheDocument());
    await user.click(trigger);
    fireEvent.change(screen.getByLabelText('Create new project'), {
      target: { value: 'Holiday launch' },
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onCreateProject).toHaveBeenCalledWith('Holiday launch'));

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Delete Campaign concepts' }));
    await waitFor(() => expect(onDeleteProject).toHaveBeenCalledWith(second.id));
  });

  it('does not accept canvas mutations before the saved workspace is hydrated', () => {
    const onProjectChange = vi.fn();
    const { rerender } = render(
      <CanvasPanel
        {...props({
          project: null,
          projectSaveState: 'loading',
          onProjectChange,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Lock canvas' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lock canvas' }));
    expect(onProjectChange).not.toHaveBeenCalled();

    rerender(
      <CanvasPanel
        {...props({
          project: project(),
          projectSaveState: 'saved',
          onProjectChange,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Lock canvas' })).toBeEnabled();
  });

  it('keeps deliberately disconnected saved edges removed after graph data changes', () => {
    const onProjectChange = vi.fn();
    const disconnectedProject = project({
      document: {
        ...project().document,
        edgeState: 'explicit',
      },
    });
    const { container, rerender } = render(
      <CanvasPanel {...props({ project: disconnectedProject, onProjectChange })} />,
    );
    expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(0);

    rerender(
      <CanvasPanel
        {...props({
          project: disconnectedProject,
          status: 'running',
          generations: [generation({ id: 'new-result', status: 'running' })],
          onProjectChange,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lock canvas' }));
    expect(onProjectChange.mock.lastCall?.[0].edges).toEqual([
      expect.objectContaining({ id: 'generate-result-new-result' }),
    ]);
  });

  it('keeps the camera stable when generation status and result nodes change', () => {
    const { container, rerender } = render(
      <CanvasPanel {...props({ project: project() })} />,
    );
    const viewport = container.querySelector('.react-flow__viewport') as HTMLElement;
    const before = viewport.style.transform;

    rerender(
      <CanvasPanel
        {...props({
          project: project(),
          status: 'running',
          plannedOutputs: 2,
          generations: [generation({ id: 'new-result', status: 'running' })],
        })}
      />,
    );

    expect(viewport.style.transform).toBe(before);
    expect((container.querySelector('[data-id="generate"]') as HTMLElement).style.transform)
      .toBe('translate(777px,888px)');
  });

  it('re-aligns untouched workflow nodes when a character is inserted', async () => {
    const oneSubject = [{
      id: 'subject-1',
      label: 'Anika',
      imageUrl: '/storage/anika.png',
    }];
    const { container, rerender } = render(
      <CanvasPanel {...props({ subjects: oneSubject })} />,
    );

    expect((container.querySelector('[data-id="pose-manual"]') as HTMLElement).style.transform)
      .toBe('translate(380px,0px)');

    rerender(
      <CanvasPanel
        {...props({
          subjects: [
            ...oneSubject,
            { id: 'subject-2', label: 'Ravi', imageUrl: '/storage/ravi.png' },
          ],
        })}
      />,
    );

    await waitFor(() => {
      expect((container.querySelector('[data-id="character-subject-2"]') as HTMLElement).style.transform)
        .toBe('translate(380px,0px)');
      expect((container.querySelector('[data-id="pose-manual"]') as HTMLElement).style.transform)
        .toBe('translate(760px,0px)');
      expect((container.querySelector('[data-id="generate"]') as HTMLElement).style.transform)
        .toBe('translate(380px,450px)');
      expect((container.querySelector('[data-id="result-placeholder-0"]') as HTMLElement).style.transform)
        .toBe('translate(305px,670px)');
    });
  });

  it('moves a focused node from the keyboard and saves the new position', () => {
    const onProjectChange = vi.fn();
    const { container } = render(
      <CanvasPanel {...props({ project: project(), onProjectChange })} />,
    );
    const generate = container.querySelector('[data-id="generate"]') as HTMLElement;
    generate.focus();
    fireEvent.keyDown(generate, { key: 'ArrowRight' });

    expect(generate.style.transform).toBe('translate(789px,888px)');
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'generate', position: { x: 789, y: 888 } }),
      ]),
    );
    expect(screen.getByRole('button', { name: 'Undo canvas move' })).toBeEnabled();
  });

  it('fans a selected identity out to selectable pose suggestion nodes', () => {
    const onToggleSuggestion = vi.fn();
    render(
      <CanvasPanel
        {...props({
          pose: null,
          selectedSubjectId: 'subject-1',
          selectedSuggestionIds: ['pose-standing'],
          poseSuggestions: [
            {
              id: 'pose-standing',
              label: 'Hero stance',
              category: 'standing',
              imageUrl: '/storage/hero.png',
            },
            {
              id: 'pose-seated',
              label: 'Chair portrait',
              category: 'sitting',
              imageUrl: '/storage/chair.png',
            },
          ],
          plannedOutputs: 1,
          outputPoseLabels: ['Hero stance'],
          onSelectSubject: vi.fn(),
          onToggleSuggestion,
        })}
      />,
    );

    const palette = screen.getByLabelText('Node palette');
    expect(within(palette).getByRole('button', { name: /remove suggested pose hero stance/i }))
      .toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(palette).getByRole('button', { name: /add suggested pose chair portrait/i }));
    expect(onToggleSuggestion).toHaveBeenCalledWith('pose-seated');
    expect(screen.getByText('Pose · Hero stance')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Remove suggested pose Hero stance')).toHaveLength(2);
  });

  it('adds an empty image block, selects a saved source, and preserves its geometry', async () => {
    const onProjectChange = vi.fn();
    const { container, unmount } = render(
      <CanvasPanel
        {...props({
          project: project(),
          onProjectChange,
          characterAssets: [{
            id: 'character-mira',
            type: 'character',
            label: 'Mira',
            imageUrl: '/storage/mira.png',
            meta: 'Saved character',
          }],
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add character image block' }));
    expect(screen.getByLabelText('Select character image')).toBeInTheDocument();

    const emptyDocument = onProjectChange.mock.lastCall?.[0];
    const emptyBlock = emptyDocument.nodes.find((node: { custom?: boolean }) => node.custom);
    expect(emptyBlock).toMatchObject({
      kind: 'character',
      custom: true,
      width: 330,
      height: 388,
      imageFit: 'fill',
    });
    expect(emptyDocument.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: emptyBlock.id, target: 'generate', targetHandle: 'character' }),
    ]));

    fireEvent.click(within(screen.getByLabelText('Select character image')).getByRole('button', { name: 'Mira' }));
    await waitFor(() => expect(screen.queryByLabelText('Select character image')).not.toBeInTheDocument());

    const populatedDocument = onProjectChange.mock.lastCall?.[0];
    const populatedBlock = populatedDocument.nodes.find((node: { id: string }) => node.id === emptyBlock.id);
    expect(populatedBlock).toMatchObject({
      position: emptyBlock.position,
      width: emptyBlock.width,
      height: emptyBlock.height,
      label: 'Mira',
      imageUrl: '/storage/mira.png',
      assetType: 'character',
      assetId: 'character-mira',
    });

    expect(container.querySelector(`[data-id="${emptyBlock.id}"] img`))
      .toHaveAttribute('src', '/storage/mira.png');
    unmount();

    const restored = render(
      <CanvasPanel
        {...props({
          project: project({ document: populatedDocument }),
          characterAssets: [],
        })}
      />,
    );
    expect(restored.container.querySelector(`[data-id="${emptyBlock.id}"]`))
      .toHaveTextContent('Mira');
    expect(restored.container.querySelector(`[data-id="${emptyBlock.id}"] img`))
      .toHaveAttribute('src', '/storage/mira.png');
  });

  it('places repeated character image blocks in separate open canvas slots', () => {
    const { container } = render(<CanvasPanel {...props()} />);
    const addCharacter = screen.getByRole('button', { name: 'Add character image block' });

    fireEvent.click(addCharacter);
    fireEvent.click(addCharacter);

    const characterBlocks = Array.from(
      container.querySelectorAll<HTMLElement>('[data-id^="character-block-"]'),
    );
    expect(characterBlocks).toHaveLength(2);
    expect(characterBlocks[0].style.transform).not.toBe(characterBlocks[1].style.transform);
  });

  it('synchronizes authored canvas selection and deletion with the Sources panel', async () => {
    const onSelectCharacterAsset = vi.fn();
    const onSelectPoseAsset = vi.fn();
    const onDeleteSubject = vi.fn();
    const onDeletePose = vi.fn();
    const { container } = render(
      <CanvasPanel
        {...props({
          subjects: [{
            id: 'subject-1',
            label: 'Anika',
            imageUrl: '/storage/anika.png',
            assetType: 'character',
            assetId: 'character-anika',
          }],
          pose: {
            label: 'Arms crossed',
            imageUrl: '/storage/pose.png',
            assetType: 'pose',
            assetId: 'pose-arms-crossed',
          },
          characterAssets: [{
            id: 'character-mira',
            type: 'character',
            label: 'Mira',
            imageUrl: '/storage/mira.png',
          }],
          poseAssets: [{
            id: 'pose-seated',
            type: 'pose',
            label: 'Seated',
            imageUrl: '/storage/seated.png',
          }],
          onSelectCharacterAsset,
          onSelectPoseAsset,
          onDeleteSubject,
          onDeletePose,
        })}
      />,
    );

    fireEvent.click(within(container.querySelector('[data-id="character-subject-1"]') as HTMLElement)
      .getByRole('button', { name: 'Replace image for Anika' }));
    fireEvent.click(within(screen.getByLabelText('Select character image'))
      .getByRole('button', { name: 'Mira' }));
    expect(onSelectCharacterAsset).toHaveBeenCalledWith('subject-1', expect.objectContaining({
      id: 'character-mira',
    }));

    fireEvent.click(within(container.querySelector('[data-id="pose-manual"]') as HTMLElement)
      .getByRole('button', { name: 'Replace image for Arms crossed' }));
    fireEvent.click(within(screen.getByLabelText('Select pose image'))
      .getByRole('button', { name: 'Seated' }));
    expect(onSelectPoseAsset).toHaveBeenCalledWith(expect.objectContaining({ id: 'pose-seated' }));

    fireEvent.click(screen.getByRole('button', { name: 'Delete character Anika' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete pose Arms crossed' }));
    expect(onDeleteSubject).toHaveBeenCalledWith('subject-1');
    expect(onDeletePose).toHaveBeenCalledTimes(1);
  });

  it('persists source-panel selections in the Studio project document', async () => {
    const onProjectChange = vi.fn();
    const { rerender } = render(
      <CanvasPanel {...props({ project: project(), onProjectChange })} />,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset canvas' })).toBeEnabled());
    onProjectChange.mockClear();

    rerender(
      <CanvasPanel
        {...props({
          project: project(),
          onProjectChange,
          subjects: [{
            id: 'subject-1',
            label: 'Mira',
            imageUrl: '/storage/mira.png',
            assetType: 'character',
            assetId: 'character-mira',
          }],
          pose: {
            label: 'Seated',
            imageUrl: '/storage/seated.png',
            assetType: 'pose',
            assetId: 'pose-seated',
          },
        })}
      />,
    );

    await waitFor(() => expect(onProjectChange).toHaveBeenCalled());
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'character-subject-1',
        assetType: 'character',
        assetId: 'character-mira',
        imageUrl: '/storage/mira.png',
      }),
      expect.objectContaining({
        id: 'pose-manual',
        assetType: 'pose',
        assetId: 'pose-seated',
        imageUrl: '/storage/seated.png',
      }),
    ]));
  });

  it('inspects a selected image block and exposes source-safe actions', () => {
    const onProjectChange = vi.fn();
    const customProject = project({
      document: {
        schemaVersion: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          { id: 'generate', kind: 'generate', position: { x: 300, y: 450 } },
          {
            id: 'character-block-inspected',
            kind: 'character',
            position: { x: 20, y: 30 },
            custom: true,
            width: 330,
            height: 388,
            imageFit: 'fill',
            label: 'Mira portrait',
            meta: 'Saved character',
            imageUrl: '/storage/mira.png',
            assetType: 'character',
            assetId: 'character-mira',
          },
        ],
        edges: [{
          id: 'character-block-inspected-generate',
          source: 'character-block-inspected',
          target: 'generate',
          targetHandle: 'character',
        }],
        edgeState: 'explicit',
        locked: false,
      },
    });
    const { container } = render(
      <CanvasPanel {...props({ project: customProject, onProjectChange })} />,
    );

    fireEvent.click(container.querySelector('[data-id="character-block-inspected"]') as HTMLElement);
    const inspector = screen.getByLabelText('Selected image block inspector');
    expect(inspector).toHaveTextContent('Mira portrait');
    expect(inspector).toHaveTextContent('Character library');
    expect(inspector).toHaveTextContent('330 × 388');
    expect(inspector).toHaveTextContent('Connections1');
    expect(within(inspector).getByRole('link', { name: 'Locate asset' }))
      .toHaveAttribute('href', '/characters');

    fireEvent.click(within(inspector).getByRole('button', { name: 'Fit' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'character-block-inspected', imageFit: 'fit' }),
    ]));

    fireEvent.click(within(inspector).getByRole('button', { name: 'Disconnect' }));
    expect(onProjectChange.mock.lastCall?.[0].edges).toEqual([]);
    expect(within(inspector).getByRole('button', { name: 'Disconnect' })).toBeDisabled();

    fireEvent.click(within(inspector).getByRole('button', { name: 'Replace image' }));
    expect(screen.getByLabelText('Select character image')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close image picker' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close image picker' }), { key: 'Escape' });
    expect(screen.queryByLabelText('Select character image')).not.toBeInTheDocument();

    fireEvent.click(within(screen.getByLabelText('Selected image block inspector')).getByRole(
      'button',
      { name: 'Remove from canvas' },
    ));
    expect(container.querySelector('[data-id="character-block-inspected"]')).not.toBeInTheDocument();
  });

  it('emits privacy-safe local funnel events for keyboard add, validation, and selection', () => {
    const events: StudioCanvasEvent[] = [];
    const onStudioEvent = vi.fn((event: StudioCanvasEvent) => events.push(event));
    render(
      <CanvasPanel
        {...props({
          project: project(),
          onProjectChange: vi.fn(),
          onStudioEvent,
          characterAssets: [{
            id: 'character-event',
            type: 'character',
            label: 'Event portrait',
            imageUrl: '/storage/event.png',
          }],
          onUploadAsset: vi.fn(),
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add character image block' }), { detail: 0 });
    const picker = screen.getByLabelText('Select character image');
    fireEvent.change(picker.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(['invalid'], 'notes.txt', { type: 'text/plain' })] },
    });
    fireEvent.click(within(picker).getByRole('button', { name: 'Event portrait' }));

    expect(events.map((event) => event.name)).toEqual(expect.arrayContaining([
      'source_drawer_started',
      'source_block_added',
      'source_picker_opened',
      'source_validation_failed',
      'source_asset_selected',
    ]));
    expect(events.find((event) => event.name === 'source_drawer_started')).toMatchObject({
      entryMethod: 'keyboard',
      kind: 'character',
      projectId: project().id,
    });
    expect(events.find((event) => event.name === 'source_validation_failed')).toMatchObject({
      reason: 'unsupported_file_type',
    });
    expect(events.find((event) => event.name === 'source_asset_selected')).toMatchObject({
      sourceType: 'character',
    });
    expect(JSON.stringify(events)).not.toContain('/storage/event.png');
  });

  it('rejects a mismatched dragged asset before creating hidden canvas state', () => {
    const onProjectChange = vi.fn();
    const onStudioEvent = vi.fn();
    const { container } = render(
      <CanvasPanel {...props({ project: project(), onProjectChange, onStudioEvent })} />,
    );
    const dataTransfer = {
      types: ['application/x-poseforge-node'],
      dropEffect: 'none',
      getData: vi.fn(() => JSON.stringify({
        kind: 'pose',
        asset: {
          id: 'wrong-character',
          type: 'character',
          label: 'Wrong source',
          imageUrl: '/storage/wrong.png',
        },
      })),
    };

    fireEvent.drop(container.querySelector('.react-flow') as HTMLElement, {
      clientX: 500,
      clientY: 400,
      dataTransfer,
    });

    expect(screen.queryByText('Wrong source')).not.toBeInTheDocument();
    expect(onProjectChange).not.toHaveBeenCalled();
    expect(onStudioEvent).toHaveBeenCalledWith(expect.objectContaining({
      name: 'source_validation_failed',
      kind: 'pose',
      sourceType: 'character',
      reason: 'asset_type_mismatch',
    }));
  });

  it('keeps a canceled picker block recoverable and rejects invalid uploads', () => {
    const onProjectChange = vi.fn();
    render(
      <CanvasPanel
        {...props({ project: project(), onProjectChange, onUploadAsset: vi.fn() })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add pose image block' }));
    const picker = screen.getByLabelText('Select pose image');
    const upload = picker.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(upload, { target: { files: [new File(['not an image'], 'notes.txt', { type: 'text/plain' })] } });
    expect(within(picker).getByRole('alert')).toHaveTextContent('Choose a supported image file.');

    fireEvent.click(within(picker).getByRole('button', { name: 'Close image picker' }));
    expect(screen.queryByLabelText('Select pose image')).not.toBeInTheDocument();
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'pose', custom: true, label: 'Untitled pose' }),
    ]));
  });

  it('persists configurable block actions and restores them with undo', async () => {
    const onProjectChange = vi.fn();
    const customProject = project({
      document: {
        schemaVersion: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          { id: 'generate', kind: 'generate', position: { x: 300, y: 450 } },
          {
            id: 'character-block-configurable',
            kind: 'character',
            position: { x: 20, y: 30 },
            custom: true,
            width: 330,
            height: 388,
            lastExpandedWidth: 330,
            lastExpandedHeight: 388,
            imageFit: 'fill',
            label: 'Configurable portrait',
            imageUrl: '/storage/configurable.png',
            assetType: 'character',
            assetId: 'character-configurable',
          },
        ],
        edges: [{
          id: 'character-block-configurable-generate',
          source: 'character-block-configurable',
          target: 'generate',
          targetHandle: 'character',
        }],
        locked: false,
      },
    });
    const { container } = render(
      <CanvasPanel {...props({ project: customProject, onProjectChange })} />,
    );
    const block = container.querySelector('[data-id="character-block-configurable"]') as HTMLElement;
    fireEvent.click(block);

    fireEvent.click(await screen.findByRole('button', { name: 'Configure Configurable portrait' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Larger' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'character-block-configurable',
        width: 396,
        height: 466,
        lastExpandedWidth: 396,
        lastExpandedHeight: 466,
      }),
    ]));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Collapse' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'character-block-configurable', collapsed: true, height: 64 }),
    ]));

    fireEvent.click(screen.getByRole('button', { name: 'Undo canvas move' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'character-block-configurable', height: 466 }),
    ]));
    expect(onProjectChange.mock.lastCall?.[0].nodes.find(
      (node: { id: string }) => node.id === 'character-block-configurable',
    ).collapsed).toBeFalsy();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Image: Fill' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'character-block-configurable', imageFit: 'fit' }),
    ]));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Block name'), { target: { value: 'Campaign hero' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'character-block-configurable', label: 'Campaign hero' }),
    ]));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset size' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'character-block-configurable', width: 330, height: 388 }),
    ]));

    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes.filter(
      (node: { custom?: boolean }) => node.custom,
    )).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Undo canvas move' }));
    expect(onProjectChange.mock.lastCall?.[0].nodes.filter(
      (node: { custom?: boolean }) => node.custom,
    )).toHaveLength(1);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Disconnect' }));
    expect(onProjectChange.mock.lastCall?.[0].edges).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'character-block-configurable' }),
    ]));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from canvas' }));
    expect(container.querySelector('[data-id="character-block-configurable"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo canvas move' }));
    expect(container.querySelector('[data-id="character-block-configurable"]')).toBeInTheDocument();
  });

  it('clamps accessible size controls and keeps ports reachable while collapsed or locked', async () => {
    const onProjectChange = vi.fn();
    const customProject = project({
      document: {
        schemaVersion: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          { id: 'generate', kind: 'generate', position: { x: 300, y: 450 } },
          {
            id: 'pose-block-limits',
            kind: 'pose',
            position: { x: 20, y: 30 },
            custom: true,
            width: 330,
            height: 388,
            label: 'Resizable pose',
            imageUrl: '/storage/pose-limits.png',
            assetType: 'pose',
            assetId: 'pose-limits',
          },
        ],
        edges: [{
          id: 'pose-block-limits-generate',
          source: 'pose-block-limits',
          target: 'generate',
          targetHandle: 'pose',
        }],
        edgeState: 'explicit',
        locked: false,
      },
    });
    const { container } = render(
      <CanvasPanel {...props({ project: customProject, onProjectChange })} />,
    );
    const block = container.querySelector('[data-id="pose-block-limits"]') as HTMLElement;
    fireEvent.click(block);
    fireEvent.click(await screen.findByRole('button', { name: 'Configure Resizable pose' }));
    const menu = screen.getByRole('menu');

    for (let index = 0; index < 12; index += 1) {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Smaller' }));
    }
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pose-block-limits', width: 220, height: 250 }),
    ]));

    for (let index = 0; index < 12; index += 1) {
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Larger' }));
    }
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pose-block-limits', width: 560, height: 720 }),
    ]));

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Collapse' }));
    expect(block.querySelectorAll('.poseforge-handle')).toHaveLength(1);
    expect(onProjectChange.mock.lastCall?.[0].nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pose-block-limits', collapsed: true, height: 64 }),
    ]));

    fireEvent.click(screen.getByRole('button', { name: 'Lock canvas' }));
    expect(within(menu).getByRole('menuitem', { name: 'Expand' })).toBeDisabled();
    expect(within(menu).getByRole('menuitem', { name: 'Reset size' })).toBeDisabled();
    expect(within(screen.getByLabelText('Selected image block inspector')).getByRole(
      'button',
      { name: 'Fill' },
    )).toBeDisabled();
  });

  it('disables image-block additions while the canvas is locked', () => {
    render(<CanvasPanel {...props({ project: project() })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock canvas' }));
    expect(screen.getByRole('button', { name: 'Add character image block' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add pose image block' })).toBeDisabled();
  });

  it('projects a drawer drop through the saved pan and zoom', () => {
    const onProjectChange = vi.fn();
    const { container } = render(
      <CanvasPanel {...props({ project: project(), onProjectChange })} />,
    );
    const dataTransfer = {
      types: ['application/x-poseforge-node'],
      dropEffect: 'none',
      getData: vi.fn(() => JSON.stringify({
        kind: 'pose',
        asset: {
          id: 'pose-dropped',
          type: 'pose',
          label: 'Dropped pose',
          imageUrl: '/storage/dropped-pose.png',
        },
      })),
    };
    fireEvent.drop(container.querySelector('.react-flow') as HTMLElement, {
      clientX: 500,
      clientY: 400,
      dataTransfer,
    });

    const dropped = onProjectChange.mock.lastCall?.[0].nodes.find(
      (node: { label?: string }) => node.label === 'Dropped pose',
    );
    expect(dropped).toBeTruthy();
    expect(Number.isFinite(dropped.position.x)).toBe(true);
    expect(Number.isFinite(dropped.position.y)).toBe(true);
  });
});

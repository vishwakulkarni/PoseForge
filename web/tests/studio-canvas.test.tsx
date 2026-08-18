import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CanvasPanel, type CanvasPanelProps } from '@/components/studio/canvas';
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
    expect(screen.getByRole('button', { name: 'Tidy canvas' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lock canvas' }));
    expect(screen.getByRole('button', { name: 'Unlock canvas' })).toBeInTheDocument();
  });

  it('hydrates saved geometry and persists the lock without disabling inspection controls', () => {
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
    expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(0);
    expect(screen.getByLabelText('Studio project: Saved')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lock canvas' }));
    expect(onProjectChange).toHaveBeenCalled();
    expect(onProjectChange.mock.lastCall?.[0]).toMatchObject({ locked: true });
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fit all nodes' })).toBeEnabled();
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
    const { container, rerender } = render(
      <CanvasPanel {...props({ project: project(), onProjectChange })} />,
    );
    expect(container.querySelectorAll('.react-flow__edge')).toHaveLength(0);

    rerender(
      <CanvasPanel
        {...props({
          project: project(),
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
});

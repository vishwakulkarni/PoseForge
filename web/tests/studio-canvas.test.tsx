import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CanvasPanel, type CanvasPanelProps } from '@/components/studio/canvas';
import type { Generation } from '@/lib/api/types';

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

describe('PoseForge workflow canvas', () => {
  it('renders character and pose sources wired through generate to a result node', () => {
    const { container } = render(<CanvasPanel {...props()} />);

    expect(container.querySelector('[data-id="character-subject-1"]')).toHaveTextContent('Anika');
    expect(container.querySelector('[data-id="character-subject-2"]')).toHaveTextContent('Ravi');
    expect(container.querySelector('[data-id="pose-manual"]')).toHaveTextContent('Arms crossed');
    expect(container.querySelector('[data-id="generate"]')).toHaveTextContent('Forge composition');
    expect(container.querySelectorAll('.poseforge-handle')).toHaveLength(8);
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

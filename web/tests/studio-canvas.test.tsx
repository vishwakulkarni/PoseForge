import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
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
  it('renders ordered character and pose inputs as an equation', () => {
    render(<CanvasPanel {...props()} />);

    const inputs = screen.getByLabelText('Generation inputs');
    expect(within(inputs).getByText('Anika')).toBeInTheDocument();
    expect(within(inputs).getByText('Ravi')).toBeInTheDocument();
    expect(within(inputs).getByText('Arms crossed')).toBeInTheDocument();
    expect(within(inputs).getAllByLabelText('plus')).toHaveLength(2);
    expect(screen.getByLabelText('equals')).toBeInTheDocument();
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

    const outputs = screen.getByRole('group', { name: 'Generated variations' });
    expect(within(outputs).getByAltText('Generated result 1')).toBeInTheDocument();
    expect(within(outputs).getByText('Generation failed')).toBeInTheDocument();
    expect(within(outputs).getByText('Provider unavailable')).toBeInTheDocument();
    expect(within(outputs).getByRole('link', { name: 'Download' })).toBeInTheDocument();
  });

  it('keeps wheel zoom inside the workflow instead of browser zoom', () => {
    render(<CanvasPanel {...props()} />);
    const canvas = screen.getByLabelText('Composition canvas');
    const viewport = canvas.querySelector('.canvas-viewport');
    expect(viewport).toBeTruthy();

    const wheel = new WheelEvent('wheel', { deltaY: -120, cancelable: true });
    viewport!.dispatchEvent(wheel);

    expect(wheel.defaultPrevented).toBe(true);
  });
});

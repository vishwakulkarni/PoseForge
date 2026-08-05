import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers/render';
import { server } from './helpers/server';
import { StudioView } from '@/app/studio/studio-view';

// The Studio reads deep-link params; jsdom has no Next router context.
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const POSES = [
  {
    id: 'pose-1',
    title: 'Arms crossed',
    category: 'standing',
    tags: ['confident'],
    tagStatus: 'tagged',
    imageUrl: '/storage/pose-1.png',
    sourceProvider: null,
    sourcePageUrl: null,
    isCustom: false,
    createdAt: '2026-08-01T10:00:00.000Z',
  },
];

function withPoses() {
  server.use(http.get('/api/pose-references', () => HttpResponse.json({ poseReferences: POSES })));
}

function withEstimate() {
  server.use(
    http.get('/api/generations/estimate', () =>
      HttpResponse.json({
        source: 'estimated',
        rateDate: '2026-08-04',
        model: null,
        inputTokens: 2200,
        outputTokens: 1106,
        totalTokens: 3306,
        estimatedCostUsd: null,
        pricingNote: 'Codex CLI usage is estimated for context.',
      }),
    ),
  );
}

describe('Studio workbench layout', () => {
  it('renders the two numbered panels and the docked action bar', async () => {
    renderWithProviders(<StudioView />);

    expect(await screen.findByRole('heading', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Direction' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate transformation/i })).toBeInTheDocument();
    // The slot counter reads "1 / 4" on a fresh Studio.
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('shows the empty canvas prompt before any source is added', async () => {
    renderWithProviders(<StudioView />);
    expect(await screen.findByText(/build your composition/i)).toBeInTheDocument();
    expect(screen.getByText(/ready to compose/i)).toBeInTheDocument();
  });

  it('keeps generate disabled until sources and a ready engine exist', async () => {
    renderWithProviders(<StudioView />);
    const generate = await screen.findByRole('button', { name: /generate transformation/i });
    expect(generate).toBeDisabled();
    expect(screen.getByText('Add sources to begin')).toBeInTheDocument();
  });
});

describe('mode switching', () => {
  it('hides advanced-only panels in Normal mode', async () => {
    renderWithProviders(<StudioView />);
    await screen.findByRole('heading', { name: 'Direction' });

    // Recipe bar and the advanced control groups belong to Advanced only.
    expect(screen.queryByText('Recipe')).not.toBeInTheDocument();
    expect(screen.queryByText('Identity & pose')).not.toBeInTheDocument();
    expect(screen.queryByText('Multi-pose collage')).not.toBeInTheDocument();

    // Look & environment is always available.
    expect(screen.getByText('Look & environment')).toBeInTheDocument();
  });

  it('reveals every advanced control group in Advanced mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await screen.findByRole('heading', { name: 'Direction' });

    await user.click(screen.getByRole('button', { name: /advanced/i }));

    expect(screen.getByText('Recipe')).toBeInTheDocument();
    for (const group of [
      'Identity & pose',
      'Camera & light',
      'Composition',
      'Finish & retouch',
      'Output',
    ]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByText('Multi-pose collage')).toBeInTheDocument();
  });

  it('labels the generate button by mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await screen.findByRole('heading', { name: 'Direction' });

    expect(screen.getByText('Guided transformation')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByText('Advanced transformation')).toBeInTheDocument();
  });
});

describe('subject slots', () => {
  it('adds and removes subjects, updating the counter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await screen.findByText('1 / 4');

    await user.click(screen.getByRole('button', { name: /add another subject/i }));
    expect(screen.getByText('2 / 4')).toBeInTheDocument();
    expect(screen.getByText('Subject 2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove subject 2/i }));
    expect(screen.getByText('1 / 4')).toBeInTheDocument();
  });

  it('caps subjects at four', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    const add = await screen.findByRole('button', { name: /add another subject/i });

    await user.click(add);
    await user.click(add);
    await user.click(add);

    expect(screen.getByText('4 / 4')).toBeInTheDocument();
    expect(add).toBeDisabled();
  });

  it('selects a saved character from the Saved tab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await screen.findByText('Subject 1');

    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await user.click(await screen.findByRole('button', { name: /Anika/ }));

    // The slot subtitle switches from the placeholder to the character name.
    await waitFor(() => expect(screen.getByText('Anika')).toBeInTheDocument());
    expect(screen.queryByText('Add identity photo')).not.toBeInTheDocument();
  });
});

describe('pose reference', () => {
  it('selects a pose from the thumbnail strip and shows the composition', async () => {
    withPoses();
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    await user.click(await screen.findByRole('button', { name: 'Arms crossed' }));

    expect(await screen.findByText('Source composition')).toBeInTheDocument();
    expect(screen.getByText(/0 subjects · pose ready/i)).toBeInTheDocument();
  });

  it('offers collage splitting only for an uploaded sheet', async () => {
    withPoses();
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    await user.click(await screen.findByRole('button', { name: /advanced/i }));
    await user.click(screen.getByRole('button', { name: 'Arms crossed' }));

    const toggle = screen.getByRole('checkbox', { name: /multi-pose collage/i });
    await user.click(toggle);

    // A library reference is already a single pose, so the help text says so.
    expect(
      await screen.findByText(/library references are already single poses/i),
    ).toBeInTheDocument();
  });
});

describe('the dock', () => {
  it('surfaces engine readiness from the API', async () => {
    renderWithProviders(<StudioView />);
    // The fixture's default engine (codex) is ready.
    expect(await screen.findByText('Ready')).toBeInTheDocument();
  });

  it('shows the live usage estimate', async () => {
    withEstimate();
    renderWithProviders(<StudioView />);

    expect(await screen.findByText(/3\.3k tokens · plan-dependent cost/i)).toBeInTheDocument();
  });

  it('lets the engine be changed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    const select = await screen.findByLabelText(/generation engine/i);
    // The select renders a "Loading…" placeholder until /api/engines resolves.
    await waitFor(() => expect(within(select).getByRole('option', { name: 'Gemini' })).toBeTruthy());

    await user.selectOptions(select, 'gemini');

    expect((select as HTMLSelectElement).value).toBe('gemini');
    // Gemini is not ready in the fixture, and its reason is surfaced.
    expect(await screen.findByText(/no api key/i)).toBeInTheDocument();
  });
});

describe('validation', () => {
  it('lists what is missing instead of silently doing nothing', async () => {
    renderWithProviders(<StudioView />);
    await screen.findByRole('heading', { name: 'Sources' });

    // The generate button is disabled, so drive the form the way pressing
    // Enter in a text field would.
    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await waitFor(() =>
      expect(screen.getByText(/add at least one person|choose a pose photo/i)).toBeInTheDocument(),
    );
  });
});

describe('inspector', () => {
  it('edits the creative brief and counts characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    const brief = await screen.findByLabelText(/creative brief/i);
    await user.type(brief, 'Warm evening light');

    expect(screen.getByText('18 / 600')).toBeInTheDocument();
  });

  it('resets direction back to defaults', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    const brief = await screen.findByLabelText(/creative brief/i);
    await user.type(brief, 'Something');
    expect((brief as HTMLTextAreaElement).value).toBe('Something');

    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect((brief as HTMLTextAreaElement).value).toBe(''));
  });

  it('exposes the aspect ratio picker in Advanced mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await user.click(await screen.findByRole('button', { name: /advanced/i }));

    const portrait = screen.getByRole('button', { name: /portrait/i });
    await user.click(portrait);

    await waitFor(() => expect(portrait).toHaveAttribute('aria-pressed', 'true'));
    // The canvas toolbar mirrors the selected ratio.
    expect(within(screen.getByLabelText(/composition canvas/i)).getByText('4:5')).toBeInTheDocument();
  });
});

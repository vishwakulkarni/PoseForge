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
let restoreClipboard: (() => void) | null = null;

function mockClipboardRead(read: () => Promise<ClipboardItems>) {
  const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { read: vi.fn(read) },
  });
  restoreClipboard = () => {
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor);
    else Reflect.deleteProperty(navigator, 'clipboard');
  };
}

afterEach(() => {
  server.resetHandlers();
  restoreClipboard?.();
  restoreClipboard = null;
});
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

function withPoseSuggestions(onRequest?: () => void) {
  const suggestions = [
    { ...POSES[0], id: 'suggestion-1', title: 'Hero stance' },
    {
      ...POSES[0],
      id: 'suggestion-2',
      title: 'Chair portrait',
      category: 'sitting',
      imageUrl: '/storage/pose-2.png',
    },
  ];
  server.use(
    http.get('/api/pose-references/suggestions', () => {
      onRequest?.();
      return HttpResponse.json({ poseReferences: suggestions });
    }),
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

  it('shows the empty workflow graph before any source is added', async () => {
    renderWithProviders(<StudioView />);
    const canvas = screen.getByLabelText(/composition canvas/i);
    expect(await within(canvas).findByText(/add a character/i)).toBeInTheDocument();
    expect(within(canvas).getByText(/add a pose/i)).toBeInTheDocument();
    expect(within(canvas).getByText(/result will appear here/i)).toBeInTheDocument();
    expect(canvas.querySelector('[data-id="character-empty"]')).toBeInTheDocument();
    expect(canvas.querySelector('[data-id="pose-empty"]')).toBeInTheDocument();
    expect(canvas.querySelector('[data-id="generate"]')).toBeInTheDocument();
    expect(within(screen.getByLabelText(/creative controls/i)).getByRole('group', {
      name: 'Studio experience level',
    })).toBeInTheDocument();
  });

  it('hydrates the Sources panel from the active Studio project', async () => {
    withPoses();
    server.use(http.get('/api/studio-projects/default', () => HttpResponse.json({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'My Studio',
      schemaVersion: 1,
      revision: 2,
      document: {
        schemaVersion: 1,
        viewport: { x: 0, y: 0, zoom: 1 },
        nodes: [
          {
            id: 'character-slot-project',
            kind: 'character',
            position: { x: 0, y: 0 },
            label: 'Anika',
            imageUrl: '/storage/characters/a.png',
            assetType: 'character',
            assetId: '11111111-1111-4111-8111-111111111111',
          },
          {
            id: 'pose-manual',
            kind: 'pose',
            position: { x: 380, y: 0 },
            label: 'Arms crossed',
            imageUrl: '/storage/pose-1.png',
            assetType: 'pose',
            assetId: 'pose-1',
          },
        ],
        edges: [],
        edgeState: 'explicit',
        locked: false,
      },
      isDefault: true,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:05:00.000Z',
    })));
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    const canvas = screen.getByLabelText(/composition canvas/i);
    expect(await within(canvas).findByText('Anika')).toBeInTheDocument();
    expect(within(canvas).getByText('Arms crossed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose source for subject 1' }));
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    expect(within(screen.getByLabelText('Source assets')).getByRole('button', { name: 'Anika' }))
      .toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Arms crossed' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps generate disabled until sources and a ready engine exist', async () => {
    renderWithProviders(<StudioView />);
    const generate = await screen.findByRole('button', { name: /generate transformation/i });
    expect(generate).toBeDisabled();
    expect(screen.getByText('Add sources to begin')).toBeInTheDocument();
  });

  it('resizes and independently collapses both side panels', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    const sourcesResize = await screen.findByRole('separator', { name: /resize sources panel/i });
    expect(sourcesResize).toHaveAttribute('aria-valuenow', '280');
    sourcesResize.focus();
    await user.keyboard('{ArrowRight}');
    expect(sourcesResize).toHaveAttribute('aria-valuenow', '292');

    await user.click(screen.getByRole('button', { name: /collapse sources panel/i }));
    expect(screen.getByRole('button', { name: /expand sources panel/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await user.click(screen.getByRole('button', { name: /collapse direction panel/i }));
    expect(screen.getByRole('button', { name: /expand direction panel/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await user.click(screen.getByRole('button', { name: /expand direction panel/i }));
    expect(screen.getByRole('button', { name: /collapse direction panel/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('saves canvas mutations through the versioned Studio project', async () => {
    let savedDocument: Record<string, unknown> | null = null;
    server.use(
      http.put('/api/studio-projects/:id', async ({ request, params }) => {
        const body = (await request.json()) as {
          expectedRevision: number;
          document: Record<string, unknown>;
        };
        savedDocument = body.document;
        return HttpResponse.json({
          id: params.id,
          name: 'My Studio',
          schemaVersion: 1,
          revision: body.expectedRevision + 1,
          document: body.document,
          isDefault: true,
          createdAt: '2026-08-17T10:00:00.000Z',
          updatedAt: '2026-08-17T10:01:00.000Z',
        });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    expect(await screen.findByLabelText('Studio project: Saved')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Lock canvas' }));

    expect(screen.getByLabelText('Studio project: Unsaved changes')).toBeInTheDocument();
    expect(savedDocument).toBeNull();
    await waitFor(
      () => expect(savedDocument).toMatchObject({ locked: true }),
      { timeout: 7_000 },
    );
    expect(await screen.findByLabelText('Studio project: Saved')).toBeInTheDocument();
  }, 10_000);
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

  it('puts the batch output selector first in Advanced mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await user.click(await screen.findByRole('button', { name: /advanced/i }));

    const outputCount = screen.getByLabelText('Images to generate');
    const recipe = screen.getByText('Recipe');

    expect(outputCount.compareDocumentPosition(recipe) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    await user.selectOptions(outputCount, '4');
    expect(outputCount).toHaveValue('4');
  });

  it('applies a built-in recipe across the advanced controls', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await user.click(await screen.findByRole('button', { name: /advanced/i }));

    await user.selectOptions(screen.getByLabelText('Apply a recipe'), 'builtin:cinematic-story');

    expect(screen.getByRole('button', { name: 'Story · 9:16' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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
  it('automatically saves a left-panel upload as a character without generating angles', async () => {
    const user = userEvent.setup();
    let characterRequests = 0;
    let angleRequests = 0;
    server.use(
      http.post('/api/characters', () => {
        characterRequests += 1;
        return HttpResponse.json({
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Maya Profile',
          createdAt: '2026-08-21T08:00:00.000Z',
          primaryPhotoUrl: '/storage/characters/maya-profile.png',
          angleProfile: null,
        }, { status: 201 });
      }),
      http.post('/api/characters/:id/angle-profile', () => {
        angleRequests += 1;
        return HttpResponse.json({}, { status: 202 });
      }),
    );

    renderWithProviders(<StudioView />);
    await screen.findByRole('heading', { name: 'Direction' });
    const file = new File(['identity'], 'Maya Profile.png', { type: 'image/png' });

    await user.upload(screen.getByLabelText('Identity photo for subject 1'), file);

    await waitFor(() => expect(characterRequests).toBe(1));
    expect(await within(screen.getByLabelText(/source assets/i)).findByText('Maya Profile')).toBeInTheDocument();
    expect(angleRequests).toBe(0);
  });

  it('pastes a clipboard image into a subject and saves it without generating angles', async () => {
    const user = userEvent.setup();
    let characterRequests = 0;
    let angleRequests = 0;
    mockClipboardRead(async () => [{
      types: ['image/png'],
      getType: vi.fn().mockResolvedValue(new Blob(['clipboard-image'], { type: 'image/png' })),
    } as unknown as ClipboardItem]);
    server.use(
      http.post('/api/characters', () => {
        characterRequests += 1;
        return HttpResponse.json({
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Pasted character',
          createdAt: '2026-08-24T08:00:00.000Z',
          primaryPhotoUrl: '/storage/characters/pasted-character.png',
          angleProfile: null,
        }, { status: 201 });
      }),
      http.post('/api/characters/:id/angle-profile', () => {
        angleRequests += 1;
        return HttpResponse.json({}, { status: 202 });
      }),
    );

    renderWithProviders(<StudioView />);
    const subjectSlot = (await screen.findByText('Subject 1')).closest('.character-slot');
    expect(subjectSlot).not.toBeNull();
    await user.click(within(subjectSlot as HTMLElement).getByRole('button', { name: 'Paste image' }));

    await waitFor(() => expect(characterRequests).toBe(1));
    expect(await within(screen.getByLabelText(/source assets/i)).findByText('Pasted character'))
      .toBeInTheDocument();
    expect(angleRequests).toBe(0);
  });

  it('keeps canvas-picked character and pose sources synchronized with the Sources panel', async () => {
    withPoses();
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);
    await screen.findByLabelText('Studio project: Saved');
    const canvas = screen.getByLabelText(/composition canvas/i);
    const sources = screen.getByLabelText(/source assets/i);

    await user.click(within(canvas).getByRole('button', {
      name: 'Select image for Add a character',
    }));
    await user.click(within(screen.getByLabelText('Select character image'))
      .getByRole('button', { name: 'Anika' }));
    await waitFor(() => expect(within(sources).getByText('Anika')).toBeInTheDocument());
    expect(within(canvas).getByText('Anika')).toBeInTheDocument();

    await user.click(within(canvas).getByRole('button', { name: 'Delete character Anika' }));
    await waitFor(() => expect(within(sources).getByText('Add identity photo')).toBeInTheDocument());
    expect(within(canvas).getByText('Add a character')).toBeInTheDocument();

    await user.click(within(canvas).getByRole('button', {
      name: 'Select image for Add a character',
    }));
    await user.click(within(screen.getByLabelText('Select character image'))
      .getByRole('button', { name: 'Ravi' }));
    await waitFor(() => expect(within(sources).getByText('Ravi')).toBeInTheDocument());
    expect(canvas.querySelectorAll('[data-id^="character-block-"]')).toHaveLength(0);
    expect(within(canvas).getByText('Ravi')).toBeInTheDocument();

    await user.click(within(canvas).getByRole('button', {
      name: 'Select image for Add a pose',
    }));
    await user.click(within(screen.getByLabelText('Select pose image'))
      .getByRole('button', { name: 'Arms crossed' }));
    await waitFor(() => expect(within(sources).getByRole('button', { name: 'Arms crossed' }))
      .toHaveAttribute('aria-pressed', 'true'));
    expect(canvas.querySelectorAll('[data-id^="pose-block-"]')).toHaveLength(0);
    expect(canvas.querySelector('[data-id="pose-manual"]')).toHaveTextContent('Arms crossed');
  });

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

    // Both the source control and visual workflow mirror the selected identity.
    const sources = screen.getByLabelText(/source assets/i);
    const canvas = screen.getByLabelText(/composition canvas/i);
    await waitFor(() => expect(within(sources).getByText('Anika')).toBeInTheDocument());
    expect(within(canvas).getByText('Anika')).toBeInTheDocument();
    expect(screen.queryByText('Add identity photo')).not.toBeInTheDocument();
  });

  it('shows multiple selected characters as separate canvas nodes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    await user.click(await screen.findByRole('button', { name: 'Saved' }));
    await user.click(await screen.findByRole('button', { name: /Anika/ }));
    await user.click(screen.getByRole('button', { name: /add another subject/i }));
    await user.click(screen.getByRole('button', { name: 'Saved' }));
    await user.click(await screen.findByRole('button', { name: /Ravi/ }));

    const canvas = screen.getByLabelText(/composition canvas/i);
    expect(within(canvas).getByText('Anika')).toBeInTheDocument();
    expect(within(canvas).getByText('Ravi')).toBeInTheDocument();
    expect(canvas.querySelectorAll('.poseforge-node-character')).toHaveLength(2);
    expect(canvas.querySelector('[data-id="pose-empty"]')).toBeInTheDocument();
  });
});

describe('pose reference', () => {
  it('pastes a clipboard image into the pose reference', async () => {
    const user = userEvent.setup();
    mockClipboardRead(async () => [{
      types: ['image/webp'],
      getType: vi.fn().mockResolvedValue(new Blob(['pose'], { type: 'image/webp' })),
    } as unknown as ClipboardItem]);
    renderWithProviders(<StudioView />);

    const poseSection = (await screen.findByText('Pose reference')).closest('.asset-section');
    expect(poseSection).not.toBeNull();
    await user.click(within(poseSection as HTMLElement).getByRole('button', { name: 'Paste image' }));

    expect(await screen.findByAltText('Selected pose reference'))
      .toHaveAttribute('src', expect.stringMatching(/^blob:/));
  });

  it('shows a clear error when the clipboard has no image', async () => {
    const user = userEvent.setup();
    mockClipboardRead(async () => [{
      types: ['text/plain'],
      getType: vi.fn(),
    } as unknown as ClipboardItem]);
    renderWithProviders(<StudioView />);

    const poseSection = (await screen.findByText('Pose reference')).closest('.asset-section');
    await user.click(within(poseSection as HTMLElement).getByRole('button', { name: 'Paste image' }));

    expect(await screen.findByText('Clipboard does not contain an image.')).toBeInTheDocument();
  });

  it('selects a pose from the thumbnail strip and adds it to the graph', async () => {
    withPoses();
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    await user.click(await screen.findByRole('button', { name: 'Arms crossed' }));

    const canvas = screen.getByLabelText(/composition canvas/i);
    expect(await within(canvas).findByText('Arms crossed')).toBeInTheDocument();
    expect(within(canvas).getByText(/add a character/i)).toBeInTheDocument();
    expect(canvas.querySelector('[data-id="pose-manual"]')).toBeInTheDocument();
    expect(canvas.querySelector('[data-id="generate"]')).toBeInTheDocument();
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

  it('keeps prefetched pose suggestions out of the canvas while the palette is removed', async () => {
    const onSuggestionRequest = vi.fn();
    withPoseSuggestions(onSuggestionRequest);
    const user = userEvent.setup();
    renderWithProviders(<StudioView />);

    await user.click(await screen.findByRole('button', { name: 'Saved' }));
    await user.click(await screen.findByRole('button', { name: /Anika/ }));
    await waitFor(() => expect(onSuggestionRequest).toHaveBeenCalled());

    expect(screen.queryByLabelText('Node palette')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /suggested pose hero stance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /suggested pose chair portrait/i })).not.toBeInTheDocument();
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
    expect((await screen.findAllByText(/no api key/i)).length).toBeGreaterThan(0);
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
    // The workflow result card mirrors the selected ratio.
    expect(
      screen.getByLabelText(/composition canvas/i).querySelector('[data-aspect="4:5"]'),
    ).toBeInTheDocument();
  });
});

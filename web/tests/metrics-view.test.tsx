import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './helpers/render';
import { server } from './helpers/server';
import { MetricsView } from '@/app/metrics/metrics-view';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Recharts measures its container, which jsdom reports as 0x0 — the chart then
// renders nothing and swallows its children. Stubbing the responsive wrapper
// with fixed dimensions is the standard workaround.
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 800, height: 400 }}>{children}</div>
    ),
  };
});

describe('MetricsView', () => {
  it('renders the headline KPI values from the API', async () => {
    renderWithProviders(<MetricsView />);

    // Lifetime spend, tokens, active days — the reference dashboard's top row.
    expect(await screen.findByText('$31.23')).toBeInTheDocument();
    expect(screen.getByText('10.2M')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
  });

  it('shows engine health from the API rather than assuming healthy', async () => {
    expect.assertions(1);
    server.use(
      http.get('/api/metrics', async () => {
        const { metricsFixture } = await import('./helpers/server');
        return HttpResponse.json({
          ...metricsFixture,
          health: {
            status: 'degraded',
            readyEngines: 1,
            totalEngines: 3,
            queueDepth: 0,
            detail: '1/3 engines ready',
          },
        });
      }),
    );

    renderWithProviders(<MetricsView />);
    expect(await screen.findByText(/degraded/i)).toBeInTheDocument();
  });

  it('shows the signed-in Codex 5-hour and weekly limits', async () => {
    renderWithProviders(<MetricsView />);

    const codexHeading = await screen.findByText('Codex account limits');
    const codexSection = codexHeading.closest('section');
    expect(codexSection).not.toBeNull();
    expect(await within(codexSection!).findByText('5-hour window')).toBeInTheDocument();
    expect(within(codexSection!).getByText('Weekly limit')).toBeInTheDocument();
    expect(within(codexSection!).getByText('72% left')).toBeInTheDocument();
    expect(within(codexSection!).getByText('45% left')).toBeInTheDocument();
    expect(within(codexSection!).getByRole('progressbar', { name: /5-hour window codex usage/i })).toHaveAttribute(
      'aria-valuenow',
      '28',
    );
  });

  it('shows Antigravity quota windows for each model group', async () => {
    renderWithProviders(<MetricsView />);

    expect(await screen.findByText('Antigravity account limits')).toBeInTheDocument();
    expect(await screen.findByText('Gemini Models')).toBeInTheDocument();
    expect(screen.getByText('Claude and GPT models')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: /weekly limit antigravity gemini models usage/i }),
    ).toHaveAttribute('aria-valuenow', '7');
  });

  it('surfaces queue depth as its own badge when work is waiting', async () => {
    server.use(
      http.get('/api/metrics', async () => {
        const { metricsFixture } = await import('./helpers/server');
        return HttpResponse.json({
          ...metricsFixture,
          health: { ...metricsFixture.health, queueDepth: 4 },
        });
      }),
    );

    renderWithProviders(<MetricsView />);
    expect(await screen.findByText('4 queued')).toBeInTheDocument();
  });

  it('renders the per-engine breakdown with cost and latency', async () => {
    renderWithProviders(<MetricsView />);

    const table = await screen.findByRole('table');
    expect(within(table).getByText('codex')).toBeInTheDocument();
    expect(within(table).getByText('gemini-3-pro-image')).toBeInTheDocument();
    expect(within(table).getByText('$18.50')).toBeInTheDocument();
    expect(within(table).getByText('38s')).toBeInTheDocument();
  });

  it('sorts the breakdown when a column header is activated', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MetricsView />);

    const table = await screen.findByRole('table');
    const runsHeader = within(table).getByRole('button', { name: /runs/i });

    await user.click(runsHeader);
    await waitFor(() =>
      expect(within(table).getByRole('columnheader', { name: /runs/i })).toHaveAttribute(
        'aria-sort',
        'descending',
      ),
    );

    // A second activation flips direction rather than re-sorting the same way.
    await user.click(runsHeader);
    await waitFor(() =>
      expect(within(table).getByRole('columnheader', { name: /runs/i })).toHaveAttribute(
        'aria-sort',
        'ascending',
      ),
    );
  });

  it('refetches with scope=session when the scope is switched', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    server.use(
      http.get('/api/metrics', async ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('scope') ?? '');
        const { metricsFixture } = await import('./helpers/server');
        return HttpResponse.json(metricsFixture);
      }),
    );

    renderWithProviders(<MetricsView />);
    await screen.findByText('$31.23');

    await user.click(screen.getByRole('radio', { name: 'Session' }));

    await waitFor(() => expect(seen).toContain('session'));
    expect(seen[0]).toBe('historical');
  });

  it('groups recurring failures instead of listing each run', async () => {
    renderWithProviders(<MetricsView />);
    expect(await screen.findByText('Timed out after <n>ms')).toBeInTheDocument();
    expect(screen.getByText('2 times')).toBeInTheDocument();
  });

  it('shows a retryable error state when the API fails', async () => {
    server.use(
      http.get('/api/metrics', () =>
        HttpResponse.json({ error: 'Database unavailable.' }, { status: 500 }),
      ),
    );

    renderWithProviders(<MetricsView />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/database unavailable/i);
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('keeps export buttons disabled until data has loaded', async () => {
    renderWithProviders(<MetricsView />);

    const jsonButton = screen.getByRole('button', { name: /json/i });
    expect(jsonButton).toBeDisabled();

    await screen.findByText('$31.23');
    await waitFor(() => expect(jsonButton).toBeEnabled());
  });
});

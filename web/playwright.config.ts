import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Smoke-level end-to-end coverage.
 *
 * These specs assume the Express API is already running on :3004 with a
 * migrated database — they exercise the real stack, which is the point.
 * `npm run test:e2e` from the repo root starts both processes first.
 */
export default defineConfig({
  testDir: './e2e',
  // Keep tests within each file serial. Fully parallel browser contexts can
  // stampede the single local API/proxy during cold Next.js compilation and
  // turn a healthy page into a loading-skeleton timeout.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // A mobile viewport catches the nav-drawer and single-column regressions
    // that a desktop-only run would miss entirely.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: process.env.PLAYWRIGHT_NO_SERVER
    ? undefined
    : {
        // Webpack is deliberate here. In this stack, Turbopack occasionally
        // serves empty 403 responses for client chunks under a real browser,
        // leaving an SSR shell that never hydrates. That makes every click
        // appear broken and turns the suite into a false-positive factory.
        command: `npx next dev --webpack -p ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

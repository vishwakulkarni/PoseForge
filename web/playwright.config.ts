import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;
const PROCESS_ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

/**
 * Smoke-level end-to-end coverage.
 *
 * The root development command starts the complete Next.js + Express app, so
 * these specs exercise the same single-origin runtime contributors use.
 */
export default defineConfig({
  testDir: './e2e',
  // Keep tests within each file serial. Fully parallel browser contexts can
  // stampede the single local server during cold Next.js compilation and
  // turn a healthy page into a loading-skeleton timeout.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 4,
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
        command: 'npm run dev',
        cwd: '..',
        env: { ...PROCESS_ENV, PORT: String(PORT) },
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});

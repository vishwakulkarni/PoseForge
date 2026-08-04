import { expect, test } from '@playwright/test';

const PAGES = [
  { path: '/', heading: /any pose/i },
  { path: '/studio', heading: /keep the person/i },
  { path: '/characters', heading: /people you photograph/i },
  { path: '/poses', heading: /body language/i },
  { path: '/passport', heading: /print-ready/i },
  { path: '/history', heading: /everything you have made/i },
  { path: '/metrics', heading: /what your studio/i },
  { path: '/docs', heading: /poseforge docs/i },
];

test.describe('every page renders', () => {
  for (const page of PAGES) {
    test(`${page.path} loads without a client-side error`, async ({ page: browserPage }) => {
      const errors: string[] = [];
      browserPage.on('pageerror', (error) => errors.push(error.message));
      browserPage.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });

      const response = await browserPage.goto(page.path);
      expect(response?.status(), `${page.path} should return 2xx`).toBeLessThan(400);

      await expect(browserPage.getByRole('heading', { name: page.heading }).first()).toBeVisible();

      // Failed image requests to /storage are expected on a fresh database;
      // anything else is a real regression.
      const realErrors = errors.filter(
        (message) => !/storage|favicon|Failed to load resource/i.test(message),
      );
      expect(realErrors, `console errors on ${page.path}`).toEqual([]);
    });
  }
});

test('primary navigation moves between sections', async ({ page }, testInfo) => {
  await page.goto('/');

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: /open menu/i }).click();
  }

  await page.getByRole('link', { name: 'Metrics', exact: true }).click();
  await expect(page).toHaveURL(/\/metrics$/);
  await expect(page.getByRole('heading', { name: /what your studio/i })).toBeVisible();
});

test('the skip link is reachable and targets main content', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');

  const skipLink = page.getByRole('link', { name: /skip to content/i });
  await expect(skipLink).toBeFocused();

  await skipLink.press('Enter');
  await expect(page.locator('#main')).toBeVisible();
});

test('theme toggle switches and survives a reload', async ({ page }) => {
  await page.goto('/');

  const html = page.locator('html');
  await expect(html).not.toHaveClass(/dark/);

  await page.getByRole('button', { name: /switch to dark theme/i }).click();
  await expect(html).toHaveClass(/dark/);

  await page.reload();
  await expect(html).toHaveClass(/dark/);
});

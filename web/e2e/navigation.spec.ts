import { expect, test } from '@playwright/test';

const PAGES = [
  { path: '/', heading: /make the shot/i },
  { path: '/studio', heading: /sources/i },
  { path: '/characters', heading: /people you photograph/i },
  { path: '/poses', heading: /body language/i },
  { path: '/passport', heading: /one photo\. ready for the application/i },
  { path: '/history', heading: /everything you have made/i },
  { path: '/metrics', heading: /what your studio/i },
  { path: '/docs', heading: /poseforge docs/i },
];

test.describe('landing page progressive enhancement', () => {
  test.use({ javaScriptEnabled: false });

  test('keeps every core section visible without hydration', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /make the shot/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /a new pose without another photoshoot/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /one little personality.*family portrait/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /your archive is not our business model/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /stop waiting for the perfect reshoot/i }),
    ).toBeVisible();
  });
});

test('hero gallery advances manually and keeps scrolling from the new frame', async ({ page }) => {
  await page.goto('/');

  const gallery = page.getByLabel(/identity, pose reference, and generated result gallery/i);
  const viewport = gallery.locator('[class*="carouselViewport"]');
  const nextButton = page.getByRole('button', { name: /show next photo/i });

  await expect(nextButton).toBeVisible();
  await expect(
    gallery.getByRole('img', { name: /NRI family identity.*walking pose reference.*final generated image/i }).first(),
  ).toBeAttached();

  const automaticStart = await viewport.evaluate((element) => element.scrollLeft);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft), { timeout: 2_000 })
    .toBeGreaterThan(automaticStart + 4);

  const startingPosition = await viewport.evaluate((element) => element.scrollLeft);
  await nextButton.click();

  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(startingPosition + 100);

  const advancedPosition = await viewport.evaluate((element) => element.scrollLeft);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollLeft), { timeout: 3_000 })
    .toBeGreaterThan(advancedPosition + 4);
});

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

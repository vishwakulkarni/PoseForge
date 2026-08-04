import { expect, test } from '@playwright/test';

test.describe('metrics dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/metrics');
  });

  test('renders KPI cards and the engine table', async ({ page }) => {
    await expect(page.getByText('Lifetime spend')).toBeVisible();
    await expect(page.getByText('Tokens used')).toBeVisible();
    await expect(page.getByText('Success rate')).toBeVisible();
    await expect(page.getByRole('heading', { name: /per-engine breakdown/i })).toBeVisible();
  });

  test('switches scope, granularity and measure without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.getByRole('radio', { name: 'Session' }).click();
    await expect(page.getByRole('radio', { name: 'Session' })).toHaveAttribute(
      'data-state',
      'on',
    );

    await page.getByRole('radio', { name: 'Weekly' }).click();
    await page.getByRole('radio', { name: 'Cost' }).click();
    await page.getByRole('radio', { name: 'Per run' }).click();

    expect(errors).toEqual([]);
  });

  test('exports metrics as JSON', async ({ page }) => {
    const jsonButton = page.getByRole('button', { name: /^json$/i });
    await expect(jsonButton).toBeEnabled();

    const download = page.waitForEvent('download');
    await jsonButton.click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^poseforge-metrics-.*\.json$/);
  });
});

test.describe('studio', () => {
  test('blocks submission and explains what is missing', async ({ page }) => {
    await page.goto('/studio');

    await page.getByRole('button', { name: /forge image/i }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/add at least one person/i);
    await expect(alert).toContainText(/choose a pose photo/i);
  });

  test('advanced mode reveals the extra control groups', async ({ page }) => {
    await page.goto('/studio');

    await expect(page.getByText('Advanced controls')).toBeHidden();

    await page.getByRole('radio', { name: 'Advanced' }).click();

    await expect(page.getByText('Advanced controls')).toBeVisible();
    await expect(page.getByText('Fidelity')).toBeVisible();
    await expect(page.getByText('Camera')).toBeVisible();
    await expect(page.getByText('Output')).toBeVisible();
  });

  test('can add and remove a person slot', async ({ page }) => {
    await page.goto('/studio');

    await expect(page.getByText('Person 1')).toBeVisible();
    await expect(page.getByText('Person 2')).toBeHidden();

    await page.getByRole('button', { name: /add person/i }).click();
    await expect(page.getByText('Person 2')).toBeVisible();

    await page.getByRole('button', { name: /remove person 2/i }).click();
    await expect(page.getByText('Person 2')).toBeHidden();
  });
});

test.describe('poses', () => {
  test('filters the library by search term', async ({ page }) => {
    await page.goto('/poses');

    const search = page.getByRole('searchbox', { name: /search poses/i });
    await search.fill('zzzzz-no-such-pose');

    await expect(page.getByText(/no poses match those filters|library is empty/i)).toBeVisible();

    await search.fill('');
  });
});

test.describe('passport', () => {
  test('shows requirements and official links for the selected document', async ({ page }) => {
    await page.goto('/passport');

    await expect(page.getByRole('heading', { name: /requirements/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /state department/i })).toBeVisible();
  });

  test('warns before enabling AI assistance', async ({ page }) => {
    await page.goto('/passport');

    await page.getByRole('radio', { name: /ai assist/i }).click();
    await expect(page.getByText(/requires an unaltered photograph/i).first()).toBeVisible();
  });
});

test.describe('settings', () => {
  test('keeps save disabled until something changes', async ({ page }) => {
    await page.goto('/settings');

    const save = page.getByRole('button', { name: /save settings/i });
    await expect(save).toBeDisabled();
    await expect(page.getByText(/all changes saved/i)).toBeVisible();
  });

  test('never renders a full API key', async ({ page }) => {
    await page.goto('/settings');

    const inputs = page.locator('input[type="password"]');
    const count = await inputs.count();

    for (let index = 0; index < count; index += 1) {
      // Credential fields are write-only: they always start empty.
      await expect(inputs.nth(index)).toHaveValue('');
    }
  });
});

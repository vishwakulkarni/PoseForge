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
  test.beforeEach(async ({ page }) => {
    await page.goto('/studio');
    // The workbench is server-rendered before React attaches event handlers.
    // Wait for the explicit app readiness marker so a fast browser cannot
    // click the visible SSR shell and lose the interaction during hydration.
    await expect(page.locator('html[data-poseforge-hydrated="true"]')).toBeAttached();
  });

  test('renders the three-column workbench and node canvas', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Direction' })).toBeVisible();
    await expect(page.getByLabel('Composition canvas')).toBeVisible();
    await expect(page.getByRole('button', { name: /generate transformation/i })).toBeVisible();
    await expect(page.locator('[data-id="character-empty"]')).toBeVisible();
    await expect(page.locator('[data-id="pose-empty"]')).toBeVisible();
    await expect(page.locator('[data-id="generate"]')).toBeVisible();
    await expect(page.locator('[data-id="result-placeholder-0"]')).toBeVisible();
    const edgePaths = page.locator('.react-flow__edge-path');
    await expect(edgePaths.first()).toBeVisible();
    await expect(edgePaths.first()).toHaveAttribute('marker-end', /type=arrowclosed/);
    await expect(page.locator('.react-flow__arrowhead polyline').first()).toHaveCSS(
      'fill',
      'rgb(99, 91, 255)',
    );
    await expect(page.getByRole('button', { name: 'Fit all nodes' })).toBeVisible();
    await expect(page.getByLabel('Node palette')).toBeVisible();
    const projectSwitcher = page.getByRole('button', { name: /switch studio project/i });
    await expect(projectSwitcher).toBeVisible();
    await projectSwitcher.click();
    await expect(page.getByRole('dialog', { name: 'Studio projects' })).toBeVisible();
    await expect(page.getByLabel('Create new project')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Studio projects' })).toBeHidden();
    expect(await page.locator('.react-flow').evaluate((element) =>
      element.getBoundingClientRect().height,
    )).toBeGreaterThan(300);
    await expect(page.getByLabel('Canvas controls')).toBeInViewport();
  });

  test('creates a Studio project and keeps it in the project dropdown', async ({ page }) => {
    const defaultId = '33333333-3333-4333-8333-333333333333';
    const createdId = '88888888-8888-4888-8888-888888888888';
    const now = '2026-08-19T12:00:00.000Z';
    const blankDocument = {
      schemaVersion: 1 as const,
      viewport: null,
      nodes: [],
      edges: [],
      locked: false,
    };
    const defaultProject = {
      id: defaultId,
      name: 'My Studio',
      schemaVersion: 1,
      revision: 0,
      document: blankDocument,
      isDefault: true,
      createdAt: now,
      updatedAt: now,
    };
    let submittedName: string | null = null;
    let listRequests = 0;
    const observedRequests: string[] = [];
    page.on('request', (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname.includes('studio-projects') || request.isNavigationRequest()) {
        observedRequests.push(`${request.method()} ${pathname}`);
      }
    });

    await page.evaluate(() => localStorage.removeItem('poseforge:active-studio-project'));
    await page.route('**/api/studio-projects/default', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(defaultProject),
      });
    });
    await page.route('**/api/studio-projects', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { name: string };
        submittedName = body.name;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            ...defaultProject,
            id: createdId,
            name: body.name,
            isDefault: false,
          }),
        });
        return;
      }
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204 });
        return;
      }
      listRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projects: [{
            ...defaultProject,
            document: undefined,
          }],
        }),
      });
    });
    await page.route(`**/api/studio-projects/${createdId}`, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 204 });
        return;
      }
      await route.fallback();
    });

    await page.reload();
    await expect(page.locator('html[data-poseforge-hydrated="true"]')).toBeAttached();
    const switcher = page.getByRole('button', {
      name: 'Switch Studio project. Current project: My Studio',
    });
    await switcher.click();
    await page.getByLabel('Create new project').fill('Holiday launch');
    const createButton = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createButton).toBeEnabled();
    await createButton.click();
    await expect.poll(() => submittedName).toBe('Holiday launch');
    expect(observedRequests).toContain('POST /api/studio-projects');
    expect(observedRequests.filter((request) => request === 'GET /studio')).toHaveLength(1);
    await expect.poll(() => page.evaluate(() =>
      localStorage.getItem('poseforge:active-studio-project'),
    )).toBe(createdId);

    await expect(page.getByRole('button', {
      name: 'Switch Studio project. Current project: Holiday launch',
    })).toBeVisible();
    expect(submittedName).toBe('Holiday launch');
    expect(listRequests).toBe(1);

    await page.getByRole('button', {
      name: 'Switch Studio project. Current project: Holiday launch',
    }).click();
    const menu = page.getByRole('dialog', { name: 'Studio projects' });
    await expect(menu.getByRole('button', { name: /Holiday launch Updated/ })).toBeVisible();
    await expect(menu.getByLabel('Current project')).toBeVisible();
    await menu.getByRole('button', { name: 'Delete Holiday launch' }).click();
    await expect(page.getByRole('button', {
      name: 'Switch Studio project. Current project: My Studio',
    })).toBeVisible();
    await page.getByRole('button', {
      name: 'Switch Studio project. Current project: My Studio',
    }).click();
    await expect(page.getByRole('dialog', { name: 'Studio projects' })
      .getByRole('button', { name: /holiday launch/i })).toHaveCount(0);
  });

  test('locks and unlocks spatial canvas interactions', async ({ page }) => {
    await expect(page.getByLabel('Studio project: Saved')).toBeVisible();
    await page.getByRole('button', { name: 'Lock canvas' }).click();
    await expect(page.getByRole('button', { name: 'Unlock canvas' })).toBeVisible();
    await page.getByRole('button', { name: 'Unlock canvas' }).click();
    await expect(page.getByRole('button', { name: 'Lock canvas' })).toBeVisible();
  });

  test('matches the canvas palette to day and night themes', async ({ page }) => {
    const canvas = page.locator('.canvas-viewport');
    const flow = page.locator('.react-flow');
    const node = page.locator('.poseforge-node-character').first();
    const controls = page.locator('.poseforge-controls');
    const drawerCard = page.locator('.poseforge-palette-card').first();

    await expect(canvas).toHaveCSS('background-color', 'rgb(248, 250, 252)');
    await expect(node).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(controls).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(drawerCard).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await expect(flow).toHaveClass(/light/);

    await page.getByRole('button', { name: 'Switch to dark theme' }).click();

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(canvas).toHaveCSS('background-color', 'rgb(20, 16, 24)');
    await expect(node).toHaveCSS('background-color', 'rgb(28, 23, 33)');
    await expect(controls).toHaveCSS('background-color', 'rgb(28, 23, 33)');
    await expect(drawerCard).toHaveCSS('background-color', 'rgb(33, 27, 38)');
    await expect(page.locator('.react-flow__arrowhead polyline').first()).toHaveCSS(
      'fill',
      'rgb(155, 148, 255)',
    );
    await expect(flow).toHaveClass(/dark/);
  });

  test('drags, populates, inspects, and configures image blocks at a saved zoom', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop HTML drag-and-drop regression.');
    const projectId = '44444444-4444-4444-8444-444444444444';
    let revision = 2;
    let document = {
      schemaVersion: 1 as const,
      viewport: { x: -120, y: -40, zoom: 0.75 },
      nodes: [
        { id: 'character-empty', kind: 'character', position: { x: 0, y: 0 } },
        { id: 'pose-empty', kind: 'pose', position: { x: 380, y: 0 } },
        { id: 'generate', kind: 'generate', position: { x: 190, y: 450 } },
        { id: 'result-placeholder-0', kind: 'result', position: { x: 115, y: 670 } },
      ],
      edges: [
        { id: 'character-empty-generate', source: 'character-empty', target: 'generate', targetHandle: 'character' },
        { id: 'pose-empty-generate', source: 'pose-empty', target: 'generate', targetHandle: 'pose' },
        { id: 'generate-result-placeholder-0', source: 'generate', target: 'result-placeholder-0' },
      ],
      edgeState: 'explicit' as const,
      locked: false,
    };
    const response = () => ({
      id: projectId,
      name: 'Image block acceptance project',
      schemaVersion: 1,
      revision,
      document,
      isDefault: true,
      createdAt: '2026-08-18T10:00:00.000Z',
      updatedAt: '2026-08-18T10:05:00.000Z',
    });

    await page.route('**/api/characters', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          characters: [{
            id: 'character-e2e',
            name: 'E2E portrait',
            primaryPhotoUrl: '/storage/e2e-portrait.png',
            createdAt: '2026-08-18T10:00:00.000Z',
          }],
        }),
      });
    });
    await page.route(`**/api/studio-projects/${projectId}`, async (route) => {
      const body = route.request().postDataJSON() as { document: typeof document };
      document = body.document;
      revision += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) });
    });
    await page.route('**/api/studio-projects/default', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) });
    });

    await page.reload();
    await expect(page.locator('html[data-poseforge-hydrated="true"]')).toBeAttached();
    await expect(page.getByLabel('Studio project: Saved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reset zoom from 75%' })).toBeVisible();

    const canvas = page.locator('.react-flow');
    const pane = page.locator('.react-flow__pane');
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    const targetPosition = { x: Math.round(canvasBox!.width * 0.24), y: 220 };
    const palettePose = page.getByRole('button', { name: 'Add pose image block' });
    await expect(palettePose).toHaveAttribute('draggable', 'true');
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await palettePose.dispatchEvent('dragstart', { dataTransfer });
    await pane.dispatchEvent('dragover', {
      dataTransfer,
      clientX: canvasBox!.x + targetPosition.x,
      clientY: canvasBox!.y + targetPosition.y,
    });
    await pane.dispatchEvent('drop', {
      dataTransfer,
      clientX: canvasBox!.x + targetPosition.x,
      clientY: canvasBox!.y + targetPosition.y,
    });
    await palettePose.dispatchEvent('dragend', { dataTransfer });
    await expect(page.getByLabel('Select pose image')).toBeVisible();
    await page.getByRole('button', { name: 'Close image picker' }).click();

    const droppedPose = page.locator('.react-flow__node[data-id^="pose-block-"]');
    await expect(droppedPose).toHaveCount(1);
    const droppedBox = await droppedPose.boundingBox();
    expect(droppedBox).not.toBeNull();
    expect(canvasBox!.x + targetPosition.x).toBeGreaterThanOrEqual(droppedBox!.x);
    expect(canvasBox!.x + targetPosition.x).toBeLessThanOrEqual(droppedBox!.x + droppedBox!.width);
    expect(Math.abs(droppedBox!.y - (canvasBox!.y + targetPosition.y - 27))).toBeLessThan(24);
    await expect(page.getByLabel('Selected image block inspector')).toBeVisible();

    await page.getByRole('button', { name: 'Configure Untitled pose' }).click();
    await page.getByRole('menuitem', { name: 'Smaller' }).click();
    await page.getByRole('menuitem', { name: 'Collapse' }).click();
    await expect(droppedPose.locator('.poseforge-collapsed-body')).toBeVisible();
    await expect(droppedPose.locator('.poseforge-handle')).toHaveCount(1);
    await page.getByLabel('Selected image block inspector')
      .getByRole('button', { name: 'Remove from canvas' }).click();
    await expect(droppedPose).toHaveCount(0);

    await page.getByRole('button', { name: 'Add character image block' }).click();
    const picker = page.getByLabel('Select character image');
    await expect(picker).toBeVisible();
    await picker.getByRole('button', { name: 'E2E portrait' }).click();
    const sources = page.getByLabel('Source assets');
    await expect(sources.getByText('E2E portrait')).toBeVisible();
    await expect(page.locator('.react-flow__node[data-id^="character-block-"]')).toHaveCount(0);
    const synchronizedCharacter = page.locator('.poseforge-node-character');
    await expect(synchronizedCharacter).toContainText('E2E portrait');
    await synchronizedCharacter.getByRole('button', { name: 'Delete character E2E portrait' }).click();
    await expect(sources.getByText('Add identity photo')).toBeVisible();
    await expect(page.locator('[data-id="character-empty"]')).toContainText('Add a character');
  });

  test('hydrates before editing and persists the final rapid drag position', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Desktop pointer-drag persistence regression.');
    // The describe-level navigation uses the real API. Let that workspace
    // settle before replacing the project endpoints for this isolated case.
    await expect(page.getByLabel('Studio project: Saved')).toBeVisible();
    await page.waitForTimeout(500);
    const projectId = '33333333-3333-4333-8333-333333333333';
    let revision = 7;
    let putCount = 0;
    let document = {
      schemaVersion: 1,
      // Keep the Generate node clear of the bottom drawer while still using a
      // non-default camera that proves hydration does not trigger fit-view.
      viewport: { x: -240, y: -80, zoom: 0.8 },
      nodes: [
        { id: 'character-empty', kind: 'character', position: { x: 0, y: 0 } },
        { id: 'pose-empty', kind: 'pose', position: { x: 380, y: 0 } },
        { id: 'generate', kind: 'generate', position: { x: 190, y: 450 } },
        { id: 'result-placeholder-0', kind: 'result', position: { x: 115, y: 670 } },
      ],
      // Legacy projects saved geometry before explicit edge-state tracking and
      // can have an empty edge array. Cold-open must repair their authored arrows.
      edges: [],
      locked: false,
    };
    const response = () => ({
      id: projectId,
      name: 'Canvas regression project',
      schemaVersion: 1,
      revision,
      document,
      isDefault: true,
      createdAt: '2026-08-17T10:00:00.000Z',
      updatedAt: '2026-08-17T10:05:00.000Z',
    });

    await page.route(`**/api/studio-projects/${projectId}`, async (route) => {
      const body = await route.request().postDataJSON() as {
        expectedRevision: number;
        document: typeof document;
      };
      expect(body.expectedRevision).toBe(revision);
      await new Promise((resolve) => setTimeout(resolve, 80));
      document = body.document;
      revision += 1;
      putCount += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) });
    });
    await page.route('**/api/studio-projects/default', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response()) });
    });

    await page.reload();
    await expect(page.locator('html[data-poseforge-hydrated="true"]')).toBeAttached();
    const lock = page.getByRole('button', { name: 'Lock canvas' });
    await expect(page.getByLabel('Studio project: Saved')).toBeVisible();
    await expect(lock).toBeEnabled();
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(3);
    await expect(page.locator('.react-flow__edge-path').first()).toHaveAttribute(
      'marker-end',
      /type=arrowclosed/,
    );
    const settledPutCount = putCount;
    await page.waitForTimeout(250);
    expect(putCount).toBe(settledPutCount);
    expect(document.viewport).toEqual({ x: -240, y: -80, zoom: 0.8 });

    const canvasNodes = page.locator('.react-flow__node');
    const originalNodeTransforms = await canvasNodes.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).style.transform),
    );
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(canvasNodes).toHaveCount(4);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await page.getByRole('button', { name: 'Zoom out' }).click();
    await expect(canvasNodes).toHaveCount(4);
    expect(await canvasNodes.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).style.transform),
    )).toEqual(originalNodeTransforms);

    const generate = page.locator('[data-id="generate"]');
    const start = document.nodes.find((node) => node.id === 'generate')!.position;
    const box = await generate.boundingBox();
    expect(box).not.toBeNull();
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 45, y + 25, { steps: 2 });
    await page.mouse.move(x + 95, y + 55, { steps: 2 });
    await page.mouse.up();

    await expect(page.getByLabel('Studio project: Unsaved changes')).toBeVisible();
    await page.waitForTimeout(4_500);
    expect(putCount).toBe(settledPutCount);
    await expect.poll(() => document.nodes.find((node) => node.id === 'generate')!.position)
      .not.toEqual(start);
    expect(putCount).toBe(settledPutCount + 1);
    await expect(page.getByLabel('Studio project: Saved')).toBeVisible();
    const savedPosition = { ...document.nodes.find((node) => node.id === 'generate')!.position };

    await page.reload();
    await expect(page.getByLabel('Studio project: Saved')).toBeVisible();
    await expect(generate).toHaveCSS(
      'transform',
      `matrix(1, 0, 0, 1, ${savedPosition.x}, ${savedPosition.y})`,
    );
  });

  test('keeps generate disabled until sources exist', async ({ page }) => {
    await expect(page.getByRole('button', { name: /generate transformation/i })).toBeDisabled();
    await expect(page.getByText('Add sources to begin')).toBeVisible();
  });

  test('advanced mode reveals the extra control groups', async ({ page }) => {
    await expect(page.getByText('Identity & pose')).toBeHidden();

    await page.getByRole('button', { name: /^Advanced/ }).click();

    for (const group of [
      'Recipe',
      'Identity & pose',
      'Camera & light',
      'Composition',
      'Finish & retouch',
      'Output',
    ]) {
      await expect(page.getByText(group, { exact: true })).toBeVisible();
    }
  });

  test('can add and remove a subject slot', async ({ page }) => {
    await expect(page.getByText('1 / 4')).toBeVisible();

    await page.getByRole('button', { name: /add another subject/i }).click();
    await expect(page.getByText('2 / 4')).toBeVisible();
    await expect(page.getByText('Subject 2')).toBeVisible();

    await page.getByRole('button', { name: /remove subject 2/i }).click();
    await expect(page.getByText('1 / 4')).toBeVisible();
  });

  test('aspect ratio selection updates the selected output setting', async ({ page }) => {
    await page.getByRole('button', { name: /^Advanced/ }).click();
    await page.getByText('Output', { exact: true }).click();
    await page.getByRole('button', { name: /^Portrait · 4:5$/i }).click();

    await expect(page.getByRole('button', { name: /^Portrait · 4:5$/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

    await expect(page.getByRole('heading', { name: /u\.s\. passport checklist/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /state department/i })).toBeVisible();
  });

  test('warns before enabling AI assistance', async ({ page }) => {
    await page.goto('/passport');

    await page.getByRole('radio', { name: /ai assist/i }).click();
    await expect(page.getByText(/requires an unaltered photograph/i).first()).toBeVisible();
  });

  test('switches to India and exposes passport, visa, e-Visa, and OCI profiles', async ({
    page,
  }) => {
    await page.goto('/passport');

    await expect(page.getByText('Local formatting · 0 tokens · $0.00')).toBeVisible();
    await expect(page.getByRole('button', { name: /prepare u\.s\. passport photo/i })).toBeDisabled();
    await expect(page.getByText('Guidelines checked')).toBeVisible();
    await expect(page.getByText('Official source update')).toBeVisible();

    await page.getByRole('radio', { name: 'India' }).click();
    await page.getByRole('combobox', { name: 'Document' }).click();

    for (const profile of [
      'Indian passport',
      'India regular visa',
      'India e-Visa',
      'India OCI application',
    ]) {
      await expect(page.getByRole('option', { name: profile })).toBeVisible();
    }

    await page.getByRole('option', { name: 'India OCI application' }).click();
    await expect(page.getByRole('heading', { name: /india oci application checklist/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /central oci application faq/i })).toBeVisible();
  });
});

test.describe('documentation navigation', () => {
  test('keeps the PoseForge navigation working across the docs layout', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/studio');

    if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('link', { name: 'Docs', exact: true }).click();

    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole('heading', { name: /poseforge docs/i })).toBeVisible();

    if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
    const primary = page.getByRole('navigation', { name: isMobile ? 'Mobile' : 'Primary' });
    for (const item of ['Studio', 'Metrics', 'Docs', 'Settings']) {
      await expect(primary.getByRole('link', { name: item, exact: true })).toBeVisible();
    }

    await primary.getByRole('link', { name: 'Studio', exact: true }).click();
    await expect(page).toHaveURL(/\/studio$/);
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
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

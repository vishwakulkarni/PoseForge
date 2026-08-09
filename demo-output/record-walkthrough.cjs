const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../web/node_modules/playwright');

const baseUrl = process.env.POSEFORGE_DEMO_URL || 'http://127.0.0.1:3000';
const outputDir = __dirname;
const rawDir = path.join(outputDir, 'raw');
const timelinePath = path.join(outputDir, 'timeline.json');

const sleep = (page, milliseconds) => page.waitForTimeout(milliseconds);

async function settle(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.locator('main').waitFor({ state: 'visible' });
}

async function zoomTo(page, locator, scale = 1.55) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Could not locate zoom target.');
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(center.x, center.y, { steps: 12 });
  await page.evaluate(({ x, y, scale: nextScale }) => {
    document.body.style.transformOrigin = `${x}px ${y}px`;
    document.body.style.transition = 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.style.transform = `scale(${nextScale})`;
  }, { ...center, scale });
  await sleep(page, 700);
}

async function zoomOut(page) {
  await page.evaluate(() => {
    document.body.style.transition = 'transform 550ms cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.style.transform = 'scale(1)';
  });
  await sleep(page, 600);
}

async function clickPrimaryNav(page, label) {
  const link = page
    .locator('nav[aria-label="Primary"]')
    .getByRole('link', { name: label, exact: true });
  await link.click();
  await settle(page);
}

(async () => {
  fs.mkdirSync(rawDir, { recursive: true });
  for (const name of fs.readdirSync(rawDir)) {
    fs.unlinkSync(path.join(rawDir, name));
  }

  const browser = await chromium.launch({ headless: true });

  // Warm data-heavy routes before recording so only intentional UI states appear.
  const warmContext = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const warmPage = await warmContext.newPage();
  for (const route of ['/studio', '/history', '/metrics']) {
    await warmPage.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await warmPage.locator('main').waitFor({ state: 'visible' });
  }
  await warmContext.close();

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: 'light',
    recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const startedAt = Date.now();
  let clickedAt = null;
  let completedAt = null;
  let metricsStartedAt = null;
  let metricsCompletedAt = null;

  try {
    await page.goto(`${baseUrl}/studio`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.getByLabel('Source assets').waitFor({ state: 'visible' });
    await sleep(page, 450);

    // Select the saved character.
    await page.getByRole('button', { name: 'Saved', exact: true }).click();
    const character = page.getByRole('button', { name: 'vishwa-sitting', exact: true });
    await character.waitFor({ state: 'visible' });
    await zoomTo(page, character, 1.75);
    await sleep(page, 250);
    await character.click();
    await sleep(page, 350);
    await zoomOut(page);

    // Select a complementary seated pose.
    const pose = page.getByRole('button', { name: 'Stone-stair seated pose', exact: true });
    await pose.waitFor({ state: 'visible' });
    await zoomTo(page, pose, 1.8);
    await sleep(page, 250);
    await pose.click();
    await sleep(page, 350);
    await zoomOut(page);

    // Reveal the complete character + pose equation on the canvas.
    const canvas = page.getByLabel('Composition canvas');
    await zoomTo(page, canvas, 1.25);
    await sleep(page, 500);
    await zoomOut(page);

    // Focus the call to action, then submit a real Codex generation.
    await page.locator('#engine').selectOption('codex');
    const generate = page.getByRole('button', { name: /Generate transformation/ });
    await generate.waitFor({ state: 'visible' });
    await zoomTo(page, generate, 1.65);
    await sleep(page, 250);
    const generationResponse = page.waitForResponse(
      (response) => response.url().includes('/api/generations') && response.request().method() === 'POST',
    );
    await generate.click();
    clickedAt = Date.now() - startedAt;
    const queued = await generationResponse;
    if (!queued.ok()) throw new Error(`Generation request failed with ${queued.status()}.`);
    await sleep(page, 350);
    await zoomOut(page);

    // Hold on the genuine in-progress state; post-production shortens only this wait.
    await page.getByText(/Queued|Forging result/, { exact: false }).first().waitFor({ state: 'visible' });
    const result = page.locator('img[alt="Generated result 1"]');
    await result.waitFor({ state: 'visible', timeout: 10 * 60 * 1000 });
    completedAt = Date.now() - startedAt;
    await zoomTo(page, result, 1.7);
    await sleep(page, 750);
    await zoomOut(page);

    // Open the newly created image in History.
    await clickPrimaryNav(page, 'History');
    const newestGeneration = page
      .getByRole('button', { name: /Open detail for generation from/ })
      .first();
    await newestGeneration.waitFor({ state: 'visible' });
    await zoomTo(page, newestGeneration, 1.4);
    await sleep(page, 250);
    await newestGeneration.click();
    const historyResult = page.getByRole('img', { name: 'Generated result' });
    await historyResult.waitFor({ state: 'visible' });
    await zoomTo(page, historyResult, 1.45);
    await sleep(page, 600);
    await zoomOut(page);

    // End on this session's truthful zero-cost usage graph.
    await page.keyboard.press('Escape');
    await clickPrimaryNav(page, 'Metrics');
    metricsStartedAt = Date.now() - startedAt;
    await page.getByRole('radio', { name: 'Session', exact: true }).click();
    await page.getByText('Lifetime spend', { exact: true }).waitFor({ state: 'visible' });
    await page.getByText('$0', { exact: true }).first().waitFor({ state: 'visible' });
    const zeroCostCard = page.getByText('Lifetime spend', { exact: true }).locator('../..');
    await zoomTo(page, zeroCostCard, 1.35);
    await sleep(page, 450);
    await zoomOut(page);

    await page.getByRole('radio', { name: 'Cost', exact: true }).click();
    const usageGraph = page.getByRole('heading', { name: 'Cumulative usage' }).locator('../..');
    await usageGraph.scrollIntoViewIfNeeded();
    await zoomTo(page, usageGraph, 1.22);
    await sleep(page, 900);
    await zoomOut(page);
    await sleep(page, 350);
    metricsCompletedAt = Date.now() - startedAt;
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, 'error-state.png'), fullPage: true });
    throw error;
  } finally {
    await page.close();
    const rawPath = await video.path();
    await context.close();
    await browser.close();
    const destination = path.join(rawDir, 'generation-walkthrough.webm');
    fs.copyFileSync(rawPath, destination);
    fs.writeFileSync(
      timelinePath,
      JSON.stringify({
        startedAt: 0,
        clickedAt,
        completedAt,
        metricsStartedAt,
        metricsCompletedAt,
        endedAt: Date.now() - startedAt,
      }, null, 2),
    );
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

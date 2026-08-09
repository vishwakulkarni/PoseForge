const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../web/node_modules/playwright');

const baseUrl = process.env.POSEFORGE_DEMO_URL || 'http://127.0.0.1:3000';
const rawDir = path.join(__dirname, 'raw');
const sleep = (page, milliseconds) => page.waitForTimeout(milliseconds);

async function zoomTo(page, locator, scale) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('Could not locate Metrics zoom target.');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y, { steps: 12 });
  await page.evaluate(({ x: originX, y: originY, scale: nextScale }) => {
    document.body.style.transformOrigin = `${originX}px ${originY}px`;
    document.body.style.transition = 'transform 600ms cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.style.transform = `scale(${nextScale})`;
  }, { x, y, scale });
  await sleep(page, 700);
}

async function zoomOut(page) {
  await page.evaluate(() => {
    document.body.style.transition = 'transform 550ms cubic-bezier(0.16, 1, 0.3, 1)';
    document.body.style.transform = 'scale(1)';
  });
  await sleep(page, 600);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    colorScheme: 'light',
    recordVideo: { dir: rawDir, size: { width: 1920, height: 1080 } },
  });
  const page = await context.newPage();
  const video = page.video();

  await page.goto(`${baseUrl}/metrics`, { waitUntil: 'domcontentloaded' });
  await page.locator('main').waitFor({ state: 'visible' });
  await page.getByText('Lifetime spend', { exact: true }).waitFor({ state: 'visible' });
  await sleep(page, 350);

  await page.getByRole('radio', { name: 'Session', exact: true }).click();
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

  await page.close();
  const recordedPath = await video.path();
  await context.close();
  await browser.close();
  fs.copyFileSync(recordedPath, path.join(rawDir, 'metrics-tail.webm'));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

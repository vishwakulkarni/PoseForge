// Records the short product video at native 1920x1080 as four scenes: hook, flow (Studio, then Advanced
// Studio, then the baby-running workflow), metrics, end card.
// Rebuild:
//   export D=/tmp/poseforge-demo-db/pglite
//   PGLITE_DATA_DIR=$D node demo-output/seed-demo-usage.cjs
//   PGLITE_DATA_DIR=$D PORT=3100 node server.js &
//   node demo-output/record-hero.cjs && node demo-output/compose-hero.cjs
// Read-only: never clicks Generate or edits a project. Metrics runs against a throwaway DB with
// SAMPLE usage (see seed-demo-usage.cjs), so the scene is labelled as sample data on screen.
//
//   POSEFORGE_DEMO_URL         app with example projects, default http://127.0.0.1:3100
//   POSEFORGE_DEMO_METRICS_URL seeded app, default http://127.0.0.1:3100 (Metrics)
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../web/node_modules/playwright');

const appUrl = process.env.POSEFORGE_DEMO_URL || 'http://127.0.0.1:3100';
const metricsUrl = process.env.POSEFORGE_DEMO_METRICS_URL || 'http://127.0.0.1:3100';
const rawDir = path.join(__dirname, 'raw-hero');
const VIEWPORT = { width: 1920, height: 1080 };

const pause = (page, ms) => page.waitForTimeout(ms);

// Injected into every page: cursor + click ripple, caption pill, sample-data tag, hidden dev badge.
// Mounted on <html> (not <body>) so zooming <body> never scales the overlay.
const overlay = () => {
  const mount = () => {
    if (document.getElementById('demo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      nextjs-portal{display:none!important}
      #demo-cursor{position:fixed;z-index:2147483647;left:-40px;top:-40px;width:30px;height:30px;border-radius:50%;
        background:rgba(129,140,248,.5);border:3px solid #fff;box-shadow:0 4px 18px rgba(0,0,0,.45);
        pointer-events:none;transform:translate(-50%,-50%)}
      .demo-ripple{position:fixed;z-index:2147483646;width:26px;height:26px;border-radius:50%;
        border:3px solid rgba(165,180,252,.95);pointer-events:none;transform:translate(-50%,-50%);
        animation:demo-ripple .6s ease-out forwards}
      @keyframes demo-ripple{to{width:96px;height:96px;opacity:0}}
      #demo-caption{position:fixed;z-index:2147483647;left:50%;bottom:56px;transform:translate(-50%,12px);
        padding:16px 36px;border-radius:999px;background:rgba(10,10,18,.9);color:#fff;white-space:nowrap;
        font:700 34px/1.15 Inter,system-ui,sans-serif;letter-spacing:-.01em;pointer-events:none;
        border:1px solid rgba(255,255,255,.2);box-shadow:0 10px 40px rgba(0,0,0,.5);
        opacity:0;transition:opacity .3s,transform .3s}
      #demo-caption.on{opacity:1;transform:translate(-50%,0)}
      #demo-tag{position:fixed;z-index:2147483647;top:84px;right:32px;padding:8px 18px;border-radius:999px;
        background:rgba(251,191,36,.14);color:#fbbf24;border:1px solid rgba(251,191,36,.4);
        font:600 18px/1 Inter,system-ui,sans-serif;pointer-events:none;display:none}`;
    document.head.append(style);
    const root = document.documentElement;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    const tag = document.createElement('div');
    tag.id = 'demo-tag';
    tag.textContent = 'Sample usage data';
    root.append(cursor, caption, tag);
    window.addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, true);
    window.addEventListener('__demo_click', (e) => {
      const r = document.createElement('div');
      r.className = 'demo-ripple';
      r.style.left = `${e.detail.x}px`;
      r.style.top = `${e.detail.y}px`;
      root.append(r);
      setTimeout(() => r.remove(), 700);
    });
  };
  if (document.documentElement) mount();
  else document.addEventListener('DOMContentLoaded', mount);
};

const caption = (page, text) => page.evaluate((value) => {
  const el = document.getElementById('demo-caption');
  if (!el) return;
  if (value) el.textContent = value;
  el.classList.toggle('on', Boolean(value));
}, text);

const showTag = (page, on) => page.evaluate((v) => {
  document.getElementById('demo-tag').style.display = v ? 'block' : 'none';
}, on);

async function glide(page, x, y, steps = 28) {
  await page.mouse.move(x, y, { steps });
}

async function center(locator) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

async function click(page, x, y) {
  await page.evaluate((p) => window.dispatchEvent(new CustomEvent('__demo_click', { detail: p })), { x, y });
  await page.mouse.down();
  await page.mouse.up();
}

// Zoom <main> toward a viewport point (header stays put). The cursor stays under the point
// because it is the transform origin. Zooming back to 1 removes the transform entirely so
// fixed/sticky descendants behave normally again.
async function zoom(page, x, y, scale, ms = 700) {
  await page.evaluate(({ x, y, scale, ms }) => {
    const t = document.querySelector('main') || document.body;
    if (!t.style.transform || t.style.transform === 'none') {
      const r = t.getBoundingClientRect();
      t.style.transformOrigin = `${x - r.left}px ${y - r.top}px`;
    }
    t.style.transition = ms ? `transform ${ms}ms cubic-bezier(.16,1,.3,1)` : 'none';
    t.style.transform = `scale(${scale})`;
    if (scale === 1) {
      setTimeout(() => { t.style.transition = 'none'; t.style.transform = 'none'; }, ms + 50);
    }
  }, { x, y, scale, ms });
  if (ms) await pause(page, ms + (scale === 1 ? 80 : 0));
}

async function wheelSmooth(page, dx, dy, steps = 30) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(dx / steps, dy / steps);
    await pause(page, 30);
  }
}

async function projectId(kind, name) {
  const res = await fetch(`${appUrl}/api/${kind}`);
  const body = await res.json();
  const list = Array.isArray(body) ? body : body.projects;
  const hit = list.find((p) => p.name === name);
  if (!hit) throw new Error(`Project "${name}" not found in ${kind}.`);
  return hit.id;
}

// The seeded project opens with a stored viewport; fit all nodes so the result is in frame.
async function fitStudioCanvas(page) {
  await page.getByRole('button', { name: 'Fit all nodes' }).click();
  await pause(page, 1000);
}

const marks = {};

// Each scene gets its own recorded context so cuts are clean and load jank can be trimmed.
// page.screencast records at the viewport size with a high JPEG quality; the default
// recordVideo encoder is too soft for UI text at 1080p.
async function scene(browser, name, fn) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  await context.addInitScript(overlay);
  const page = await context.newPage();
  const file = path.join(rawDir, `${name}.webm`);
  await page.screencast.start({ path: file, size: VIEWPORT, quality: 95 });
  const t0 = Date.now();
  const mark = (label) => { (marks[name] ||= {})[label] = (Date.now() - t0) / 1000; };
  try {
    await fn(page, mark);
  } finally {
    mark('end');
    await page.screencast.stop();
    await context.close();
  }
}

// Centre of the first <img> in the React Flow node that contains `text`.
async function nodeImage(page, text) {
  const img = page.locator('.react-flow__node').filter({ hasText: text }).locator('img').first();
  return center(img);
}

(async () => {
  fs.rmSync(rawDir, { recursive: true, force: true });
  fs.mkdirSync(rawDir, { recursive: true });
  const studioId = await projectId('studio-projects', 'Example: one model, three poses');
  const babyId = await projectId('advanced-studio-projects', 'Example: baby running');
  const studioUrl = `${appUrl}/studio/${studioId}`;
  const babyUrl = `${appUrl}/studio-advanced/${babyId}`;

  const browser = await chromium.launch({ headless: true });

  // Warm everything so recordings show settled UI.
  const warm = await (await browser.newContext({ viewport: VIEWPORT })).newPage();
  for (const url of [studioUrl, babyUrl, `${metricsUrl}/metrics`]) {
    await warm.goto(url, { waitUntil: 'networkidle' });
  }
  await warm.context().close();

  // 1. Hook: open on the finished photo, then pull back to reveal the recipe.
  await scene(browser, 'hook', async (page, mark) => {
    await page.goto(studioUrl, { waitUntil: 'networkidle' });
    await page.getByText('Generated result').first().waitFor({ state: 'attached' });
    await fitStudioCanvas(page);
    const result = await nodeImage(page, 'Generated result');
    await glide(page, result.x, result.y, 1);
    await zoom(page, result.x, result.y, 1.55, 0);
    mark('ready');
    await pause(page, 900);
    await caption(page, 'Keep the person. Change the pose.');
    await zoom(page, result.x, result.y, 1, 1100);
    const character = await nodeImage(page, 'Identity 1');
    const pose = await nodeImage(page, 'Pose Reference');
    await glide(page, character.x, character.y, 24);
    await glide(page, pose.x, pose.y, 24);
    await glide(page, result.x, result.y, 24);
    await pause(page, 700);
    await caption(page, '');
  });

  // 2. Flow: Studio project, then Advanced Studio, then the baby-running workflow.
  await scene(browser, 'flow', async (page, mark) => {
    await page.goto(studioUrl, { waitUntil: 'networkidle' });
    await page.getByText('Forge composition').first().waitFor({ state: 'visible' });
    await fitStudioCanvas(page);
    mark('ready');
    const subject = await center(page.getByText('Subject 1', { exact: true }));
    await glide(page, subject.x, subject.y);
    await caption(page, 'Pick a character');
    await zoom(page, subject.x, subject.y, 1.5);
    await pause(page, 900);
    await zoom(page, subject.x, subject.y, 1, 500);
    const poseRef = await center(page.getByRole('button', { name: 'Paste image' }).first());
    await glide(page, poseRef.x, poseRef.y - 90);
    await caption(page, 'Pick a pose');
    await zoom(page, poseRef.x, poseRef.y - 90, 1.5);
    await pause(page, 900);
    await zoom(page, poseRef.x, poseRef.y - 90, 1, 500);
    const generate = await center(page.getByRole('button', { name: /Generate transformation/ }));
    await glide(page, generate.x, generate.y);
    await caption(page, 'One click');
    await zoom(page, generate.x, generate.y, 1.5);
    await pause(page, 1100);
    await zoom(page, generate.x, generate.y, 1, 500);
    const result = await nodeImage(page, 'Generated result');
    await glide(page, result.x, result.y);
    await caption(page, 'Your photo, in that pose');
    await zoom(page, result.x, result.y, 1.3);
    await pause(page, 1300);
    await zoom(page, result.x, result.y, 1, 500);
    await caption(page, '');

    // Studio, then Advanced Studio via the primary nav.
    const nav = await center(page.locator('nav[aria-label="Primary"]').getByRole('link', { name: 'Advanced Studio', exact: true }));
    await glide(page, nav.x, nav.y, 32);
    await pause(page, 250);
    await click(page, nav.x, nav.y);
    await page.getByRole('link', { name: 'Open Example: baby running', exact: true }).waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
    mark('adv');
    await caption(page, 'Advanced Studio: workflows as nodes');
    await pause(page, 900);
    const baby = await center(page.getByRole('link', { name: 'Open Example: baby running', exact: true }));
    await glide(page, baby.x, baby.y, 32);
    await pause(page, 500);
    await click(page, baby.x, baby.y);
    await page.getByRole('button', { name: 'Zoom in' }).waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
    await pause(page, 1200);
    mark('babyOpen');
    await caption(page, 'Example: baby running');
    await pause(page, 1300);
    const zoomIn = await center(page.getByRole('button', { name: 'Zoom in' }));
    await glide(page, zoomIn.x, zoomIn.y);
    await caption(page, 'Prompt, then image, then video');
    for (let i = 0; i < 5; i++) {
      await click(page, zoomIn.x, zoomIn.y);
      await pause(page, 420);
    }
    await pause(page, 700);
    // Pan until the first video node sits mid-screen.
    await glide(page, 960, 540);
    const video = page.locator('video').first();
    for (let i = 0; i < 60; i++) {
      const box = await video.boundingBox();
      if (!box) break;
      const dx = box.x + box.width / 2 - 960;
      const dy = box.y + box.height / 2 - 540;
      if (Math.abs(dx) < 40 && Math.abs(dy) < 40) break;
      await page.mouse.wheel(Math.max(-60, Math.min(60, dx / 4)), Math.max(-60, Math.min(60, dy / 4)));
      await pause(page, 35);
    }
    mark('video');
    await caption(page, '…and it moves');
    await video.evaluate((v) => { v.muted = true; v.loop = true; return v.play(); });
    await pause(page, 3500);
    await caption(page, '');
  });

  // 4. Metrics: what is tracked and what it costs, on seeded sample data.
  await scene(browser, 'metrics', async (page, mark) => {
    await page.goto(`${metricsUrl}/metrics`, { waitUntil: 'networkidle' });
    await page.getByText('Lifetime spend', { exact: true }).waitFor({ state: 'visible' });
    await showTag(page, true);
    mark('ready');
    await caption(page, 'Know what every image costs');
    const spend = await center(page.getByText('Lifetime spend', { exact: true }));
    await glide(page, spend.x + 60, spend.y + 30);
    await zoom(page, spend.x + 60, spend.y + 30, 1.5);
    await pause(page, 1600);
    await zoom(page, spend.x + 60, spend.y + 30, 1, 500);
    await caption(page, 'Tokens, cost, latency, success rate');
    await glide(page, 800, 450);
    await pause(page, 900);
    // Scroll to the chart; the failures card below stays out of frame.
    const chartTop = (await center(page.getByRole('heading', { name: 'Cumulative usage' }))).y;
    await wheelSmooth(page, 0, chartTop - 150, 45);
    await pause(page, 500);
    mark('chart');
    const cost = await center(page.getByRole('radio', { name: 'Cost', exact: true }));
    await glide(page, cost.x, cost.y);
    await click(page, cost.x, cost.y);
    await caption(page, 'Cost by engine, over time');
    await pause(page, 1300);
    const chart = await center(page.getByRole('heading', { name: 'Cumulative usage' }));
    await zoom(page, chart.x + 250, chart.y + 200, 1.25);
    await pause(page, 1400);
    await zoom(page, chart.x + 250, chart.y + 200, 1, 500);
    const table = await center(page.getByRole('heading', { name: 'Per-engine breakdown' }));
    await glide(page, table.x + 100, table.y + 120);
    await caption(page, 'Per-engine breakdown');
    await zoom(page, table.x + 100, table.y + 120, 1.35);
    await pause(page, 1800);
    await caption(page, '');
  });

  // 5. End card.
  await scene(browser, 'end', async (page, mark) => {
    await page.setContent(`<!doctype html><meta charset=utf-8><style>
      html,body{margin:0;height:100%;background:#0b0b12;color:#fff;font-family:Inter,system-ui,sans-serif;overflow:hidden}
      body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
        background:radial-gradient(900px 500px at 50% 40%,rgba(99,102,241,.35),transparent 70%),#0b0b12}
      .logo{width:84px;height:84px;border-radius:22px;background:linear-gradient(135deg,#818cf8,#6366f1);
        box-shadow:0 20px 60px rgba(99,102,241,.5);animation:in .7s both}
      h1{font-size:84px;margin:0;letter-spacing:-.03em;animation:in .7s .15s both}
      p{font-size:30px;margin:0;color:#c7c9ff;animation:in .7s .35s both}
      .url{margin-top:10px;font-size:26px;padding:12px 28px;border-radius:999px;border:1px solid rgba(255,255,255,.25);
        animation:in .7s .55s both}
      @keyframes in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
    </style><div class=logo></div><h1>PoseForge</h1>
    <p>Free. Local-first. Open source.</p><div class=url>github.com/vishwakulkarni/PoseForge</div>`);
    mark('ready');
    await pause(page, 3200);
  });

  await browser.close();
  fs.writeFileSync(path.join(rawDir, 'marks.json'), JSON.stringify(marks, null, 2));
  console.log(JSON.stringify(marks));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

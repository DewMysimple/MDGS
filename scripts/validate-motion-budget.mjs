import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Browser tooling is optional for normal builds. A connected runtime can supply
// its module through NODE_PATH or MDGS_PLAYWRIGHT_MODULE without a machine path here.
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const vite = await createServer({ server: { host: '127.0.0.1' }, logLevel: 'error' });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const inflight = new Set();
  let peakTextureRequests = 0;
  const isTexture = request => /\/assets\/.+\.(webp|png)(?:\?|$)/.test(request.url());
  page.on('request', request => {
    if (!isTexture(request)) return;
    inflight.add(request);
    peakTextureRequests = Math.max(peakTextureRequests, inflight.size);
  });
  page.on('requestfinished', request => inflight.delete(request));
  page.on('requestfailed', request => inflight.delete(request));
  await page.goto(vite.resolvedUrls.local[0]);
  await page.locator('.scene-viewport.is-ready').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.loadingTextures) === 0);
  await page.waitForTimeout(600);
  const snapshot = () => page.locator('canvas').evaluate(canvas => ({ ...canvas.dataset, now: performance.now() }));
  const start = await snapshot();
  await page.locator('.scene-viewport').screenshot({ path: fileURLToPath(new URL('../reports/reconstruction/pilot-motion-early.png', import.meta.url)) });
  await page.waitForTimeout(2200);
  const end = await snapshot();
  await page.locator('.scene-viewport').screenshot({ path: fileURLToPath(new URL('../reports/reconstruction/pilot-motion-late.png', import.meta.url)) });
  const renders = Number(end.renderCount) - Number(start.renderCount);
  const elapsed = (end.now - start.now) / 1000;
  const rendersPerSecond = renders / elapsed;
  assert(renders > 0, 'Ambient motion must continue at a fixed viewing position');
  assert(rendersPerSecond <= 33, `Idle ambient redraw exceeds the 30Hz budget: ${rendersPerSecond}`);
  assert(Number(end.motionTime) > Number(start.motionTime));
  assert.equal(end.progress, start.progress, 'Ambient movement must not seek the scroll');
  assert(Number(end.activeMotionLayers) <= 6);
  assert(peakTextureRequests <= 4, `Texture requests must retain the four-request concurrency cap: ${peakTextureRequests}`);
  await page.getByRole('button', { name: '画中轻动', exact: true }).click();
  await page.waitForTimeout(250);
  const pausedStart = await snapshot();
  await page.waitForTimeout(1100);
  const pausedEnd = await snapshot();
  assert.equal(pausedEnd.renderCount, pausedStart.renderCount, 'Paused idle rendering should stop');
  assert.equal(pausedEnd.motionTime, pausedStart.motionTime, 'Paused independent time should stop');
  assert.equal(pausedEnd.rafRunning, 'false');
  assert.deepEqual(pageErrors, []);
  const revision = JSON.parse(await readFile(new URL('../public/assets/reconstruction/manifest.json', import.meta.url), 'utf8'));
  const result = {
    passed: true, viewport: '1440x900', activeRevisionChapters: revision.activeChapters,
    idleMotion: { elapsedSeconds: elapsed, renders, rendersPerSecond, start, end },
    pause: { start: pausedStart, end: pausedEnd },
    peakTextureRequests, pageErrors,
    screenshots: ['reports/reconstruction/pilot-motion-early.png', 'reports/reconstruction/pilot-motion-late.png'],
    scope: 'First-scroll local Chromium sample; software/browser-specific frame rate and estimated texture bytes do not certify other GPUs or a hard GPU-memory ceiling.',
  };
  await writeFile(new URL('../reports/reconstruction/validation-motion-budget.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Motion budget passed: ${rendersPerSecond.toFixed(1)} idle draws/s; ${peakTextureRequests} peak texture requests; pause stops RAF.`);
} finally { await browser?.close(); await vite.close(); }

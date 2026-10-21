/** Verify the actual page gives every entry at least 4 seconds of visible art loading. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const project = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const externalPreview = process.env.MDGS_PREVIEW_URL;
const reportPath = path.join(project, 'reports/study/validation-timing.json');
const expected = ['SCROLL_AWAKENING', 'CAMERA_ENTERING', 'ARTISTIC_TRANSITION', 'SCROLL_LOADING', 'PAINTING_REVEAL', 'ENTERING_VIEWER', 'SCROLL_VIEWER'];
const results = [];
const errors = [];
let browser;
let server;
let targetUrl;
let currentMeasurement;
const report = (status, failure) => ({
  status, testedAt: new Date().toISOString(), environment: 'Windows Edge; actual React/Three.js page, real image decoding and first-frame gates',
  mode: externalPreview ? 'existing-preview' : 'owned-development-server', targetUrl,
  minimumVisibleLoadingMs: 4000, normalCachedTargetMs: [5000, 7000],
  visibilityScope: 'Synthetic document.hidden change event checks visible-time accounting; OS background behavior is not inferred.',
  results, pageErrors: errors, ...(failure ? { failure } : {}),
});
await mkdir(path.dirname(reportPath), { recursive: true });
// A failed or interrupted rerun must never leave an older pass as its result.
await writeFile(reportPath, JSON.stringify(report('running'), null, 2) + '\n');
const waitPhase = (page, phase) => page.waitForFunction(phase => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === phase, phase, { timeout: 60000 });
const observe = async page => {
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.studyTimingPhases = [];
    new MutationObserver(() => {
      const phase = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
      if (phase && window.studyTimingPhases.at(-1)?.phase !== phase) window.studyTimingPhases.push({ phase, at: performance.now() });
    }).observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ['data-journey-phase'] });
  });
};
const reset = page => page.evaluate(() => { window.studyTimingPhases = []; });
async function verify(page, name, { cachedNormal = false, minimumWallLoading = 4000 } = {}) {
  currentMeasurement = { name, phases: [] };
  await waitPhase(page, 'SCROLL_VIEWER');
  const events = await page.evaluate(() => window.studyTimingPhases);
  const first = events.findIndex(event => event.phase === 'SCROLL_AWAKENING');
  const entered = events.findIndex((event, index) => index >= first && event.phase === 'SCROLL_VIEWER');
  const ritual = events.slice(first, entered + 1);
  currentMeasurement = { name, phases: ritual };
  assert.deepEqual(ritual.map(event => event.phase), expected, `${name}: every entry must retain the full choreography.`);
  const loadingMs = ritual[4].at - ritual[3].at;
  const totalMs = ritual.at(-1).at - ritual[0].at;
  currentMeasurement = { name, loadingMs, totalMs, phases: ritual };
  assert(loadingMs >= minimumWallLoading, `${name}: art loading lasted only ${loadingMs.toFixed(1)}ms.`);
  if (cachedNormal) assert(totalMs >= 5000 && totalMs <= 7000, `${name}: cached ceremony should be 5–7s, measured ${totalMs.toFixed(1)}ms.`);
  assert.equal(await page.locator('.scene-viewport').getAttribute('aria-disabled'), 'false');
  assert.equal(await page.locator('.painting canvas').getAttribute('data-first-frame-ready'), 'true');
  assert.equal(Number(await page.locator('.painting canvas').getAttribute('data-texture-failed')), 0);
  results.push({ name, loadingMs, totalMs, phases: ritual, passed: true });
  currentMeasurement = null;
  console.log(`${name}: loading ${loadingMs.toFixed(1)}ms, total ${totalMs.toFixed(1)}ms.`);
}

try {
  if (externalPreview) targetUrl = new URL(externalPreview).href.split('#')[0];
  else {
    server = await createServer({ root: project, server: { host: '127.0.0.1', watch: null }, logLevel: 'error' });
    await server.listen();
    targetUrl = server.resolvedUrls.local[0];
  }
  const url = targetUrl;
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const normal = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await observe(normal);
  await normal.goto(`${url}#chapter-1`);
  await verify(normal, 'normal-direct-link-complete-ritual');
  await normal.reload();
  await verify(normal, 'cached-refresh-complete-ritual', { cachedNormal: true });

  // History routing must replay the same choreography instead of entering at loading.
  await reset(normal);
  await normal.evaluate(() => { window.location.hash = '#chapter-4'; });
  await verify(normal, 'new-hash-complete-ritual');
  await reset(normal);
  await normal.goBack();
  await verify(normal, 'browser-back-complete-ritual', { cachedNormal: true });
  await normal.close();

  const reduced = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await observe(reduced);
  await reduced.goto(`${url}#chapter-2`);
  await verify(reduced, 'reduced-motion-still-four-seconds');

  let failManifest = true;
  await reduced.route('**/chapter-3/scene.json', route => failManifest ? route.fulfill({ status: 503, body: 'timing verification interruption' }) : route.continue());
  await reduced.goto(`${url}#chapter-3`);
  await waitPhase(reduced, 'SCROLL_LOADING');
  await reduced.locator('.art-loading__retry').waitFor();
  await reduced.waitForTimeout(4100);
  failManifest = false;
  await reset(reduced);
  await reduced.getByRole('button', { name: '重新展卷', exact: true }).click();
  await verify(reduced, 'retry-restarts-full-ritual-and-four-seconds');

  // Exercise the visibility branch explicitly: this synthetic event verifies the
  // timer accounting without claiming to simulate an actual OS background tab.
  await reset(reduced);
  await reduced.evaluate(() => { window.location.hash = '#chapter-4'; });
  await waitPhase(reduced, 'SCROLL_LOADING');
  await reduced.waitForTimeout(450);
  await reduced.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await reduced.waitForTimeout(1500);
  assert.equal(await reduced.locator('[data-journey-phase]').getAttribute('data-journey-phase'), 'SCROLL_LOADING');
  await reduced.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await verify(reduced, 'hidden-time-excluded-synthetic-visibility-event', { minimumWallLoading: 5500 });

  // A slow real texture is allowed to extend the exhibition beyond its minimum.
  const slow = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  await observe(slow);
  let releaseTextures;
  const heldTextures = new Promise(resolve => { releaseTextures = resolve; });
  await slow.route('**/assets/**/*.webp', async route => { await heldTextures; await route.continue().catch(() => {}); });
  await slow.goto(`${url}#chapter-1`);
  await waitPhase(slow, 'SCROLL_LOADING');
  await slow.waitForTimeout(4300);
  assert.equal(await slow.locator('[data-journey-phase]').getAttribute('data-journey-phase'), 'SCROLL_LOADING');
  assert.equal(await slow.locator('.scene-viewport').getAttribute('aria-disabled'), 'true');
  releaseTextures();
  await verify(slow, 'real-slow-texture-extends-exhibition', { minimumWallLoading: 4300 });

  assert.deepEqual(errors, []);
  await writeFile(reportPath, JSON.stringify(report('pass'), null, 2) + '\n');
  console.log(`${results.length} full-journey timing cases passed; every successful entry displayed art loading for at least 4000ms.`);
} catch (error) {
  const pageSnapshots = await Promise.all((browser?.contexts().flatMap(context => context.pages()) ?? []).map(page => page.evaluate(() => ({ url: location.href, phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase, phases: window.studyTimingPhases })).catch(() => ({ url: page.url(), unavailable: true }))));
  await writeFile(reportPath, JSON.stringify(report('fail', { message: error.message, stack: error.stack, currentMeasurement, pageSnapshots }), null, 2) + '\n');
  throw error;
} finally {
  await browser?.close();
  await server?.close();
}

const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const origin = process.env.MDGS_PREVIEW_URL || 'http://127.0.0.1:5276/';
const target = path.join(__dirname, 'unfurl-cover-timing-validation.json');
const report = { status: 'running', startedAt: new Date().toISOString(),
  scope: 'Cover-only network route delayed6500ms. Camera transition remains450ms; actual decoded/GPU-drawn paper starts its own full visible4000ms. No duplicate cover gate or inferred readiness.',
  network: [], checks: [], errors: [] };
let browser;
(async () => {
  const history = path.join(__dirname, 'unfurl-cover-timing-history', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(history, { recursive: true });
  try { await fs.copyFile(target, path.join(history, 'previous-validation.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] });
  report.browserVersion = browser.version(); report.url = origin;
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => {
    window.__coverTiming = { decodes: [], phases: [], geometry: [], presentation: [] };
    const original = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      const record = { src: this.src, start: performance.now() }; window.__coverTiming.decodes.push(record);
      return original.call(this).then(value => { record.end = performance.now(); return value; }, error => {
        record.end = performance.now(); record.error = error.message; throw error;
      });
    };
    let identity = '';
    new MutationObserver(() => {
      const phase = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
      const ready = document.querySelector('.art-loading')?.dataset.presentationReady;
      if (phase + ':' + ready === identity) return;
      identity = phase + ':' + ready; window.__coverTiming.presentation.push({ at: performance.now(), phase, ready });
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-journey-phase', 'data-presentation-ready'] });
    function sample(at) {
      const log = window.__coverTiming, phase = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
      if (phase && log.phases.at(-1)?.phase !== phase) log.phases.push({ phase, at });
      const root = document.querySelector('.art-loading');
      if (root && phase === 'SCROLL_LOADING') log.geometry.push({ at: performance.now(), open: Number(root.dataset.unfurl),
        ready: root.dataset.presentationReady === 'true', vertices: Number(root.dataset.paperVertices) });
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.route('**/chapter-2/cover.webp', async route => {
    const start = Date.now(), url = route.request().url();
    await new Promise(resolve => setTimeout(resolve, 6500));
    report.network.push({ url, delayedMs: Date.now() - start }); await route.continue();
  });
  await page.goto(origin + '#chapter-2', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 90000 });
  const result = await page.evaluate(() => window.__coverTiming);
  Object.assign(report, result);
  const camera = result.phases.find(sample => sample.phase === 'CAMERA_ENTERING');
  const transition = result.phases.find(sample => sample.phase === 'ARTISTIC_TRANSITION');
  const loading = result.presentation.find(sample => sample.phase === 'SCROLL_LOADING');
  const paper = result.presentation.find(sample => sample.phase === 'SCROLL_LOADING' && sample.ready === 'true');
  const reveal = result.presentation.find(sample => sample.phase === 'PAINTING_REVEAL');
  assert(camera && transition && transition.at - camera.at >= 400 && transition.at - camera.at < 2000,
    'Camera choreography must keep its450ms duration instead of waiting for an image it does not display.');
  assert.equal(report.network.length, 1, 'The DOM image and unroll share one actual cover fetch.');
  assert(report.network[0].delayedMs >= 6450);
  assert(loading && paper && reveal && paper.at - loading.at > 5000, 'The slow image must wait visibly at loading.');
  assert(reveal.at - paper.at >= 3998, 'A slow decoded paper still receives the full four foreground seconds.');
  assert(result.geometry.filter(sample => sample.at < paper.at).every(sample => !sample.ready && sample.open === 0),
    'Blank paper must not spend any unfolding time before the visible picture is ready.');
  assert(result.geometry.some(sample => sample.ready && sample.open < .1 && sample.vertices > 4000)
    && result.geometry.some(sample => sample.open > .4 && sample.open < .7)
    && result.geometry.some(sample => sample.open === 1), 'Slow cover keeps closed, truly curved and fully open geometry.');
  assert.deepEqual(report.errors, []);
  report.checks.push({ test: 'slow-cover-waits-for-real-paper-then-shows-full-four-seconds', passed: true,
    cameraMs: transition.at - camera.at, imageWaitMs: paper.at - loading.at, visibleLoadingMs: reveal.at - paper.at, totalLoadingMs: reveal.at - loading.at });
  report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => {
    report.verifiedAt = new Date().toISOString(); await fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
    await browser?.close(); console.log(JSON.stringify({ status: report.status, checks: report.checks, errors: report.errors }));
  });

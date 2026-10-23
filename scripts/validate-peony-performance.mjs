/** One production browser owns the GPU. RAF drives real native range input;
 * functional pass never means that measured frame times achieved stable 60 FPS. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, 'reports/peony-2.0');
const screenshots = path.join(directory, 'performance');
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const report = { status: 'running', startedAt: new Date().toISOString(), viewport: { width: 1440, height: 900 },
  scope: 'Actual production WebGL; each current chapter has an 8s first forward traversal and an 8s immediate reverse traversal driven by native HTMLInputElement input events on browser requestAnimationFrame. One browser/page, sequential GPU work. Loading frames and physical paper initial/middle/full screenshots are collected separately. No FPS values are synthesized.',
  limitations: [
    'Cold means the first traversal of the chapter in a new document/renderer. Its entry view has necessarily already loaded for first-frame gating; browser HTTP cache is not forcibly disabled.',
    'Warm means immediate reverse travel in the same renderer. The texture memory budget may evict and decode textures again; request/upload counters are retained rather than labeling it fully cached.',
    'Loading frame sampling includes three screenshots; screenshot GPU readback can perturb that sample. Narrative traversal measurements contain no screenshots.',
    'Dataset max CPU/upload/sample fields are cumulative renderer high-water marks, not isolated per-window maxima. RAF gaps also include browser scheduling, GPU/driver waits and the actual application.',
    'Functional status is based on real progress, native interaction and errors. Slow-frame counts remain results and are never converted into a false stable-60-FPS pass.',
  ], chapters: [], checks: [], errors: [], httpErrors: [], cancelledRequests: [] };
let server, browser, page;
let navigating = false;
await mkdir(directory, { recursive: true }); await mkdir(screenshots, { recursive: true });
const save = () => writeFile(path.join(directory, 'validation-performance.json'), JSON.stringify(report, null, 2) + '\n');
await save();
const waitPhase = value => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 90000 });
const dataset = () => page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));

/** Runs inside the real page. Measurements and input use the same RAF clock. */
async function sampleFrames(options) {
  return page.evaluate(async options => {
    const intervals = [], samples = [], longtasks = [], phases = [];
    const slider = document.querySelector('input[aria-label="画卷游观进度"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const getData = () => ({ ...(document.querySelector(options.loading ? '.art-loading' : '.painting canvas')?.dataset ?? {}) });
    const before = getData(); const begin = performance.now(); let first = null, previous = null, lastSample = -Infinity, events = 0;
    const longtaskSupported = PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false;
    const observer = longtaskSupported ? new PerformanceObserver(list => longtasks.push(...list.getEntries().map(entry => ({ startTime: entry.startTime, duration: entry.duration })))) : null;
    observer?.observe({ type: 'longtask' });
    await new Promise(resolve => {
      const tick = now => {
        first ??= now;
        if (previous !== null) intervals.push(now - previous);
        previous = now;
        const elapsed = now - first;
        if (!options.loading) {
          const value = options.from + (options.to - options.from) * Math.min(1, elapsed / options.duration);
          setter.call(slider, String(value));
          slider.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
          events++;
        }
        const phase = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
        if (phases.at(-1)?.phase !== phase) phases.push({ phase, elapsed });
        if (elapsed - lastSample >= 500) { samples.push({ elapsed, phase, data: getData() }); lastSample = elapsed; }
        if (elapsed >= options.duration) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    if (observer) {
      longtasks.push(...observer.takeRecords().map(entry => ({ startTime: entry.startTime, duration: entry.duration })));
      observer.disconnect();
    }
    const end = performance.now(), sorted = [...intervals].sort((a, b) => a - b);
    const percentile = p => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))] ?? null;
    const relevantTasks = longtasks.filter(entry => entry.startTime >= begin && entry.startTime < end);
    const resourceEntries = performance.getEntriesByType('resource').filter(entry => entry.startTime >= begin && entry.startTime < end && entry.name.includes('/textures/'));
    return { requestedDurationMs: options.duration, measuredDurationMs: end - first, rafFrames: intervals.length + 1, nativeInputEvents: events,
      raf: { p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: sorted.at(-1) ?? null,
        over33ms: intervals.filter(value => value > 33.333).length, over50ms: intervals.filter(value => value > 50).length,
        intervalsMs: intervals },
      longtask: { supported: longtaskSupported, count: longtaskSupported ? relevantTasks.length : null,
        totalMs: longtaskSupported ? relevantTasks.reduce((sum, item) => sum + item.duration, 0) : null,
        maxMs: longtaskSupported ? Math.max(0, ...relevantTasks.map(item => item.duration)) : null, entries: relevantTasks },
      textureNetwork: { requests: resourceEntries.length, transferBytes: resourceEntries.reduce((sum, item) => sum + (item.transferSize || 0), 0),
        decodedBodyBytes: resourceEntries.reduce((sum, item) => sum + (item.decodedBodySize || 0), 0) },
      before, after: getData(), samples, phases,
    };
  }, options);
}

async function captureLoading(chapter) {
  await waitPhase('SCROLL_LOADING');
  const measurement = sampleFrames({ loading: true, duration: 4000 });
  const frames = [];
  for (const [label, lower, upper] of [['initial', 0, .15], ['middle', .43, .83], ['full', .999, 1.001]]) {
    await page.waitForFunction(({ lower, upper }) => {
      const value = Number(document.querySelector('.art-loading')?.dataset.unfurl);
      return Number.isFinite(value) && value >= lower && value < upper;
    }, { lower, upper }, { timeout: 15000 });
    const data = await page.locator('.art-loading').evaluate(element => ({ ...element.dataset }));
    const file = `loading-c${chapter}-${label}.png`;
    await page.screenshot({ path: path.join(screenshots, file) });
    frames.push({ label, file: `reports/peony-2.0/performance/${file}`, data });
  }
  return { ...(await measurement), screenshots: frames };
}

async function settle(value) {
  await page.waitForFunction(value => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - value) < .003, value, { timeout: 20000 });
}

try {
  if (!process.env.MDGS_PREVIEW_URL) server = await preview({ root, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  const baseUrl = process.env.MDGS_PREVIEW_URL || server.resolvedUrls.local[0]; report.url = baseUrl;
  report.buildHtmlSha256 = createHash('sha256').update(await readFile(path.join(root, 'dist/index.html'))).digest('hex');
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  page = await browser.newPage({ viewport: report.viewport });
  page.on('pageerror', error => report.errors.push({ type: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') report.errors.push({ type: 'console', message: message.text() }); });
  page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => {
    const item = { url: request.url(), error: request.failure()?.errorText };
    if (navigating && /ABORTED|CANCELLED/i.test(item.error || '')) report.cancelledRequests.push(item);
    else report.errors.push({ type: 'requestfailed', ...item });
  });
  await page.addInitScript(() => { try { localStorage.setItem('guose-fanghua:painting-motion', 'on'); sessionStorage.clear(); } catch { /* Recorded page can still use storage fallback. */ } });
  for (const chapter of [1, 2, 3, 4]) {
    const url = new URL(baseUrl); url.hash = `chapter-${chapter}`;
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/assets/new-scrolls/chapter-${chapter}/scene.json`));
    navigating = true; await page.goto(url.href, { waitUntil: 'domcontentloaded' }); navigating = false;
    const response = await responsePromise, manifest = await response.json();
    assert.equal(manifest.sourceRevision, 'peony-2.0-2026-10-22');
    const loading = await captureLoading(chapter);
    await waitPhase('SCROLL_VIEWER');
    if (!report.environment) report.environment = await page.locator('.painting canvas').evaluate(canvas => {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'), extension = gl?.getExtension('WEBGL_debug_renderer_info');
      return { gpu: gl ? { vendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
        renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION), shadingLanguage: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) } : null,
        dpr: devicePixelRatio, innerWidth, innerHeight, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
    });
    const initial = await dataset(); assert.equal(initial.chapter, String(chapter)); assert.equal(initial.firstFrameReady, 'true');
    const cold = await sampleFrames({ loading: false, duration: 8000, from: 0, to: .98 });
    await settle(.98); cold.settled = await dataset();
    assert(cold.nativeInputEvents > 10 && cold.rafFrames > 10);
    assert(Number(cold.settled.progress) > .95, 'Real source camera must reach the end of the forward traversal.');
    const warm = await sampleFrames({ loading: false, duration: 8000, from: .98, to: 0 });
    await settle(0); warm.settled = await dataset();
    assert(warm.nativeInputEvents > 10 && Number(warm.settled.progress) < .003);
    const entry = { chapter, sourceRevision: manifest.sourceRevision, sourceSha256: manifest.sourceSha256,
      sourceFrameRange: manifest.frameRange, authoredMeshes: manifest.meshes.length, sourceEffectMaterials: manifest.sourceEffects?.materials?.length ?? 0,
      initial, loading, coldForward: cold, warmReverse: warm, functionalPassed: true };
    report.chapters.push(entry);
    if (chapter === 1) {
      const viewport = await page.locator('.scene-viewport').boundingBox(), before = Number((await dataset()).progress);
      await page.mouse.move(viewport.x + viewport.width * .55, viewport.y + viewport.height * .58);
      await page.mouse.wheel(0, 640);
      await page.waitForFunction(before => Number(document.querySelector('.painting canvas')?.dataset.progress) > before + .01, before);
      const wheel = Number((await dataset()).progress);
      await page.mouse.move(viewport.x + viewport.width * .75, viewport.y + viewport.height * .65);
      await page.mouse.down();
      await page.mouse.move(viewport.x + viewport.width * .25, viewport.y + viewport.height * .65, { steps: 18 });
      await page.mouse.up();
      await page.waitForFunction(before => Number(document.querySelector('.painting canvas')?.dataset.progress) > before + .01, wheel);
      const drag = Number((await dataset()).progress);
      report.checks.push({ test: 'trusted-native-wheel-and-pointer-drag-advance-source-camera', chapter, before, wheel, drag, passed: true });
    }
    console.log(`chapter ${chapter}: cold p95 ${cold.raf.p95Ms.toFixed(1)}ms, warm p95 ${warm.raf.p95Ms.toFixed(1)}ms; >50ms ${cold.raf.over50ms}/${warm.raf.over50ms}`);
    await save();
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.httpErrors, []);
  report.performanceAssessment = report.chapters.map(chapter => ({ chapter: chapter.chapter,
    coldP95Ms: chapter.coldForward.raf.p95Ms, warmP95Ms: chapter.warmReverse.raf.p95Ms,
    coldOver33ms: chapter.coldForward.raf.over33ms, coldOver50ms: chapter.coldForward.raf.over50ms,
    warmOver33ms: chapter.warmReverse.raf.over33ms, warmOver50ms: chapter.warmReverse.raf.over50ms,
    stable60FpsClaimed: false }));
  report.status = 'pass'; report.functionalPassed = true;
} catch (error) {
  report.status = 'fail'; report.functionalPassed = false; report.failure = { message: error.message, stack: error.stack };
  if (page) await page.screenshot({ path: path.join(screenshots, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await browser?.close(); if (server) await server.close();
  report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, chapters: report.chapters.length, performanceAssessment: report.performanceAssessment }, null, 2));
}

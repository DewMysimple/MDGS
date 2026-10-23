const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), runId = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(__dirname, 'unfurl-snapshot-runs', runId), target = path.join(__dirname, 'unfurl-snapshot-validation.json');
const report = { status: 'running', runId, startedAt: new Date().toISOString(), scope: 'Production snapshot regression: actual resumed frames, cold session, reduced motion, slow source resources, failed encoding/return and URL leases. No source seek to zero. This diagnostic run is not a final whole-product freeze.', checks: [], errors: [] };
const save = () => fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
const phase = (page, value) => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 45000 });
let browser, server;
const portable = file => path.relative(root, file).split(path.sep).join('/');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function below(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await below(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}
async function inputs() {
  const files = [...await below(path.join(root, 'src')), __filename,
    ...['index.html', 'vite.config.ts', 'package.json', 'package-lock.json'].map(file => path.join(root, file))];
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [portable(file), sha(await fs.readFile(file))])));
}
async function instrument(page, stored, brokenBlob = false) {
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(({ stored, brokenBlob }) => {
    if (stored) sessionStorage.setItem(`guose-fanghua:peony-2.0-2026-10-23:chapter-${stored.chapter}:position`, String(stored.progress));
    window.__snapshotURL = { created: 0, revoked: 0, live: new Set() };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); window.__snapshotURL.created++; window.__snapshotURL.live.add(url); return url; };
    URL.revokeObjectURL = url => { window.__snapshotURL.revoked++; window.__snapshotURL.live.delete(url); revoke(url); };
    const toBlob = HTMLCanvasElement.prototype.toBlob; window.__breakSnapshotBlob = brokenBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (window.__breakSnapshotBlob) { setTimeout(() => callback(null)); return; }
      return toBlob.call(this, callback, ...args);
    };
    window.__snapshotSamples = []; window.__snapshotEvents = [];
    let lastPresentation = '';
    const presentationEvent = () => {
      const loading = document.querySelector('.art-loading'), phase = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
      const ready = loading?.dataset.presentationReady, key = phase + ':' + ready;
      if (key === lastPresentation) return;
      lastPresentation = key; window.__snapshotEvents.push({ at: performance.now(), phase, ready });
    };
    new MutationObserver(presentationEvent).observe(document, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-journey-phase', 'data-presentation-ready'] });
    function sample(at) {
      const loading = document.querySelector('.art-loading'), canvas = document.querySelector('.painting canvas');
      if (loading) window.__snapshotSamples.push({ at, phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,
        open: Number(loading.dataset.unfurl), preview: loading.dataset.previewProgress, frame: loading.dataset.previewFrame,
        ready: loading.dataset.presentationReady, state: loading.dataset.handoffState, image: loading.dataset.paintingSrc,
        nativeProgress: Number(canvas?.dataset.progress), nativeFrame: Number(canvas?.dataset.sourceFrame) });
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, { stored, brokenBlob });
}
async function seek(page, progress) {
  await page.locator('input[aria-label="画卷游观进度"]').evaluate((input, progress) => {
    input.step = 'any'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(progress));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, progress);
  await page.waitForFunction(progress => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - progress) < 1e-8, progress);
}
async function inspectEntry(page, chapter, progress, name) {
  await phase(page, 'SCROLL_LOADING');
  await page.waitForFunction(() => Number(document.querySelector('.art-loading')?.dataset.unfurl) === 1);
  const preview = await page.locator('.art-loading').evaluate(async element => {
    const image = element.querySelector('.art-loading__handoff'), canvas = document.createElement('canvas');
    await image.decode(); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let nonzero = 0; for (let index = 3; index < pixels.length; index += 4) if (pixels[index]) nonzero++;
    return { ...element.dataset, width: image.naturalWidth, height: image.naturalHeight, nonzeroAlpha: nonzero, png: canvas.toDataURL('image/png') };
  });
  assert(preview.paintingSrc.startsWith('blob:'), 'A nonzero restored frame must use a native snapshot, never cover0.');
  assert(Math.abs(Number(preview.previewProgress) - progress) < 1e-6);
  assert(preview.nonzeroAlpha > preview.width * preview.height * .95, 'The actual copied GPU frame must not be blank.');
  assert(preview.width <= 1920);
  await fs.writeFile(path.join(directory, name + '-snapshot.png'), Buffer.from(preview.png.split(',')[1], 'base64')); delete preview.png;
  await page.screenshot({ path: path.join(directory, name + '-paper.png') });
  await phase(page, 'SCROLL_VIEWER');
  const native = await page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
  assert(Math.abs(Number(native.progress) - progress) < 1e-8);
  assert(Math.abs(Number(native.sourceFrame) - Number(preview.previewFrame)) < 1e-6);
  await page.screenshot({ path: path.join(directory, name + '-native.png') });
  const cleanStyle = await page.addStyleTag({ content: '.narrative-calligraphy,.end-colophon{visibility:hidden!important}' });
  const nativeRect = await page.locator('.painting canvas').evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect(), view = JSON.parse(canvas.dataset.sourceViewport);
    const sx = bounds.width / canvas.clientWidth, sy = bounds.height / canvas.clientHeight;
    return { left: bounds.left + view.x * sx, top: bounds.top + view.y * sy, width: view.width * sx, height: view.height * sy };
  });
  await page.screenshot({ path: path.join(directory, name + '-clean-native.png') });
  await cleanStyle.evaluate(style => style.remove());
  const samples = await page.evaluate(() => window.__snapshotSamples);
  assert(samples.filter(sample => sample.image && sample.phase === 'SCROLL_LOADING').every(sample => sample.image.startsWith('blob:')));
  const presentationEvents = await page.evaluate(() => window.__snapshotEvents);
  const visibleLoading = presentationEvents.filter(sample => sample.phase === 'SCROLL_LOADING' && sample.ready === 'true');
  const firstReveal = presentationEvents.find(sample => sample.phase === 'PAINTING_REVEAL');
  const readyLoadingMs = firstReveal ? firstReveal.at - visibleLoading[0]?.at : 0;
  assert(readyLoadingMs >= 3998, `Correct resumed paper must remain visible for four seconds: ${readyLoadingMs}`);
  const aligned = samples.filter(sample => sample.state === 'aligned');
  assert(aligned.length, 'The actual restored image must finish its same-position handoff.');
  report.checks.push({ test: name, passed: true, chapter, progress, sourceFrame: native.sourceFrame, preview, nativeRect, readyLoadingMs, presentationEvents,
    files: { snapshot: name + '-snapshot.png', paper: name + '-paper.png', native: name + '-native.png', cleanNative: name + '-clean-native.png' },
    samples: samples.filter((_, index) => index % 4 === 0) });
  await save();
}

(async () => {
  await fs.mkdir(directory, { recursive: true });
  try { await fs.copyFile(target, path.join(directory, 'previous-validation.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await save();
  report.inputsBefore = await inputs();
  const dist = path.resolve(root, process.env.MDGS_SNAPSHOT_DIST || 'tmp/snapshot-audit-dist');
  report.build = {};
  for (const file of ['index.html', ...await fs.readdir(path.join(dist, 'assets')).then(items => items.filter(name => /\.(?:js|css)$/.test(name)).map(name => 'assets/' + name))])
    report.build[file] = createHash('sha256').update(await fs.readFile(path.join(dist, file))).digest('hex');
  const { build, preview } = await import('vite');
  const bundles = await build({ root, logLevel: 'error', build: { write: false, copyPublicDir: false, emptyOutDir: false } });
  report.buildReproduction = {};
  for (const bundle of Array.isArray(bundles) ? bundles : [bundles]) for (const item of bundle.output) {
    const digest = sha(item.type === 'chunk' ? Buffer.from(item.code) : Buffer.from(item.source));
    assert.equal(sha(await fs.readFile(path.join(dist, item.fileName))), digest, `Production file differs from current source: ${item.fileName}`);
    report.buildReproduction[item.fileName] = digest;
  }
  server = await preview({ root, build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  report.url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] });
  report.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: directory, size: { width: 1280, height: 720 } } }), page = await context.newPage();
  await instrument(page); await page.goto(report.url + '#chapter-4'); await phase(page, 'SCROLL_VIEWER');
  report.gpu = await page.locator('.painting canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), extension = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), preserveDrawingBuffer: gl.getContextAttributes().preserveDrawingBuffer }; });
  for (const progress of [.65, 1]) {
    await seek(page, progress); await page.evaluate(() => { window.__snapshotSamples = []; window.__snapshotEvents = []; });
    await page.getByRole('button', { name: '返回序厅', exact: true }).click(); await phase(page, 'RETURNING_HOME');
    await page.waitForFunction(() => document.querySelector('.art-loading')?.dataset.presentationReady === 'true');
    assert(Math.abs(Number(await page.locator('.art-loading').getAttribute('data-preview-progress')) - progress) < 1e-6);
    await page.screenshot({ path: path.join(directory, `warm-${progress}-return.png`) });
    await phase(page, 'HOME'); await page.evaluate(() => { window.__snapshotSamples = []; window.__snapshotEvents = []; });
    await page.locator('.study-entry-button[data-chapter-id="4"]').click(); await inspectEntry(page, 4, progress, `warm-return-reentry-${progress}`);
    assert((await page.evaluate(() => window.__snapshotURL.live.size)) <= 1, 'Replaced snapshots must release their Blob URLs after the loading consumer unmounts.');
  }
  const video = page.video(); await context.close();
  const videoPath = await video.path(); await fs.rename(videoPath, path.join(directory, 'warm-return-reentry.webm'));
  for (const test of [{ chapter: 1, progress: .03 }, { chapter: 2, progress: .65 }, { chapter: 3, progress: .65 },
    { chapter: 4, progress: .65 }, { chapter: 4, progress: 1 }, { chapter: 4, progress: .65, reduce: true }]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: test.reduce ? 'reduce' : 'no-preference' }), page = await context.newPage();
    await instrument(page, test); await page.goto(report.url + '#chapter-' + test.chapter);
    await inspectEntry(page, test.chapter, test.progress, `cold-session-c${test.chapter}-${test.progress}${test.reduce ? '-reduce' : ''}`); await context.close();
  }
  const coverContext = await browser.newContext({ viewport: { width: 1280, height: 720 } }), cover = await coverContext.newPage();
  let unusedCoverRequests = 0;
  await instrument(cover, { chapter: 4, progress: .65 });
  await cover.route('**/chapter-4/cover.webp', route => { unusedCoverRequests++; return route.fulfill({ status: 503, body: 'Unused cover0 must not gate a real resumed frame.' }); });
  await cover.goto(report.url + '#chapter-4'); await inspectEntry(cover, 4, .65, 'cold-resumption-has-no-unused-cover0-dependency');
  assert.equal(unusedCoverRequests, 0, 'A cold nonzero entry must not download the unused cover0 at all.');
  report.checks.at(-1).unusedCoverRequests = unusedCoverRequests; await coverContext.close();
  const slowContext = await browser.newContext({ viewport: { width: 1280, height: 720 } }), slow = await slowContext.newPage();
  await instrument(slow, { chapter: 4, progress: .65 });
  await slow.route('**/chapter-4/textures/**', async route => { await new Promise(resolve => setTimeout(resolve, 4500)); await route.continue().catch(() => {}); });
  await slow.goto(report.url + '#chapter-4'); await phase(slow, 'SCROLL_LOADING');
  await slow.waitForTimeout(1000);
  assert.equal(await slow.locator('.art-loading').getAttribute('data-painting-src'), '', 'Slow cold resumption must wait rather than show cover0.');
  await inspectEntry(slow, 4, .65, 'cold-resumption-slow-real-source'); await slowContext.close();
  const failContext = await browser.newContext({ viewport: { width: 1280, height: 720 } }), fail = await failContext.newPage();
  await instrument(fail, { chapter: 4, progress: .65 }, true); await fail.goto(report.url + '#chapter-4');
  await fail.locator('.art-loading__retry').waitFor(); assert.equal(await fail.locator('.art-loading').getAttribute('data-painting-src'), '');
  await fail.screenshot({ path: path.join(directory, 'encoding-failure.png') });
  await fail.evaluate(() => { window.__breakSnapshotBlob = false; window.__snapshotSamples = []; window.__snapshotEvents = []; });
  await fail.locator('.art-loading__retry').click(); await inspectEntry(fail, 4, .65, 'cold-snapshot-encode-failure-retry');
  await fail.evaluate(() => { window.__breakSnapshotBlob = true; window.__snapshotSamples = []; window.__snapshotEvents = []; });
  await fail.getByRole('button', { name: '返回序厅', exact: true }).click(); await phase(fail, 'RETURNING_HOME');
  await fail.waitForFunction(() => document.querySelector('.art-loading')?.dataset.handoffState === 'return-fallback');
  await fail.screenshot({ path: path.join(directory, 'encoding-failure-return-fallback.png') }); await phase(fail, 'HOME');
  report.checks.push({ test: 'failed-return-capture-uses-warm-paper-and-completes', passed: true }); await failContext.close();
  const cancelContext = await browser.newContext({ viewport: { width: 1280, height: 720 } }), cancel = await cancelContext.newPage();
  await instrument(cancel, { chapter: 4, progress: .65 }); await cancel.route('**/chapter-4/textures/**', route => route.abort());
  await cancel.goto(report.url + '#chapter-4'); await phase(cancel, 'SCROLL_LOADING'); await cancel.locator('.art-loading__return').click(); await phase(cancel, 'HOME');
  report.checks.push({ test: 'unready-nonzero-source-cancel-never-needs-cover0', passed: true }); await cancelContext.close();
  const gpuContext = await browser.newContext({ viewport: { width: 1280, height: 720 } }), gpu = await gpuContext.newPage();
  await instrument(gpu, { chapter: 4, progress: .65 }); await gpu.goto(report.url + '#chapter-4'); await phase(gpu, 'SCROLL_VIEWER');
  await gpu.locator('.painting canvas').evaluate(canvas => new Promise(resolve => {
    canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
    canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext();
  }));
  assert(await gpu.locator('.painting canvas').evaluate(canvas => canvas.getContext('webgl2').isContextLost()));
  const lostProgress = Number(await gpu.locator('.painting canvas').getAttribute('data-progress'));
  await gpu.getByRole('button', { name: '返回序厅', exact: true }).click(); await phase(gpu, 'RETURNING_HOME');
  await gpu.waitForFunction(() => document.querySelector('.art-loading')?.dataset.handoffState === 'return-fallback');
  await gpu.screenshot({ path: path.join(directory, 'gpu-loss-return-fallback.png') }); await phase(gpu, 'HOME');
  assert.equal(lostProgress, .65);
  report.checks.push({ test: 'actual-webgl-context-loss-return-uses-warm-paper-without-trap', passed: true, retainedProgress: lostProgress }); await gpuContext.close();
  const backContext = await browser.newContext({ viewport: { width: 1280, height: 720 } }), back = await backContext.newPage();
  await instrument(back); await back.goto(report.url); await phase(back, 'HOME');
  await back.locator('.study-entry-button[data-chapter-id="4"]').click(); await phase(back, 'SCROLL_VIEWER'); await seek(back, .65);
  await back.goBack(); await phase(back, 'RETURNING_HOME');
  await back.waitForFunction(() => document.querySelector('.art-loading')?.dataset.presentationReady === 'true');
  assert.equal(Number(await back.locator('.art-loading').getAttribute('data-preview-progress')), .65);
  await back.screenshot({ path: path.join(directory, 'browser-back-current-frame-return.png') }); await phase(back, 'HOME');
  await back.evaluate(() => { window.__snapshotSamples = []; window.__snapshotEvents = []; });
  await back.locator('.study-entry-button[data-chapter-id="4"]').click();
  await inspectEntry(back, 4, .65, 'browser-back-captures-current-frame-and-reenters-session'); await backContext.close();
  report.inputsAfter = await inputs();
  report.inputsUnchanged = JSON.stringify(report.inputsBefore) === JSON.stringify(report.inputsAfter);
  report.changedInputs = [...new Set([...Object.keys(report.inputsBefore), ...Object.keys(report.inputsAfter)])]
    .filter(file => report.inputsBefore[file] !== report.inputsAfter[file]);
  if (process.env.MDGS_SNAPSHOT_REQUIRE_FREEZE === '1') assert(report.inputsUnchanged, 'Source/driver changed during the frozen run.');
  assert.deepEqual(report.errors, []); report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); process.exitCode = 1; }).finally(async () => {
  report.completedAt = new Date().toISOString();
  report.artifacts = {};
  await browser?.close(); await server?.close();
  for (const file of await below(directory)) if (!file.endsWith('previous-validation.json')) report.artifacts[portable(file)] = sha(await fs.readFile(file));
  await save();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, errors: report.errors }));
});

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { isDeepStrictEqual } = require('node:util');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(__dirname, 'matrix-runs', runId);
const dist = path.resolve(root, process.env.MDGS_RETURN_DIST || 'tmp/art-candidate-5-dist');
const buildFile = path.resolve(root, process.env.MDGS_RETURN_BUILD || 'reports/art-renewal/art-candidate-5-build.json');
const expected = process.env.MDGS_RETURN_EXPECT || 'fixed';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const sessionKey = 'guose-fanghua:peony-2.0-2026-10-23:chapter-4:position';
const report = {
  status: 'running', runId, expected, startedAt: new Date().toISOString(), checks: [], errors: [],
  scope: 'Actual fixed production package, history Back at .65/1 under normal/reduced motion, forward and session reload, plus an explicitly injected delay of an already completed real PNG encoding callback during button-then-Back. No render, GL, source clock, image bytes, or visibility overrides. Public diagnostics count submitted frames, not display FPS. Every check uses an independent browser context.',
};
let browser, server;
const save = () => fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Unexpected symlink: ' + directory + '/' + entry.name);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}
async function hashes(files) {
  const result = {}; let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < files.length) { const file = files[next++]; result[relative(file)] = sha(await fs.readFile(file)); }
  }));
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
async function sources() {
  return hashes([
    ...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'public')),
    ...['index.html', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json'].map(file => path.join(root, file)),
  ]);
}
const phase = (page, value, timeout = 90000) => page.waitForFunction(
  value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout },
);
const validPreview = (value, progress) => typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value) - progress) < 1e-6;

// Observe public state. The optional delay only holds delivery of a real,
// already encoded PNG; its pixels and originating GPU frame are untouched.
function installProbe() {
  const state = window.__returnMatrix = { blobs: [], phases: [], returns: [], entries: [], holdNextEncoding: false, held: false, releasedAt: null };
  const nativeBlob = HTMLCanvasElement.prototype.toBlob;
  let heldCallback = null, lastPhase = '', currentReturn = null, currentEntry = null, lastSample = '';
  HTMLCanvasElement.prototype.toBlob = function (callback, ...options) {
    const native = document.querySelector('.painting canvas');
    const item = { at: performance.now(), phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,
      progress: native?.dataset.progress, count: Number(native?.dataset.renderCount), width: this.width, height: this.height };
    const shouldHold = state.holdNextEncoding && item.phase === 'SCROLL_VIEWER';
    if (shouldHold) state.holdNextEncoding = false;
    state.blobs.push(item);
    return nativeBlob.call(this, blob => {
      item.encodedAt = performance.now(); item.ok = !!blob; item.bytes = blob?.size;
      const deliver = () => { item.deliveredAt = performance.now(); callback(blob); };
      if (shouldHold) { state.held = true; item.injectedCallbackHold = true; item.heldAt = performance.now(); heldCallback = deliver; }
      else deliver();
    }, ...options);
  };
  window.__releaseReturnEncoding = () => {
    if (!heldCallback) throw new Error('No real encoded image callback is held');
    const callback = heldCallback; heldCallback = null; state.held = false; state.releasedAt = performance.now(); callback();
  };
  function observe() {
    const next = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
    if (!next) return;
    if (next !== lastPhase) {
      lastPhase = next; const event = { phase: next, at: performance.now() }; state.phases.push(event);
      if (next === 'RETURNING_HOME') { currentReturn = { startedAt: event.at, samples: [] }; state.returns.push(currentReturn); lastSample = ''; }
      else if (currentReturn && !currentReturn.finishedAt) { currentReturn.finishedAt = event.at; currentReturn.finishedPhase = next; }
      if (next === 'SCROLL_AWAKENING' || next === 'CAMERA_ENTERING' && !currentEntry) { currentEntry = { startedAt: event.at }; state.entries.push(currentEntry); }
    }
    const native = document.querySelector('.painting canvas'), paper = document.querySelector('.art-loading');
    const warm = native?.dataset.shaderWarmup ? JSON.parse(native.dataset.shaderWarmup) : null;
    const sample = { at: performance.now(), nativeCount: Number(native?.dataset.renderCount), nativeProgress: native?.dataset.progress,
      cancelled: warm?.cancelled, cancelReason: warm?.reason, blobCount: state.blobs.length,
      preview: paper?.dataset.previewProgress, frame: paper?.dataset.previewFrame,
      ready: paper?.dataset.presentationReady, handoff: paper?.dataset.handoffState,
      paintingSrc: paper?.dataset.paintingSrc, open: Number(paper?.dataset.unfurl) };
    if (next === 'RETURNING_HOME' && currentReturn) {
      if (!currentReturn.first) currentReturn.first = sample;
      if (sample.ready === 'true' && !currentReturn.firstReady) currentReturn.firstReady = sample;
      if (sample.cancelled && !currentReturn.firstCancelled) currentReturn.firstCancelled = sample;
      const signature = JSON.stringify([sample.cancelled, sample.blobCount, sample.preview, sample.ready, sample.handoff, sample.nativeCount]);
      if (signature !== lastSample) { currentReturn.samples.push(sample); lastSample = signature; }
      currentReturn.last = sample;
    }
    if (next !== 'RETURNING_HOME' && currentEntry && sample.ready === 'true' && !currentEntry.firstReady) currentEntry.firstReady = sample;
  }
  new MutationObserver(observe).observe(document, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-journey-phase', 'data-preview-progress', 'data-presentation-ready', 'data-handoff-state', 'data-shader-warmup'] });
  function frame() { observe(); requestAnimationFrame(frame); } requestAnimationFrame(frame);
}
async function native(page, progress) {
  await page.waitForFunction(progress => {
    const data = document.querySelector('.painting canvas')?.dataset;
    return data?.firstFrameReady === 'true' && Math.abs(Number(data.progress) - progress) < 1e-6 && data.loadingTextures === '0' && data.queuedTextures === '0';
  }, progress, { timeout: 90000 });
  return page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
}
async function seek(page, progress) {
  await page.locator('input[aria-label="画卷游观进度"]').evaluate((input, progress) => {
    input.step = 'any'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(progress));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, progress);
  await native(page, progress);
  await page.waitForFunction(({ key, progress }) => Math.abs(Number(sessionStorage.getItem(key)) - progress) < 1e-6, { key: sessionKey, progress });
}
async function fresh(reduce, callback) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, reducedMotion: reduce ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(installProbe);
  try { return await callback(page); }
  catch (error) {
    const check = report.checks.at(-1);
    if (check) {
      check.failureState = await page.evaluate(() => ({ url: location.href, phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,
        native: document.querySelector('.painting canvas') && { ...document.querySelector('.painting canvas').dataset },
        paper: document.querySelector('.art-loading') && { ...document.querySelector('.art-loading').dataset }, probe: window.__returnMatrix })).catch(() => null);
      const file = 'failure-' + report.checks.length + '.png'; await page.screenshot({ path: path.join(output, file) }).catch(() => {}); check.failureScreenshot = file;
    }
    throw error;
  } finally { await context.close(); }
}
async function enter(page, progress) {
  await page.goto(report.url); await phase(page, 'HOME');
  await page.locator('.study-entry-button[data-chapter-id="4"]').click(); await phase(page, 'SCROLL_VIEWER');
  const data = await native(page, 0); assert.equal(data.shaderErrors, '[]'); await seek(page, progress);
  if (!report.actualGpu) report.actualGpu = await page.locator('.painting canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR) };
  });
  return page.evaluate(() => ({ native: { ...document.querySelector('.painting canvas').dataset }, blobCount: window.__returnMatrix.blobs.length }));
}
async function closeAndRecord(page, before) {
  await phase(page, 'HOME', 12000);
  const state = await page.evaluate(() => window.__returnMatrix);
  const transition = state.returns.at(-1); assert(transition?.firstReady, 'A real return presentation or explicit fallback must become ready');
  const result = { ...transition, blobs: state.blobs.slice(before.blobCount), allPhases: state.phases,
    newEncodings: state.blobs.length - before.blobCount,
    nativeSubmissions: transition.firstReady.nativeCount - Number(before.native.renderCount) };
  assert.equal(transition.finishedPhase, 'HOME');
  assert(transition.firstCancelled?.cancelled, 'The native owner must eventually become permanently cancelled');
  assert(state.blobs.every(blob => blob.ok), 'Every observed real PNG encoding must succeed');
  return result;
}
function requireMatching(result, progress, minimumEncodings = 1) {
  assert(validPreview(result.firstReady.preview, progress), 'Return preview must be a nonempty matching number: ' + JSON.stringify(result.firstReady));
  assert.notEqual(result.firstReady.handoff, 'return-fallback');
  assert(result.newEncodings >= minimumEncodings, 'Must encode the current real GPU artwork, not reuse its stale initial image');
  assert(result.blobs.some(blob => validPreview(blob.progress, progress)), 'Encoding must originate at the expected real source progress');
  const delivery = result.blobs.find(blob => validPreview(blob.progress, progress))?.deliveredAt;
  assert(result.firstCancelled.at >= delivery, 'Permanent owner cancellation must follow the real matching snapshot delivery');
}
async function check(name, callback) {
  if (process.env.MDGS_RETURN_ONLY && !process.env.MDGS_RETURN_ONLY.split(',').includes(name)) return;
  const item = { name, startedAt: new Date().toISOString() }; report.checks.push(item); await save();
  try { await callback(item); item.passed = true; }
  catch (error) { item.passed = false; item.error = error.stack || String(error); }
  item.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ name, passed: item.passed, error: item.error?.split('\n')[0] }));
}
(async () => {
  await fs.mkdir(output, { recursive: true }); await fs.copyFile(__filename, path.join(output, 'driver.cjs'));
  report.driverSha256 = sha(await fs.readFile(__filename));
  const build = JSON.parse(await fs.readFile(buildFile, 'utf8'));
  report.buildBinding = { path: relative(buildFile), sha256: sha(await fs.readFile(buildFile)) };
  report.sourcesBefore = await sources(); report.sourcesMatchFrozen = isDeepStrictEqual(report.sourcesBefore, build.sourceInputs);
  if (expected === 'fixed') assert.deepEqual(report.sourcesBefore, build.sourceInputs, 'Fixed candidate source inputs must match its complete build fingerprint');
  report.packageBefore = await hashes(await walk(dist));
  for (const [file, hash] of Object.entries(build.code)) assert.equal(sha(await fs.readFile(path.join(dist, file))), hash, 'Frozen package code mismatch: ' + file);
  const { preview } = await import('vite');
  server = await preview({ root, build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  report.url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] });
  report.browser = browser.version(); await save();
  for (const reduce of [false, true]) {
    const motion = reduce ? 'reduced' : 'normal';
    await check('button-control-' + motion, item => fresh(reduce, async page => {
      item.progress = .65; const before = await enter(page, item.progress);
      await page.getByRole('button', { name: '返回序厅', exact: true }).click(); item.return = await closeAndRecord(page, before);
      requireMatching(item.return, item.progress);
    }));
    for (const progress of [.65, 1]) await check('history-' + progress + '-' + motion, item => fresh(reduce, async page => {
      item.progress = progress; const before = await enter(page, progress);
      await page.goBack(); item.return = await closeAndRecord(page, before);
      item.observedDefect = !validPreview(item.return.firstReady.preview, progress) && item.return.firstReady.handoff === 'return-fallback' && item.return.newEncodings === 0;
      if (expected === 'fixed') requireMatching(item.return, progress); else assert(item.observedDefect, 'Expected actual C4 Back regression was not observed');
      assert.equal(await page.evaluate(key => Number(sessionStorage.getItem(key)), sessionKey), progress, 'Back must preserve session progress');
      await page.goForward(); await phase(page, 'SCROLL_VIEWER'); item.forwardNative = await native(page, progress);
      item.forwardEntry = await page.evaluate(() => window.__returnMatrix.entries.at(-1));
      assert(validPreview(item.forwardEntry?.firstReady?.preview, progress), 'Forward paper must already show the restored current frame');
      assert.equal(item.forwardNative.shaderErrors, '[]');
      await page.reload(); await phase(page, 'SCROLL_VIEWER'); item.reloadNative = await native(page, progress);
      item.reloadEntry = await page.evaluate(() => window.__returnMatrix.entries.at(-1));
      assert(validPreview(item.reloadEntry?.firstReady?.preview, progress), 'Cold deep-link reload must use the actual session frame');
      assert.equal(item.reloadNative.shaderErrors, '[]');
      assert.equal(await page.evaluate(key => Number(sessionStorage.getItem(key)), sessionKey), progress);
    }));
    await check('button-encoding-inflight-then-back-' + motion, item => fresh(reduce, async page => {
      item.progress = .65; item.injection = 'Hold delivery of the next already encoded real viewer PNG until browser Back has committed RETURNING_HOME; then release exactly once. No pixel/GL/clock substitution.';
      const before = await enter(page, item.progress);
      await page.evaluate(() => { window.__returnMatrix.holdNextEncoding = true; });
      await page.getByRole('button', { name: '返回序厅', exact: true }).click();
      await page.waitForFunction(() => window.__returnMatrix.held === true, null, { timeout: 10000 });
      assert.equal(await page.locator('[data-journey-phase]').getAttribute('data-journey-phase'), 'SCROLL_VIEWER', 'Encoding delay must hold the original button phase');
      await page.goBack(); await phase(page, 'RETURNING_HOME');
      item.beforeRelease = await page.evaluate(() => ({ phase: document.querySelector('[data-journey-phase]').dataset.journeyPhase, probe: window.__returnMatrix }));
      await page.evaluate(() => window.__releaseReturnEncoding());
      item.return = await closeAndRecord(page, before);
      const held = item.return.blobs.find(blob => blob.injectedCallbackHold); assert(held?.encodedAt && held?.deliveredAt && held.ok);
      assert(held.deliveredAt >= item.return.startedAt, 'The matching result must genuinely arrive after Back enters RETURNING_HOME');
      item.observedDefect = !validPreview(item.return.firstReady.preview, item.progress) && item.return.firstReady.handoff === 'return-fallback';
      if (expected === 'fixed') requireMatching(item.return, item.progress); else assert(item.observedDefect, 'Expected actual in-flight result rejection was not observed');
      assert.equal(await page.evaluate(key => Number(sessionStorage.getItem(key)), sessionKey), item.progress);
    }));
  }
  report.sourcesAfter = await sources(); report.packageAfter = await hashes(await walk(dist));
  assert.deepEqual(report.sourcesAfter, report.sourcesBefore, 'Product inputs changed during acceptance');
  assert.deepEqual(report.packageAfter, report.packageBefore, 'Candidate package bytes changed during acceptance');
  assert.equal(sha(await fs.readFile(__filename)), report.driverSha256, 'Driver changed during acceptance');
  assert.equal(sha(await fs.readFile(buildFile)), report.buildBinding.sha256, 'Frozen fingerprint changed during acceptance');
  assert.deepEqual(report.errors, []); report.inputsUnchanged = true;
  report.passed = report.checks.filter(check => check.passed).length; report.total = report.checks.length;
  assert(report.total > 0 && report.passed === report.total, 'Some focused groups failed');
  report.status = expected === 'fixed' ? 'passed' : 'confirmed-regression';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); }).finally(async () => {
  await Promise.allSettled([browser?.close(), server?.close()]); report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, runId, passed: report.passed, total: report.total, errors: report.errors }));
  if (!['passed', 'confirmed-regression'].includes(report.status)) process.exitCode = 1;
});

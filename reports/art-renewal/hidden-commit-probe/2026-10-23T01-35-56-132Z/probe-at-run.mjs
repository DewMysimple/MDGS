/** Isolate the historical hidden-test baseline without editing the product.
 * --build-dir and --freeze are explicit; browser launch requires --run.
 */
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { preview } from 'vite';
const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); assert(at >= 0 && args[at + 1], `Required ${name}`); return args[at + 1]; };
const buildName = option('--build-dir'), freezeName = option('--freeze');
const build = path.resolve(root, buildName);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const freezeBytes = await readFile(path.resolve(root, freezeName));
const freeze = JSON.parse(freezeBytes);
assert.equal(buildName, freeze.directory);
const code = {};
for (const file of Object.keys(freeze.code)) {
  code[file] = sha(await readFile(path.join(build, file)));
  assert.equal(code[file], freeze.code[file]);
}
if (!args.includes('--run')) {
  console.log(JSON.stringify({ status: 'prepared-not-run', buildName, checks: '25 real autoplay/visibility cycles. Synchronous persisted controller position is compared with immediate canvas data, then exact DOM commit and 400ms frozen data. No epsilon/fake clock/product edit.', code }, null, 2));
  process.exit(0);
}
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'reports/art-renewal/hidden-commit-probe', runId);
await mkdir(output, { recursive: true });
const report = { status: 'running', startedAt: new Date().toISOString(), runId, buildDirectory: buildName, freeze: { path: freezeName, sha256: sha(freezeBytes) }, code, scope: 'Same document.hidden override + visibilitychange dispatch as historical settings test. Isolates synchronous controller persistence from delayed React/renderer DOM commit. This is not a native OS window background or display-FPS benchmark.', rounds: [], errors: [] };
const save = () => writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
let browser, server, page;
try {
  const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
  server = await preview({ root, build: { outDir: build }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  report.url = server.resolvedUrls.local[0];
  browser = await chromium.launch({ executablePath: process.env.MDGS_TEST_BROWSER || undefined, headless: true });
  report.browserVersion = browser.version();
  page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
  await page.addInitScript(() => {
    window.__hiddenProbeDrawCalls = 0;
    window.__hiddenProbeDrawsWhileHidden = [];
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
        if (!Object.hasOwn(proto, name)) continue;
        const original = proto[name];
        proto[name] = function (...args) {
          if (this.canvas.matches?.('.painting canvas')) {
            window.__hiddenProbeDrawCalls++;
            if (document.hidden) window.__hiddenProbeDrawsWhileHidden.push({ at: performance.now(), method: name });
          }
          return Reflect.apply(original, this, args);
        };
      }
    }
  });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(report.url);
  report.httpHtmlSha256 = sha(await (await page.request.get(report.url)).body());
  assert.equal(report.httpHtmlSha256, freeze.code['index.html']);
  await page.waitForFunction(() => window.__MDGS_ATLAS__?.snapshot().ready, null, { timeout: 90000 });
  await page.locator('.study-entry-button[data-chapter-id="1"]').click();
  await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 90000 });
  await page.locator('input[aria-label="画卷游观进度"]').evaluate(element => {
    element.step = 'any';
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '.4');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - .4) < .00001, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  for (let index = 0; index < 25; index++) {
    await page.getByRole('button', { name: '自动展卷', exact: true }).click();
    await page.waitForTimeout(200);
    const start = await page.evaluate(() => {
      const canvas = document.querySelector('.painting canvas');
      const keys = Object.keys(sessionStorage).filter(key => key.startsWith('guose-fanghua:') && key.endsWith(':chapter-1:position'));
      if (keys.length !== 1) throw Error('Expected one actual chapter position key');
      const key = keys[0];
      window.__hiddenCommitTrace = [];
      window.__hiddenCommitObserver?.disconnect();
      const state = () => ({ at: performance.now(), hidden: document.hidden, dom: canvas.dataset.progress, persisted: sessionStorage.getItem(key), input: document.querySelector('input[aria-label="画卷游观进度"]').value, inputStep: document.querySelector('input[aria-label="画卷游观进度"]').step, renderCount: canvas.dataset.renderCount, rafTicks: canvas.dataset.rafTicks, nativePaintingDrawCalls: window.__hiddenProbeDrawCalls, playLabel: document.querySelector('.play-button').textContent.trim(), playing: document.querySelector('.play-button').getAttribute('aria-pressed') });
      window.__hiddenCommitObserver = new MutationObserver(records => {
        if (records.some(record => record.attributeName === 'data-progress')) window.__hiddenCommitTrace.push(state());
      });
      window.__hiddenCommitObserver.observe(canvas, { attributes: true, attributeFilter: ['data-progress'] });
      const at = performance.now(), before = canvas.dataset.progress;
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      return { at, before, immediateDOM: canvas.dataset.progress, persisted: sessionStorage.getItem(key), key, hidden: document.hidden, immediate: state() };
    });
    assert.equal(start.hidden, true);
    assert(Number.isFinite(Number(start.persisted)));
    const expected = Number(Number(start.persisted).toFixed(6));
    report.pending = { index, start, expected }; await save();
    await page.waitForFunction(() => document.querySelector('.play-button')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000, polling: 5 });
    const committed = await page.evaluate(() => ({ at: performance.now(), input: document.querySelector('input[aria-label="画卷游观进度"]').value, inputStep: document.querySelector('input[aria-label="画卷游观进度"]').step, renderCount: document.querySelector('.painting canvas').dataset.renderCount, rafTicks: document.querySelector('.painting canvas').dataset.rafTicks }));
    await page.waitForTimeout(400);
    const after = await page.evaluate(key => ({ dom: Number(document.querySelector('.painting canvas').dataset.progress), persisted: sessionStorage.getItem(key), input: document.querySelector('input[aria-label="画卷游观进度"]').value, renderCount: document.querySelector('.painting canvas').dataset.renderCount, rafTicks: document.querySelector('.painting canvas').dataset.rafTicks, nativePaintingDrawCalls: window.__hiddenProbeDrawCalls, nativeDrawsWhileHidden: window.__hiddenProbeDrawsWhileHidden, playing: document.querySelector('.play-button').getAttribute('aria-pressed'), playLabel: document.querySelector('.play-button').textContent.trim(), trace: window.__hiddenCommitTrace, hidden: document.hidden, rendererRAF: document.querySelector('.painting canvas').dataset.rafRunning }), start.key);
    const item = { index, start, expected, committed, commitAfterMs: committed.at - start.at, after, immediateDOMEqualsSynchronousPosition: Number(start.immediateDOM) === expected };
    delete report.pending; report.rounds.push(item); await save();
    assert.equal(after.persisted, start.persisted, 'Controller position advances after visibility suspension');
    assert.equal(after.input, committed.input, 'Committed input changes while suspended');
    assert.equal(after.renderCount, committed.renderCount, 'Renderer draw metadata changes after pause commit');
    assert.equal(after.rafTicks, committed.rafTicks, 'Renderer RAF metadata changes after pause commit');
    assert.equal(after.playing, 'false');
    assert.equal(after.nativePaintingDrawCalls, start.immediate.nativePaintingDrawCalls, 'Native painting GL draw calls advance while hidden');
    assert.equal(after.nativeDrawsWhileHidden.length, 0);
    assert(after.trace.every(event => event.persisted === start.persisted && event.nativePaintingDrawCalls === start.immediate.nativePaintingDrawCalls), 'Hidden mutation trace shows controller/native draw movement');
    assert.equal(after.hidden, true); assert.equal(after.rendererRAF, 'false');
    await page.evaluate(() => { window.__hiddenCommitObserver.disconnect(); delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  }
  assert.equal(report.errors.length, 0);
  report.status = 'pass';
  report.lateCommitCases = report.rounds.filter(round => !round.immediateDOMEqualsSynchronousPosition).length;
} catch (error) { report.status = 'fail'; report.failure = { message: error.message, stack: error.stack }; }
finally {
  await browser?.close(); await server?.httpServer.close();
  report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, rounds: report.rounds.length, lateCommitCases: report.lateCommitCases, report: relative(path.join(output, 'validation.json')), failure: report.failure?.message }, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

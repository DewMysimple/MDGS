const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict'), { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..'), runId = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(__dirname, 'unfurl-lifecycle-runs', runId), target = path.join(__dirname, 'unfurl-lifecycle-validation.json');
const report = { status: 'running', runId, startedAt: new Date().toISOString(),
  scope: 'Actual Chrome partial unroll cancellation must visibly decrease to zero without warm fallback; reverse native return; real shader compile failure/retry and cleanup. Failures always replace stale passed status and retain observations.',
  checks: [], errors: [] };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const save = () => fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
let browser, server, page;
async function screenshot(name) {
  const filename = 'unfurl-' + name + '.png';
  await page.screenshot({ path: path.join(directory, filename) });
  await fs.copyFile(path.join(directory, filename), path.join(__dirname, filename));
}
async function check(test, run) {
  const evidence = { test };
  try { await run(evidence); evidence.passed = true; }
  catch (error) { evidence.passed = false; evidence.error = error.stack || String(error); await screenshot(test.replace(/[^a-z\d_-]/gi, '-') + '-failed').catch(() => {}); }
  report.checks.push(evidence); await save();
}
const phase = value => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 90000 });
(async () => {
  await fs.mkdir(directory, { recursive: true });
  try { await fs.copyFile(target, path.join(directory, 'previous-validation.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await save(); report.driverSha256 = sha(await fs.readFile(__filename));
  let origin = process.env.MDGS_PREVIEW_URL;
  if (!origin && process.env.MDGS_LIFECYCLE_DIST) {
    const dist = path.resolve(root, process.env.MDGS_LIFECYCLE_DIST), { preview } = await import('vite');
    server = await preview({ root, build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    origin = server.resolvedUrls.local[0]; report.productionDirectory = path.relative(root, dist).split(path.sep).join('/');
    report.productionFiles = {};
    for (const relative of ['index.html', ...(await fs.readdir(path.join(dist, 'assets'))).filter(file => /\.(?:js|css)$/.test(file)).map(file => 'assets/' + file)])
      report.productionFiles[relative] = sha(await fs.readFile(path.join(dist, relative)));
  }
  origin ||= 'http://127.0.0.1:5276/'; report.url = origin;
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] }); report.browserVersion = browser.version();
  page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => {
    window.__returnSamples = [];
    function sample(at) {
      const element = document.querySelector('.art-loading');
      if (element) window.__returnSamples.push({ at, phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,
        open: Number(element.dataset.unfurl), state: element.dataset.handoffState, frames: Number(element.dataset.renderCount), ready: element.dataset.presentationReady,
        opacity: Number(element.style.getPropertyValue('--art-ground-opacity')), imageOpacity: Number(document.querySelector('.art-loading__handoff')?.style.opacity) });
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.goto(origin + '#chapter-2');
  await check('mid-unroll-return-is-continuous-and-actually-closes-to-zero', async evidence => {
    await page.waitForFunction(() => Number(document.querySelector('.art-loading')?.dataset.unfurl) > .2 && Number(document.querySelector('.art-loading')?.dataset.unfurl) < .5);
    evidence.before = Number(await page.locator('.art-loading').getAttribute('data-unfurl'));
    evidence.initialPresentationReady = await page.locator('.art-loading').getAttribute('data-presentation-ready');
    assert.equal(evidence.initialPresentationReady, 'true');
    await page.locator('.art-loading__return').click(); await phase('RETURNING_HOME'); await screenshot('cancel-midway'); await phase('HOME');
    const cancel = await page.evaluate(() => window.__returnSamples.filter(sample => sample.phase === 'RETURNING_HOME'));
    const maximum = Math.max(...cancel.map(sample => sample.open)), peak = cancel.findIndex(sample => sample.open === maximum);
    Object.assign(evidence, { maxReturnOpen: maximum, finalOpen: cancel.at(-1)?.open, samples: cancel });
    assert(cancel.length > 2 && maximum <= evidence.before + .06, 'Cancellation must start at its existing opening, never jump fully open.');
    assert(cancel.slice(peak + 1).every((sample, index) => sample.open <= cancel[peak + index].open + .00002), 'After the last input-frame peak geometry must close monotonically.');
    assert(!cancel.some(sample => sample.state === 'return-fallback'), 'A ready partial scroll must physically close rather than being destroyed for a warm fallback.');
    assert(cancel.at(-1).open <= .002, 'Monotonic flatline is insufficient: the actual paper must finish closed.');
    assert(cancel.some(sample => sample.open < maximum * .5), 'The return must contain an actual intermediate decrease.');
    const frames = cancel.map(sample => sample.frames).filter(Number.isFinite);
    assert(Math.max(...frames) - Math.min(...frames) > 5, 'Real paper rendering must continue through the close.');
  });
  await check('viewer-return-matches-native-print-before-closing', async evidence => {
    await phase('HOME'); await page.locator('.study-entry-button[data-chapter-id="1"]').click(); await phase('SCROLL_VIEWER');
    await page.evaluate(() => { window.__returnSamples = []; });
    await page.getByRole('button', { name: '返回序厅', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.art-loading')?.dataset.handoffState === 'returning');
    await screenshot('return-handoff'); await phase('HOME');
    const returned = await page.evaluate(() => window.__returnSamples.filter(sample => sample.phase === 'RETURNING_HOME'));
    evidence.samples = returned.filter((_, index) => index % 4 === 0); evidence.finalOpen = returned.at(-1)?.open;
    assert(returned.some(sample => sample.state === 'returning' && sample.open > .999));
    assert(returned.some(sample => sample.open > .02 && sample.open < .5)); assert(returned.at(-1).open <= .002);
    assert.equal(await page.locator('.painting canvas').count(), 0);
  });
  await page.close();
  page = await browser.newPage({ viewport: { width: 1280, height: 720 } }); page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => {
    window.__breakUnfurlShader = true; const original = WebGL2RenderingContext.prototype.shaderSource;
    WebGL2RenderingContext.prototype.shaderSource = function (shader, source) {
      if (this.canvas?.dataset?.role === 'unfurl-scene' && window.__breakUnfurlShader) source += '\nnot_a_valid_glsl_token;\n';
      return original.call(this, shader, source);
    };
  });
  await check('real-shader-compile-failure-gates-entry-and-retries', async () => {
    await page.goto(origin + '#chapter-3'); await page.locator('.art-loading__retry').waitFor({ timeout: 30000 });
    assert((await page.locator('.art-loading__error').innerText()).includes('材质')); await screenshot('shader-failure');
    await page.evaluate(() => { window.__breakUnfurlShader = false; }); await page.locator('.art-loading__retry').click(); await phase('SCROLL_VIEWER');
    assert.equal(await page.locator('[data-role="unfurl-scene"]').count(), 0);
  });
  assert.deepEqual(report.errors, []); report.status = report.checks.length === 3 && report.checks.every(check => check.passed) ? 'passed' : 'failed';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); })
  .finally(async () => {
    await browser?.close(); await server?.close(); report.verifiedAt = new Date().toISOString();
    report.artifacts = {};
    for (const file of await fs.readdir(directory)) if (file !== 'previous-validation.json') report.artifacts[file] = sha(await fs.readFile(path.join(directory, file)));
    await save(); await fs.copyFile(target, path.join(directory, 'validation.json'));
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter(check => !check.passed).map(check => ({ test: check.test, error: check.error, finalOpen: check.finalOpen })), errors: report.errors }));
    if (report.status !== 'passed') process.exitCode = 1;
  });

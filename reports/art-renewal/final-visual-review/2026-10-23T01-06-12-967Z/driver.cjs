/** Stable desktop visual captures of an explicitly frozen production package. */
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..');
assert(process.env.MDGS_VISUAL_BUILD, 'An explicit frozen build manifest is required.');
const buildFile = path.resolve(root, process.env.MDGS_VISUAL_BUILD);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rel = file => path.relative(root, file).replaceAll('\\', '/');
const runId = new Date().toISOString().replace(/[:.]/g, '-'), out = path.join(__dirname, runId);
const report = { status: 'capturing', runId, startedAt: new Date().toISOString(), scope: 'Stable actual desktop foyer captures, normal motion at DPR1. Waits for decoded layers, completed arrival and fonts; no product styling or clock overrides. This records images for subsequent visual judgement, not an artistic-quality test.', captures: [], errors: [] };
let browser, server, build, dist;
const save = () => fs.writeFile(path.join(out, 'captures.json'), JSON.stringify(report, null, 2) + '\n');
async function inputs() {
  const hashes = {};
  for (const file of Object.keys(build.sourceInputs)) hashes[file] = sha(await fs.readFile(path.join(root, file)));
  return hashes;
}
async function bundles() {
  const hashes = {};
  for (const file of Object.keys(build.code)) hashes[file] = sha(await fs.readFile(path.join(dist, file)));
  return hashes;
}
(async () => {
  await fs.mkdir(out, { recursive: true }); await fs.copyFile(__filename, path.join(out, 'driver.cjs'));
  report.driverSha256 = sha(await fs.readFile(__filename));
  const bytes = await fs.readFile(buildFile); build = JSON.parse(bytes); dist = path.resolve(root, build.directory);
  report.buildManifest = { path: rel(buildFile), sha256: sha(bytes) }; report.buildDirectory = build.directory;
  report.inputsBefore = await inputs(); assert.deepEqual(report.inputsBefore, build.sourceInputs);
  report.bundlesBefore = await bundles(); assert.deepEqual(report.bundlesBefore, build.code);
  const { preview } = await import('vite');
  server = await preview({ root, build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] });
  report.browser = browser.version();
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 3440, height: 1440 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
    try {
      const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
      page.on('response', response => { if (response.status() >= 400) report.errors.push(response.status() + ' ' + response.url()); });
      await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('.peony-atlas')?.classList.contains('is-ready') && document.querySelector('.atlas-pigment')?.dataset.pigmentState !== 'pending');
      await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(3100);
      const file = 'home-' + viewport.width + 'x' + viewport.height + '.png';
      const state = await page.evaluate(() => ({ phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase, pigment: document.querySelector('.atlas-pigment')?.dataset.pigmentState, intro: { opacity: getComputedStyle(document.querySelector('.atlas-intro')).opacity, filter: getComputedStyle(document.querySelector('.atlas-intro')).filter }, flower: { opacity: getComputedStyle(document.querySelector('.atlas-peony-plane')).opacity, filter: getComputedStyle(document.querySelector('.atlas-peony-plane')).filter }, dpr: devicePixelRatio, allFourLayersDecoded: [...document.querySelectorAll('.atlas-art img,.atlas-title img')].every(image => image.complete && image.naturalWidth > 0) }));
      await page.screenshot({ path: path.join(out, file) });
      const imageBytes = await fs.readFile(path.join(out, file)); report.captures.push({ viewport, file: rel(path.join(out, file)), bytes: imageBytes.length, sha256: sha(imageBytes), state });
      await save();
    } finally { await context.close(); }
  }
  report.inputsAfter = await inputs(); assert.deepEqual(report.inputsAfter, report.inputsBefore);
  report.bundlesAfter = await bundles(); assert.deepEqual(report.bundlesAfter, report.bundlesBefore);
  assert.deepEqual(report.errors, []); report.status = 'captured-awaiting-visual-review';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await server?.close(); report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, runId, captures: report.captures.length, errors: report.errors }));
});

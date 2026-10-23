/** Real desktop pointer regression for the overlapping marker/range defect. */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const { preview } = require('vite');
const root = path.resolve(__dirname, '../..');
const candidate = process.env.MDGS_TIMELINE_DIST;
assert(candidate, 'Set an explicit frozen MDGS_TIMELINE_DIST.');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(__dirname, 'timeline-gesture-candidate8', runId);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', runId, candidate, checks: [], errors: [] };
const save = () => fs.writeFile(path.join(directory, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
const range = page => page.locator('input[aria-label="画卷游观进度"]');
async function settle(page, expected) {
  await page.waitForFunction(expected => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - expected) < .001,
    expected, { timeout: 10000 });
  return Number(await range(page).inputValue());
}
async function binding() {
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'reports/art-renewal/art-candidate-8-build.json'), 'utf8'));
  assert.equal(manifest.directory, candidate);
  const actual = {};
  for (const file of Object.keys(manifest.sourceInputs)) {
    actual[file] = sha(await fs.readFile(path.join(root, file)));
    assert.equal(actual[file], manifest.sourceInputs[file], 'Changed input: ' + file);
  }
  for (const [file, digest] of Object.entries(manifest.code)) assert.equal(sha(await fs.readFile(path.join(root, candidate, file))), digest);
  return actual;
}
let browser, server;
(async () => {
  await fs.mkdir(directory, { recursive: true });
  report.driverSha256 = sha(await fs.readFile(__filename));
  report.inputsBefore = await binding();
  server = await preview({ configFile: false, root, build: { outDir: path.join(root, candidate) }, preview: { host: '127.0.0.1', port: 5627, strictPort: true } });
  browser = await chromium.launch({ executablePath: process.env.MDGS_TEST_BROWSER, headless: true, args: ['--use-angle=d3d11'] });
  for (const viewport of [{ width: 1920, height: 1080, dpr: 1 }, { width: 2042, height: 1083, dpr: 1.25 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(() => sessionStorage.setItem('guose-fanghua:peony-2.0-2026-10-23:chapter-1:position', '.78'));
    await page.goto('http://127.0.0.1:5627/#chapter-1');
    await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 60000 });
    const mark = page.locator('.timeline-stop').filter({ has: page.locator('i') }).nth(12);
    const exact = Number(await mark.getAttribute('data-progress'));
    const box = await mark.boundingBox(), track = await page.locator('.chapter-timeline').boundingBox();
    assert(box && track);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('button')?.getAttribute('title'), { x, y });
    assert(hit, 'The original defect requires a real marker hit.');
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(track.x + track.width * .90, y, { steps: 60 });
    await page.mouse.up();
    const dragged = await settle(page, .90);
    assert(Math.abs(dragged - exact) > .08);
    report.checks.push({ name: 'drag-starting-on-covered-marker-crosses-85-percent', passed: true, viewport, hit, exact, dragged });
    await mark.click();
    const tapped = await settle(page, exact);
    report.checks.push({ name: 'tap-retains-exact-native-stop', passed: true, viewport, tapped, exact });
    await mark.focus(); await page.keyboard.press('Enter'); await settle(page, exact);
    await range(page).focus(); await page.keyboard.press('ArrowRight');
    const keyed = await settle(page, exact + .01);
    report.checks.push({ name: 'marker-enter-and-range-arrow-retained', passed: true, viewport, keyed });
    await page.mouse.move(track.x + track.width * .90, y); await page.mouse.down();
    await page.mouse.move(track.x + track.width * .78, y, { steps: 60 }); await page.mouse.up();
    const reversed = await settle(page, .78);
    assert.equal(await page.locator('.chapter-timeline.is-dragging').count(), 0);
    report.checks.push({ name: 'reverse-drag-and-release', passed: true, viewport, reversed });
    await page.mouse.move(x, y); await page.mouse.down();
    // A trusted capture is already active; cancellation is an explicit DOM
    // lifecycle probe, distinct from the trusted mouse tests above.
    await page.locator('.chapter-timeline').dispatchEvent('pointercancel', { pointerId: 1, bubbles: true });
    await page.mouse.up();
    assert.equal(await page.locator('.chapter-timeline.is-dragging').count(), 0);
    await range(page).focus(); await page.keyboard.press('Home'); await settle(page, 0);
    report.checks.push({ name: 'cancel-clears-capture-and-keyboard-remains-live', passed: true, viewport });
    const shot = path.join(directory, `timeline-${viewport.width}.png`);
    await page.screenshot({ path: shot });
    const geometry = await page.locator('.painting canvas').evaluate(canvas => ({ viewport: JSON.parse(canvas.dataset.sourceViewport), width: canvas.clientWidth, height: canvas.clientHeight }));
    assert(Math.abs(geometry.viewport.width / geometry.viewport.height - 16 / 9) < .0001);
    assert.equal(geometry.height, viewport.height === 1080 ? 954 : 957);
    assert((viewport.width - geometry.viewport.width) / 2 < (viewport.width === 1920 ? 120 : 180));
    report.checks.push({ name: 'complete-source-aspect-and-tightened-gutters', passed: true, viewport, geometry,
      screenshot: path.relative(root, shot).replaceAll('\\', '/'), sha256: sha(await fs.readFile(shot)) });
    await context.close(); await save();
  }
  report.inputsAfter = await binding(); assert.deepEqual(report.inputsAfter, report.inputsBefore);
  assert.equal(report.errors.length, 0); report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; })
.finally(async () => { await browser?.close(); await new Promise(resolve => server?.httpServer.close(resolve) ?? resolve()); await save(); console.log(JSON.stringify({ status: report.status, runId, checks: report.checks.length, failure: report.failure })); });

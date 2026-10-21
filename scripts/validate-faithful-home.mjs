/** Visual-composition and functional acceptance for the reference-corrected 3D home.
 * It measures layout and real geometry, not an automatic judgement of painting quality. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'reports/study-faithful');
await mkdir(output, { recursive: true });
const server = process.env.MDGS_PREVIEW_URL ? null : await preview({ root, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const url = process.env.MDGS_PREVIEW_URL || server.resolvedUrls.local[0];
const startedAt = new Date().toISOString();
const reportPath = path.join(output, 'validation-faithful-home.json');
await writeFile(reportPath, JSON.stringify({ status: 'running', startedAt, url }, null, 2) + '\n');
const browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
const results = [], pageErrors = [], consoleErrors = [], badResponses = [];
const titles = ['神都花事', '花入万家', '锦绣花意', '国色倾城'];
const waitPhase = (page, value) => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 60000 });
const phase = page => page.locator('[data-journey-phase]').getAttribute('data-journey-phase');
const button = (page, id) => page.locator(`.study-entry-button[data-chapter-id="${id}"]`);
const snapshot = page => page.evaluate(() => window.__MDGS_STUDY__.snapshot());
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
const readyHome = async page => {
  await waitPhase(page, 'HOME');
  await page.waitForFunction(() => window.__MDGS_STUDY__?.snapshot().ready && [...document.querySelectorAll('.study-entry-button')].length === 4 && [...document.querySelectorAll('.study-entry-button')].every(button => !button.disabled), null, { timeout: 60000 });
};
async function observe(page) {
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', item => { if (item.type() === 'error') consoleErrors.push(item.text()); });
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
  await page.addInitScript(() => {
    localStorage.setItem('guose-fanghua:painting-motion', 'on');
    window.faithfulPhases = [];
    new MutationObserver(() => {
      const phase = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
      if (phase && window.faithfulPhases.at(-1)?.phase !== phase) window.faithfulPhases.push({ phase, at: performance.now() });
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-journey-phase'] });
  });
}
function loadingDuration(events) {
  const start = events.findIndex(item => item.phase === 'SCROLL_LOADING');
  const end = events.findIndex((item, index) => index > start && item.phase === 'PAINTING_REVEAL');
  assert(start >= 0 && end > start, 'Real load and reveal phases must be observable.');
  return events[end].at - events[start].at;
}
async function entries(page) {
  return page.locator('.study-entry-button').evaluateAll((buttons, titles) => buttons.map((button, index) => {
    const rect = button.getBoundingClientRect(), text = button.querySelector('strong');
    return { id: Number(button.dataset.chapterId), title: text?.textContent, isButton: button.tagName === 'BUTTON', width: rect.width, height: rect.height,
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, centreX: rect.left + rect.width / 2,
      fontSize: parseFloat(getComputedStyle(text || button).fontSize), pointer: button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)), expected: titles[index] };
  }), titles);
}
function entryAssertions(items, width, height) {
  assert.equal(items.length, 4);
  items.forEach((item, index) => {
    assert(item.isButton && item.id === index + 1 && item.title === titles[index]);
    assert(item.width >= 44 && item.height >= 44 && item.fontSize >= 16 && item.pointer);
    assert(item.left >= -1 && item.top >= -1 && item.right <= width + 1 && item.bottom <= height + 1, 'Every entry must remain inside the viewport and receive pointers.');
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await observe(page); await page.goto(url); await readyHome(page);
  const room = await snapshot(page);
  assert(room.objects.some(item => item.geometryType === 'BoxGeometry'));
  assert(room.objects.some(item => /CylinderGeometry|LatheGeometry/.test(item.geometryType)));
  assert(room.objects.some(item => item.name === 'gongbi-volumetric-peony-corolla' && item.vertices > 100), 'Painted flowers must retain a cupped mesh rather than a rectangular billboard.');
  assert.equal(room.objects.filter(item => item.name === 'home-wound-silk-roll').length, 8);
  assert.equal(room.scrolls.length, 4);
  assert(room.scrolls.every(item => item.paperVertices >= 100 && item.rodRadius > 0));
  const bounds = room.scrolls.map(scroll => {
    if (scroll.paperBounds) return scroll.paperBounds;
    const points = scroll.paperCorners || scroll.corners;
    assert(points?.length >= 4, 'Paper geometry needs actual projected bounds/corners.');
    return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
  });
  const paperTop = Math.min(...bounds.map(b => b.top)) / 900;
  const paperBottom = Math.max(...bounds.map(b => b.bottom)) / 900;
  assert(paperTop >= .25 && paperTop <= .47, 'The reference places the far scroll shafts around 36% height, not a narrow strip below 50%.');
  assert(paperBottom >= .51 && paperBottom <= .71);
  assert(paperBottom - paperTop >= .17, 'The four paintings must have substantial readable depth on the desk.');
  const nativeEntries = await entries(page); entryAssertions(nativeEntries, 1440, 900);
  nativeEntries.forEach((item, index) => {
    assert(item.top / 900 >= .49 && item.top / 900 <= .67, 'Plaques should attach near the reference front shafts.');
    assert(item.bottom / 900 <= .9);
    assert(Math.abs(item.centreX / 1440 - [.17, .40, .62, .84][index]) <= .065);
  });
  const title = await page.locator('.study-title').boundingBox();
  assert(title.y / 900 <= .105 && (title.y + title.height) / 900 <= .35, 'The title belongs above the desk, near the upper reference composition.');
  const materialRequests = await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name).filter(name => /\/ui\/study-faithful\/.*\.(webp|png)(?:[?#]|$)/.test(name)));
  for (const file of ['garden.webp', 'scroll-paintings.webp', 'ornament-atlas.webp', 'peony-blooms.webp', 'carpet.webp']) {
    assert(materialRequests.some(name => new URL(name).pathname.endsWith(`/study-faithful/${file}`)), `Missing independent surface: ${file}`);
  }
  const manifest = JSON.parse(await readFile(path.join(root, 'public/ui/study-faithful/asset-manifest.json'), 'utf8'));
  for (const asset of manifest.assets) {
    const pixels = await readFile(path.join(root, 'public/ui/study-faithful', asset.file));
    assert.equal(createHash('sha256').update(pixels).digest('hex'), asset.sha256, `Asset provenance mismatch: ${asset.file}`);
  }
  await shot(page, 'home-desktop');
  results.push({ test: 'reference-composition-and-real-volume', paperTop, paperBottom, title, entries: nativeEntries, materialRequests, geometryCount: room.objects.length, passed: true });
  await page.mouse.move(150, 180); await page.waitForTimeout(600); const left = await snapshot(page);
  await page.mouse.move(1280, 180); await page.waitForTimeout(600); const right = await snapshot(page);
  assert(Math.hypot(right.camera.x - left.camera.x, right.camera.y - left.camera.y) > .002);
  assert.notDeepEqual(left.scrolls[0].corners, right.scrolls[0].corners);
  results.push({ test: 'perspective-observation', before: left.camera, after: right.camera, passed: true });
  await button(page, 1).hover(); await page.waitForTimeout(400); await shot(page, 'entry-hover');
  await button(page, 1).focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await shot(page, 'entry-focus');
  await page.mouse.move(5, 5); await page.waitForTimeout(200);
  for (const id of [1, 2, 3, 4]) {
    await page.evaluate(() => { window.faithfulPhases = []; });
    if (id === 1) {
      let release;
      const hold = new Promise(resolve => { release = resolve; });
      await page.route('**/assets/**/*.webp', async route => { await hold; await route.continue().catch(() => {}); });
      const rect = await button(page, 1).boundingBox(); await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.mouse.down(); await page.waitForTimeout(90); await shot(page, 'entry-pressed'); await page.mouse.up();
      await button(page, 2).dispatchEvent('click'); assert.equal(new URL(page.url()).hash, '#chapter-1');
      await waitPhase(page, 'ARTISTIC_TRANSITION'); await shot(page, 'scroll-closed');
      await waitPhase(page, 'SCROLL_LOADING'); await page.waitForTimeout(1300); await shot(page, 'scroll-unfurling');
      const first = Number(await page.locator('.art-loading').getAttribute('data-render-count'));
      await page.waitForTimeout(3000); assert.equal(await phase(page), 'SCROLL_LOADING');
      assert(Number(await page.locator('.art-loading').getAttribute('data-render-count')) > first);
      await shot(page, 'scroll-open-waiting'); release(); await page.unroute('**/assets/**/*.webp');
    } else await button(page, id).click();
    await waitPhase(page, 'SCROLL_VIEWER');
    assert.equal(new URL(page.url()).hash, `#chapter-${id}`);
    await page.locator('.painting canvas').waitFor();
    assert.equal(await page.locator('.scene-viewport').getAttribute('aria-disabled'), 'false');
    const events = await page.evaluate(() => window.faithfulPhases);
    const visibleLoadingMs = loadingDuration(events); assert(visibleLoadingMs >= 4000, 'The complete visible scroll exhibition must last at least four seconds.');
    results.push({ test: `entry-${id}-real-world-return`, title: titles[id - 1], visibleLoadingMs, events, passed: true });
    await page.getByRole('button', { name: '返回书房', exact: true }).click(); await readyHome(page);
  }
  for (const [width, height, name] of [[1920, 1080, 'home-wide'], [375, 800, 'home-mobile'], [620, 360, 'home-short-landscape']]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(600); const items = await entries(page); entryAssertions(items, width, height);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await shot(page, name); results.push({ test: `layout-${width}x${height}`, entries: items, passed: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 }); await page.getByRole('button', { name: '书房环境动画' }).click(); await page.waitForTimeout(400);
  const still = await snapshot(page); await page.waitForTimeout(500); const later = await snapshot(page);
  assert.equal(still.environmentTime, later.environmentTime); assert.deepEqual(still.camera, later.camera);
  await shot(page, 'home-motion-off'); results.push({ test: 'environment-toggle-stops-continuous-motion', passed: true });
  const reduced = await browser.newPage({ viewport: { width: 375, height: 800 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  await observe(reduced); await reduced.goto(url); await readyHome(reduced); await shot(reduced, 'home-mobile-reduced');
  await reduced.evaluate(() => { window.faithfulPhases = []; }); await button(reduced, 3).tap(); await waitPhase(reduced, 'SCROLL_VIEWER');
  assert.equal(new URL(reduced.url()).hash, '#chapter-3'); const reducedMs = loadingDuration(await reduced.evaluate(() => window.faithfulPhases)); assert(reducedMs >= 4000);
  results.push({ test: 'mobile-touch-reduced-complete-entry', visibleLoadingMs: reducedMs, passed: true });
  await reduced.close(); await page.close();
  assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(badResponses, []);
  const reference = await readFile(path.join(root, 'public/ui/study-faithful/reference.png'));
  await writeFile(reportPath, JSON.stringify({ status: 'pass', startedAt, completedAt: new Date().toISOString(), url,
    scope: 'Windows Edge real WebGL, reference feature proportions, native controls, all four original worlds; emulated mobile touch. Painting quality requires separate manual visual comparison.',
    referenceSha256: createHash('sha256').update(reference).digest('hex'), results, pageErrors, consoleErrors, unexpectedResponses: badResponses }, null, 2) + '\n');
  console.log(JSON.stringify({ status: 'pass', tests: results.length, pageErrors, consoleErrors, unexpectedResponses: badResponses }));
} catch (error) {
  await writeFile(reportPath, JSON.stringify({ status: 'fail', startedAt, completedAt: new Date().toISOString(), url, results, pageErrors, consoleErrors, unexpectedResponses: badResponses, failure: { message: error.message, stack: error.stack } }, null, 2) + '\n');
  throw error;
} finally { await browser.close(); await server?.close(); }

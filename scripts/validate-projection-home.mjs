/** Acceptance of the current reference-projected relief room. This preserves the
 * earlier geometry tests and adds a dedicated test for this homepage edition.
 * --static-only checks current provenance without starting a server/browser. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'reports/peony-2.0');
const staticOnly = process.argv.includes('--static-only');
const reportFile = path.join(output, `validation-projection-home${staticOnly ? '-static' : ''}.json`);
const referenceSha256 = '5ddde6154a57aa96bec01bdcb2f2e85bf0599ff28b01439988355768d1639f27';
const titles = ['神都花事', '花入万家', '锦绣花意', '国色倾城'];
const checks = [], pageErrors = [], consoleErrors = [], badResponses = [], expectedShaderErrors = [];
const report = { status: 'running', startedAt: new Date().toISOString(), scope: staticOnly
  ? 'Current homepage reference and backing byte hashes only. No browser, shader execution, visual comparison or interaction claim.'
  : 'Real WebGL projection relief, shader failure gate, source image provenance, native HTML controls, responsive layout, environment controls. Painting quality and pixel similarity require human screenshot review.',
  checks, pageErrors, consoleErrors, badResponses, expectedShaderErrors };
let server, browser, url;
await mkdir(output, { recursive: true });
await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const shot = (page, name) => page.screenshot({ path: path.join(output, `projection-${name}.png`), fullPage: true });
const snapshot = page => page.evaluate(() => window.__MDGS_STUDY__?.snapshot());
const entry = (page, id) => page.locator(`.study-entry-button[data-chapter-id="${id}"]`);
const waitHome = async page => {
  await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'HOME'
    && window.__MDGS_STUDY__?.snapshot().ready
    && [...document.querySelectorAll('.study-entry-button')].length === 4
    && [...document.querySelectorAll('.study-entry-button')].every(button => !button.disabled), null, { timeout: 45000 });
};
const style = button => button.evaluate(element => {
  const button = getComputedStyle(element), arrow = getComputedStyle(element.querySelector('.study-plaque-arrow'));
  return { transform: button.transform, filter: button.filter, outline: button.outlineStyle, arrow: arrow.transform };
});
const loops = page => page.locator('.volume-study').evaluate(element => element.getAnimations({ subtree: true })
  .filter(animation => animation.playState === 'running' && animation.effect instanceof KeyframeEffect && animation.effect.getTiming().iterations === Infinity).length);
async function observe(page, intentionalShaderFailure = false) {
  page.on('pageerror', error => (intentionalShaderFailure ? expectedShaderErrors : pageErrors).push(error.message));
  page.on('console', item => { if (item.type() === 'error') (intentionalShaderFailure ? expectedShaderErrors : consoleErrors).push(item.text()); });
  page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() }); });
  await page.addInitScript(() => localStorage.setItem('guose-fanghua:painting-motion', 'on'));
}
async function layout(page, width, height, name) {
  await page.setViewportSize({ width, height }); await page.waitForTimeout(450);
  const room=await snapshot(page),art=room.referenceViewport;
  assert.equal(room.referenceFit,'cover');
  assert(art.x<=0&&art.y<=0&&art.x+art.width>=width&&art.y+art.height>=height,'The actual room projection must cover the whole viewport, including portrait.');
  const items = await page.locator('.study-entry-button').evaluateAll(buttons => buttons.map(button => {
    const rect = button.getBoundingClientRect(), text = button.querySelector('strong');
    return { id: Number(button.dataset.chapterId), title: text?.textContent, tag: button.tagName,
      left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height,
      fontSize: parseFloat(getComputedStyle(text).fontSize), pointer: button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) };
  }));
  assert.equal(items.length, 4);
  items.forEach((item, index) => {
    assert.equal(item.tag, 'BUTTON'); assert.equal(item.id, index + 1); assert.equal(item.title, titles[index]);
    assert(item.width >= 44 && item.height >= 44 && item.fontSize >= 16 && item.pointer, 'Readable real controls must receive pointer input.');
    assert(item.left >= -1 && item.top >= -1 && item.right <= width + 1 && item.bottom <= height + 1, 'Every control must fit the viewport.');
    for (const other of items.slice(index + 1)) assert(item.right <= other.left || other.right <= item.left || item.bottom <= other.top || other.bottom <= item.top, 'Entry controls must not overlap.');
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await shot(page, name); checks.push({ test: `native-button-layout-${width}x${height}`, items, passed: true });
}

try {
  const manifest = JSON.parse(await readFile(path.join(root, 'public/ui/study-projection/asset-manifest.json'), 'utf8'));
  const assets = [];
  for (const asset of manifest.assets) {
    const bytes = await readFile(path.join(root, 'public/ui/study-projection', asset.file));
    assert.equal(hash(bytes), asset.sha256); assert.equal(bytes.length, asset.bytes);
    assets.push({ file: asset.file, bytes: bytes.length, sha256: hash(bytes) });
  }
  const reference = await readFile(path.join(root, 'public/ui/study-projection/reference.png'));
  assert.equal(hash(reference), referenceSha256);
  assert.equal(reference.readUInt32BE(16), 1672); assert.equal(reference.readUInt32BE(20), 941);
  const rootOriginal = path.join(root, 'exec-7b9c2640-9d8b-45f3-a2e6-0debe4684e11.png');
  const rootOriginalAvailable = await stat(rootOriginal).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
  if (rootOriginalAvailable) assert.equal(hash(await readFile(rootOriginal)), referenceSha256);
  report.referenceSha256 = referenceSha256;
  checks.push({ test: 'exact-reference-and-backing-current-byte-provenance', assets, rootOriginalAvailable, passed: true });
  if (!staticOnly) {
    const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
    server = process.env.MDGS_PREVIEW_URL ? null : await preview({ root, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    url = process.env.MDGS_PREVIEW_URL || server.resolvedUrls.local[0]; report.url = url;
    browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
    const page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
    await observe(page); await page.goto(url); await waitHome(page);
    const room = await snapshot(page);
    assert.equal(room.projectionMethod, 'reference-camera-relief-and-closed-solids');
    assert.equal(room.compiled, true); assert.equal(room.failure, null); assert.deepEqual(room.shaderErrors, []);
    assert.equal(room.smokeMode,'continuous-billow-ribbons');assert.equal(room.smokeLayers,2);
    assert(room.depthRange.every(Number.isFinite) && room.depthRange[1] - room.depthRange[0] > 4, 'Relief must contain substantial measured depth.');
    const relief = room.objects.find(item => item.name === 'continuous-reference-relief-window-desk-foreground');
    assert(relief?.vertices > 20000, 'The reference surface must have actual relief vertices.');
    assert(room.objects.some(item => item.geometryType === 'BoxGeometry' && item.name === 'solid-carved-desk-apron'));
    assert.equal(room.objects.filter(item => item.name === 'projected-solid-silk-axis' && item.geometryType === 'CylinderGeometry').length, 8);
    assert.equal(room.objects.filter(item => item.name === 'silk-paper-thickness').length, 4);
    assert.equal(room.scrolls.length, 4); room.scrolls.forEach(item => assert(item.paperVertices >= 1000 && item.rodRadius > 0));
    const response = await page.request.get(new URL(room.referenceSource, url).href);
    assert(response.ok()); assert.equal(hash(await response.body()), referenceSha256, 'The actually served homepage texture must be the reference file.');
    const visibleTitles = await page.locator('h1.study-title').evaluateAll(nodes => nodes.filter(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node); return rect.width > 5 && rect.height > 5 && style.visibility !== 'hidden';
    }).length);
    assert.equal(visibleTitles, 0, 'Painted title must not receive a second visible DOM heading.');
    checks.push({ test: 'actual-relief-paper-thickness-solid-sha-first-draw', room, passed: true });
    await layout(page, 1672, 941, 'home-reference-size');
    await page.mouse.move(100, 120); await page.waitForTimeout(650); const left = await snapshot(page);
    await page.mouse.move(1530, 160); await page.waitForTimeout(650); const right = await snapshot(page);
    assert(Math.hypot(right.camera.x - left.camera.x, right.camera.y - left.camera.y) > .002);
    assert.notDeepEqual(left.scrolls[0].corners, right.scrolls[0].corners);
    assert(right.renderCount > left.renderCount && right.environmentTime > left.environmentTime);
    checks.push({ test: 'real-perspective-camera-and-continuous-environment', before: left.camera, after: right.camera, passed: true });
    const first = entry(page, 1); await page.mouse.move(4, 4); await page.waitForTimeout(400); const normal = await style(first);
    await first.hover(); await page.waitForTimeout(400); const hovered = await style(first); assert.notDeepEqual(hovered, normal); await shot(page, 'button-hover');
    await page.mouse.move(4, 4); await first.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(400);
    assert(await first.evaluate(element => document.activeElement === element && element.matches(':focus-visible')));
    const focused = await style(first); assert.notEqual(focused.outline, 'none'); await shot(page, 'button-keyboard');
    checks.push({ test: 'hover-and-real-keyboard-focus-feedback', normal, hovered, focused, passed: true });
    await layout(page, 1440, 900, 'home-desktop'); await layout(page, 1920, 1080, 'home-wide');
    await layout(page, 375, 800, 'home-mobile'); await layout(page, 620, 360, 'home-landscape');
    await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(400);
    await page.getByRole('button', { name: '书房环境动画', exact: true }).click(); await page.waitForTimeout(250); const off = await snapshot(page);
    await page.mouse.move(1200, 130); await page.waitForTimeout(650); const offAfter = await snapshot(page);
    assert.deepEqual(off.camera, offAfter.camera); assert.equal(off.environmentTime, offAfter.environmentTime); assert.equal(offAfter.environmentActive, false); assert.equal(await loops(page), 0);
    await shot(page, 'environment-off');
    await page.getByRole('button', { name: '书房环境动画', exact: true }).click(); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(250); const reduced = await snapshot(page);
    await page.mouse.move(100, 130); await page.waitForTimeout(650); const reducedAfter = await snapshot(page);
    assert.deepEqual(reduced.camera, reducedAfter.camera); assert.equal(reduced.environmentTime, reducedAfter.environmentTime); assert.equal(await loops(page), 0); await shot(page, 'reduced-motion');
    checks.push({ test: 'off-and-system-reduce-stop-webgl-and-css-loops', offTime: offAfter.environmentTime, reducedTime: reducedAfter.environmentTime, passed: true });
    // A genuine key press must select chapter 2; the separate journey suite
    // verifies all four actual-world resources and minimum loading duration.
    await entry(page, 2).focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#chapter-2' && document.querySelector('[data-journey-phase]')?.dataset.journeyPhase !== 'HOME');
    checks.push({ test: 'keyboard-enter-selects-associated-chapter', hash: new URL(page.url()).hash, passed: true });
    await page.close();
    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await observe(mobile); await mobile.goto(url); await waitHome(mobile); await entry(mobile, 3).tap();
    await mobile.waitForFunction(() => location.hash === '#chapter-3' && document.querySelector('[data-journey-phase]')?.dataset.journeyPhase !== 'HOME');
    checks.push({ test: 'phone-touch-selects-associated-chapter', hash: new URL(mobile.url()).hash, passed: true }); await mobile.close();
    // Corrupt only the reference shader in this isolated page. GLSL link failure
    // must show the paper error panel, keep controls disabled and allow retry.
    const broken = await browser.newPage({ viewport: { width: 1280, height: 800 } }); await observe(broken, true);
    await broken.addInitScript(() => {
      window.__projectionFaultOn = true;
      for (const type of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
        if (!type) continue;
        const original = type.prototype.shaderSource;
        type.prototype.shaderSource = function(shader, source) { return original.call(this, shader, window.__projectionFaultOn && source.includes('plaqueRepair') ? `${source}\nINTENTIONAL_PROJECTION_SHADER_FAILURE` : source); };
      }
    });
    await broken.goto(url); await broken.getByRole('button', { name: '重新陈设', exact: true }).waitFor({ timeout: 45000 });
    const failed = await snapshot(broken); assert.equal(failed.ready, false); assert.equal(failed.compiled, false); assert(failed.shaderErrors.length > 0 && failed.failure);
    assert.equal(await broken.locator('.study-volume-host').getAttribute('data-scene-state'), 'error');
    assert.equal(await broken.locator('.study-entry-button:disabled').count(), 4); await shot(broken, 'shader-error-gate');
    await broken.evaluate(() => { window.__projectionFaultOn = false; });
    await broken.getByRole('button', { name: '重新陈设', exact: true }).click(); await waitHome(broken);
    const recovered = await snapshot(broken); assert.equal(recovered.failure, null); assert.deepEqual(recovered.shaderErrors, []);
    await shot(broken, 'shader-recovered'); checks.push({ test: 'real-glsl-link-failure-cannot-unlock-entries-and-retry-recovers', diagnostics: failed.shaderErrors, passed: true }); await broken.close();
    assert.deepEqual(pageErrors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(badResponses, []);
  }
  report.status = 'pass'; console.log(JSON.stringify({ status: report.status, checks: checks.length, staticOnly, report: path.relative(root, reportFile) }));
} catch (error) {
  report.status = 'fail'; report.error = { message: error.message, stack: error.stack }; throw error;
} finally {
  await browser?.close(); if (server) await server.close();
  report.completedAt = new Date().toISOString(); await writeFile(reportFile, JSON.stringify(report, null, 2) + '\n');
}

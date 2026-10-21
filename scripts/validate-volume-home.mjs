/** Browser acceptance of real room geometry, tactile controls and deforming scrolls. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'reports/study-volume');
await mkdir(output, { recursive: true });
const external = process.env.MDGS_PREVIEW_URL;
const server = external ? null : await preview({ root, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const url = external || server.resolvedUrls.local[0];
const startedAt = new Date().toISOString();
await writeFile(path.join(output, 'validation-volume-home.json'), JSON.stringify({ status: 'running', startedAt, url, minimumVisibleArtLoadingMs: 4000 }, null, 2) + '\n');
const browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
const results = [], errors = [], consoleErrors = [], failures = [], unexpectedResponses = [];
const phase = page => page.locator('[data-journey-phase]').getAttribute('data-journey-phase');
const waitPhase = (page, value) => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 60000 });
const entry = (page, id) => page.locator(`.study-entry-button[data-chapter-id="${id}"]`);
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
const snapshot = page => page.evaluate(() => window.__MDGS_STUDY__.snapshot());
const environmentLoops = page => page.locator('.volume-study').evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running' && animation.effect instanceof KeyframeEffect && animation.effect.getTiming().iterations === Infinity).length);
const readyHome = async page => {
  await waitPhase(page, 'HOME');
  await page.waitForFunction(() => window.__MDGS_STUDY__?.snapshot().ready && [...document.querySelectorAll('.study-entry-button')].length === 4 && [...document.querySelectorAll('.study-entry-button')].every(button => !button.disabled), null, { timeout: 30000 });
};
const inspectUnfurl = page => page.locator('.art-loading').evaluate(element => ({
  open: Number(element.dataset.unfurl), rods: Number(element.dataset.rodSeparation), curvature: Number(element.dataset.paperCurvature), frames: Number(element.dataset.renderCount), painting: element.dataset.paintingSrc,
}));
async function observe(page, network = true) {
  page.on('pageerror', error => errors.push(error.message));
  if (network) page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  if (network) page.on('response', response => { if (response.url().startsWith(url) && response.status() >= 400) unexpectedResponses.push({ status: response.status(), url: response.url() }); });
  await page.addInitScript(() => {
    localStorage.setItem('guose-fanghua:painting-motion', 'on');
    window.volumePhases = [];
    window.volumeLoadingFrameGaps = [];
    let lastFrame = performance.now();
    const measureFrame = now => {
      const current = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
      if (!document.hidden && current === 'SCROLL_LOADING') window.volumeLoadingFrameGaps.push(now - lastFrame);
      lastFrame = now;
      requestAnimationFrame(measureFrame);
    };
    requestAnimationFrame(measureFrame);
    new MutationObserver(() => {
      const current = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
      if (current && window.volumePhases.at(-1)?.phase !== current) window.volumePhases.push({ phase: current, at: performance.now() });
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-journey-phase'] });
  });
}
async function buttonStyle(button) {
  return button.evaluate(element => {
    const styles = [element, ...element.querySelectorAll('*')].map(node => {
      const s = getComputedStyle(node);
      return { transform: s.transform, shadow: s.boxShadow, filter: s.filter, background: s.backgroundImage, outline: `${s.outlineStyle}/${s.outlineWidth}` };
    });
    return styles;
  });
}
async function layout(page, width, height, name) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(700);
  const titles = ['神都花事', '花入万家', '锦绣花意', '国色倾城'];
  const buttons = await page.locator('.study-entry-button').evaluateAll((buttons, titles) => buttons.map((button, index) => {
    const rect = button.getBoundingClientRect();
    const text = [...button.querySelectorAll('*')].find(node => node.textContent.trim() === titles[index]) || button;
    return { id: button.dataset.chapterId, tag: button.tagName, text: button.textContent, fontSize: parseFloat(getComputedStyle(text).fontSize), x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      receivesPointer: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) };
  }), titles);
  assert.equal(buttons.length, 4);
  buttons.forEach((button, index) => {
    assert.equal(button.tag, 'BUTTON'); assert.equal(Number(button.id), index + 1); assert(button.text.includes(titles[index]));
    assert(button.width >= 44 && button.height >= 44); assert(button.fontSize >= 16); assert(button.receivesPointer);
    assert(button.x >= -1 && button.y >= -1 && button.x + button.width <= width + 1 && button.y + button.height <= height + 1, 'Each entry must fit visibly within the current viewport.');
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await shot(page, name);
  results.push({ test: `layout-${width}x${height}`, buttons, passed: true });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await observe(page);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/assets/**/*.webp', async route => { await held; await route.continue().catch(() => {}); });
  await page.goto(url);
  await readyHome(page);
  assert.equal(await page.locator('canvas.study-volume-canvas').count(), 1);
  assert.equal(await page.locator('.painting canvas').count(), 0);
  const room = await snapshot(page);
  assert(room.objects.length >= 25, 'The room must contain substantial actual geometry.');
  assert(room.objects.some(object => /BoxGeometry/.test(object.geometryType)), 'Table/window/furniture require volume geometry.');
  assert(room.objects.some(object => /CylinderGeometry|LatheGeometry/.test(object.geometryType)), 'Rollers and vessels require round volume geometry.');
  assert.equal(room.scrolls.length, 4);
  room.scrolls.forEach(scroll => { assert(scroll.paperVertices >= 100, 'Curved paper needs a real subdivided mesh.'); assert(scroll.rodRadius > 0, 'Every rod needs a positive real radius.'); });
  const roomBefore = await snapshot(page);
  await page.mouse.move(100, 170); await page.waitForTimeout(700); const left = await snapshot(page);
  await page.mouse.move(1300, 170); await page.waitForTimeout(700); const right = await snapshot(page);
  assert(Math.hypot(right.camera.x - left.camera.x, right.camera.y - left.camera.y, right.camera.z - left.camera.z) > .002, 'Observation should move a real perspective camera.');
  assert.notDeepEqual(left.scrolls[0].corners, right.scrolls[0].corners, 'Actual projected mesh corners should respond to the camera.');
  assert(right.renderCount > roomBefore.renderCount && right.environmentTime > roomBefore.environmentTime, 'The continuous scene must keep rendering while waiting.');
  results.push({ test: 'actual-geometry-perspective-and-live-motion', geometryCount: room.objects.length, geometryTypes: [...new Set(room.objects.map(object => object.geometryType))], scrolls: room.scrolls, cameraBefore: left.camera, cameraAfter: right.camera, renderedFrames: right.renderCount - roomBefore.renderCount, passed: true });
  await layout(page, 1440, 900, 'home-desktop');
  await layout(page, 1920, 1080, 'home-wide');
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(600);
  const button = entry(page, 1);
  await page.mouse.move(5, 5); await page.waitForTimeout(300); const normal = await buttonStyle(button);
  await button.hover(); await page.waitForTimeout(400); const hover = await buttonStyle(button); assert.notDeepEqual(hover, normal);
  await shot(page, 'entry-hover');
  await button.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  assert(await button.evaluate(element => document.activeElement === element)); await shot(page, 'entry-keyboard-focus');
  const rect = await button.boundingBox(); await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2); await page.waitForTimeout(250);
  const beforePress = await buttonStyle(button); await page.mouse.down(); await page.waitForTimeout(100); assert.notDeepEqual(await buttonStyle(button), beforePress); await shot(page, 'entry-pressed');
  await page.mouse.up();
  await waitPhase(page, 'SCROLL_AWAKENING');
  await entry(page, 2).dispatchEvent('click'); assert.equal(new URL(page.url()).hash, '#chapter-1');
  // Observe the real phase history before expensive screenshots can outlast the brief transition.
  await page.waitForFunction(() => window.volumePhases.some(event => event.phase === 'ARTISTIC_TRANSITION') && Number(document.querySelector('.art-loading')?.dataset.renderCount) > 0);
  const closed = await inspectUnfurl(page); await shot(page, 'scroll-closed');
  assert(closed.open < .2, 'The first real scroll state must be closed rather than half open.');
  await waitPhase(page, 'SCROLL_LOADING');
  await page.waitForTimeout(1250); const half = await inspectUnfurl(page); await shot(page, 'scroll-unfurling');
  assert(half.open > closed.open && half.open < .99); assert(half.rods > closed.rods);
  await page.waitForTimeout(2200); const open = await inspectUnfurl(page); await shot(page, 'scroll-open');
  assert(open.open >= .98); assert(open.rods > half.rods);
  assert.notEqual(closed.curvature, open.curvature, 'A mesh curve must change as the silk unrolls.');
  await page.waitForTimeout(850); const waiting = await inspectUnfurl(page);
  assert.equal(await phase(page), 'SCROLL_LOADING'); assert(waiting.frames > open.frames);
  assert.equal(await page.locator('.scene-viewport').getAttribute('aria-disabled'), 'true');
  await shot(page, 'scroll-slow-waiting');
  release(); await waitPhase(page, 'SCROLL_VIEWER');
  const events = await page.evaluate(() => window.volumePhases);
  const frameGaps = await page.evaluate(() => window.volumeLoadingFrameGaps);
  const maximumLoadingFrameGap = Math.max(0, ...frameGaps);
  const loadingAt = events.find(event => event.phase === 'SCROLL_LOADING').at;
  const revealedAt = events.find(event => event.phase === 'PAINTING_REVEAL').at;
  assert(revealedAt - loadingAt >= 4000);
  assert.equal(await page.locator('.painting canvas').getAttribute('data-chapter'), '1');
  assert.equal(await page.locator('.painting canvas').getAttribute('data-first-frame-ready'), 'true');
  assert.equal(await page.locator('.scene-viewport').getAttribute('aria-disabled'), 'false');
  const hiddenHome = await page.evaluate(() => window.__MDGS_STUDY__?.snapshot());
  let homeLifecycle = 'disposed';
  if (hiddenHome) {
    await page.waitForTimeout(350);
    const afterHidden = await snapshot(page);
    assert.equal(afterHidden.renderCount, hiddenHome.renderCount, 'A retained home renderer must stop rendering while the user is in a chapter.');
    assert.equal(afterHidden.environmentTime, hiddenHome.environmentTime, 'A retained home environment must pause while invisible.');
    homeLifecycle = 'retained-and-paused';
  }
  await shot(page, 'viewer-chapter-1');
  assert(frameGaps.length > 10 && maximumLoadingFrameGap < 1000, 'Art loading must continue receiving frames without a second-long freeze. This does not establish sustained FPS.');
  results.push({ test: 'closed-curved-scroll-unfurls-with-live-slow-loading-and-first-frame-gates', closed, half, open, waiting, loadingMs: revealedAt - loadingAt, maximumLoadingFrameGap, sampledFrames: frameGaps.length, homeLifecycle, phases: events, passed: true });
  await page.getByRole('button', { name: '返回书房', exact: true }).click(); await readyHome(page);
  for (const id of [2, 3, 4]) {
    if (id === 2) { await entry(page, id).focus(); await page.keyboard.press('Enter'); await shot(page, 'entry-selected'); }
    else await entry(page, id).click();
    await waitPhase(page, 'SCROLL_LOADING');
    assert((await page.locator('.art-loading').getAttribute('aria-label')).includes(['神都花事', '花入万家', '锦绣花意', '国色倾城'][id - 1]));
    await waitPhase(page, 'SCROLL_VIEWER'); assert.equal(Number(await page.locator('.painting canvas').getAttribute('data-chapter')), id);
    await page.getByRole('button', { name: '返回书房', exact: true }).click(); await readyHome(page);
    results.push({ test: `native-entry-${id}-real-world-and-return`, input: id === 2 ? 'keyboard Enter' : 'mouse click', passed: true });
  }
  const occlusionState = await snapshot(page);
  const brushHolder = occlusionState.objects.find(object => object.name === 'brush-holder');
  assert(brushHolder?.screenPosition, 'The physical brush holder must expose its projected centre for the occlusion probe.');
  await page.mouse.click(brushHolder.screenPosition.x, brushHolder.screenPosition.y);
  await page.waitForTimeout(350);
  assert.equal(await phase(page), 'HOME', 'A visible solid in front of a scroll must block a ray from selecting the painting behind it.');
  await shot(page, 'home-solid-occlusion');
  const raycastTarget = (await snapshot(page)).scrolls.find(scroll => scroll.id === 2).center;
  await page.mouse.click(raycastTarget.x, raycastTarget.y);
  await waitPhase(page, 'SCROLL_VIEWER');
  assert.equal(await page.locator('.painting canvas').getAttribute('data-chapter'), '2', 'Clicking the real paper surface must select that mesh’s chapter.');
  await page.getByRole('button', { name: '返回书房', exact: true }).click(); await readyHome(page);
  results.push({ test: 'real-solid-occlusion-and-canvas-paper-raycast', blockedObject: brushHolder.name, blockedAt: brushHolder.screenPosition, paperTarget: raycastTarget, selectedChapter: 2, passed: true });
  await layout(page, 375, 800, 'home-mobile'); await layout(page, 620, 360, 'home-short-landscape'); await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(500);
  await page.getByRole('button', { name: '书房环境动画', exact: true }).click(); await page.waitForTimeout(450); const off = await snapshot(page);
  await page.mouse.move(50, 100); await page.waitForTimeout(500); await page.mouse.move(1350, 100); await page.waitForTimeout(500); const offAfter = await snapshot(page);
  assert.deepEqual(off.camera, offAfter.camera); assert.equal(off.environmentTime, offAfter.environmentTime);
  assert.equal(await environmentLoops(page), 0, 'The environment switch must stop local CSS loops as well as WebGL movement.');
  await shot(page, 'home-environment-off');
  await page.getByRole('button', { name: '书房环境动画', exact: true }).click(); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(500);
  const reduced = await snapshot(page); await page.mouse.move(100, 180); await page.waitForTimeout(500); const reducedAfter = await snapshot(page);
  assert.deepEqual(reduced.camera, reducedAfter.camera); assert.equal(reduced.environmentTime, reducedAfter.environmentTime);
  assert.equal(await environmentLoops(page), 0, 'Reduced motion must stop local looping tassels and branches.');
  await shot(page, 'home-reduced-motion');
  const environmentSummary = state => ({ camera: state.camera, environmentTime: state.environmentTime, environmentActive: state.environmentActive });
  results.push({ test: 'environment-off-and-reduced-motion-stop-camera-and-loops', off: environmentSummary(off), offAfter: environmentSummary(offAfter), reduced: environmentSummary(reduced), reducedAfter: environmentSummary(reducedAfter), passed: true });
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await observe(mobile); await mobile.goto(url); await readyHome(mobile);
  await entry(mobile, 3).tap(); await waitPhase(mobile, 'SCROLL_LOADING'); await mobile.waitForTimeout(1500); await shot(mobile, 'scroll-mobile'); await waitPhase(mobile, 'SCROLL_VIEWER');
  assert.equal(await mobile.locator('.painting canvas').getAttribute('data-chapter'), '3'); await mobile.getByRole('button', { name: '返回书房', exact: true }).tap(); await readyHome(mobile);
  results.push({ test: 'phone-touch-real-world-and-return', passed: true });
  const recovery = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); await observe(recovery, false);
  let fail = true; await recovery.route('**/chapter-4/scene.json', route => fail ? route.fulfill({ status: 503, body: 'intentional manifest interruption' }) : route.continue()); await recovery.goto(`${url}#chapter-4`);
  await recovery.getByRole('button', { name: '重新展卷', exact: true }).waitFor(); await shot(recovery, 'scroll-error'); assert.notEqual(await phase(recovery), 'SCROLL_VIEWER'); fail = false;
  await recovery.getByRole('button', { name: '重新展卷', exact: true }).click(); await waitPhase(recovery, 'SCROLL_LOADING'); await recovery.waitForTimeout(500); const reducedClosed = await inspectUnfurl(recovery); await recovery.waitForTimeout(2700); const reducedOpen = await inspectUnfurl(recovery);
  assert(reducedOpen.open > reducedClosed.open, 'Reduced motion must retain the closed-to-open geometric state change.'); await waitPhase(recovery, 'SCROLL_VIEWER'); assert.equal(await recovery.locator('.painting canvas').getAttribute('data-chapter'), '4');
  results.push({ test: 'error-retry-and-reduced-unfurl', reducedClosed, reducedOpen, passed: true });
  await recovery.getByRole('button', { name: '返回书房', exact: true }).click(); await readyHome(recovery);
  let releaseLateManifest;
  const lateManifest = new Promise(resolve => { releaseLateManifest = resolve; });
  await recovery.route('**/chapter-1/scene.json', async route => { await lateManifest; await route.continue().catch(() => {}); });
  await entry(recovery, 1).click(); await waitPhase(recovery, 'SCROLL_LOADING');
  const lossSupported = await recovery.locator('canvas[data-role="unfurl-scene"]').evaluate(canvas => {
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const extension = context?.getExtension('WEBGL_lose_context');
    extension?.loseContext(); return !!extension;
  });
  assert(lossSupported, 'This browser must support the explicit WebGL-loss acceptance scenario.');
  await recovery.getByRole('button', { name: '重新展卷', exact: true }).waitFor();
  releaseLateManifest();
  await recovery.waitForFunction(() => document.querySelector('.painting canvas')?.dataset.firstFrameReady === 'true', null, { timeout: 30000 });
  await recovery.waitForTimeout(4300);
  assert.equal(await phase(recovery), 'SCROLL_LOADING', 'A later world-ready callback must not dismiss a failed visual presentation.');
  assert(await recovery.getByRole('button', { name: '重新展卷', exact: true }).isVisible()); await shot(recovery, 'scroll-webgl-error');
  await recovery.getByRole('button', { name: '重新展卷', exact: true }).click(); await waitPhase(recovery, 'SCROLL_VIEWER');
  assert.equal(await recovery.locator('.painting canvas').getAttribute('data-chapter'), '1');
  results.push({ test: 'unfurl-webgl-loss-stays-blocked-until-explicit-retry', lossSupported, passed: true });
  const materialRecovery = await browser.newPage({ viewport: { width: 1280, height: 800 } }); await observe(materialRecovery, false);
  let failMaterial = true;
  await materialRecovery.route('**/ui/study-faithful/garden.webp', route => failMaterial ? route.fulfill({ status: 503, body: 'intentional garden material interruption' }) : route.continue());
  await materialRecovery.goto(url); await materialRecovery.getByRole('button', { name: '重新陈设', exact: true }).waitFor();
  assert(await entry(materialRecovery, 1).isDisabled()); await shot(materialRecovery, 'home-material-error');
  failMaterial = false; await materialRecovery.getByRole('button', { name: '重新陈设', exact: true }).click(); await readyHome(materialRecovery); await shot(materialRecovery, 'home-material-recovered');
  results.push({ test: 'home-real-material-failure-and-recovery', intentionalStatus: 503, passed: true });
  assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(unexpectedResponses, []);
} catch (error) { failures.push({ message: error.message, stack: error.stack }); }
finally {
  await browser.close(); if (server) await new Promise(resolve => server.httpServer.close(resolve));
  const report = { status: failures.length ? 'fail' : 'pass', startedAt, completedAt: new Date().toISOString(), url, scope: 'Windows Edge, actual WebGL geometry and native controls; desktop and emulated touch. No physical phone, cross-browser or sustained-FPS claim.', minimumVisibleArtLoadingMs: 4000, results, errors, consoleErrors, unexpectedResponses, failures };
  await writeFile(path.join(output, 'validation-volume-home.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report, null, 2));
}
if (failures.length) process.exitCode = 1;

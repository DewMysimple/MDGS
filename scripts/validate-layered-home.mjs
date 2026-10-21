/** Independent browser acceptance for the layered study; does not replace journey/renderer tests. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'reports/study-layered');
await mkdir(output, { recursive: true });
const ownedServer = process.env.MDGS_PREVIEW_URL ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
const url = process.env.MDGS_PREVIEW_URL || ownedServer.resolvedUrls.local[0];
const browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
const titles = ['神都花事', '花入万家', '锦绣花意', '国色倾城'];
const results = [], errors = [], badResponses = [], failures = [];
const startedAt = new Date().toISOString();
const phase = page => page.locator('[data-journey-phase]').getAttribute('data-journey-phase');
const waitPhase = (page, value) => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 60000 });
const entry = (page, id) => page.locator(`.study-entry-button[data-chapter-id="${id}"]`);
const screenshot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
const settle = page => page.waitForTimeout(520);

async function observePage(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === new URL(url).origin && response.status() >= 400) badResponses.push({ url: response.url(), status: response.status() });
  });
  await page.addInitScript(() => {
    try { localStorage.setItem('guose-fanghua:painting-motion', 'on'); } catch { /* Storage independence is covered separately. */ }
  });
}

async function layerPositions(page) {
  return page.locator('.study-scene-layer[data-depth]').evaluateAll(layers => layers.map((layer, index) => {
    const style = getComputedStyle(layer);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return { index, depth: layer.dataset.depth, transform: style.transform, x: matrix.m41, y: matrix.m42 };
  }));
}

async function moveBetweenCorners(page) {
  const box = await page.locator('.study-stage').boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'The layered stage must have a real visible extent.');
  await page.mouse.move(box.x + box.width * .1, box.y + box.height * .2);
  await settle(page);
  const left = await layerPositions(page);
  await page.mouse.move(box.x + box.width * .9, box.y + box.height * .2);
  await settle(page);
  const right = await layerPositions(page);
  return left.map((item, index) => ({ depth: item.depth, dx: right[index].x - item.x, dy: right[index].y - item.y, before: item.transform, after: right[index].transform }));
}

async function visualState(button) {
  return button.evaluate(element => [element, ...element.querySelectorAll('*')].map(node => {
    const state = pseudo => {
      const style = getComputedStyle(node, pseudo);
      return { transform: style.transform, filter: style.filter, shadow: style.boxShadow, opacity: style.opacity, border: style.borderColor, background: style.backgroundImage, outline: `${style.outlineStyle}/${style.outlineWidth}/${style.outlineColor}` };
    };
    return { tag: node.tagName, style: state(null), before: state('::before'), after: state('::after') };
  }));
}

async function runningLoops(page) {
  return page.locator('.study-home').evaluate(home => home.getAnimations({ subtree: true }).filter(animation => {
    if (animation.playState !== 'running') return false;
    const effect = animation.effect;
    return effect instanceof KeyframeEffect && effect.getTiming().iterations === Infinity;
  }).map(animation => ({ name: animation.animationName || 'unnamed' })));
}

async function verifyLayout(page, width, height, name) {
  await page.setViewportSize({ width, height });
  await settle(page);
  assert.equal(await page.locator('.study-entry-button').count(), 4, 'Exactly four real entry controls must serve desktop and phone.');
  const buttons = await page.locator('.study-entry-button').evaluateAll((buttons, titles) => buttons.map((button, index) => {
    const matchingText = [button, ...button.querySelectorAll('*')].find(node => node.textContent.trim() === titles[index]);
    const rect = button.getBoundingClientRect();
    return { id: button.dataset.chapterId, tag: button.tagName, title: button.textContent, width: rect.width, height: rect.height,
      titleSize: parseFloat(getComputedStyle(matchingText || button).fontSize), label: button.getAttribute('aria-label') };
  }), titles);
  buttons.forEach((button, index) => {
    assert.equal(button.tag, 'BUTTON', 'The primary chapter entry must use native button semantics.');
    assert.equal(Number(button.id), index + 1, 'Titles and chapter IDs must remain in the requested left-to-right order.');
    assert(button.title.includes(titles[index]), `The real title ${titles[index]} must be visible in its entry.`);
    assert(button.width >= 44 && button.height >= 44, 'Every primary entry needs a usable touch target.');
    assert(button.titleSize >= 16, 'The visible chapter title must stay readable on the current screen.');
  });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'The document must not overflow horizontally.');
  for (let id = 1; id <= 4; id++) {
    const button = entry(page, id);
    await button.scrollIntoViewIfNeeded();
    assert(await button.isVisible());
    assert(await button.evaluate(button => {
      const rect = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
    }), `Chapter ${id} must receive pointer input at its visible centre.`);
  }
  await screenshot(page, name);
  results.push({ test: `responsive-${width}x${height}`, buttons, passed: true });
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await observePage(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await waitPhase(page, 'HOME');
  await page.locator('.study-stage').waitFor();
  const layers = await page.locator('.study-scene-layer[data-depth]').evaluateAll(layers => layers.map(layer => ({
    depth: layer.dataset.depth, images: [...(layer.matches('img') ? [layer] : []), ...layer.querySelectorAll('img')].map(image => ({ src: image.currentSrc || image.src, width: image.naturalWidth, loaded: image.complete && image.naturalWidth > 0 })),
    cssImage: getComputedStyle(layer).backgroundImage,
  })));
  assert(layers.length >= 5, 'The study must comprise independent scene layers, beyond a single full-frame background.');
  assert(new Set(layers.map(layer => layer.depth)).size >= 3, 'The study needs different real depth planes.');
  const bitmapSources = new Set(layers.flatMap(layer => [...layer.images.map(image => image.src), ...[...layer.cssImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1])]));
  assert(bitmapSources.size >= 5, 'Layered space must use distinct bitmap artwork.');
  assert(layers.flatMap(layer => layer.images).every(image => image.loaded), 'All independent study images must decode.');
  assert.equal(await page.locator('canvas').count(), 0, 'The book room must not keep a hidden chapter renderer running.');
  await verifyLayout(page, 1440, 900, 'home-desktop');
  await verifyLayout(page, 1920, 1080, 'home-wide');
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);
  const paintedEdgeHit = await page.locator('.study-scroll-object[data-scroll-id="1"]').evaluate(scroll => {
    // This point lies inside the first artwork's upper-right tip; the next
    // scroll's transparent rectangular margin must not steal its pointer.
    const rect = scroll.getBoundingClientRect();
    const x = rect.left + rect.width * .95, y = rect.top + rect.height * .22;
    return { x, y, actual: document.elementFromPoint(x, y)?.closest('[data-scroll-id]')?.dataset.scrollId || null };
  });
  assert.equal(paintedEdgeHit.actual, '1', 'Transparent adjacent sprite bounds must not redirect a visible first-scroll edge to chapter 2.');
  results.push({ test: 'painted-edge-hit-does-not-cross-into-adjacent-scroll', ...paintedEdgeHit, passed: true });

  const activeDeltas = await moveBetweenCorners(page);
  const moving = activeDeltas.filter(delta => Math.hypot(delta.dx, delta.dy) > .2);
  assert(moving.length >= 2, 'Mouse movement must shift multiple independent planes.');
  assert(new Set(moving.map(delta => Math.hypot(delta.dx, delta.dy).toFixed(1))).size >= 2, 'Layers must move by different distances, rather than the entire scene moving together.');
  results.push({ test: 'independent-depth-parallax', layerCount: layers.length, bitmapCount: bitmapSources.size, deltas: activeDeltas, passed: true });

  const first = entry(page, 1);
  await page.mouse.move(5, 5);
  await settle(page);
  const resting = await visualState(first);
  await first.hover();
  await settle(page);
  const hovering = await visualState(first);
  assert.notDeepEqual(hovering, resting, 'Hover must visibly lift/illuminate the actual entrance.');
  await screenshot(page, 'entry-hover');
  await first.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  assert(await first.evaluate(button => document.activeElement === button));
  await screenshot(page, 'entry-keyboard-focus');
  const box = await first.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await settle(page);
  const beforePress = await visualState(first);
  await page.mouse.down();
  await page.waitForTimeout(130);
  assert.equal(await phase(page), 'HOME', 'A native entry activates on click, after release.');
  const pressing = await visualState(first);
  assert.notDeepEqual(pressing, beforePress, 'Press feedback must differ visibly from the lifted hover.');
  await screenshot(page, 'entry-pressed');
  await page.mouse.up();
  await waitPhase(page, 'SCROLL_AWAKENING');
  await screenshot(page, 'entry-selected');
  await waitPhase(page, 'SCROLL_VIEWER');
  assert.equal(Number(await page.locator('canvas').getAttribute('data-chapter')), 1);
  await page.getByRole('button', { name: '返回书房', exact: true }).click();
  await waitPhase(page, 'HOME');
  results.push({ test: 'native-hover-focus-press-selection-to-real-chapter-1', passed: true });

  // The same buttons navigate the real world at all sizes; chapter 4 is tested at phone width.
  for (const id of [2, 3, 4]) {
    if (id === 4) await verifyLayout(page, 375, 800, 'home-mobile');
    await entry(page, id).click();
    await waitPhase(page, 'SCROLL_VIEWER');
    assert.equal(Number(await page.locator('canvas').getAttribute('data-chapter')), id);
    assert.equal(await page.locator('canvas').count(), 1);
    await page.getByRole('button', { name: '返回书房', exact: true }).click();
    await waitPhase(page, 'HOME');
    results.push({ test: `native-entry-to-real-chapter-${id}-and-return`, viewport: page.viewportSize(), passed: true });
  }
  await verifyLayout(page, 620, 360, 'home-short-landscape');
  await page.setViewportSize({ width: 1440, height: 900 });
  await settle(page);
  const body = page.locator('.study-scroll-object[data-scroll-id="2"]');
  assert.equal(await page.locator('.study-scroll-object[data-scroll-id]').count(), 4);
  await body.click({ position: { x: (await body.boundingBox()).width * .5, y: (await body.boundingBox()).height * .35 } });
  await waitPhase(page, 'SCROLL_VIEWER');
  assert.equal(Number(await page.locator('canvas').getAttribute('data-chapter')), 2, 'The artwork itself must activate the matching real chapter.');
  await page.getByRole('button', { name: '返回书房', exact: true }).click();
  await waitPhase(page, 'HOME');
  results.push({ test: 'whole-scroll-body-selects-matching-chapter', passed: true });

  const toggle = page.getByRole('button', { name: '书房环境动画', exact: true });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await toggle.click();
  await settle(page);
  const offDeltas = await moveBetweenCorners(page);
  assert(offDeltas.every(delta => Math.hypot(delta.dx, delta.dy) < .1), 'Disabling atmosphere must also freeze camera parallax.');
  const loopsWhenOff = await runningLoops(page);
  assert.equal(loopsWhenOff.length, 0, 'The environment toggle must stop local looping decorations.');
  await screenshot(page, 'home-motion-disabled');
  await toggle.click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle(page);
  const reducedDeltas = await moveBetweenCorners(page);
  assert(reducedDeltas.every(delta => Math.hypot(delta.dx, delta.dy) < .1), 'Reduced-motion preference must freeze all camera planes.');
  await entry(page, 1).hover();
  await settle(page);
  const animatedLocals = await runningLoops(page);
  assert.equal(animatedLocals.length, 0, 'Reduced motion must stop looping local decoration as well as parallax.');
  await screenshot(page, 'home-reduced-motion');
  results.push({ test: 'environment-off-and-reduced-motion', offDeltas, loopsWhenOff, reducedDeltas, animatedLocals, passed: true });

  // Recovery must fix the displayed bitmap, not only a detached preload probe.
  const recovery = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  recovery.on('pageerror', error => errors.push(error.message));
  let failRoom = true;
  await recovery.route(/\/room-frame\.(?:png|webp)(?:\?|$)/, route => failRoom ? route.fulfill({ status: 503, body: 'intentional temporary image failure' }) : route.continue());
  await recovery.goto(url);
  await recovery.getByRole('button', { name: '重新陈设', exact: true }).waitFor();
  assert(await recovery.locator('.study-entry-button').first().isDisabled(), 'Missing room material must keep entries locked.');
  await screenshot(recovery, 'home-material-error');
  failRoom = false;
  await recovery.getByRole('button', { name: '重新陈设', exact: true }).click();
  await recovery.waitForFunction(() => {
    const room = document.querySelector('.study-room-plane img');
    return room?.complete && room.naturalWidth > 0 && [...document.querySelectorAll('.study-entry-button')].every(button => !button.disabled);
  }, null, { timeout: 15000 });
  assert.equal(await phase(recovery), 'HOME');
  await screenshot(recovery, 'home-material-recovered');
  results.push({ test: 'visible-bitmap-material-retry', intentionalStatus: 503, recovered: true, passed: true });
  await recovery.close();

  assert.equal(errors.length, 0, 'No browser runtime errors are acceptable.');
  assert.equal(badResponses.length, 0, 'All local scene layers must resolve.');
} catch (error) {
  failures.push({ message: error.message, stack: error.stack });
} finally {
  await browser.close();
  if (ownedServer) await new Promise(resolve => ownedServer.httpServer.close(resolve));
  const report = { status: failures.length ? 'fail' : 'pass', startedAt, completedAt: new Date().toISOString(), url,
    scope: 'Windows/Chromium browser; independent visual states, real layer transforms, responsive hit areas and real chapter navigation. No sustained FPS, physical phone or cross-browser claim.', results, errors, badResponses, failures };
  await writeFile(path.join(output, 'validation-layered-home.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
if (failures.length) process.exitCode = 1;

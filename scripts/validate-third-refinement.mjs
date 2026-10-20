/** Exercise the delivered third scroll, including retirement and compact framing. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = new URL('../', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await readFile(new URL('public/assets/reconstruction/manifest.json', root));
const canonicalSha256 = sha(bytes), canonical = JSON.parse(bytes);
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
if (option('expected-hash')) assert.equal(canonicalSha256, option('expected-hash'));
const baseline = JSON.parse(await readFile(new URL('reports/chapter-3-refinement/before/manifest.json', root)));
for (const chapter of ['1', '2', '4']) assert.deepEqual(canonical.chapters[chapter], baseline.chapters[chapter]);
const output = new URL('reports/chapter-3-refinement/final/runtime/', root);
await mkdir(output, { recursive: true });
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const sources = await Promise.all(['src/scene/CalligraphyLayer.ts', 'src/scene/CalligraphyLayer.css', 'src/scene/ArtDirectionLayer.ts', 'src/scene/SceneRenderer.ts', 'src/styles/handscroll.css'].map(async file => ({ path: file, sha256: sha(await readFile(new URL(file, root))) })));
const report = { status: 'running', canonicalSha256, sources, otherChapterPayloadsUnchanged: [1, 2, 4], viewports: [], errors: [], interactions: [] };
const vite = await createServer({ server: { host: '127.0.0.1', watch: null }, logLevel: 'error', plugins: [{ name: 'third-runtime-no-watch', configResolved(config) { config.server.watch = null; } }] });
let browser;
try {
  await vite.listen();
  const source = JSON.parse(await readFile(new URL('public/assets/chapter-3/scene.json', root)));
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const stops = prepareScene(source, 3).stops;
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (new URL(response.url()).hostname === '127.0.0.1' && response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
  // Test-only observation; production exports no renderer handle.
  await page.route('**/src/scene/SceneRenderer.ts', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace('this.renderer.sortObjects = true;', 'this.renderer.sortObjects = true; window.__thirdRenderer = this;');
    await route.fulfill({ response, body });
  });
  await page.goto(vite.resolvedUrls.local[0]);
  await page.locator('.chapter-link').nth(2).click();
  const ready = () => page.waitForFunction(() => document.querySelector('canvas')?.dataset.chapter === '3' && document.querySelector('.scene-viewport.is-ready') && document.querySelector('canvas').dataset.loadingTextures === '0' && document.querySelector('canvas').dataset.queuedTextures === '0');
  await ready();
  const seek = async progress => {
    const value = await page.locator('input[type=range]').evaluate((input, target) => { input.value = String(target); input.dispatchEvent(new Event('input', { bubbles: true })); return Number(input.value); }, progress);
    await page.waitForFunction(value => Math.abs(Number(document.querySelector('canvas')?.dataset.progress) - value) < .00001, value);
    await ready();
    return value;
  };
  const states = [];
  for (const [width, height, compactExpected] of [[1920, 1080, false], [960, 700, false], [360, 800, true], [620, 360, true], [360, 640, true]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(compactExpected => {
      const renderer = window.__thirdRenderer;
      if (!renderer || renderer.dirty) return false;
      const actual = renderer.host.getBoundingClientRect();
      return Math.abs(actual.width - renderer.width) < 1 && Math.abs(actual.height - renderer.height) < 1
        && renderer.height >= renderer.calligraphy.getMinimumReadingHeight() - 1
        && (renderer.compactReserve > 0) === compactExpected;
    }, compactExpected);
    const samples = [];
    const points = stops.flatMap((stop, index) => index === stops.length - 1 ? [stop.progress] : [stop.progress, (stop.progress + stops[index + 1].progress) / 2]);
    for (const [direction, values] of [['forward', points], ['reverse', [...points].reverse()]]) for (const target of values) {
      const progress = await seek(target);
      const sample = await page.evaluate(() => {
        const r = window.__thirdRenderer, canvas = r.renderer.domElement;
        const active = [...document.querySelectorAll('[data-art-text-id]')].filter(element => element.dataset.compactOpening !== 'true' && element.style.display !== 'none' && Number(element.style.opacity) > .001).map(element => ({ id: element.dataset.artTextId, bodyPixels: Number(element.dataset.screenBodySize), opacity: Number(element.style.opacity) }));
        return { progress: Number(canvas.dataset.progress), active, hidden: r.objects.filter(object => object.mesh.userData.artHidden).map(object => ({ name: object.mesh.name, visible: object.mesh.visible, queued: !!object.url })), cameraPosition: r.camera.position.toArray(), cameraQuaternion: r.camera.quaternion.toArray(), projection: r.camera.projectionMatrix.toArray(), compactReserve: r.compactReserve, overflow: document.documentElement.scrollWidth > innerWidth, viewport: { width: canvas.clientWidth, height: canvas.clientHeight }, texturesFailed: Number(canvas.dataset.textureFailed) };
      });
      assert(sample.active.length <= 1, 'Only the current editorial group may be visible.');
      assert(sample.active.every(text => text.bodyPixels >= 13.99));
      assert(!sample.overflow && !sample.texturesFailed);
      assert.equal(sample.hidden.length, canonical.chapters['3'].hiddenMeshNames.length);
      assert(sample.hidden.every(object => !object.visible && !object.queued), 'Retired replacements must stay hidden after texture loads and reverse seeks.');
      assert(sample.projection.every(Number.isFinite));
      samples.push({ direction, ...sample });
    }
    assert.equal(compactExpected, samples.every(sample => sample.compactReserve > 0));
    const screenshot = `${width}x${height}-final.png`;
    await page.locator('.painting').screenshot({ path: fileURLToPath(new URL(screenshot, output)) });
    const documentLayout = await page.evaluate(() => ({ viewportHeight: innerHeight, documentHeight: document.documentElement.scrollHeight, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, controlsBottom: document.querySelector('.scroll-controls').getBoundingClientRect().bottom + scrollY, minimumPainting: getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('--reading-min-paint-height').trim() }));
    if (height <= 640) assert(documentLayout.documentHeight > height && documentLayout.controlsBottom <= documentLayout.documentHeight);
    if (width === 620) await page.screenshot({ path: fileURLToPath(new URL('short-620x360-full-page.png', output)), fullPage: true });
    report.viewports.push({ width, height, samples, screenshot, screenshotSha256: sha(await readFile(new URL(screenshot, output))), documentLayout });
    states.push(samples);
  }
  // The responsive projection changes framing; source camera poses stay identical.
  for (let index = 0; index < states[0].length; index++) for (const viewport of states.slice(1)) {
    assert.deepEqual(viewport[index].cameraPosition, states[0][index].cameraPosition);
    assert.deepEqual(viewport[index].cameraQuaternion, states[0][index].cameraQuaternion);
  }
  report.sourceCameraPosesAcrossResponsiveViews = 'identical';
  await seek(.45);
  const painting = await page.locator('.painting').boundingBox();
  await page.mouse.move(painting.x + painting.width * .5, painting.y + painting.height * .6);
  const progress = () => page.locator('input[type=range]').inputValue().then(Number);
  const a = await progress(); await page.mouse.wheel(0, 240); await page.waitForTimeout(160); const b = await progress();
  await page.mouse.wheel(0, -240); await page.waitForTimeout(160); const c = await progress();
  assert(b > a && c < b); report.interactions.push({ kind: 'native-wheel-both-directions', before: a, forward: b, reverse: c });
  await page.mouse.move(painting.x + painting.width * .65, painting.y + painting.height * .65);
  const dragBefore = await progress(); await page.mouse.down(); await page.mouse.move(painting.x + painting.width * .3, painting.y + painting.height * .65, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(140);
  const dragAfter = await progress(); assert.notEqual(dragAfter, dragBefore); report.interactions.push({ kind: 'native-drag', before: dragBefore, after: dragAfter });
  await seek(.743);
  const beforeRestore = await page.locator('canvas').evaluate(canvas => ({ reserve: canvas.dataset.compactReadingReserve, progress: canvas.dataset.progress }));
  await page.evaluate(() => window.__thirdRenderer.contextExtension.loseContext());
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.contextLost === 'true');
  assert(await page.evaluate(() => window.__thirdRenderer.retryFailedAssets()));
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.contextLost === 'false' && Number(document.querySelector('canvas')?.dataset.contextRestores) >= 1);
  await ready();
  const restored = await page.locator('canvas').evaluate(canvas => ({ reserve: canvas.dataset.compactReadingReserve, progress: canvas.dataset.progress }));
  assert.deepEqual(restored, beforeRestore); report.interactions.push({ kind: 'real-webgl-context-restoration', before: beforeRestore, after: restored });
  await page.locator('.painting').screenshot({ path: fileURLToPath(new URL('compact-restored.png', output)) });
  await page.locator('.play-button').scrollIntoViewIfNeeded();
  const playBounds = await page.locator('.play-button').boundingBox();
  assert(playBounds.y >= 0 && playBounds.y + playBounds.height <= 640);
  await page.locator('.play-button').click();
  await page.waitForFunction(() => document.querySelector('.play-button').classList.contains('is-playing'));
  await page.locator('.play-button').click();
  await page.waitForFunction(() => !document.querySelector('.play-button').classList.contains('is-playing'));
  report.interactions.push({ kind: 'short-window-document-scroll-and-autoplay-controls', accessible: true });
  const minimumBefore = await page.locator('.app-shell').evaluate(element => element.style.getPropertyValue('--reading-min-paint-height'));
  await page.locator('.chapter-link').nth(0).click();
  await page.waitForFunction(() => document.querySelector('canvas')?.dataset.chapter === '1' && document.querySelector('.scene-viewport.is-ready'));
  const minimumOnOtherChapter = await page.locator('.app-shell').evaluate(element => element.style.getPropertyValue('--reading-min-paint-height'));
  assert.equal(minimumOnOtherChapter, '');
  await page.locator('.chapter-link').nth(2).click(); await ready();
  const minimumAfter = await page.locator('.app-shell').evaluate(element => element.style.getPropertyValue('--reading-min-paint-height'));
  assert.equal(minimumAfter, minimumBefore);
  report.interactions.push({ kind: 'content-height-cleanup-and-chapter-return', before: minimumBefore, otherChapter: minimumOnOtherChapter, restored: minimumAfter });
  assert.equal(sha(await readFile(new URL('public/assets/reconstruction/manifest.json', root))), canonicalSha256);
  report.sourceFilesUnchanged = (await Promise.all(sources.map(async source => sha(await readFile(new URL(source.path, root))) === source.sha256))).every(Boolean);
  assert(report.sourceFilesUnchanged, 'Product source changed during the runtime check.');
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; throw error; }
finally {
  await browser?.close(); await vite.close(); report.ownedServerClosed = !vite.httpServer?.listening;
  await writeFile(new URL('validation.json', output), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, canonicalSha256, states: report.viewports.reduce((total, viewport) => total + viewport.samples.length, 0), interactions: report.interactions.length, errors: report.errors.length, ownedServerClosed: report.ownedServerClosed }));

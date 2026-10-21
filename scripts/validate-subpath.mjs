import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const revision = JSON.parse(await readFile(path.join(root, 'public/assets/reconstruction/manifest.json'), 'utf8'));
const prefix = '/portable/nested/';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
    const relative = pathname.slice(prefix.length) || 'index.html';
    const target = path.resolve(dist, relative);
    if (!target.startsWith(dist + path.sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' }).end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const pageErrors = [], failedResources = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => { if (new URL(response.url()).origin === new URL(url).origin && response.status() >= 400) failedResources.push(response.url()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-chapter-id="1"]').click();
  const waitViewer = () => page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.getAttribute('data-journey-phase') === 'SCROLL_VIEWER', null, { timeout: 60000 });
  await waitViewer();
  await page.locator('.painting canvas').waitFor();
  await page.locator('.scene-loading').waitFor({ state: 'hidden', timeout: 60000 });
  const ornamentPaths = await page.locator('.exhibition-atmosphere img').evaluateAll(images => images.map(image => ({ src: image.src, loaded: image.complete && image.naturalWidth > 0 })));
  assert(ornamentPaths.every(image => image.src.startsWith(url) && image.loaded), 'Ornaments must load beneath the nested prefix.');
  const brocade = await page.locator('.brocade-border__pattern').first().evaluate(element => getComputedStyle(element).backgroundImage);
  assert(brocade.includes(prefix + 'ui/'), 'CSS public asset references must use the nested prefix.');
  const chapters = [];
  const ready = async chapter => page.waitForFunction(chapter => document.querySelector('.painting canvas')?.dataset.chapter === String(chapter) && document.querySelector('.scene-viewport.is-ready') && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0', chapter, { timeout: 60000 });
  for (let index = 0; index < 4; index++) {
    await page.locator('.chapter-link').nth(index).click();
    await waitViewer();
    await page.locator('.scene-viewport').getAttribute('aria-label').then(label => assert(label.startsWith(`第${index + 1}卷`)));
    await page.locator('.scene-loading').waitFor({ state: 'hidden', timeout: 60000 });
    await ready(index + 1);
    assert.equal(await page.locator('.painting canvas').count(), 1);
    const canvas = await page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
    const chapter = revision.chapters[String(index + 1)];
    assert.equal(Number(canvas.artAddedLayers), chapter.addedLayers.length, 'Production must load the current reconstruction from the nested prefix.');
    assert.equal(Number(canvas.artTextLayers), chapter.textLayers.length);
    assert.equal(Number(canvas.textureFailed), 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false);
    chapters.push({ chapter: index + 1, loaded: true, addedLayers: Number(canvas.artAddedLayers), textLayers: Number(canvas.artTextLayers), overflow });
  }
  await page.getByRole('button', { name: '打开文化解读' }).click();
  await page.getByRole('dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(await page.getByRole('button', { name: '打开文化解读' }).evaluate(button => button === document.activeElement));
  await page.locator('.chapter-link').first().click();
  await waitViewer();
  await page.locator('.scene-loading').waitFor({ state: 'hidden', timeout: 60000 });
  await ready(1);
  const progress = () => page.locator('.painting canvas').evaluate(canvas => Number(canvas.dataset.progress));
  const advance = async previous => page.waitForFunction(previous => Number(document.querySelector('.painting canvas')?.dataset.progress) > previous + .002, previous);
  const box = await page.locator('.scene-viewport').boundingBox();
  let previous = await progress();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.wheel(0, 360);
  await advance(previous);
  await page.waitForTimeout(350);
  previous = await progress();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5, { steps: 8 });
  await page.mouse.up();
  await advance(previous);
  await page.locator('.scene-viewport').focus();
  previous = await progress();
  await page.keyboard.press('ArrowRight');
  await advance(previous);
  await page.waitForTimeout(350);
  previous = await progress();
  await page.getByRole('button', { name: '下一分镜', exact: true }).click();
  await advance(previous);
  await page.waitForTimeout(450);
  previous = await progress();
  await page.getByRole('button', { name: '自动展卷', exact: true }).click();
  await advance(previous);
  await page.getByRole('button', { name: '暂停展卷', exact: true }).click();
  const motion = page.getByRole('button', { name: '画中轻动', exact: true });
  await motion.click();
  await page.waitForFunction(() => document.querySelector('.motion-button')?.getAttribute('aria-pressed') === 'false');
  await motion.click();
  await page.waitForFunction(() => document.querySelector('.motion-button')?.getAttribute('aria-pressed') === 'true');
  await page.getByRole('button', { name: '进入全屏', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement !== null);
  await page.getByRole('button', { name: '退出全屏', exact: true }).click();
  await page.waitForFunction(() => document.fullscreenElement === null);
  await page.locator('input[type=range]').focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(() => Number(document.querySelector('.painting canvas')?.dataset.progress) < .001);
  await ready(1);
  await page.screenshot({ path: path.join(root, 'reports/screenshots/portable-subpath-1280x720.png') });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(failedResources, []);
  const result = { status: 'pass', testedAt: new Date().toISOString(), url, chapters, ornaments: ornamentPaths, cssAssetRebased: true, cultureDialog: true, interactions: ['wheel', 'drag', 'keyboard', 'next-scene', 'autoplay-pause', 'motion-toggle', 'fullscreen', 'progress-home', 'drawer-escape-focus'], pageErrors, failedResources };
  await writeFile(path.join(root, 'reports/validation-portable-subpath.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

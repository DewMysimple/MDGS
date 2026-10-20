import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const reportDirectory = new URL('../reports/reconstruction/pilot-motion/', import.meta.url);
await mkdir(reportDirectory, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1' }, logLevel: 'error' });
let browser;
try {
  await vite.listen();
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const source = JSON.parse(await readFile(new URL('../public/assets/chapter-1/scene.json', import.meta.url), 'utf8'));
  const manifest = prepareScene(source, 1);
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference',
    recordVideo: { dir: fileURLToPath(new URL('../tmp/pilot-motion-video/', import.meta.url)), size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(vite.resolvedUrls.local[0]);
  try {
    await page.waitForFunction(() => !!document.querySelector('.scene-viewport.is-ready') || !!document.querySelector('.scene-loading.has-error'), undefined, { timeout: 60000 });
    if (!await page.locator('.scene-viewport.is-ready').count()) throw new Error(await page.locator('.scene-loading.has-error').innerText());
  }
  catch (error) {
    await page.screenshot({ path: fileURLToPath(new URL('latest-load-failure.png', reportDirectory)) });
    const state = await page.evaluate(() => ({ text: document.body.innerText, canvas: document.querySelector('canvas')?.dataset }));
    await writeFile(new URL('latest-load-failure.json', reportDirectory), `${JSON.stringify({ pageErrors, state }, null, 2)}\n`);
    throw error;
  }
  const motionButton = page.getByRole('button', { name: '画中轻动', exact: true });
  const snapshot = () => page.locator('canvas').evaluate(canvas => ({ ...canvas.dataset, now: performance.now() }));
  const screenshot = async name => {
    await page.locator('.scene-viewport').screenshot({ path: fileURLToPath(new URL(`${name}.png`, reportDirectory)) });
    return `reports/reconstruction/pilot-motion/${name}.png`;
  };
  const results = [];
  for (const [key, stop] of [['opening', manifest.stops[0]], ['palace', manifest.stops[6]]]) {
    await page.getByRole('button', { name: `游观至${stop.name}`, exact: true }).click();
    await page.waitForFunction(progress => Math.abs(Number(document.querySelector('canvas')?.dataset.progress) - progress) < 0.0001, stop.progress);
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.loadingTextures) === 0 && Number(document.querySelector('canvas')?.dataset.queuedTextures) === 0);
    await page.waitForTimeout(1000);
    const activeA = await snapshot();
    const activeAImage = await screenshot(`${key}-on-a`);
    await page.waitForTimeout(3400);
    const activeB = await snapshot();
    const activeBImage = await screenshot(`${key}-on-b`);
    assert.equal(activeA.progress, activeB.progress);
    assert(Number(activeB.motionTime) > Number(activeA.motionTime));
    assert.equal(activeB.activePetals, '2');
    assert.equal(activeB.activeBridges, '1');
    assert(Number(activeB.activeMotionLayers) <= 6);
    assert.equal(activeB.textureFailed, '0');
    const names = JSON.parse(activeB.activeMotionNames);
    assert(names.every(name => name.startsWith('R1_') || /淡墨云气|金色飘带|下方花枝|飘落花瓣/.test(name)), 'Only explicitly audited independent layers may move');

    await motionButton.click();
    await page.waitForTimeout(300);
    const offA = await snapshot();
    const offAImage = await screenshot(`${key}-off-a`);
    await page.waitForTimeout(1100);
    const offB = await snapshot();
    const offBImage = await screenshot(`${key}-off-b`);
    assert.equal(offA.motionTime, offB.motionTime);
    assert.equal(offA.renderCount, offB.renderCount);
    assert.equal(offA.rafTicks, offB.rafTicks);
    assert.equal(offB.rafRunning, 'false');
    await motionButton.click();
    await page.waitForTimeout(300);
    const resumedA = await snapshot();
    await page.waitForTimeout(900);
    const resumedB = await snapshot();
    const resumedImage = await screenshot(`${key}-resumed`);
    assert(Number(resumedB.motionTime) > Number(resumedA.motionTime));
    assert.equal(resumedA.progress, resumedB.progress);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(350);
    const reducedA = await snapshot();
    const reducedAImage = await screenshot(`${key}-reduced-a`);
    await page.waitForTimeout(1100);
    const reducedB = await snapshot();
    const reducedBImage = await screenshot(`${key}-reduced-b`);
    assert.equal(reducedB.reducedMotion, 'true');
    assert.equal(reducedA.motionTime, reducedB.motionTime);
    assert.equal(reducedA.renderCount, reducedB.renderCount);
    assert.equal(reducedA.rafTicks, reducedB.rafTicks);
    assert.equal(reducedB.activeMotionLayers, '0');
    assert.equal(reducedB.rafRunning, 'false');
    results.push({
      scene: key, name: stop.name, progress: stop.progress,
      active: { a: activeA, b: activeB, images: [activeAImage, activeBImage] },
      off: { a: offA, b: offB, images: [offAImage, offBImage] },
      resumed: { a: resumedA, b: resumedB, image: resumedImage },
      reduced: { a: reducedA, b: reducedB, images: [reducedAImage, reducedBImage] },
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForTimeout(300);
  }
  assert.deepEqual(pageErrors, []);
  const video = page.video();
  await context.close();
  await video.saveAs(fileURLToPath(new URL('first-scroll-motion.webm', reportDirectory)));
  const revision = JSON.parse(await readFile(new URL('../public/assets/reconstruction/manifest.json', import.meta.url), 'utf8'));
  const result = { passed: true, firstScrollOnly: true, activeRevisionChapters: revision.activeChapters, viewport: '1440x900', results, pageErrors, video: 'reports/reconstruction/pilot-motion/first-scroll-motion.webm', scope: 'Two real first-scroll viewpoints: active movement at fixed progress, pause and reduced-motion freeze, then resume. Pixel comparisons accompany these telemetry checks; no claim of every scene/gpu is implied.' };
  await writeFile(new URL('validation.json', reportDirectory), `${JSON.stringify(result, null, 2)}\n`);
  console.log('First-scroll opening and palace: active / off / resume / reduced-motion passed; screenshots and WEBM saved.');
} finally { await browser?.close(); await vite.close(); }

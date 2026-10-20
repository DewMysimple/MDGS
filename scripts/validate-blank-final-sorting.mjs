/** Final-canonical read-only draw sampling at the reported first-scroll crossing. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url), output = new URL('reports/blank-design/final/', root);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const inputs = ['public/assets/reconstruction/manifest.json', 'src/scene/StableLayerSorting.ts', 'src/scene/SceneRenderer.ts', 'public/assets/chapter-1/scene.json'];
const fingerprints = Object.fromEntries(await Promise.all(inputs.map(async file => [file, sha(await readFile(new URL(file, root)))])));
const canonicalSha256 = fingerprints[inputs[0]];
const expected = process.argv.find(value => value.startsWith('--expected='))?.slice(11);
if (expected) assert.equal(canonicalSha256, expected, 'Final canonical does not match the requested frozen input.');
await mkdir(output, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1', watch: null }, logLevel: 'error' });
let browser;
try {
  await vite.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(45000);
  const pageErrors = [], failedRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/src/scene/SceneRenderer.ts', async route => {
    const response = await route.fetch(), code = await response.text();
    assert(code.includes('this.renderer.sortObjects = true;'));
    await route.fulfill({ response, body: code.replace('this.renderer.sortObjects = true;', 'this.renderer.sortObjects = true; window.__finalSorting = this;') });
  });
  const loaded = async () => {
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.chapter === '1' && document.querySelector('.scene-viewport.is-ready'));
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.loadingTextures === '0' && document.querySelector('canvas')?.dataset.queuedTextures === '0');
  };
  await page.goto(vite.resolvedUrls.local[0]); await loaded();
  await page.evaluate(() => {
    const r = window.__finalSorting;
    window.__sortFrames = [];
    window.__sortDraws = [];
    for (const object of r.objects) {
      const previous = object.mesh.onBeforeRender;
      object.mesh.onBeforeRender = function (...args) {
        previous?.apply(this, args);
        window.__sortDraws.push(this.name);
      };
    }
    const native = r.renderer.render.bind(r.renderer);
    r.renderer.render = (...args) => {
      window.__sortDraws = [];
      native(...args);
      const order = window.__sortDraws;
      window.__sortFrames.push({
        progress: r.progress, motion: r.getMotionState().enabled,
        empressIndex: order.indexOf('06_01_中央主位女子'),
        palaceIndex: order.indexOf('06_05_京城全景'),
        actualDrawCalls: order.length,
      });
    };
  });
  const samples = [], screenshots = [];
  for (const [mode, motion] of [['reduce', false], ['no-preference', true]]) {
    await page.emulateMedia({ reducedMotion: mode });
    await page.waitForFunction(motion => document.querySelector('canvas')?.dataset.motionEnabled === String(motion), motion);
    for (const [direction, progressValues] of [
      ['forward', [.345, .348, .349, .350, .351, .352, .355]],
      ['reverse', [.355, .352, .351, .350, .349, .348, .345]],
    ]) {
      for (const progress of progressValues) {
        await page.locator('input[type=range]').evaluate((input, value) => {
          input.value = String(value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }, progress);
        await page.waitForFunction(value => Math.abs(Number(document.querySelector('canvas')?.dataset.progress) - value) < .0001, progress);
        await loaded();
        await page.evaluate(() => { const r = window.__finalSorting; r.dirty = true; r.requestFrame(); });
        await page.waitForTimeout(80);
        const sample = await page.evaluate(() => ({
          frame: window.__sortFrames.at(-1),
          renderer: { ...document.querySelector('canvas').dataset },
          axis: window.__finalSorting.layerSorting.axis.toArray(),
        }));
        assert(sample.frame.empressIndex >= 0 && sample.frame.palaceIndex >= 0, 'Both subjects must be actually painted.');
        assert(sample.frame.empressIndex > sample.frame.palaceIndex, 'The source palace must be painted before the foreground empress.');
        assert.equal(sample.frame.motion, motion);
        assert.equal(sample.renderer.textureFailed, '0');
        samples.push({ mode, direction, requestedProgress: progress, ...sample });
        if (progress === .349 || progress === .350) {
          const name = 'sorting-' + mode + '-' + direction + '-' + progress.toFixed(3) + '.png';
          await page.locator('.scene-viewport').screenshot({ path: fileURLToPath(new URL(name, output)) });
          screenshots.push(name);
        }
      }
    }
  }
  const frames = await page.evaluate(() => window.__sortFrames);
  const sharedFrames = frames.filter(frame => frame.empressIndex >= 0 && frame.palaceIndex >= 0);
  assert(sharedFrames.length >= samples.length);
  assert(sharedFrames.every(frame => frame.empressIndex > frame.palaceIndex), 'A transient actual frame inverted the pair.');
  assert(frames.some(frame => frame.motion), 'Actual motion must have been exercised.');
  assert.deepEqual(pageErrors, []); assert.deepEqual(failedRequests, []);
  for (const [file, hash] of Object.entries(fingerprints)) assert.equal(sha(await readFile(new URL(file, root))), hash, 'Input changed during final verification: ' + file);
  const report = {
    status: 'passed', canonicalSha256, fingerprints, viewport: { width: 1440, height: 900 },
    scope: 'Focused final-canonical actual draw-order sampling only; the prior full sorting/GPU/motion sweeps remain separately archived.',
    observation: 'Source palace painted before foreground empress on every shared frame across .349/.350 in both directions and both motion modes.',
    inputSamples: samples.length, sharedFrames: sharedFrames.length, flips: 0,
    samples, frames, screenshots, pageErrors, failedRequests,
  };
  await writeFile(new URL('validation-sorting-focus.json', output), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, canonicalSha256, inputSamples: samples.length, sharedFrames: sharedFrames.length, flips: 0, screenshots: screenshots.length }));
} finally { await browser?.close(); await vite.close(); }


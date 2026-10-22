/** Observe the controller clock and the asynchronously rendered last frame. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {preview} from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const {chromium} = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const report = {status: 'running', samples: []};
const manifest = JSON.parse(await readFile(path.join(root, 'public/assets/new-scrolls/chapter-1/scene.json'), 'utf8'));
let server, browser;
try {
  server = await preview({root, preview: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
  browser = await chromium.launch({headless: true, executablePath: process.env.MDGS_TEST_BROWSER});
  const page = await browser.newPage({viewport: {width: 1672, height: 941}});
  await page.goto(server.resolvedUrls.local[0] + '#chapter-1');
  await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, {timeout: 120000});
  await page.locator('input[aria-label="画卷游观进度"]').evaluate(element => {
    element.step = 'any';
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '.125');
    element.dispatchEvent(new Event('input', {bubbles: true}));
  });
  const [start, end] = manifest.frameRange;
  await page.waitForFunction(frame => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.sourceFrame) - frame) < 1e-7,
    start + (end - start) * .125, {timeout: 120000});
  await page.waitForTimeout(500);
  const snapshot = label => page.evaluate(({label, start, end}) => {
    const data = document.querySelector('.painting canvas').dataset;
    return {label, time: performance.now(), controllerProgress: Number(document.querySelector('input[aria-label="画卷游观进度"]').value),
      controllerFrame: start + Number(document.querySelector('input[aria-label="画卷游观进度"]').value) * (end - start),
      canvasFrame: Number(data.sourceFrame), renderCount: Number(data.renderCount), rafRunning: data.rafRunning,
      paused: [...document.querySelectorAll('button')].some(button => button.textContent.trim() === '自动展卷')};
  }, {label, start, end});
  report.samples.push(await snapshot('before-play'));
  await page.getByRole('button', {name: '自动展卷', exact: true}).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', {name: '暂停展卷', exact: true}).click();
  for (const delay of [0, 16, 100, 250, 400, 800]) {
    if (delay) await page.waitForTimeout(delay);
    report.samples.push(await snapshot('post-pause-delay-' + delay));
  }
  const paused = report.samples.slice(1);
  assert(paused.every(sample => sample.paused), 'The UI did not enter paused state.');
  assert(paused.every(sample => sample.controllerFrame === paused[0].controllerFrame), 'Controller clock continued after pause.');
  assert(Math.abs(paused.at(-1).canvasFrame - paused[0].controllerFrame) < 1e-7,
    'The final rendered frame differs from the stopped controller clock.');
  const arrived = paused.findIndex(sample => Math.abs(sample.canvasFrame - paused[0].controllerFrame) < 1e-7);
  assert(arrived >= 0 && paused.slice(arrived).every(sample => sample.canvasFrame === paused[arrived].canvasFrame),
    'The final in-flight rendered frame continued changing after it reached the stopped clock.');
  report.status = 'pass';
} catch (error) {report.status = 'fail'; report.failure = error.stack || String(error); process.exitCode = 1;}
finally {
  await browser?.close(); await server?.close();
  await writeFile(path.join(root, 'reports/peony2-fidelity/pause-probe.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
}

/** Real-browser checks for preparation gates, cancellation and retained viewer input. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const project = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const tempDirectory = path.join(project, 'tmp', 'study-renderer-qa');
const htmlPath = path.join(tempDirectory, 'index.html');
const modulePath = path.join(tempDirectory, 'harness.ts');
await mkdir(tempDirectory, { recursive: true });
await writeFile(htmlPath, '<!doctype html><html><head><meta charset="utf-8"><title>Renderer preparation verification</title></head><body style="margin:0"><div id="test-host" style="width:100vw;height:90vh;position:relative"></div><script type="module" src="./harness.ts"></script></body></html>');
await writeFile(modulePath, `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { SceneRenderer } from '/src/scene/SceneRenderer.ts';
import ScrollViewport from '/src/components/ScrollViewport.tsx';
const host = document.querySelector('#test-host');
let engine, root, state;
const newState = () => ({ preparation: [], status: [], nudge: 0, seek: 0, manual: 0, ready: 0, errors: [] });
function dispose() {
  root?.unmount(); root = undefined;
  engine?.dispose(); engine = undefined;
}
function viewport(interactive) {
  root.render(React.createElement(ScrollViewport, {
    chapterId: 1, progress: 0, interactive, motionEnabled: false,
    onNudge: () => { state.nudge++; }, onSeek: () => { state.seek++; }, onManualInput: () => { state.manual++; },
    onPreparation: event => { state.preparation.push(event); }, onReady: () => { state.ready++; }
  }));
}
window.__studyRendererQA = {
  async direct(id) {
    dispose(); state = newState();
    const current = state;
    engine = new SceneRenderer(host, message => current.status.push(message), event => current.preparation.push(event));
    engine.resize(host.clientWidth, host.clientHeight); engine.setMotionEnabled(false);
    return engine.load(id).then(() => true).catch(error => { current.errors.push(error.name); return false; });
  },
  mountViewport() { dispose(); state = newState(); root = createRoot(host); viewport(false); },
  setInteractive: viewport,
  retry() { return engine.retryFailedAssets(); },
  resizeToHost() { engine.resize(host.clientWidth, host.clientHeight); },
  loseContext() { engine.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext(); },
  dispose,
  snapshot() { return { ...state, canvas: { ...host.querySelector('canvas')?.dataset }, canvases: host.querySelectorAll('canvas').length }; }
};
`);

const server = await createServer({ root: project, server: { host: '127.0.0.1', watch: null }, logLevel: 'error' });
let browser;
const checks = [];
try {
  await server.listen();
  const url = new URL('tmp/study-renderer-qa/index.html', server.resolvedUrls.local[0]).href;
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => !!window.__studyRendererQA);
  const snapshot = () => page.evaluate(() => window.__studyRendererQA.snapshot());
  const ready = () => page.waitForFunction(() => window.__studyRendererQA.snapshot().canvas.firstFrameReady === 'true', undefined, { timeout: 60000 });

  let holdTextures = true;
  const held = [];
  const holdRoute = async route => { if (holdTextures) held.push(route); else await route.continue(); };
  await page.route('**/*.webp', holdRoute);
  assert(await page.evaluate(() => window.__studyRendererQA.direct(1)));
  await page.waitForFunction(() => window.__studyRendererQA.snapshot().preparation.some(item => item.stage === 'textures'));
  let state = await snapshot();
  assert(!state.preparation.some(item => item.stage === 'ready'), 'A delayed required texture must keep the ceremony closed.');
  assert(state.preparation.at(-1).loaded < state.preparation.at(-1).total);
  holdTextures = false;
  await Promise.all(held.map(route => route.continue()));
  await ready();
  state = await snapshot();
  const readyIndex = state.preparation.findIndex(item => item.stage === 'ready');
  assert(readyIndex > state.preparation.findIndex(item => item.stage === 'first-frame'));
  assert(state.preparation[readyIndex].total > 0);
  assert.equal(state.preparation[readyIndex].loaded, state.preparation[readyIndex].total);
  assert(Number(state.canvas.renderCount) > 0);
  assert.equal(Number(state.canvas.textureFailed), 0);
  checks.push({ name: 'real-textures-and-first-frame', passed: true, textures: state.preparation[readyIndex].total, events: state.preparation.map(item => item.stage) });

  // A resize during the ritual can expose more of the real scene. Its newly
  // needed textures must close readiness again until the new viewport is drawn.
  holdTextures = true;
  held.length = 0;
  const readyEvents = state.preparation.filter(item => item.stage === 'ready').length;
  await page.setViewportSize({ width: 1920, height: 480 });
  await page.evaluate(() => window.__studyRendererQA.resizeToHost());
  await page.waitForFunction(count => {
    const current = window.__studyRendererQA.snapshot();
    return current.preparation.at(-1)?.stage === 'textures' && current.preparation.filter(item => item.stage === 'ready').length === count;
  }, readyEvents);
  assert.equal((await snapshot()).canvas.firstFrameReady, 'false');
  holdTextures = false;
  await Promise.all(held.map(route => route.continue()));
  await page.waitForFunction(count => window.__studyRendererQA.snapshot().preparation.filter(item => item.stage === 'ready').length > count, readyEvents);
  checks.push({ name: 'resized-viewport-waits-for-new-required-textures', passed: true, newlyRequestedTextures: held.length });
  await page.unroute('**/*.webp', holdRoute);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Hold the actual manifest request, then dispose the renderer while it is pending.
  let manifestRoute;
  let manifestArrived;
  const pendingManifest = new Promise(resolve => { manifestArrived = resolve; });
  await page.route('**/chapter-2/scene.json', route => { manifestRoute = route; manifestArrived(); });
  const cancelledLoad = page.evaluate(() => window.__studyRendererQA.direct(2));
  await pendingManifest;
  await page.evaluate(() => window.__studyRendererQA.dispose());
  const disposed = await snapshot();
  if (manifestRoute) await manifestRoute.continue().catch(() => {});
  assert.equal(await cancelledLoad, false);
  await page.waitForTimeout(120);
  state = await snapshot();
  assert.equal(state.canvases, 0);
  assert.deepEqual(state.preparation, disposed.preparation, 'Disposed requests may not publish later preparation events.');
  assert(state.errors.includes('AbortError'));
  checks.push({ name: 'pending-manifest-cancellation', passed: true });
  await page.unroute('**/chapter-2/scene.json');

  let failOnce = true;
  const failRoute = route => { if (failOnce) { failOnce = false; return route.abort('failed'); } return route.continue(); };
  await page.route('**/*.webp', failRoute);
  assert(await page.evaluate(() => window.__studyRendererQA.direct(1)));
  await page.waitForFunction(() => window.__studyRendererQA.snapshot().preparation.some(item => item.stage === 'error'));
  state = await snapshot();
  assert(!state.preparation.some(item => item.stage === 'ready'));
  assert(await page.evaluate(() => window.__studyRendererQA.retry()));
  await ready();
  state = await snapshot();
  assert.equal(Number(state.canvas.textureFailed), 0);
  checks.push({ name: 'failed-required-texture-and-explicit-retry', passed: true });
  await page.unroute('**/*.webp', failRoute);

  const beforeLoss = Number(state.canvas.renderCount);
  await page.evaluate(() => window.__studyRendererQA.loseContext());
  await page.waitForFunction(() => window.__studyRendererQA.snapshot().canvas.contextLost === 'true');
  await page.waitForTimeout(100);
  assert(await page.evaluate(() => window.__studyRendererQA.retry()));
  await page.waitForFunction(before => {
    const data = window.__studyRendererQA.snapshot().canvas;
    return data.contextLost === 'false' && Number(data.contextRestores) > 0 && Number(data.renderCount) > before;
  }, beforeLoss);
  checks.push({ name: 'retained-webgl-context-recovery', passed: true });

  await page.evaluate(() => window.__studyRendererQA.mountViewport());
  await ready();
  const viewport = page.locator('.scene-viewport');
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5);
  await page.mouse.wheel(0, 300);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5, { steps: 6 });
  await page.mouse.up();
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  state = await snapshot();
  assert.equal(state.nudge, 0); assert.equal(state.seek, 0); assert.equal(state.manual, 0);
  await page.evaluate(() => window.__studyRendererQA.setInteractive(true));
  await page.waitForFunction(() => document.querySelector('.scene-viewport')?.getAttribute('aria-disabled') === 'false');
  await viewport.focus();
  await page.keyboard.press('ArrowRight');
  await page.mouse.wheel(0, 300);
  await page.mouse.move(box.x + box.width * .7, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .4, box.y + box.height * .5, { steps: 6 });
  await page.mouse.up();
  state = await snapshot();
  assert(state.nudge > 2 && state.manual > 2, 'Original wheel, keyboard and drag input resumes once the ceremony opens.');
  assert.equal(state.canvases, 1);
  await page.evaluate(() => window.__studyRendererQA.setInteractive(false));
  await page.waitForFunction(() => document.querySelector('.scene-viewport')?.getAttribute('aria-disabled') === 'true');
  const stopped = await snapshot();
  await page.waitForTimeout(200);
  assert.equal((await snapshot()).nudge, stopped.nudge, 'Closing input must cancel inertial movement.');
  await page.evaluate(() => window.__studyRendererQA.dispose());
  assert.equal((await snapshot()).canvases, 0);
  checks.push({ name: 'viewport-input-gate-and-inertia-cleanup', passed: true });
  assert.deepEqual(pageErrors, []);
  await writeFile(path.join(project, 'reports', 'validation-study-renderer.json'), JSON.stringify({ status: 'pass', testedAt: new Date().toISOString(), environment: 'Windows Chromium; real WebGL textures and explicit network interruption', checks, pageErrors }, null, 2) + '\n');
  console.log(`${checks.length} renderer preparation and input checks passed.`);
} finally {
  await browser?.close();
  await server.close();
  await rm(htmlPath, { force: true });
  await rm(modulePath, { force: true });
}

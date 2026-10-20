/** Responsive runtime acceptance for the final four-scroll blank-design pass.
 *
 * node scripts/validate-blank-runtime.mjs --expected-hash=<full canonical SHA256>
 * Playwright/browser locations may be supplied with MDGS_PLAYWRIGHT_MODULE and
 * MDGS_TEST_BROWSER. Starts and closes only its own Vite server, with watch:null
 * and an OS-selected port. It never rewrites the art manifest or pilot evidence.
 * Draw submission is a runtime check; framebuffer contribution and aesthetic
 * approval remain separate evidence, not conclusions of this script.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const expected = option('expected-hash');
assert.match(expected || '', /^[a-f0-9]{64}$/, 'Pass the explicit final --expected-hash=<64 hex chars>; no stale default revision');
const root = new URL('../', import.meta.url);
const canonicalPath = new URL('public/assets/reconstruction/manifest.json', root);
const output = new URL((option('output') || 'reports/blank-design/final').replace(/\\/g, '/').replace(/\/?$/, '/'), root);
assert(output.href.startsWith(new URL('reports/blank-design/', root).href), 'Runtime evidence must stay in reports/blank-design');
assert(!/\/pilot(?:-v\d+)?\//.test(output.pathname), 'Do not overwrite an earlier pilot evidence directory');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const canonicalBytes = await readFile(canonicalPath);
assert.equal(sha(canonicalBytes), expected, 'Canonical differs from requested acceptance revision');
const canonical = JSON.parse(canonicalBytes);
const newByChapter = Object.fromEntries([1, 2, 3, 4].map(chapter => [chapter,
  canonical.chapters[chapter].addedLayers.filter(layer => layer.blankDesign && layer.id.startsWith(`bd${chapter}-`))]));
assert.equal(Object.values(newByChapter).flat().length, 45, 'This acceptance must account for the 45 designed world layers');
const pilotPath = new URL('reports/blank-design/pilot-v4/validation-runtime.json', root);
const pilotManifestPath = new URL('reports/blank-design/pilot-v4/manifest.json', root);
const pilotManifest = await json(pilotManifestPath);
const pilot = await json(pilotPath);
assert.equal(pilot.status, 'passed');
assert.equal(sha(await readFile(pilotManifestPath)), pilot.canonicalSha256, 'Pilot manifest bytes no longer match accepted runtime');
assert.deepEqual(canonical.chapters['4'], pilotManifest.chapters['4'], 'C4 subtree changed: old pilot cannot be reused');
assert.equal(pilot.viewports.reduce((count, viewport) => count + viewport.samples.length, 0), 62);
if (process.argv.includes('--preflight-only')) {
  console.log(JSON.stringify({status: 'inputs-ready-not-runtime-tested', canonicalSha256: expected,
    newLayers: Object.fromEntries(Object.entries(newByChapter).map(([id, layers]) => [id, layers.length])),
    chapter4EquivalentToPilot: true}));
  process.exit(0);
}
await mkdir(output, {recursive: true});
const {chromium} = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const vite = await createServer({server: {host: '127.0.0.1', watch: null}, logLevel: 'error',
  // Vite's config merge keeps an object from vite.config when an inline null
  // is merged into it. Set the final resolved option before server creation.
  plugins: [{name: 'blank-runtime-disable-watch', enforce: 'post',
    configResolved(config) { config.server.watch = null; }}]});
assert.equal(vite.config.server.watch, null, 'Runtime tests must not start file watchers');
let browser, page;
const report = {
  schemaVersion: 1, status: 'running', canonicalSha256: expected, createdAt: new Date().toISOString(),
  scope: 'C1–3: every gap plus first/last at 1920/960/360; wide/narrow native-wheel full-route forward/reverse; real controls at each width. C4 exact chapter subtree reuses passed pilot deep run plus a current four-chapter smoke. Draw submission is not a pixel-contribution or aesthetic approval.',
  newLayerCount: 45, viewports: [], continuous: [], interactions: [], staticNewLayers: [], mediaTransitions: [],
  fourChapterSmoke: [], pageErrors: [], consoleErrors: [], failedResources: [], failedRequests: [],
  reusedChapter4: {runtime: 'reports/blank-design/pilot-v4/validation-runtime.json',
    runtimeSha256: sha(await readFile(pilotPath)), canonicalSha256: pilot.canonicalSha256,
    equivalentChapterSubtree: true, reviewedViews: 62,
    boundary: 'Chapter4 art subtree equals accepted pilot. This run does not relabel the old whole-manifest hash as current.'},
  capturePolicy: 'Actual current browser screenshots. No image edits. Reduced-motion static captures are separate from live motion and native wheel frames.'
};
const cropProofPath = new URL('reports/blank-design/final/expected-narrow-crop-bd2-stop07-edge.json', root);
const cropProof = await json(cropProofPath);
assert.equal(cropProof.canonicalSha256, expected);
assert.equal(cropProof.status, 'proved-outside-narrow-frustum');
assert.equal(cropProof.sampleCount, 1001); assert.equal(cropProof.intersectingSamples, 0);
assert(cropProof.minProjectedCornerX > 1);
report.expectedNarrowCrops = [{chapter: 2, viewportWidth: 360, id: 'bd2-stop07-edge',
  reason: 'Secondary low-right ending path lies outside the untouched narrow camera route. Preserve original route and world anchor; main gap06 path and subjects remain. This is the single explicitly reviewed crop, not a general coverage exemption.',
  proof: 'reports/blank-design/final/expected-narrow-crop-bd2-stop07-edge.json', proofSha256: sha(await readFile(cropProofPath)),
  sampledFrustumIntersections: 0, routeSamples: 1001, minProjectedCornerX: cropProof.minProjectedCornerX}];
if (option('resume')) {
  const path = new URL(option('resume').replace(/\\/g, '/'), root), previous = await json(path);
  assert.equal(previous.canonicalSha256, expected, 'Cannot resume evidence from another canonical');
  for (const field of ['pageErrors', 'consoleErrors', 'failedResources', 'failedRequests']) assert.deepEqual(previous[field], []);
  const checkImage = async item => assert.equal(sha(await readFile(new URL(item.image, output))), item.sha256, 'Resume screenshot bytes changed: ' + item.image);
  for (const entry of previous.viewports) for (const sample of entry.samples) await checkImage(sample);
  for (const entry of previous.continuous) { await checkImage(entry.endImage); await checkImage(entry.startImage); }
  report.viewports = previous.viewports; report.continuous = previous.continuous;
  report.interactions = previous.interactions; report.mediaTransitions = previous.mediaTransitions || [];
  report.resumedEvidence = {path: option('resume'), sha256: sha(await readFile(path)), canonicalSha256: expected,
    retainedViewportRuns: previous.viewports.length, retainedInteractionRuns: previous.interactions.length,
    retainedContinuousRuns: previous.continuous.length, screenshotHashesReverified: true,
    boundary: 'Only completed captures, controls and routes from the identical final canonical are retained; failed C2 narrow route and remaining chapter3 narrow run are rerun. No product source or scene assets changed between these attempts.'};
}
const save = () => writeFile(new URL('validation-runtime.json', output), JSON.stringify(report, null, 2) + '\n');
const verifyCanonical = async () => assert.equal(sha(await readFile(canonicalPath)), expected, 'Canonical changed during runtime acceptance; mixed batches are rejected');
const image = async filename => {
  const target = new URL(filename, output);
  await page.locator('.scene-viewport').screenshot({path: fileURLToPath(target)});
  return {image: filename, sha256: sha(await readFile(target))};
};

try {
  await vite.listen();
  const address = vite.resolvedUrls.local[0], origin = new URL(address).origin;
  report.server = {origin, watcherDisabled: true, portSelection: 'OS free port via project Vite configuration', otherServersTouched: false};
  const {prepareScene} = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const prepared = {};
  for (const chapter of [1, 2, 3, 4]) {
    const path = new URL(`public/assets/chapter-${chapter}/scene.json`, root);
    prepared[chapter] = prepareScene(await json(path), chapter);
  }
  browser = await chromium.launch({headless: true, executablePath: process.env.MDGS_TEST_BROWSER});
  page = await browser.newPage({viewport: {width: 1920, height: 1080}, reducedMotion: 'reduce'});
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  page.on('response', response => {
    if (new URL(response.url()).origin === origin && response.status() >= 400)
      report.failedResources.push({url: response.url(), status: response.status()});
  });
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin === origin && request.failure()?.errorText !== 'net::ERR_ABORTED')
      report.failedRequests.push({url: request.url(), failure: request.failure()});
  });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({body: '', contentType: 'text/css'}));
  await page.route('**/src/scene/SceneRenderer.ts', async route => {
    const response = await route.fetch(), code = await response.text();
    const marker = 'this.renderer.sortObjects = true;';
    assert(code.includes(marker), 'Renderer instrumentation point changed');
    await route.fulfill({response, body: code.replace(marker, marker + ' window.__blankRuntimeRenderer=this;')});
  });
  await page.goto(address);

  const progress = () => page.locator('canvas').evaluate(canvas => Number(canvas.dataset.progress));
  const ready = async chapter => {
    await page.waitForFunction(chapter => {
      const canvas = document.querySelector('canvas');
      return canvas?.dataset.chapter === String(chapter) && document.querySelector('.scene-viewport.is-ready') &&
        canvas.dataset.loadingTextures === '0' && canvas.dataset.queuedTextures === '0';
    }, chapter);
    await page.waitForTimeout(110);
    assert.equal(await page.locator('canvas').getAttribute('data-texture-failed'), '0');
  };
  const instrument = async chapter => {
    const layers = newByChapter[chapter];
    const staticState = await page.evaluate(layers => {
      const r = window.__blankRuntimeRenderer;
      if (!r.__runtimeInstrumented) {
        r.__runtimeInstrumented = true; r.__runtimeFrames = []; r.__runtimeDrawn = new Set();
        r.__runtimeMediaTrace = [];
        const trace = (source, state) => {
          r.__runtimeMediaTrace.push({now: performance.now(), source, ...state});
          if (r.__runtimeMediaTrace.length > 150) r.__runtimeMediaTrace.shift();
        };
        r.motionMedia.addEventListener('change', event => trace('renderer-media-change', {matches: event.matches}));
        const notify = r.emitMotionState.bind(r);
        r.emitMotionState = (...args) => { trace('subscriber-notification', r.getMotionState()); return notify(...args); };
        for (const object of r.objects.filter(object => layers.some(layer => layer.id === object.mesh.userData.artLayerId))) {
          const previous = object.mesh.onBeforeRender;
          object.mesh.onBeforeRender = function (...args) {
            r.__runtimeDrawn.add(object.mesh.userData.artLayerId);
            previous?.apply(this, args);
          };
        }
        const native = r.renderer.render.bind(r.renderer);
        r.renderer.render = (...args) => {
          r.__runtimeDrawn.clear(); native(...args);
          const d = r.motionDirector.getDiagnostics();
          r.__runtimeFrames.push({now: performance.now(), progress: r.progress, newDrawn: [...r.__runtimeDrawn],
            drawCalls: r.renderer.info.render.calls, activeMotionLayers: d.activeBindings,
            activeMotionNames: [...d.activeNames], effectiveMotionBudget: d.maxBindings,
            phase: d.phase, motionEnabled: r.getMotionState().enabled});
        };
      }
      const objects = r.objects.filter(object => layers.some(layer => layer.id === object.mesh.userData.artLayerId));
      const bound = r.motionDirector.bindings.filter(binding => objects.some(object => object.mesh === binding.mesh));
      return {ids: objects.map(object => object.mesh.userData.artLayerId),
        names: objects.map(object => object.mesh.name), boundNewLayers: bound.map(binding => binding.mesh.name),
        originalMotionBindingCount: r.motionDirector.bindings.length};
    }, layers);
    assert.deepEqual([...staticState.ids].sort(), layers.map(layer => layer.id).sort());
    assert.deepEqual(staticState.boundNewLayers, [], 'New blank-design scenery must remain static outside the light-motion budget');
    return staticState;
  };
  const select = async chapter => {
    await page.locator('.chapter-link').nth(chapter - 1).click();
    await ready(chapter); await instrument(chapter);
  };
  const render = async () => {
    await page.evaluate(() => { const r = window.__blankRuntimeRenderer; r.dirty = true; r.requestFrame(); });
    await page.waitForTimeout(50);
  };
  const seek = async (chapter, target) => {
    await page.locator('input[type=range]').evaluate((input, target) => {
      input.value = String(target); input.dispatchEvent(new Event('input', {bubbles: true}));
    }, target);
    await page.waitForFunction(target => Math.abs(Number(document.querySelector('canvas')?.dataset.progress) - target) < .0011, target);
    await ready(chapter); await render();
  };
  const state = () => page.evaluate(() => {
    const r = window.__blankRuntimeRenderer, host = document.querySelector('.scene-viewport'), rect = host.getBoundingClientRect();
    return {diagnostics: {...r.renderer.domElement.dataset}, frame: r.__runtimeFrames.at(-1),
      canvasCount: document.querySelectorAll('canvas').length,
      overflow: document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth,
      host: {width: rect.width, height: rect.height},
      calligraphy: r.calligraphy.artText.map(({config}) => ({id: config.id, title: config.title, lines: config.lines})),
      range: {value: document.querySelector('input[type=range]').value, text: document.querySelector('input[type=range]').getAttribute('aria-valuetext')},
      staticNewLayers: r.objects.filter(object => /^bd[1-4]-/.test(object.mesh.userData.artLayerId || '')).map(object => ({id: object.mesh.userData.artLayerId, matrix: object.mesh.matrix.toArray()}))};
  });
  const assertState = (chapter, sample) => {
    const revision = canonical.chapters[chapter];
    assert.equal(sample.canvasCount, 1); assert.equal(sample.overflow, false);
    assert.equal(Number(sample.diagnostics.chapter), chapter);
    assert.equal(Number(sample.diagnostics.artAddedLayers), revision.addedLayers.length);
    assert.equal(Number(sample.diagnostics.artTextLayers), revision.textLayers.length);
    assert.deepEqual(sample.calligraphy, revision.textLayers.map(({id, title, lines}) => ({id, title, lines})));
    assert.equal(sample.diagnostics.textureFailed, '0'); assert.equal(sample.diagnostics.contextLost, 'false');
    assert(Number(sample.diagnostics.drawCalls) > 0);
    assert(Number(sample.diagnostics.activeMotionLayers) <= Number(sample.diagnostics.effectiveMotionBudget));
    const newNames = new Set(newByChapter[chapter].map(layer => layer.name));
    assert(JSON.parse(sample.diagnostics.activeMotionNames).every(name => !newNames.has(name)));
  };
  const media = async reduced => {
    const before = await page.evaluate(() => ({chapter: window.__blankRuntimeRenderer.chapterId,
      matches: window.__blankRuntimeRenderer.motionMedia.matches,
      traceLength: window.__blankRuntimeRenderer.__runtimeMediaTrace?.length || 0}));
    await page.emulateMedia({reducedMotion: reduced ? 'reduce' : 'no-preference'});
    // Headless Chromium may update MQL.matches on an idle page without taking a
    // rendering opportunity to deliver its change event. A real browser visual
    // flush lets native MQL events/subscribers run; no app callback or disabled
    // attribute is changed by this test.
    await page.screenshot({animations: 'allow'});
    if (before.matches !== reduced) {
      const viewport = page.viewportSize();
      await page.setViewportSize({...viewport, width: viewport.width + 1});
      await page.setViewportSize(viewport);
      await page.screenshot({animations: 'allow'});
    }
    // Wait for the real MQL listener/subscriber and React button to agree.
    // A bare emulateMedia return only means the override was installed; rapid
    // overrides may coalesce before the rendering opportunity delivers change.
    await page.waitForFunction(reduced => {
      const r = window.__blankRuntimeRenderer, button = document.querySelector('.motion-button'), current = r.getMotionState();
      return r.motionMedia.matches === reduced && current.reducedMotion === reduced &&
        button.disabled === (reduced || !current.supported) &&
        r.renderer.domElement.dataset.reducedMotion === String(reduced);
    }, reduced);
    const after = await page.evaluate(length => ({matches: window.__blankRuntimeRenderer.motionMedia.matches,
      buttonDisabled: document.querySelector('.motion-button').disabled,
      trace: window.__blankRuntimeRenderer.__runtimeMediaTrace.slice(length)}), before.traceLength);
    report.mediaTransitions.push({chapter: before.chapter, requestedReduced: reduced, beforeMatches: before.matches,
      browserVisualFlush: 'page.screenshot plus native 1px viewport resize and restore for changed media; no manual MQL/renderer notification or UI override', ...after});
  };
  const freshPosition = async (chapter, target) => {
    // A real pointer-up glide can still be delivering nudge events after the
    // first successful drag delta. Let that gesture finish before starting a
    // separate slider action; otherwise its last nudge overwrites our reset.
    await page.evaluate(() => window.__blankRuntimeSettling = undefined);
    await page.waitForFunction(() => {
      const p = Number(document.querySelector('canvas')?.dataset.progress), now = performance.now();
      const previous = window.__blankRuntimeSettling;
      if (!previous || Math.abs(previous.progress - p) > .00001) {
        window.__blankRuntimeSettling = {progress: p, since: now}; return false;
      }
      return now - previous.since > 200;
    });
    await seek(chapter, target);
    await page.waitForTimeout(100);
  };
  const waitDelta = (before, sign) => page.waitForFunction(({before, sign}) =>
    (Number(document.querySelector('canvas')?.dataset.progress) - before) * sign > .002, {before, sign});
  const stableScreenshot = async (chapter, viewport, point) => {
    await seek(chapter, point.progress); const sample = await state(); assertState(chapter, sample);
    return {...point, actualProgress: Number(sample.diagnostics.progress), ...sample,
      ...await image(`runtime-c${chapter}-${viewport.width}-${point.kind}-${String(point.index).padStart(2, '0')}.png`)};
  };

  // Every new scenery mesh is independently absent from the real resolved
  // motion bindings, including C4 which reuses its accepted deep route evidence.
  for (const chapter of [1, 2, 3, 4]) {
    await select(chapter); report.staticNewLayers.push({chapter, ...await instrument(chapter), static: true});
  }
  await save();

  for (const viewport of [{width: 1920, height: 1080}, {width: 960, height: 700}, {width: 360, height: 800}]) {
    await verifyCanonical(); await page.setViewportSize(viewport);
    for (const chapter of [1, 2, 3]) {
      if (report.interactions.some(entry => entry.chapter === chapter && entry.viewport.width === viewport.width)) continue;
      await media(true); await select(chapter);
      const stops = prepared[chapter].stops;
      const points = [{kind: 'first', index: 1, progress: stops[0].progress},
        ...stops.slice(0, -1).map((stop, index) => ({kind: 'gap', index: index + 1, progress: (stop.progress + stops[index + 1].progress) / 2})),
        {kind: 'last', index: stops.length, progress: stops.at(-1).progress}];
      let captured = report.viewports.find(entry => entry.chapter === chapter && entry.viewport.width === viewport.width);
      if (!captured) {
        const samples = [];
        for (const point of points) samples.push(await stableScreenshot(chapter, viewport, point));
        captured = {chapter, viewport, sampleCount: samples.length, samples};
        report.viewports.push(captured); await save();
      }
      console.log(`C${chapter} ${viewport.width}: ${captured.samples.length} gap/first/last captures passed (SHA-checked if resumed).`);
      if (chapter === 2 && viewport.width === 360) {
        const layer = newByChapter[2].find(layer => layer.id === 'bd2-stop07-edge');
        await seek(chapter, layer.blankDesign.progress);
        const evidence = await page.evaluate(id => {
          const r = window.__blankRuntimeRenderer, target = r.objects.find(object => object.mesh.userData.artLayerId === id);
          const actual = r.frustum.clone().setFromProjectionMatrix(r.camera.projectionMatrix.clone().multiply(r.camera.matrixWorldInverse));
          target.mesh.geometry.computeBoundingSphere();
          const sphere = target.mesh.geometry.boundingSphere.clone().applyMatrix4(target.mesh.matrixWorld);
          const positions = target.mesh.geometry.getAttribute('position');
          const corners = Array.from({length: positions.count}, (_, index) => r.camera.position.clone()
            .fromBufferAttribute(positions, index).applyMatrix4(target.mesh.matrixWorld).project(r.camera).toArray());
          return {progress: r.progress, textureLoaded: !!target.material.map, meshVisible: target.mesh.visible,
            explicitlyHidden: !!target.mesh.userData.artHidden, actualFrustumIntersects: actual.intersectsObject(target.mesh),
            projectedCornersNdc: corners, worldSphere: {center: sphere.center.toArray(), radius: sphere.radius},
            camera: {aspect: r.camera.aspect, fov: r.camera.fov, position: r.camera.position.toArray()},
            diagnostics: {...r.renderer.domElement.dataset}};
        }, layer.id);
        assert(evidence.textureLoaded && evidence.meshVisible && !evidence.explicitlyHidden);
        assert.equal(evidence.actualFrustumIntersects, false); assert(evidence.projectedCornersNdc.every(corner => corner[0] > 1));
        report.expectedNarrowCrops[0].browserAnchorEvidence = evidence;
      }

      const actions = [], scene = page.locator('.scene-viewport');
      await media(false);
      await freshPosition(chapter, .2); await scene.scrollIntoViewIfNeeded(); let box = await scene.boundingBox();
      let before = await progress(); await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
      await page.mouse.wheel(0, 180); await waitDelta(before, 1); actions.push('native-wheel');
      await freshPosition(chapter, .2); await scene.scrollIntoViewIfNeeded(); box = await scene.boundingBox(); before = await progress();
      await page.mouse.move(box.x + box.width * .72, box.y + box.height * .5); await page.mouse.down();
      await page.mouse.move(box.x + box.width * .30, box.y + box.height * .5, {steps: 10}); await page.mouse.up();
      await waitDelta(before, 1); actions.push('native-pointer-drag');
      await freshPosition(chapter, .33); before = await progress(); await scene.focus(); await page.keyboard.press('ArrowRight');
      await waitDelta(before, 1); actions.push('scene-keyboard-right');
      await freshPosition(chapter, .33); before = await progress(); await scene.focus(); await page.keyboard.press('ArrowLeft');
      await waitDelta(before, -1); actions.push('scene-keyboard-left');
      await freshPosition(chapter, .33); before = await progress(); await page.getByRole('button', {name: '下一分镜', exact: true}).click();
      await waitDelta(before, 1); actions.push('next-scene');
      await freshPosition(chapter, .5); before = await progress(); await page.getByRole('button', {name: '上一分镜', exact: true}).click();
      await waitDelta(before, -1); actions.push('previous-scene');
      await page.getByRole('button', {name: '游观至' + stops[2].name, exact: true}).click();
      await page.waitForFunction(target => Math.abs(Number(document.querySelector('canvas')?.dataset.progress) - target) < .0011, stops[2].progress);
      actions.push('story-stop-button');
      await freshPosition(chapter, .3); before = await progress();
      await page.getByRole('button', {name: '自动展卷', exact: true}).click(); await waitDelta(before, 1);
      await page.getByRole('button', {name: '暂停展卷', exact: true}).click(); await page.waitForTimeout(900);
      const pausedA = await progress(); await page.waitForTimeout(250); const pausedB = await progress();
      assert(Math.abs(pausedA - pausedB) < .0002); actions.push('autoplay-and-pause-stable');
      await page.getByRole('button', {name: '打开文化解读', exact: true}).click();
      const dialog = page.getByRole('dialog'); await dialog.waitFor();
      assert(await page.getByRole('button', {name: '关闭文化解读', exact: true}).evaluate(el => el === document.activeElement));
      const focusTrap = await dialog.evaluate(panel => {
        const selectors = 'a[href],button:not([disabled]),input:not([disabled]),summary,[tabindex="0"]';
        const elements = [...panel.querySelectorAll(selectors)]; elements.at(-1).focus(); return elements.length;
      });
      await page.keyboard.press('Tab');
      assert(await page.getByRole('button', {name: '关闭文化解读', exact: true}).evaluate(el => el === document.activeElement));
      await page.keyboard.press('Shift+Tab'); assert(await dialog.evaluate(panel => panel.contains(document.activeElement)));
      await page.keyboard.press('Escape'); await dialog.waitFor({state: 'hidden'});
      assert(await page.getByRole('button', {name: '打开文化解读', exact: true}).evaluate(el => el === document.activeElement));
      actions.push('drawer-open-tab-trap-escape-focus-return');

      await freshPosition(chapter, .4);
      const motion = page.getByRole('button', {name: '画中轻动', exact: true});
      if (await motion.getAttribute('aria-pressed') === 'false') await motion.click();
      await page.waitForFunction(() => document.querySelector('.motion-button')?.getAttribute('aria-pressed') === 'true');
      const liveA = await state(); await page.waitForTimeout(250); const liveB = await state();
      assert.deepEqual(liveA.staticNewLayers, liveB.staticNewLayers, 'Designed ground meshes moved while light motion ran');
      assertState(chapter, liveB); actions.push('motion-on-new-scenery-stays-static');
      await motion.click(); await page.waitForFunction(() => document.querySelector('.motion-button')?.getAttribute('aria-pressed') === 'false');
      await page.waitForTimeout(200); const offA = await state(); await page.waitForTimeout(220); const offB = await state();
      assert.equal(offA.diagnostics.motionTime, offB.diagnostics.motionTime); actions.push('motion-off-freezes-clock');
      await media(true); await seek(chapter, 0);
      assert(await motion.isDisabled()); actions.push('system-reduced-motion-static');
      await page.locator('input[type=range]').focus(); await page.keyboard.press('End');
      await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.progress) > .995);
      await page.keyboard.press('Home'); await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.progress) < .005);
      actions.push('range-keyboard-end-home');

      if (viewport.width !== 960) {
        await media(false);
        await freshPosition(chapter, 0); await scene.scrollIntoViewIfNeeded(); box = await scene.boundingBox();
        await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
        await page.evaluate(() => window.__blankRuntimeRenderer.__runtimeFrames = []);
        for (let i = 0; i < 64; i++) { await page.mouse.wheel(0, 130); await page.waitForTimeout(20); }
        await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.progress) > .995); await ready(chapter); await render();
        const forward = await page.evaluate(() => window.__blankRuntimeRenderer.__runtimeFrames);
        assert(forward.length > 30); assert(Math.min(...forward.map(frame => frame.progress)) < .1);
        assert(Math.max(...forward.map(frame => frame.progress)) > .99);
        const endImage = await image(`runtime-c${chapter}-${viewport.width}-wheel-end.png`);
        const heading = await page.locator('.end-colophon h2').boundingBox(); assert(heading);
        const hit = await page.evaluate(({x, y}) => ({insidePainting: !!document.elementFromPoint(x, y)?.closest('.scene-viewport'),
          cardPointerEvents: getComputedStyle(document.querySelector('.end-colophon')).pointerEvents}), {x: heading.x + heading.width / 2, y: heading.y + heading.height / 2});
        assert(hit.insidePainting); assert.equal(hit.cardPointerEvents, 'none');
        await page.mouse.move(heading.x + heading.width / 2, heading.y + heading.height / 2);
        await page.mouse.down(); await page.mouse.move(heading.x + heading.width / 2 + box.width * .15, heading.y + heading.height / 2, {steps: 8});
        await page.mouse.up(); await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.progress) < .99);
        actions.push('ending-card-text-drag-through');
        await freshPosition(chapter, 1); await scene.scrollIntoViewIfNeeded(); box = await scene.boundingBox();
        await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
        await page.evaluate(() => window.__blankRuntimeRenderer.__runtimeFrames = []);
        for (let i = 0; i < 64; i++) { await page.mouse.wheel(0, -130); await page.waitForTimeout(20); }
        await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.progress) < .005); await ready(chapter); await render();
        const reverse = await page.evaluate(() => window.__blankRuntimeRenderer.__runtimeFrames);
        assert(reverse.length > 30); assert(Math.min(...reverse.map(frame => frame.progress)) < .01);
        assert(Math.max(...reverse.map(frame => frame.progress)) > .9);
        const drawn = [...new Set([...forward, ...reverse].flatMap(frame => frame.newDrawn))];
        const missing = newByChapter[chapter].filter(layer => !drawn.includes(layer.id)).map(layer => layer.id);
        const allowedCrops = report.expectedNarrowCrops.filter(crop => crop.chapter === chapter && crop.viewportWidth === viewport.width).map(crop => crop.id);
        const unexpectedMissing = missing.filter(id => !allowedCrops.includes(id));
        report.continuous.push({chapter, viewport, input: 'native mouse.wheel', wheelEventsEachDirection: 64,
          route: 'Full prepareScene original reading route, no seek used inside either sweep',
          forwardFrames: forward.length, reverseFrames: reverse.length, newDrawn: drawn, missingNewLayers: missing,
          expectedNarrowCrops: allowedCrops, unexpectedMissingNewLayers: unexpectedMissing,
          endingCardHit: hit, forward, reverse, endImage, startImage: await image(`runtime-c${chapter}-${viewport.width}-wheel-start.png`)});
        await save();
        assert.deepEqual(unexpectedMissing, [], `C${chapter} ${viewport.width}: unexpected new layers never submitted in either real wheel direction`);
        actions.push('full-route-wheel-forward-reverse-all-new-layer-submissions');
      }
      await media(true); await seek(chapter, .25);
      await page.getByRole('button', {name: '进入全屏', exact: true}).click(); await page.waitForFunction(() => document.fullscreenElement !== null);
      await page.getByRole('button', {name: '退出全屏', exact: true}).click(); await page.waitForFunction(() => document.fullscreenElement === null);
      await ready(chapter); actions.push('fullscreen-enter-exit');
      const final = await state(); assertState(chapter, final);
      report.interactions.push({chapter, viewport, actions, autoplayPause: {pausedA, pausedB}, drawerFocusableElements: focusTrap,
        motionOff: {a: offA.diagnostics, b: offB.diagnostics}, liveMotion: liveB.diagnostics, final});
      await verifyCanonical(); await save(); console.log(`C${chapter} ${viewport.width}: controls${viewport.width !== 960 ? ' + full bidirectional wheel route' : ''} passed.`);
    }
  }

  // Current-revision smoke in all four chapters: navigation, progress, load,
  // single canvas, unchanged captions, still-static new scenery and replay.
  await page.setViewportSize({width: 960, height: 700});
  for (const chapter of [4, 1, 3, 2, 4]) {
    await media(true); await select(chapter); await seek(chapter, .5);
    const current = await state(); assertState(chapter, current);
    await seek(chapter, 1); await page.getByRole('button', {name: '再观此卷', exact: true}).click();
    await page.waitForFunction(() => Number(document.querySelector('canvas')?.dataset.progress) < .001); await ready(chapter);
    report.fourChapterSmoke.push({chapter, navigationPassed: true, replayPassed: true, state: current,
      ...await image(`runtime-smoke-c${chapter}-${report.fourChapterSmoke.length + 1}.png`)});
  }
  await verifyCanonical(); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.failedResources, []); assert.deepEqual(report.failedRequests, []);
  assert.equal(report.viewports.reduce((count, viewport) => count + viewport.samples.length, 0), 102);
  assert.equal(report.continuous.length, 6); assert.equal(report.interactions.length, 9);
  assert.equal(report.staticNewLayers.reduce((count, chapter) => count + chapter.ids.length, 0), 45);
  report.status = 'passed'; report.finishedAt = new Date().toISOString(); report.mixedRevision = false;
  report.summary = {stableScreenshots: 102, wheelSweeps: 12, interactionRuns: 9, staticNewLayers: 45,
    chapter4PilotViewsReused: 62, fourChapterSmokeVisits: 5, actualDrawSubmission: true,
    framebufferContributionClaimedHere: false, artisticAcceptanceClaimedHere: false};
  await save(); console.log('Final blank-design runtime passed: 102 fresh views, 12 full native-wheel sweeps, 9 responsive control runs and four-chapter smoke.');
} catch (error) {
  report.status = 'failed'; report.failure = String(error.stack || error);
  if (page) try {
    report.failureState = await page.evaluate(() => ({canvases: [...document.querySelectorAll('canvas')].map(canvas => ({...canvas.dataset})),
      overflow: document.documentElement.scrollWidth > innerWidth, status: document.querySelector('.scene-loading')?.textContent,
      motionState: window.__blankRuntimeRenderer?.getMotionState(), mediaTrace: window.__blankRuntimeRenderer?.__runtimeMediaTrace,
      motionButton: {disabled: document.querySelector('.motion-button')?.disabled, title: document.querySelector('.motion-button')?.title}}));
    const filename = 'runtime-failure.png'; await page.screenshot({path: fileURLToPath(new URL(filename, output)), fullPage: true});
    report.failureImage = filename;
  } catch { /* Keep the primary assertion if the page has already closed. */ }
  await save(); throw error;
} finally {
  await browser?.close(); await vite.close();
}

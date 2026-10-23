/** Extra desktop scaling coverage; no OS settings, product files or native references are changed. */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), dist = path.resolve(root, process.env.MDGS_DPR_DIST || 'tmp/art-candidate-3-dist');
const runId = new Date().toISOString().replace(/[:.]/g, '-'), directory = path.join(__dirname, 'desktop-dpr-runs', runId);
const target = path.join(directory, 'validation.json'), alias = path.join(__dirname, 'desktop-dpr-validation.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), portable = file => path.relative(root, file).split(path.sep).join('/');
const report = { status: 'running', runId, startedAt: new Date().toISOString(), productionDirectory: portable(dist),
  scope: 'Additional representative desktop DPR checks using real Chromium deviceScaleFactor, not a change to Windows display settings. CSS1536x864 at DPR1.25 and CSS1280x720 at DPR1.5/2; matched DPR1 controls. First/fourth native-aspect paper, handoff, text/controls, projected anchor layout; one nonzero resumed-frame and one resizing path. Existing native-pixel thresholds are neither invoked nor relaxed here.',
  checks: [], errors: [], baselines: {} };
let browser, server, currentPage;
const save = () => fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name); assert(!entry.isSymbolicLink(), 'Unexpected link: ' + portable(file));
    if (entry.isDirectory()) files.push(...await walk(file)); else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}
async function inputs() {
  const files = [...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'public')), __filename,
    ...['index.html', 'vite.config.ts', 'package.json', 'package-lock.json'].map(file => path.join(root, file))];
  const result = {}; let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (next < files.length) { const file = files[next++]; result[portable(file)] = sha(await fs.readFile(file)); } }));
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
const phase = (page, value) => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 60000 });
async function check(test, action) {
  const evidence = { test };
  try { await action(evidence); evidence.passed = true; }
  catch (error) {
    evidence.passed = false; evidence.error = error.stack || String(error);
    await currentPage?.screenshot({ path: path.join(directory, test + '-failed.png') }).catch(() => {});
  }
  report.checks.push(evidence); await save(); console.log((evidence.passed ? 'PASS ' : 'FAIL ') + test);
}
async function instrument(page) {
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.errors.push('HTTP ' + response.status() + ' ' + response.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('guose-fanghua:painting-motion', 'off');
    window.__dprSamples = [];
    function sample() {
      const element = document.querySelector('.art-loading');
      if (element) {
        const data = element.dataset;
        window.__dprSamples.push({ at: performance.now(), phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,
          open: Number(data.unfurl), vertices: Number(data.paperVertices), z: Number(data.paperZRange), ready: data.presentationReady,
          error: Number(data.handoffError), state: data.handoffState, aspect: Number(data.paintingAspect),
          rect: data.handoffRect ? JSON.parse(data.handoffRect) : null, target: data.handoffTarget ? JSON.parse(data.handoffTarget) : null });
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
}
async function inspect(page, evidence, prefix, expectedDpr, chapter) {
  const data = await page.evaluate(() => {
    const canvas = document.querySelector('.painting canvas'), bounds = canvas.getBoundingClientRect();
    return { dpr: devicePixelRatio, canvas: { ...canvas.dataset }, bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      buffer: { width: canvas.width, height: canvas.height }, client: { width: canvas.clientWidth, height: canvas.clientHeight }, samples: window.__dprSamples,
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
      controls: [...document.querySelectorAll('.brand,.settings-button,.fullscreen-button,.chapter-link,.scroll-controls button,.scroll-controls input')].filter(element => element.getClientRects().length && !element.disabled).map(element => {
        const rect = element.getBoundingClientRect(); return { name: element.getAttribute('aria-label') || element.textContent.trim(), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }) };
  });
  assert.equal(data.dpr, expectedDpr); assert(data.horizontalOverflow <= 1, 'No horizontal page overflow at the desktop scaling.');
  const viewport = page.viewportSize();
  assert(data.controls.every(rect => rect.x >= -1 && rect.y >= -1 && rect.x + rect.width <= viewport.width + 1 && rect.y + rect.height <= viewport.height + 1), 'Visible desktop controls must fit the viewport.');
  const source = JSON.parse(data.canvas.sourceViewport), aspect = chapter === 4 ? 1.4 : 16 / 9;
  assert(Math.abs(source.width / source.height - aspect) / aspect < .0015, 'The source camera gate retains the native artwork aspect.');
  assert(source.x >= -.01 && source.y >= -.01 && source.x + source.width <= data.client.width + 1 && source.y + source.height <= data.client.height + 1);
  const aligned = data.samples.filter(sample => sample.state === 'aligned');
  assert(aligned.length > 1 && aligned.every(sample => sample.error < .01), 'The DPR handoff must align to the actual CSS source gate.');
  assert(data.samples.some(sample => sample.open < .1 && sample.vertices >= 4000 && sample.z > .1));
  assert(data.samples.some(sample => sample.open > .4 && sample.open < .8 && sample.vertices >= 4000));
  assert(data.samples.some(sample => sample.open > .999 && sample.vertices >= 4000));
  evidence.source = { ...data, samples: undefined }; evidence.alignedSamples = aligned; evidence.physicalSamples = data.samples.filter((_, index) => index % 12 === 0);
  await page.screenshot({ path: path.join(directory, prefix + '-native.png') });
}
async function encounter(page, evidence, prefix, baselineKey, compare) {
  await page.locator('.art-encounter-entrance').click();
  await page.locator('.art-anchor').first().waitFor(); await page.waitForTimeout(650);
  const geometry = await page.evaluate(() => {
    const host = document.getElementById('scroll-artwork'), bounds = host.getBoundingClientRect();
    const convert = rect => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    return { host: convert(bounds), anchors: [...document.querySelectorAll('.art-anchor')].map(button => {
      const rect = button.getBoundingClientRect(), eye = button.querySelector('.art-anchor__eye').getBoundingClientRect();
      return { name: button.getAttribute('aria-label'), x: parseFloat(button.style.left) / 100, y: parseFloat(button.style.top) / 100,
        center: { x: eye.x + eye.width / 2, y: eye.y + eye.height / 2 }, bounds: convert(rect) };
    }), papers: [...document.querySelectorAll('.art-paper')].map(element => convert(element.getBoundingClientRect())) };
  });
  assert(geometry.anchors.length > 0);
  for (const anchor of geometry.anchors) {
    const x = geometry.host.x + geometry.host.width * anchor.x, y = geometry.host.y + geometry.host.height * anchor.y;
    assert(Math.hypot(anchor.center.x - x, anchor.center.y - y) < .75, 'Visible anchor eye must sit at its actual projected CSS position.');
    assert(anchor.center.x >= geometry.host.x && anchor.center.x <= geometry.host.x + geometry.host.width && anchor.center.y >= geometry.host.y && anchor.center.y <= geometry.host.y + geometry.host.height);
  }
  assert(geometry.papers.every(rect => rect.x >= geometry.host.x - 1 && rect.y >= geometry.host.y - 1 && rect.x + rect.width <= geometry.host.x + geometry.host.width + 1 && rect.y + rect.height <= geometry.host.y + geometry.host.height + 1), 'The encounter reading paper remains within the artwork.');
  if (compare) {
    const baseline = report.baselines[baselineKey]; assert(baseline, 'A matching CSS-viewport DPR1 control is required.');
    assert.deepEqual(geometry.anchors.map(anchor => anchor.name), baseline.anchors.map(anchor => anchor.name));
    evidence.maximumAnchorDriftCss = Math.max(...geometry.anchors.map((anchor, index) => Math.hypot((anchor.x - baseline.anchors[index].x) * geometry.host.width, (anchor.y - baseline.anchors[index].y) * geometry.host.height)));
    assert(evidence.maximumAnchorDriftCss < .75, 'Fractional DPR must not move the source-projected anchors relative to a matched DPR1 control.');
  } else report.baselines[baselineKey] = geometry;
  evidence.encounter = geometry; await page.screenshot({ path: path.join(directory, prefix + '-encounter.png') });
  await page.getByRole('button', { name: '收起画中有遇', exact: true }).click();
}
async function entry(browser, chapter, viewport, dpr, baseline) {
  const prefix = `c${chapter}-${viewport.width}x${viewport.height}-dpr${dpr}`, context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  const page = currentPage = await context.newPage(); await instrument(page);
  await check(prefix, async evidence => {
    await page.goto(report.url + '#chapter-' + chapter); await phase(page, 'SCROLL_LOADING');
    await page.waitForFunction(() => Number(document.querySelector('.art-loading')?.dataset.unfurl) > .45 && Number(document.querySelector('.art-loading')?.dataset.unfurl) < .8);
    await page.screenshot({ path: path.join(directory, prefix + '-thin-paper.png') });
    await phase(page, 'SCROLL_VIEWER'); await inspect(page, evidence, prefix, dpr, chapter);
    await encounter(page, evidence, prefix, `c${chapter}-${viewport.width}x${viewport.height}`, !baseline);
  });
  await context.close();
}
async function seek(page, progress) {
  await page.locator('input[aria-label="画卷游观进度"]').evaluate((input, progress) => {
    input.step = 'any'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(progress));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, progress);
  await page.waitForFunction(progress => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - progress) < 1e-8, progress);
}
(async () => {
  await fs.mkdir(directory, { recursive: true }); await save(); report.inputsBefore = await inputs(); report.build = {};
  for (const file of (await walk(dist)).filter(file => /\.(?:html|js|css)$/.test(file))) report.build[path.relative(dist, file).split(path.sep).join('/')] = sha(await fs.readFile(file));
  const { preview } = await import('vite'); server = await preview({ root, build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  report.url = server.resolvedUrls.local[0]; browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] }); report.browserVersion = browser.version();
  for (const viewport of [{ width: 1536, height: 864 }, { width: 1280, height: 720 }]) for (const chapter of [1, 4]) await entry(browser, chapter, viewport, 1, true);
  for (const configuration of [{ dpr: 1.25, viewport: { width: 1536, height: 864 } }, { dpr: 1.5, viewport: { width: 1280, height: 720 } }, { dpr: 2, viewport: { width: 1280, height: 720 } }])
    for (const chapter of [1, 4]) await entry(browser, chapter, configuration.viewport, configuration.dpr, false);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 }), page = currentPage = await context.newPage();
  await instrument(page);
  await check('dpr1.5-nonzero-c4-return-and-reentry', async evidence => {
    await page.goto(report.url + '#chapter-4'); await phase(page, 'SCROLL_VIEWER'); await seek(page, .65);
    await page.getByRole('button', { name: '返回序厅', exact: true }).click(); await phase(page, 'HOME');
    await page.evaluate(() => { window.__dprSamples = []; }); await page.locator('.study-entry-button[data-chapter-id="4"]').click();
    await phase(page, 'SCROLL_LOADING'); await page.waitForFunction(() => document.querySelector('.art-loading')?.dataset.presentationReady === 'true' && Number(document.querySelector('.art-loading')?.dataset.unfurl) > .999);
    evidence.preview = await page.locator('.art-loading').evaluate(async element => {
      const image = element.querySelector('.art-loading__handoff'); await image.decode();
      return { ...element.dataset, width: image.naturalWidth, height: image.naturalHeight };
    });
    assert(evidence.preview.paintingSrc.startsWith('blob:')); assert(Math.abs(Number(evidence.preview.previewProgress) - .65) < 1e-6);
    assert(evidence.preview.width <= 1920 && Math.abs(evidence.preview.width / evidence.preview.height - 1.4) < .001);
    await page.screenshot({ path: path.join(directory, 'dpr1.5-resumed-paper.png') });
    await phase(page, 'SCROLL_VIEWER'); assert(Math.abs(Number(await page.locator('.painting canvas').getAttribute('data-progress')) - .65) < 1e-8);
    await inspect(page, evidence, 'dpr1.5-resumed', 1.5, 4);
  });
  await context.close();
  const resizeContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }), resizePage = currentPage = await resizeContext.newPage();
  await instrument(resizePage);
  await check('dpr2-resize-during-c4-thin-unroll', async evidence => {
    await resizePage.goto(report.url + '#chapter-4'); await phase(resizePage, 'SCROLL_LOADING');
    await resizePage.waitForFunction(() => Number(document.querySelector('.art-loading')?.dataset.unfurl) > .45);
    await resizePage.setViewportSize({ width: 1920, height: 1080 }); await phase(resizePage, 'SCROLL_VIEWER');
    await inspect(resizePage, evidence, 'dpr2-resized', 2, 4); await encounter(resizePage, evidence, 'dpr2-resized', 'extra-resized-control', false);
  });
  await resizeContext.close(); report.inputsAfter = await inputs(); assert.deepEqual(report.inputsAfter, report.inputsBefore); report.inputsUnchanged = true;
  assert.deepEqual(report.errors, []); assert.equal(report.checks.length, 12); report.status = report.checks.every(check => check.passed) ? 'passed' : 'failed';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); })
  .finally(async () => {
    await Promise.allSettled([browser?.close(), server?.close()]); report.completedAt = new Date().toISOString(); report.artifacts = {};
    for (const file of await fs.readdir(directory)) if (file !== 'validation.json') report.artifacts[file] = sha(await fs.readFile(path.join(directory, file)));
    await save(); await fs.copyFile(target, alias); console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter(check => !check.passed).map(check => ({ test: check.test, error: check.error })), errors: report.errors }));
    if (report.status !== 'passed') process.exitCode = 1;
  });

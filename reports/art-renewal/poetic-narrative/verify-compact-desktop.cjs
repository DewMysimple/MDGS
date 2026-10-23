/* Frozen production only. Additional compact-layout evidence at the user's
   approximate desktop viewport and DPR; no CSS injection or product mocks. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), vm = require('node:vm'), ts = require('typescript');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..'); process.chdir(root);
const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
for (const name of ['--build-dir', '--freeze-file', '--report-dir', '--url']) if (!option(name)) throw new Error(`Required ${name}`);
const build = path.resolve(root, option('--build-dir')), freezeFile = path.resolve(root, option('--freeze-file')), output = path.resolve(root, option('--report-dir')), base = option('--url');
fs.mkdirSync(output, { recursive: true });
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex'), relative = file => path.relative(root, file).replaceAll('\\', '/');
const freeze = JSON.parse(fs.readFileSync(freezeFile, 'utf8'));
if (path.resolve(root, freeze.directory) !== build) throw new Error('Freeze directory must match explicit build');
function frozenSource() { return Object.fromEntries(Object.keys(freeze.sourceInputs).map(file => [file, sha(fs.readFileSync(path.join(root, file)))])); }
function frozenCode() { return Object.fromEntries(Object.keys(freeze.code).map(file => [file, sha(fs.readFileSync(path.join(build, file)))])); }
const before = frozenSource(), codeBefore = frozenCode();
if (Object.keys(before).some(file => before[file] !== freeze.sourceInputs[file]) || Object.keys(codeBefore).some(file => codeBefore[file] !== freeze.code[file])) throw new Error('Frozen source or code mismatch before run');
const exportsPoetic = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/poeticNarrative.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsPoetic });
const scenes = Object.fromEntries([1, 2, 3, 4].map(id => {
  const bytes = fs.readFileSync(path.join(build, `assets/new-scrolls/chapter-${id}/scene.json`)), scene = JSON.parse(bytes), r = scene.render;
  return [id, { sha256: sha(bytes), aspect: r.width * r.pixelAspectX / (r.height * r.pixelAspectY), track: exportsPoetic.buildPoeticTrack(id, scene.stops, scene.sourceDurationSeconds) }];
}));
const report = { status: 'running', scope: 'Additional frozen compact-desktop layout: all 45 poetic captions at 2042x1083 CSS/DPR1.25 and padding12/24; four real colophons at three CSS sizes/DPR1.25; four real art encounters at user viewport. This is functional geometry plus actual screenshots for separate artistic review, not a performance benchmark or automatic semantic occlusion proof.', startedAt: new Date().toISOString(), buildDirectory: relative(build), freezeFile: relative(freezeFile), freezeSha256: sha(fs.readFileSync(freezeFile)), driver: relative(__filename), driverSha256: sha(fs.readFileSync(__filename)), sourceHashesBefore: before, codeBefore, checks: [], captions: [], colophons: [], encounters: [], screenshots: [], errors: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });

(async () => {
  let browser, page;
  try {
    browser = await chromium.launch({ ...(process.env.MDGS_TEST_BROWSER ? { executablePath: process.env.MDGS_TEST_BROWSER } : {}), headless: true });
    report.browser = browser.version();
    const cdp = await browser.newBrowserCDPSession(); report.gpu = (await cdp.send('SystemInfo.getInfo')).gpu; await cdp.detach();
    page = await browser.newPage({ viewport: { width: 2042, height: 1083 }, deviceScaleFactor: 1.25, reducedMotion: 'reduce' });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
    const response = await page.goto(base), html = await response.text();
    check('production HTML has no Vite HMR client', !html.includes('/@vite/client'));
    const htmlBytes = await response.body(); check('actual HTTP HTML equals frozen build', sha(htmlBytes) === freeze.code['index.html']);
    report.httpCode = [];
    const urls = await page.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(es => es.map(e => e.getAttribute('src') || e.getAttribute('href')));
    for (const url of urls) { const r = await page.request.get(new URL(url, base).href), hash = sha(await r.body()), file = url.replace(/^\.\//, '').replace(/^\//, ''); report.httpCode.push({ url, status: r.status(), sha256: hash }); check(`HTTP ${file} equals frozen code`, r.status() === 200 && freeze.code[file] === hash); }
    await page.getByRole('button', { name: /^展开第壹卷/ }).click({ timeout: 90000 });
    async function chapter(id) {
      const current = await page.locator('#scroll-artwork canvas').getAttribute('data-chapter').catch(() => '');
      if (current !== String(id)) await page.getByRole('button', { name: new RegExp('^第' + ['一', '二', '三', '四'][id - 1] + '卷，') }).click();
      await page.waitForFunction(id => document.querySelector('#scroll-artwork canvas')?.dataset.chapter === String(id) && document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', id, { timeout: 90000 });
      await page.evaluate(() => document.fonts.ready);
    }
    async function range(selector, value) { await page.locator(selector).evaluate((e, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, String(value)); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, value); }
    async function configure(padding) {
      await page.getByRole('button', { name: '打开设置', exact: true }).click();
      await page.locator('input[name="narrative-mode"][value="poetic"]').check(); await range('#text-plate-padding', padding);
      await page.getByRole('button', { name: '完成', exact: true }).click();
    }
    async function seek(progress, cue) {
      await range('input[aria-label="画卷游观进度"]', progress);
      await page.waitForFunction(({ progress, cue }) => {
        const c = document.querySelector('#scroll-artwork canvas'), n = document.querySelector('.narrative-calligraphy');
        return c && Math.abs(Number(c.dataset.progress) - progress) < .0011 && c.dataset.loadingTextures === '0' && c.dataset.queuedTextures === '0' && (!cue || n?.dataset.cueId === cue && n?.dataset.placementReady === 'true' && n.querySelector('.is-visible') && c.dataset.narrativeReadPending === 'false' && Math.floor(Number(c.dataset.narrativeReadProgress) * 24) === Math.floor(Number(c.dataset.progress) * 24));
      }, { progress, cue }, { timeout: 90000 });
      await page.waitForTimeout(250);
    }
    async function shot(name) { const file = `${name}.png`; await page.screenshot({ path: path.join(output, file) }); const bytes = fs.readFileSync(path.join(output, file)); report.screenshots.push({ file, sha256: sha(bytes), physicalWidth: bytes.readUInt32BE(16), physicalHeight: bytes.readUInt32BE(20) }); return file; }
    async function measure(selector) {
      return page.evaluate(selector => {
        const box = e => e?.getBoundingClientRect().toJSON(), painting = box(document.querySelector('#scroll-artwork')), root = document.querySelector(selector), bounds = box(root);
        const outside = (r, b) => r.x < b.x - .8 || r.y < b.y - .8 || r.right > b.right + .8 || r.bottom > b.bottom + .8;
        const glyphs = [];
        if (root) {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) { const node = walker.currentNode, parent = node.parentElement; if (!parent || getComputedStyle(parent).visibility === 'hidden' || parent.closest('svg')) continue; let start = 0; for (const char of node.textContent) { const end = start + char.length; if (!/\s/u.test(char)) { const r = document.createRange(); r.setStart(node, start); r.setEnd(node, end); for (const rect of r.getClientRects()) if (rect.width && rect.height) glyphs.push({ char, parent: parent.tagName, ...rect.toJSON() }); } start = end; } }
        }
        const canvas = document.querySelector('#scroll-artwork canvas'), native = JSON.parse(canvas.dataset.sourceViewport);
        const ink = document.querySelector('.narrative-passage.is-visible .narrative-ink'), pbox = box(ink?.querySelector('p')), hbox = box(ink?.querySelector('h2')), seal = box(ink?.querySelector('.narrative-small-seal'));
        const intersects = (a, b) => a && b && a.x < b.right - .8 && a.right > b.x + .8 && a.y < b.bottom - .8 && a.bottom > b.y + .8;
        const bodyGlyphs = selector.includes('narrative') ? glyphs.filter(g => g.parent === 'P') : [];
        const heading = root?.querySelector('h2'), headingGlyphs = glyphs.filter(g => g.parent === 'H2');
        const headingWritingMode = heading && getComputedStyle(heading).writingMode;
        const headingLines = new Map(); if (headingWritingMode === 'horizontal-tb') for (const g of headingGlyphs) { const key = Math.round(g.y); headingLines.set(key, (headingLines.get(key) || '') + g.char); }
        const controlSelectors = ['.brand', '.chapter-nav', '.settings-button', '.fullscreen-button', '.current-scene', '.chapter-timeline', '.progress-caption', '.playback-controls', '.secondary-controls'];
        const controls = controlSelectors.map(selector => ({ selector, box: box(document.querySelector(selector)) }));
        const overlaps = [];
        for (const group of [controls.slice(0, 4), controls.slice(4)]) for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) if (intersects(group[a].box, group[b].box)) overlaps.push([group[a].selector, group[b].selector]);
        return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, painting, sourceViewport: native, sourceGate: { x: painting.x + native.x, y: painting.y + native.y, width: native.width, height: native.height }, bounds, glyphCount: glyphs.length, glyphOverflow: bounds ? glyphs.filter(g => outside(g, bounds)) : [], glyphPaintingOverflow: glyphs.filter(g => outside(g, painting)), heading: heading?.textContent, headingWritingMode, headingLines: [...headingLines.values()], text: root?.querySelector('p')?.textContent, font: root?.querySelector('p') && getComputedStyle(root.querySelector('p')).fontSize, controls, controlOverlaps: overlaps, fourEntrances: document.querySelectorAll('.chapter-nav button').length, bodyHeadingOverlap: intersects(pbox, hbox), bodySealLetterOverlap: bodyGlyphs.filter(g => /[\p{L}\p{N}]/u.test(g.char) && intersects(g, seal)), bodySealPunctuationContact: bodyGlyphs.filter(g => !/[\p{L}\p{N}]/u.test(g.char) && intersects(g, seal)), shaderErrors: canvas.dataset.shaderErrors, textureFailed: canvas.dataset.textureFailed, progress: Number(canvas.dataset.progress) };
      }, selector);
    }
    for (let id = 1; id <= 4; id++) {
      await page.setViewportSize({ width: 2042, height: 1083 }); await chapter(id);
      for (const padding of [12, 24]) {
        await configure(padding);
        for (const cue of scenes[id].track) {
          await seek((cue.start + cue.end) / 2, cue.id); const row = { chapterId: id, padding, cue: cue.id, ...await measure('.narrative-passage.is-visible .narrative-ink') }; report.captions.push(row);
          check(`${cue.id} padding${padding}: text and ink contained`, row.glyphCount > 0 && !row.glyphOverflow.length && !row.glyphPaintingOverflow.length && !row.bodyHeadingOverlap && !row.bodySealLetterOverlap.length);
          check(`${cue.id} padding${padding}: four entrances and controls intact`, row.fourEntrances === 4 && !row.controlOverlaps.length && row.controls.every(c => c.box.x >= -.8 && c.box.y >= -.8 && c.box.right <= 2042.8 && c.box.bottom <= 1083.8));
          check(`${cue.id} padding${padding}: true DPR and full source aspect`, row.viewport.dpr === 1.25 && Math.abs(row.sourceViewport.aspect - scenes[id].aspect) < 1e-6 && row.shaderErrors === '[]' && row.textureFailed === '0');
          if (padding === 12 && ((id === 1 && cue.paragraphIndex === 12) || (id === 2 && cue.paragraphIndex === 1 && cue.partIndex === 0) || (id === 3 && cue.paragraphIndex === 5) || (id === 4 && [1, 4, 8].includes(cue.paragraphIndex)))) row.screenshot = await shot(`poetic-c${id}-s${cue.paragraphIndex + 1}-user-dpr125`);
        }
      }
      await configure(12);
      for (const [width, height] of [[1280, 720], [1920, 1080], [2042, 1083]]) {
        await page.setViewportSize({ width, height }); await seek(1); await page.locator('.end-colophon').waitFor({ state: 'visible' }); await page.waitForTimeout(1300);
        const row = { chapterId: id, ...await measure('.end-colophon') }; row.screenshot = await shot(`colophon-c${id}-${width}x${height}-dpr125`); report.colophons.push(row);
        check(`colophon c${id} ${width}: readable content contained`, row.glyphCount > 0 && !row.glyphOverflow.length && !row.glyphPaintingOverflow.length);
        await page.getByRole('button', { name: '留一笺春色', exact: true }).focus(); check(`colophon c${id} ${width}: real keepsake entry focusable`, await page.getByRole('button', { name: '留一笺春色', exact: true }).evaluate(e => e === document.activeElement));
      }
      await page.setViewportSize({ width: 2042, height: 1083 });
      await page.getByRole('button', { name: /画中有遇：/ }).click(); await page.waitForSelector('.art-paper', { state: 'visible' }); await page.waitForFunction(() => { const c = document.querySelector('#scroll-artwork canvas'); return document.querySelectorAll('.art-anchor').length > 0 && c?.dataset.loadingTextures === '0' && c?.dataset.queuedTextures === '0'; }, null, { timeout: 90000 }); await page.waitForTimeout(1300);
      if (id === 4) { await page.getByRole('button', { name: '展读原诗', exact: true }).click(); await page.waitForTimeout(400); }
      const encounter = { chapterId: id, ...await measure('.art-paper') };
      encounter.markers = await page.locator('.art-anchor').evaluateAll(es => es.map(e => ({ label: e.getAttribute('aria-label'), box: e.getBoundingClientRect().toJSON() })));
      encounter.screenshot = await shot(`encounter-c${id}-user-dpr125`); report.encounters.push(encounter);
      check(`encounter c${id}: actual panel and text contained`, !encounter.glyphOverflow.length && !encounter.glyphPaintingOverflow.length && encounter.bounds.x >= encounter.painting.x - .8 && encounter.bounds.right <= encounter.painting.right + .8 && encounter.bounds.y >= encounter.painting.y - .8 && encounter.bounds.bottom <= encounter.painting.bottom + .8);
      check(`encounter c${id}: narrative retracted and markers on painting`, await page.locator('.narrative-passage.is-visible').count() === 0 && encounter.markers.every(m => m.box.x >= encounter.painting.x - .8 && m.box.right <= encounter.painting.right + .8 && m.box.y >= encounter.painting.y - .8 && m.box.bottom <= encounter.painting.bottom + .8));
      await page.keyboard.press('Escape'); await page.waitForSelector('.art-encounters', { state: 'detached' });
      console.log(JSON.stringify({ chapter: id, captionCases: report.captions.length, colophons: report.colophons.length, encounters: report.encounters.length }));
    }
    check('90 user-viewport caption cases, 12 colophons, four encounters captured', report.captions.length === 90 && report.colophons.length === 12 && report.encounters.length === 4);
    check('no page or console errors', report.errors.length === 0);
    report.status = report.checks.every(c => c.pass) ? 'passed-functional-scope-art-review-pending' : 'failed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error.stack || error);
    if (page) try { await shotFailure(page); } catch {}
    process.exitCode = 1;
  } finally {
    await browser?.close();
    report.sourceHashesAfter = frozenSource(); report.codeAfter = frozenCode(); report.sourceStable = JSON.stringify(before) === JSON.stringify(report.sourceHashesAfter); report.codeStable = JSON.stringify(codeBefore) === JSON.stringify(report.codeAfter);
    if (!report.sourceStable || !report.codeStable) { report.status = 'failed'; process.exitCode = 1; }
    report.finishedAt = new Date().toISOString(); fs.writeFileSync(path.join(output, 'compact-desktop-validation.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, status: report.status, checks: report.checks.length, failed: report.checks.filter(c => !c.pass), sourceStable: report.sourceStable, codeStable: report.codeStable }));
    if (report.status === 'failed') process.exitCode = 1;
  }
  async function shotFailure(page) { const file = 'failure.png'; await page.screenshot({ path: path.join(output, file) }); report.screenshots.push({ file, sha256: sha(fs.readFileSync(path.join(output, file))) }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

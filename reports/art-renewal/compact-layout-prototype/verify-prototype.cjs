/* TMP-only layout experiment. Reads an explicit frozen build via HTTP;
   only page.addStyleTag changes appearance. Never imports product CSS. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..');
process.chdir(root);
const base = process.env.MDGS_PROTO_URL || 'http://127.0.0.1:5197/';
const build = process.env.MDGS_PROTO_BUILD || 'tmp/art-candidate-6-dist';
const out = path.join(__dirname, 'runs', new Date().toISOString().replace(/[:.]/g, '-'));
fs.mkdirSync(out, { recursive: true });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const css = fs.readFileSync(path.join(__dirname, 'layout-prototype.css'), 'utf8');
const sourceFiles = ['src/App.tsx', 'src/styles/poetic-exhibition.css', 'src/styles/scroll-2026.css', 'src/scene/sourceViewport.ts', 'src/scene/NarrativeSpace.ts', 'src/data/poeticNarrative.ts'];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(f => [f, hash(fs.readFileSync(f))]));
const before = sourceHashes();
const exportsPoetic = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/data/poeticNarrative.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: exportsPoetic });
const scenes = Object.fromEntries([1, 2, 3, 4].map(id => {
  const bytes = fs.readFileSync(path.join(build, `assets/new-scrolls/chapter-${id}/scene.json`));
  const scene = JSON.parse(bytes), render = scene.render;
  return [id, { id, sourceSha256: hash(bytes), aspect: render.width * render.pixelAspectX / (render.height * render.pixelAspectY), track: exportsPoetic.buildPoeticTrack(id, scene.stops, scene.sourceDurationSeconds) }];
}));

(async () => {
  let browser;
  const rows = [], screenshots = [], errors = [], checks = [];
  const result = { status: 'started', prototypeOnly: true, buildDirectory: build, base, at: new Date().toISOString(), driverSha256: hash(fs.readFileSync(__filename)), prototypeCssSha256: hash(css), sourceHashesBefore: before, rows, screenshots, errors, checks };
  try {
    browser = await chromium.launch({ ...(process.env.MDGS_TEST_BROWSER ? { executablePath: process.env.MDGS_TEST_BROWSER } : {}), headless: true });
    result.browser = browser.version();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
    page.on('pageerror', e => errors.push(e.message));
    const response = await page.goto(base);
    const html = await response.text();
    if (html.includes('/@vite/client')) throw new Error('Prototype must use frozen production HTTP');
    const urls = await page.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(es => es.map(e => e.getAttribute('src') || e.getAttribute('href')));
    result.bundle = [];
    for (const url of urls) { const r = await page.request.get(new URL(url, base).href); result.bundle.push({ url, status: r.status(), sha256: hash(await r.body()) }); }
    await page.getByRole('button', { name: /^展开第壹卷/ }).click({ timeout: 90000 });
    async function chapter(id) {
      if (await page.locator('#scroll-artwork canvas').getAttribute('data-chapter').catch(() => '') !== String(id)) {
        await page.getByRole('button', { name: new RegExp('^第' + ['一', '二', '三', '四'][id - 1] + '卷，') }).click();
      }
      await page.waitForFunction(id => document.querySelector('#scroll-artwork canvas')?.dataset.chapter === String(id) && document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', id, { timeout: 90000 });
    }
    await chapter(1);
    let style;
    async function variant(name, id) {
      await style?.evaluate(e => e.remove()); style = undefined;
      await page.locator('.app-shell.poetic-viewer').evaluate((e, { name, aspect }) => {
        e.dataset.compactFrame = name === 'attached' ? 'attached' : '';
        e.style.setProperty('--compact-source-aspect', String(aspect));
      }, { name, aspect: scenes[id].aspect });
      if (name !== 'baseline') style = await page.addStyleTag({ content: css });
    }
    async function seek(id, progress) {
      const cue = scenes[id].track.find(c => progress >= c.start && progress < c.end);
      await page.locator('input[aria-label="画卷游观进度"]').evaluate((e, value) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, String(value)); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, progress);
      await page.waitForFunction(({ progress, cue }) => {
        const c = document.querySelector('#scroll-artwork canvas'), n = document.querySelector('.narrative-calligraphy');
        return c && Math.abs(Number(c.dataset.progress) - progress) < .0011 && c.dataset.loadingTextures === '0' && c.dataset.queuedTextures === '0' && (!cue || n?.dataset.cueId === cue && n?.dataset.placementReady === 'true' && n.querySelector('.is-visible') && c.dataset.narrativeReadPending === 'false' && Math.floor(Number(c.dataset.narrativeReadProgress) * 24) === Math.floor(Number(c.dataset.progress) * 24));
      }, { progress, cue: cue?.id }, { timeout: 90000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
    }
    async function measure(id, name, size, progress) {
      const aspect = scenes[id].aspect;
      const data = await page.evaluate(aspect => {
        const box = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON();
        const p = box('#scroll-artwork'), sourceWidth = Math.min(p.width, p.height * aspect), sourceHeight = sourceWidth / aspect;
        const sourceGateExpected = { x: p.x + (p.width - sourceWidth) / 2, y: p.y + (p.height - sourceHeight) / 2, width: sourceWidth, height: sourceHeight };
        const sourceViewport = JSON.parse(document.querySelector('#scroll-artwork canvas').dataset.sourceViewport || 'null');
        const sourceGate = sourceViewport && { x: p.x + sourceViewport.x, y: p.y + sourceViewport.y, width: sourceViewport.width, height: sourceViewport.height };
        const controls = ['.site-header', '.brand', '.chapter-nav', '.settings-button', '.fullscreen-button', '.scroll-controls', '.current-scene', '.chapter-timeline', '.progress-caption', '.playback-controls', '.secondary-controls'].map(selector => ({ selector, box: box(selector) }));
        const q = document.querySelector('.narrative-passage.is-visible .narrative-ink');
        const glyphs = [];
        if (q) for (const selector of ['h2', 'p', '.narrative-ordinal', '.narrative-small-seal']) {
          const el = q.querySelector(selector), walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) { const node = walker.currentNode; let start = 0; for (const char of node.textContent) { const end = start + char.length; if (!/\s/u.test(char)) { const r = document.createRange(); r.setStart(node, start); r.setEnd(node, end); for (const rect of r.getClientRects()) if (rect.width && rect.height) glyphs.push({ char, selector, ...rect.toJSON() }); } start = end; } }
        }
        const outside = (a, b) => a.x < b.x - .8 || a.y < b.y - .8 || a.right > b.right + .8 || a.bottom > b.bottom + .8;
        const ink = q?.getBoundingClientRect().toJSON();
        const n = document.querySelector('.narrative-calligraphy');
        return { viewport: { width: innerWidth, height: innerHeight }, painting: p, sourceViewport, sourceGate, sourceGateExpected, mount: box('.scroll-mount'), controls, headerHeight: getComputedStyle(document.querySelector('.poetic-viewer')).getPropertyValue('--header-height').trim(), narrative: { cue: n?.dataset.cueId, layout: n?.dataset.layout, locked: n?.dataset.placementLocked, heading: q?.querySelector('h2')?.textContent, text: q?.querySelector('p')?.textContent, font: q ? getComputedStyle(q.querySelector('p')).fontSize : null, ink, glyphOverflow: ink ? glyphs.filter(g => outside(g, ink)) : [], glyphPaintingOverflow: glyphs.filter(g => outside(g, p)) }, chapterLinks: document.querySelectorAll('.chapter-nav button').length, shader: document.querySelector('#scroll-artwork canvas')?.dataset.shaderErrors };
      }, aspect);
      const row = { chapterId: id, variant: name, size, progress, ...data };
      rows.push(row);
      const file = `${name}-c${id}-${size.width}x${size.height}-${String(progress).replace('.', '_')}.png`;
      await page.screenshot({ path: path.join(out, file) }); screenshots.push({ file, sha256: hash(fs.readFileSync(path.join(out, file))) });
      const buttonBoxes = data.controls.filter(x => ['.chapter-nav', '.settings-button', '.fullscreen-button', '.current-scene', '.chapter-timeline', '.progress-caption', '.playback-controls', '.secondary-controls'].includes(x.selector)).map(x => x.box).filter(Boolean);
      const onScreen = buttonBoxes.every(r => r.x >= -.8 && r.y >= -.8 && r.right <= size.width + .8 && r.bottom <= size.height + .8);
      checks.push({ name: `${name} c${id} ${size.width}: controls on screen and 4 chapters retained`, pass: onScreen && data.chapterLinks === 4 });
      checks.push({ name: `${name} c${id} ${size.width}: glyphs contained`, pass: data.narrative.glyphOverflow.length === 0 && data.narrative.glyphPaintingOverflow.length === 0 });
      checks.push({ name: `${name} c${id} ${size.width}: actual source viewport retains whole aspect`, pass: !!data.sourceGate && Math.abs(data.sourceGate.width - data.sourceGateExpected.width) < 1 && Math.abs(data.sourceGate.height - data.sourceGateExpected.height) < 1 && Math.abs(data.sourceViewport.aspect - aspect) < .000001 });
      const overlaps = [];
      for (const selectors of [['.brand', '.chapter-nav', '.settings-button', '.fullscreen-button'], ['.current-scene', '.chapter-timeline', '.progress-caption', '.playback-controls', '.secondary-controls']]) {
        const group = data.controls.filter(x => selectors.includes(x.selector));
        for (let a = 0; a < group.length; a++) for (let b = a + 1; b < group.length; b++) {
          const x = group[a].box, y = group[b].box;
          if (x && y && Math.min(x.right, y.right) - Math.max(x.x, y.x) > .8 && Math.min(x.bottom, y.bottom) - Math.max(x.y, y.y) > .8) overlaps.push([group[a].selector, group[b].selector]);
        }
      }
      row.controlOverlaps = overlaps;
      checks.push({ name: `${name} c${id} ${size.width}: separate controls do not overlap`, pass: overlaps.length === 0, overlaps });
      console.log(JSON.stringify({ id, name, size, painting: data.painting, sourceGate: data.sourceGate, layout: data.narrative.layout, overflow: data.narrative.glyphOverflow.length }));
    }
    for (const size of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 2042, height: 1083 }]) {
      await page.setViewportSize(size);
      for (const id of [1, 4]) {
        await chapter(id);
        const progress = id === 1 ? .85 : .4688715953307393;
        for (const name of ['baseline', 'compact', 'attached']) { await variant(name, id); await seek(id, progress); await measure(id, name, size, progress); }
      }
    }
    result.status = 'completed-prototype';
  } catch (error) { result.status = 'failed-prototype'; result.failure = String(error.stack || error); throw error; }
  finally {
    await browser?.close();
    result.sourceHashesAfter = sourceHashes(); result.sourceStable = JSON.stringify(result.sourceHashesAfter) === JSON.stringify(before);
    fs.writeFileSync(path.join(out, 'prototype-validation.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output: out, status: result.status, checks: checks.length, failed: checks.filter(x => !x.pass).length, sourceStable: result.sourceStable }));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

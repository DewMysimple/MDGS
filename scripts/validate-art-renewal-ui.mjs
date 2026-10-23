/** Real built-App desktop acceptance. Build first; no product mocks.
 * node scripts/validate-art-renewal-ui.mjs [--build-dir dist] [--suite all|home|reading|keepsake]
 * Optional --report-dir DIR --shots-dir DIR isolate concurrent/final reports.
 * MDGS_PLAYWRIGHT_MODULE / MDGS_TEST_BROWSER provide browser dependencies. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const build = path.resolve(root, option('--build-dir', 'dist')), suite = option('--suite', 'all');
assert(['all', 'home', 'reading', 'keepsake'].includes(suite));
const expectedChecks = { all: 83, home: 23, reading: 28, keepsake: 32 }[suite];
const out = path.resolve(root, option('--report-dir', 'reports/art-renewal')), shots = path.resolve(root, option('--shots-dir', 'tmp/art-renewal-ui'));
const reportPath = path.join(out, `ui-${suite}-validation.json`), prefix = '/exhibition/ui-qa/';
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const require = createRequire(import.meta.url), { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const ts = require('typescript');
async function dataModule(file) { const code = ts.transpileModule(await readFile(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText; return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')); }
const { chapters, workPreface } = await dataModule('src/data/chapters.ts');
const { curatorialNotes } = await dataModule('src/data/curatorialNotes.ts');
const { flowerLetters } = await dataModule('src/data/flowerLetters.ts');
const { artEncounters } = await dataModule('src/data/artEncounters.ts');
const sizes = [{ width: 1280, height: 720 }, { width: 1600, height: 1000 }, { width: 1920, height: 1080 }, { width: 2560, height: 1440 }, { width: 3440, height: 1440 }, { width: 1100, height: 650 }];
const report = { status: 'running', startedAt: new Date().toISOString(), suite, expectedChecks, scope: 'Actual built App at nested prefix, six desktop viewports. Home decoded layers/recovery/real optional WebGL context loss/motion/dialog focus; four culture note/original tabs/source links/explore targets; four colophons and local 1200x1600 keepsake choice/seal/download/glyph evidence. No audio retest. Visibility uses an injected document.hidden signal, not system-background emulation.', sizes, checks: [], errors: [], expectedFailures: [] };
let browser, page, url;
await mkdir(out, { recursive: true });
await mkdir(shots, { recursive: true });
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
const server = createServer(async (req, res) => { try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) {
        res.writeHead(404);
        res.end();
        return;
    }
    let file = path.resolve(build, pathname.slice(prefix.length) || 'index.html');
    if (file !== build && !file.startsWith(build + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
    }
    if ((await stat(file)).isDirectory())
        file = path.join(file, 'index.html');
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
}
catch {
    res.writeHead(404);
    res.end();
} });
const button = name => page.getByRole('button', { name, exact: true });
const home = async () => {
    await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'HOME' && document.querySelector('.peony-atlas')?.classList.contains('is-ready'), null, { timeout: 90000 });
    if (!report.webglRenderer) report.webglRenderer = await page.locator('[data-role="peony-pigment-surface"]').evaluate(canvas => {
        const gl = canvas.getContext('webgl2'), debug = gl?.getExtension('WEBGL_debug_renderer_info');
        return gl ? { vendor: gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), version: gl.getParameter(gl.VERSION) } : { available: false };
    });
};
const viewer = () => page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 90000 });
async function seek(value) { await page.getByRole('slider', { name: '画卷游观进度', exact: true }).fill(String(value)); await page.waitForFunction(value => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - value) < .00001 && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0', value, { timeout: 90000 }); }
async function enter(id) { if (await page.locator('.painting canvas').count()) {
    if (Number(await page.locator('.painting canvas').getAttribute('data-chapter')) === id)
        return;
    await page.locator('.chapter-link').nth(id - 1).click();
}
else
    await page.locator(`.study-entry-button[data-chapter-id="${id}"]`).click(); await viewer(); await page.waitForFunction(id => Number(document.querySelector('.painting canvas')?.dataset.chapter) === id, id, { timeout: 90000 }); }
async function check(name, run) { try {
    const evidence = await run();
    report.checks.push({ test: name, passed: true, ...evidence });
    console.log('PASS ' + name);
}
catch (error) {
    const filename = name.replace(/[^a-zA-Z0-9_-]/g, '-') + '.png';
    await page?.screenshot({ path: path.join(shots, filename) }).catch(() => { });
    const state = await page?.evaluate(() => ({ phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase, active: document.activeElement?.outerHTML?.slice(0, 500), canvas: { ...document.querySelector('.painting canvas')?.dataset } })).catch(() => null);
    report.checks.push({ test: name, passed: false, error: error.message, screenshot: relative(path.join(shots, filename)), state });
    console.log('FAIL ' + name + ': ' + error.message);
    await page?.keyboard.press('Escape').catch(() => { });
} await save(); }
async function bounds(selector) { return page.locator(selector).evaluateAll(async (elements) => { await Promise.all(elements.flatMap(element => element.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => { })))); return elements.map(element => ({ selector: element.className, rect: element.getBoundingClientRect().toJSON(), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth })); }); }
function inViewport(rect, size, tolerance = 1) { assert(rect.x >= -tolerance && rect.y >= -tolerance && rect.right <= size.width + tolerance && rect.bottom <= size.height + tolerance, JSON.stringify({ rect, size })); }
async function trap(selector, steps = 14) { const contained = () => page.locator(selector).evaluate(element => element.contains(document.activeElement) || document.activeElement === document.body); for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    assert(await contained(), 'Tab reached underlying page content outside ' + selector);
} await page.keyboard.press('Shift+Tab'); assert(await contained()); }
async function glyphEvidence(text) { return page.evaluate(async (text) => { await document.fonts.ready; const faces = [...document.fonts].filter(face => face.family.replaceAll('"', '').replaceAll("'", '') === 'MDGS Kai').map(face => ({ family: face.family, status: face.status })); const canvas = document.createElement('canvas'); canvas.width = 100; canvas.height = 100; const context = canvas.getContext('2d', { willReadFrequently: true }); function raster(character) { context.clearRect(0, 0, 100, 100); context.fillStyle = '#000'; context.font = '64px "MDGS Kai"'; context.fillText(character, 12, 76); const pixels = context.getImageData(0, 0, 100, 100).data; let hash = 2166136261, ink = 0; for (let i = 3; i < pixels.length; i += 4) {
    hash = Math.imul(hash ^ pixels[i], 16777619);
    if (pixels[i])
        ink++;
} return { hash: hash >>> 0, ink }; } const missing = raster('\uffff'); return { faces, missing, glyphs: [...new Set([...text])].map(character => ({ character, ...raster(character) })) }; }, text); }
async function newPage(size = { width: 1600, height: 1000 }) { await page?.close(); page = await browser.newPage({ viewport: size, acceptDownloads: true }); page.on('pageerror', error => report.errors.push(error.message)); await page.addInitScript(() => { window.__letterCanvasAudit = []; const fill = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) { if (this.canvas.width === 1200 && this.canvas.height === 1600)
    window.__letterCanvasAudit.push({ text, font: this.font, x, y, loaded: document.fonts.check('40px "MDGS Kai"') }); return fill.call(this, text, x, y, ...args); }; }); }
try {
    report.buildHtmlSha256 = digest(await readFile(path.join(build, 'index.html')));
    report.buildJavascript = {};
    for (const file of await readdir(path.join(build, 'assets')))
        if (file.endsWith('.js'))
            report.buildJavascript[file] = digest(await readFile(path.join(build, 'assets', file)));
    report.sourceSha256 = {};
    for (const file of ['src/App.tsx', 'src/components/PeonyAtlasHome.tsx', 'src/components/PeonyPigment.tsx', 'src/scene/PeonyBloomSurface.ts', 'src/components/CulturePanel.tsx', 'src/components/ScrollColophon.tsx', 'src/components/FlowerLetterDialog.tsx', 'src/art/flowerLetter.ts', 'src/styles/peony-atlas.css', 'src/styles/curatorial-reading.css', 'src/styles/flower-letter.css', 'src/data/curatorialNotes.ts', 'src/data/flowerLetters.ts', 'src/data/chapters.ts', 'src/data/artEncounters.ts', 'src/data/peonyAtlas.ts', 'scripts/validate-art-renewal-ui.mjs'])
        report.sourceSha256[file] = digest(await readFile(path.join(root, file)));
    report.assetSha256 = {};
    for (const file of ['ui/peony-atlas/landscape.webp', 'ui/peony-atlas/cinnabar-peonies.webp', 'ui/peony-atlas/ivory-branch.webp', 'ui/peony-atlas/title.webp', 'fonts/wenkai-web.woff2']) {
        const deployedHash = digest(await readFile(path.join(build, file)));
        assert.equal(deployedHash, digest(await readFile(path.join(root, 'public', file))));
        report.assetSha256[file] = deployedHash;
    }
    await save();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${server.address().port}${prefix}`;
    report.url = url;
    browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] });
    report.browser = browser.version();
    report.platform = process.platform;
    report.launchFlags = ['--enable-unsafe-swiftshader'];
    if (suite === 'all' || suite === 'home') {
        for (const failedImage of ['title.webp', 'cinnabar-peonies.webp']) {
            await newPage();
            let broken = true;
            await page.route('**/ui/peony-atlas/' + failedImage, route => broken ? route.fulfill({ status: 503, body: 'intentional home image outage' }) : route.continue());
            await page.goto(url);
            await check('home-image-failure-retry-' + failedImage.replace('.webp', ''), async () => { await button('重新铺陈').waitFor(); assert(await page.locator('.atlas-begin').isDisabled()); report.expectedFailures.push('Home ' + failedImage + ' 503'); broken = false; await button('重新铺陈').click(); await home(); const images = await page.locator('.atlas-landscape,.atlas-peonies,.atlas-ivory-branch,.atlas-title>img').evaluateAll(images => images.map(image => ({ src: image.currentSrc, complete: image.complete, width: image.naturalWidth, height: image.naturalHeight }))); assert.equal(images.length, 4); assert(images.every(image => image.complete && image.width > 0), 'Ready must mean all four currently visible HTML images decoded: ' + JSON.stringify(images)); assert(await page.locator('.atlas-begin').isEnabled()); return { failedImage, images }; });
        }
        await newPage();
        await page.goto(url);
        await home();
        await page.waitForTimeout(2700);
        for (const size of sizes) {
            await page.setViewportSize(size);
            await page.waitForTimeout(300);
            await check(`home-layout-${size.width}x${size.height}`, async () => { const geometry = await bounds('.atlas-header,.atlas-intro,.atlas-chapters,.atlas-footer,.atlas-begin,.atlas-chapter'); for (const element of geometry)
                inViewport(element.rect, size); const intro = geometry.find(element => element.selector === 'atlas-intro'), chaptersBox = geometry.find(element => element.selector === 'atlas-chapters'), header = geometry.find(element => element.selector === 'atlas-header'); const actualIntro = await bounds('.atlas-intro>.atlas-overline,.atlas-begin-note'); assert(actualIntro[1].rect.bottom <= chaptersBox.rect.y + 1 && actualIntro[0].rect.y >= header.rect.bottom - 1, 'Home text must not overlap header or chapter controls: ' + JSON.stringify({ actualIntro, header, chaptersBox })); const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth); assert(documentWidth <= size.width); assert.equal(await page.locator('.atlas-chapter').count(), 4); const images = await page.locator('.atlas-landscape,.atlas-peonies,.atlas-ivory-branch,.atlas-title>img').evaluateAll(images => images.map(image => ({ width: image.naturalWidth, height: image.naturalHeight }))); assert(images.every(image => image.width > 0)); await page.screenshot({ path: path.join(shots, `home-${size.width}x${size.height}.png`) }); return { geometry, images }; });
            for (const name of ['作品序言', '观展指南'])
                await check(`home-dialog-${name === '作品序言' ? 'preface' : 'guide'}-${size.width}x${size.height}`, async () => { await button(name).click(); await page.locator('.atlas-note[open]').waitFor(); const box = (await bounds('.atlas-note[open]'))[0]; inViewport(box.rect, size); assert(await page.locator('.atlas-note').evaluate(element => element.contains(document.activeElement))); await trap('.atlas-note'); await page.keyboard.press('Escape'); await page.locator('.atlas-note[open]').waitFor({ state: 'hidden' }); assert(await button(name).evaluate(element => element === document.activeElement)); return { box }; });
        }
        await page.setViewportSize({ width: 1600, height: 1000 });
        await check('home-motion-off-reduced-hidden-stops-real-pigment-and-resumes', async () => { const canvas = page.locator('[data-role="peony-pigment-surface"]'); await page.waitForFunction(() => document.querySelector('.atlas-pigment')?.dataset.pigmentState === 'live'); const sample = () => canvas.evaluate(element => ({ ...element.dataset })); const initial = await sample(); await page.waitForTimeout(200); assert(Number((await sample()).renderCount) > Number(initial.renderCount)); await button('风物轻动').click(); await page.waitForTimeout(160); const off = await sample(); await page.waitForTimeout(350); assert.equal((await sample()).renderCount, off.renderCount); assert.equal(await page.locator('.peony-atlas').getAttribute('data-paused'), 'true'); const animationStates = await page.locator('.atlas-haze,.atlas-petals>i').evaluateAll(elements => elements.map(element => getComputedStyle(element).animationPlayState)); assert(animationStates.every(state => state === 'paused')); await button('风物轻动').click(); await page.waitForTimeout(200); assert(Number((await sample()).renderCount) > Number(off.renderCount)); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(180); const reduced = await sample(); await page.waitForTimeout(300); assert.equal((await sample()).renderCount, reduced.renderCount); await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(150); await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(150); const hidden = await sample(); await page.waitForTimeout(300); assert.equal((await sample()).renderCount, hidden.renderCount); await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await page.waitForTimeout(250); const resumed = await sample(); assert(Number(resumed.renderCount) > Number(hidden.renderCount)); await button('轻拂花影，唤醒牡丹花色').click(); assert(await page.locator('.peony-atlas').evaluate(element => element.classList.contains('is-flower-touched'))); return { initial, off, reduced, hidden, resumed, animationStates }; });
        await check('home-optional-pigment-real-webgl-context-loss-retains-painted-fallback', async () => { assert(await page.locator('[data-role="peony-pigment-surface"]').evaluate(canvas => { const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context'); if (!extension)
            return false; extension.loseContext(); return true; })); await page.waitForFunction(() => document.querySelector('.atlas-pigment')?.dataset.pigmentState === 'image'); const fallback = await page.locator('.atlas-peonies').evaluate(image => ({ width: image.naturalWidth, visibility: getComputedStyle(image).visibility, hostVisibility: getComputedStyle(image.nextElementSibling).visibility })); assert(fallback.width > 0 && fallback.visibility === 'visible' && fallback.hostVisibility === 'hidden'); assert(await page.locator('.atlas-begin').isEnabled()); await enter(1); await button('返回序厅').click(); await home(); assert.equal(await page.locator('.atlas-pigment').getAttribute('data-pigment-state'), 'image'); return { fallback, viewerEntryWithStaticFallback: true }; });
        await page.reload();
        await home();
        await check('home-return-restores-pigment-and-selected-entry-focus', async () => { await enter(2); await button('返回序厅').click(); await home(); await page.waitForFunction(() => document.querySelector('.atlas-pigment')?.dataset.pigmentState === 'live'); assert(await page.locator('.study-entry-button[data-chapter-id="2"]').evaluate(element => element === document.activeElement)); const before = Number(await page.locator('[data-role="peony-pigment-surface"]').getAttribute('data-render-count')); await page.waitForTimeout(250); assert(Number(await page.locator('[data-role="peony-pigment-surface"]').getAttribute('data-render-count')) > before); });
    }
    if (suite === 'all' || suite === 'reading') {
        await newPage();
        await page.goto(url);
        await home();
        for (const chapter of chapters) {
            await page.setViewportSize({ width: 1600, height: 1000 });
            await enter(chapter.id);
            await seek(.05);
            await check(`culture-full-text-sources-tabs-explore-c${chapter.id}`, async () => { await button('打开文化解读').click(); await page.locator('.culture-panel').waitFor(); assert(await button('关闭文化解读').evaluate(element => element === document.activeElement)); const notes = curatorialNotes[chapter.id]; assert.equal(await page.locator('.culture-annotations>h3').innerText(), notes.question); const sources = await page.locator('.culture-reference-list>a').evaluateAll(elements => elements.map(element => ({ href: element.href, target: element.target, rel: element.rel }))); assert.deepEqual(sources.map(source => source.href), notes.sources.map(source => new URL(source.url).href)); assert(sources.every(source => source.target === '_blank' && source.rel.includes('noopener') && source.rel.includes('noreferrer'))); await page.getByRole('tab', { name: '花事札记', exact: true }).focus(); await page.keyboard.press('ArrowRight'); assert.equal(await page.getByRole('tab', { name: '原作全文', exact: true }).getAttribute('aria-selected'), 'true'); assert.deepEqual(await page.locator('.culture-prose>p').allTextContents(), chapter.paragraphs); assert.equal(await page.locator('.culture-lead').innerText(), chapter.intro); assert.equal(await page.locator('.culture-original>blockquote').innerText(), chapter.colophon); if (chapter.id === 1) {
                await page.locator('.preface-note>summary').click();
                assert.equal(await page.locator('.preface-note>p').innerText(), workPreface);
            } await page.getByRole('tab', { name: '原作全文', exact: true }).focus(); await page.keyboard.press('ArrowLeft'); assert.equal(await page.getByRole('tab', { name: '花事札记', exact: true }).getAttribute('aria-selected'), 'true'); await button('循此入画').click(); await page.locator('.culture-panel').waitFor({ state: 'hidden' }); await page.waitForFunction(progress => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - progress) < .00001, artEncounters.find(item => item.chapterId === chapter.id).progress, { timeout: 60000 }); await page.waitForFunction(() => document.querySelector('#scroll-artwork') === document.activeElement); return { characters: chapter.paragraphs.join('').length, sources, target: artEncounters.find(item => item.chapterId === chapter.id).progress }; });
            for (const size of sizes) {
                await page.setViewportSize(size);
                await check(`culture-desktop-bounds-focus-c${chapter.id}-${size.width}x${size.height}`, async () => { if (!await page.locator('.culture-panel').count())
                    await button('打开文化解读').click(); const geometry = (await bounds('.culture-panel'))[0]; inViewport(geometry.rect, size); assert(geometry.scrollWidth <= geometry.clientWidth + 1); for (const name of ['花事札记', '原作全文']) {
                    await page.getByRole('tab', { name, exact: true }).click();
                    await trap('.culture-panel', 12);
                } await page.keyboard.press('Escape'); await page.locator('.culture-panel').waitFor({ state: 'hidden' }); assert(await button('打开文化解读').evaluate(element => element === document.activeElement)); return { geometry }; });
                if (await page.locator('.culture-panel').count())
                    await page.keyboard.press('Escape');
            }
        }
    }
    if (suite === 'all' || suite === 'keepsake') {
        await newPage();
        await page.goto(url);
        await home();
        for (const chapter of chapters) {
            await page.setViewportSize({ width: 1600, height: 1000 });
            await enter(chapter.id);
            await seek(1);
            await page.locator('.end-colophon').waitFor();
            for (const size of sizes) {
                await page.setViewportSize(size);
                await page.waitForTimeout(150);
                await check(`colophon-keepsake-bounds-escape-c${chapter.id}-${size.width}x${size.height}`, async () => { const colophon = (await bounds('.end-colophon'))[0]; inViewport(colophon.rect, size); assert.equal(await page.locator('.end-colophon h2').innerText(), chapter.title); assert((await page.locator('.end-colophon-text').innerText()).length > 5); await button('留一笺春色').click(); await page.locator('.flower-letter-dialog[open]').waitFor(); await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false'); assert.equal(await page.locator('.flower-letter-choices>button').nth(chapter.id - 1).getAttribute('aria-pressed'), 'true'); const dialog = (await bounds('.flower-letter-dialog[open]'))[0]; inViewport(dialog.rect, size); assert(dialog.scrollWidth <= dialog.clientWidth + 1); const metadataFonts = await page.locator('.flower-letter-compose p,.flower-letter-compose small,.flower-letter-compose button').evaluateAll(elements => elements.map(element => ({ text: element.textContent?.slice(0, 30), size: parseFloat(getComputedStyle(element).fontSize) }))); assert(metadataFonts.every(item => item.size >= 12), 'Keepsake text/metadata below 12px: ' + JSON.stringify(metadataFonts.filter(item => item.size < 12))); const image = await page.locator('.flower-letter-preview>img').evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight, rect: image.getBoundingClientRect().toJSON() })); assert.equal(image.width, 1200); assert.equal(image.height, 1600); inViewport(image.rect, size); await trap('.flower-letter-dialog', 8); await page.keyboard.press('Escape'); await page.locator('.flower-letter-dialog[open]').waitFor({ state: 'hidden' }); assert(await button('留一笺春色').evaluate(element => element === document.activeElement)); return { colophon, dialog, image }; });
                if (await page.locator('.flower-letter-dialog[open]').count())
                    await page.keyboard.press('Escape');
            }
            await page.setViewportSize({ width: 1600, height: 1000 });
            await check(`keepsake-choice-seal-download-actual-png-and-glyphs-c${chapter.id}`, async () => { await button('留一笺春色').click(); await page.locator('.flower-letter-dialog[open]').waitFor(); await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false'); const selected = flowerLetters[(chapter.id) % 4]; await page.locator('.flower-letter-choices>button').nth(chapter.id % 4).click(); await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false'); assert.equal(await page.locator('.flower-letter-selected').innerText(), selected.lines.join('，') + '。'); const unsealed = await page.locator('.flower-letter-preview>img').getAttribute('src'); await button('钤印 · 留芳').click(); await page.waitForFunction(previous => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false' && document.querySelector('.flower-letter-preview>img')?.getAttribute('src') !== previous, unsealed); assert.equal(await page.locator('.flower-letter-choices>button:disabled').count(), 4); const downloadEvent = page.waitForEvent('download'); await button('存为花笺').click(); const download = await downloadEvent; assert.equal(download.suggestedFilename(), `国色长卷·${selected.word}花笺.png`); const destination = path.join(shots, `keepsake-c${chapter.id}.png`); await download.saveAs(destination); const bytes = await readFile(destination); assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a'); assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 1600); const rasterGlyphs = await glyphEvidence(selected.word + selected.lines.join('') + '留芳'); assert(rasterGlyphs.faces.some(face => face.status === 'loaded'), 'Local Kai FontFace must be loaded.'); assert(rasterGlyphs.glyphs.every(glyph => glyph.ink > 50 && glyph.hash !== rasterGlyphs.missing.hash), 'Chinese glyphs must not rasterize as the missing-glyph box.'); const glyphs = await page.evaluate(() => window.__letterCanvasAudit); assert(glyphs.every(item => item.loaded && item.font.includes('MDGS Kai'))); for (const glyph of [...selected.word, ...selected.lines.join(''), '留', '芳'])
                assert(glyphs.some(item => item.text === glyph), 'Missing drawn glyph ' + glyph); const sealPixels = await page.locator('.flower-letter-preview>img').evaluate(image => { const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1600; const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); const data = context.getImageData(1020, 1350, 55, 65).data; let red = 0; for (let i = 0; i < data.length; i += 4)
                if (data[i] > data[i + 1] * 1.6 && data[i + 1] < 110)
                    red++; return red; }); assert(sealPixels > 1000, 'The downloaded preview must contain the actual red seal.'); await page.screenshot({ path: path.join(shots, `keepsake-dialog-c${chapter.id}.png`) }); await button('再题一笺').click(); assert.equal(await page.locator('.flower-letter-choices>button:disabled').count(), 0); await page.keyboard.press('Escape'); assert(await button('留一笺春色').evaluate(element => element === document.activeElement)); return { selected: selected.word, pngBytes: bytes.length, pngSha256: digest(bytes), dimensions: [1200, 1600], sealPixels, rasterGlyphs, drawnTextCount: glyphs.length, saved: relative(destination), glyphLimit: 'Actual loaded local Kai FontFace, distinct nonempty glyph rasters versus missing-glyph box, intercepted canvas fillText and raster seal; typographic beauty still needs exported PNG review.' }; });
            await check(`keepsake-seal-again-focus-c${chapter.id}`, async () => {
                await button('留一笺春色').click();
                await page.locator('.flower-letter-dialog[open]').waitFor();
                await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false');
                const cycles = [];
                for (let cycle = 1; cycle <= 5; cycle++) {
                    const unsealed = await page.locator('.flower-letter-preview>img').getAttribute('src');
                    await button('钤印 · 留芳').click();
                    await page.waitForFunction(previous => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false' && document.querySelector('.flower-letter-preview>img')?.getAttribute('src') !== previous, unsealed);
                    const sealFocused = await page.waitForFunction(() => document.querySelector('.flower-letter-primary') === document.activeElement, null, { timeout: 1800 }).then(() => true, () => false);
                    const sealState = await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 300), disabled: document.querySelector('.flower-letter-primary')?.disabled, busy: document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') }));
                    const sealed = await page.locator('.flower-letter-preview>img').getAttribute('src');
                    await button('再题一笺').click();
                    const againFocused = await page.waitForFunction(() => document.querySelector('.flower-letter-choices>button[aria-pressed=true]') === document.activeElement, null, { timeout: 1800 }).then(() => true, () => false);
                    await page.waitForFunction(previous => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false' && document.querySelector('.flower-letter-preview>img')?.getAttribute('src') !== previous, sealed);
                    cycles.push({ cycle, sealFocused, againFocused, sealState });
                }
                await page.keyboard.press('Escape');
                assert(cycles.every(cycle => cycle.sealFocused && cycle.againFocused), JSON.stringify(cycles));
                return { cycles };
            });
        }
    }
    assert.deepEqual(report.errors, []);
    assert.equal(report.checks.length, expectedChecks, 'The selected suite must execute every expected group.');
    report.status = report.checks.every(check => check.passed) ? 'passed' : 'failed';
}
catch (error) {
    report.status = 'failed';
    report.failure = { message: error.message, stack: error.stack };
}
finally {
    await browser?.close();
    if (server.listening)
        await new Promise(resolve => server.close(resolve));
    report.completedAt = new Date().toISOString();
    await save();
    console.log(JSON.stringify({ status: report.status, passed: report.checks.filter(check => check.passed).length, failed: report.checks.filter(check => !check.passed).length, report: path.relative(root, reportPath) }));
    if (report.status !== 'passed')
        process.exitCode = 1;
}

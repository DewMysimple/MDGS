/** Direct current-edition nested-prefix successor; old 3D room metrics are explicitly retired. */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = process.env.MDGS_ACCEPTANCE_BUILD, preflight = process.env.MDGS_ACCEPTANCE_PREFLIGHT === 'true', out = process.env.MDGS_ACCEPTANCE_OUTPUT;
const prefix = '/portable/nested/';
// Explicit historical fixture mode checks a separately built legacy runtime;
// it never changes the running application's source edition behind the test.
const legacy = process.env.MDGS_LEGACY_RECONSTRUCTION === '1';
const revision = legacy ? JSON.parse(await readFile(path.join(root, 'public/assets/reconstruction/manifest.json'), 'utf8')) : undefined;
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const editionCode = compile(await readFile(path.join(root, 'src/data/sourceEdition.ts'), 'utf8')).replaceAll('import.meta.env.BASE_URL', JSON.stringify(prefix));
const { activeSourceEdition, chapterAssetBase } = await import(`data:text/javascript;base64,${Buffer.from(editionCode).toString('base64')}`);
const activeManifests = new Map();
if (!legacy)
    for (const id of [1, 2, 3, 4]) {
        const base = chapterAssetBase(id);
        assert(base.startsWith(prefix + 'assets/'), 'Active edition paths must remain portable under a nested prefix.');
        const manifest = JSON.parse(await readFile(path.join(root, 'public', base.slice(prefix.length), 'scene.json'), 'utf8'));
        assert.equal(manifest.sourceRevision, activeSourceEdition);
        activeManifests.set(id, manifest);
    }
const titles = ['神都花事', '花入万家', '锦绣花意', '国色倾城'];
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
        if (pathname === '/favicon.ico') {
            response.writeHead(204).end();
            return;
        }
        if (!pathname.startsWith(prefix)) {
            response.writeHead(404).end();
            return;
        }
        const relative = pathname.slice(prefix.length) || 'index.html';
        const target = path.resolve(dist, relative);
        if (!target.startsWith(dist + path.sep)) {
            response.writeHead(403).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' }).end(await readFile(target));
    }
    catch {
        response.writeHead(404).end();
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}${prefix}`;
const reportPath = path.join(out, 'validation.json');
await mkdir(out, { recursive: true });
const buildHtmlSha256 = createHash('sha256').update(await readFile(path.join(dist, 'index.html'))).digest('hex');
const httpResponse = await fetch(url);
assert.equal(httpResponse.status, 200);
const httpHtmlSha256 = createHash('sha256').update(Buffer.from(await httpResponse.arrayBuffer())).digest('hex');
assert.equal(httpHtmlSha256, buildHtmlSha256);
const startedAt = new Date().toISOString(), pageErrors = [], failedResources = [], chapters = [];
const report = status => ({ status, preflight, buildHtmlSha256, httpHtmlSha256, narrativeMode: 'original', startedAt, completedAt: new Date().toISOString(), url, sourceMode: legacy ? 'legacy-reconstruction' : activeSourceEdition, chapters, pageErrors, failedResources });
await writeFile(reportPath, JSON.stringify(report('running'), null, 2) + '\n');
let browser;
try {
    browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await page.addInitScript(() => { localStorage.setItem('guose-fanghua:painting-motion', 'on'); localStorage.setItem('guose-fanghua:viewer-settings:v2', JSON.stringify({ version: 2, narrativeMode: 'original' })); });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => { if (new URL(response.url()).origin === new URL(url).origin && response.status() >= 400)
        failedResources.push(response.url()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => [...document.querySelectorAll('.study-entry-button')].length === 4 && [...document.querySelectorAll('.study-entry-button')].every(button => !button.disabled), null, { timeout: 45000 });
    const homepage = await page.evaluate(() => window.__MDGS_ATLAS__?.snapshot());
    assert(homepage?.ready);
    assert.equal(homepage.layers, 4);
    assert.equal(homepage.kind, 'original-painted-atlas');
    const homeLayers = await page.locator('.atlas-landscape,.atlas-peonies,.atlas-ivory-branch,.atlas-title img').evaluateAll(images => images.map(image => ({ src: image.currentSrc, loaded: image.complete && image.naturalWidth > 0 })));
    assert.equal(homeLayers.length, 4);
    assert(homeLayers.every(image => image.loaded && image.src.startsWith(url)), 'All four actual painted foyer layers must load beneath the nested prefix.');
    const homeResources = await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name));
    assert(!homeResources.some(name => name.includes('/ui/study-projection/')), 'The retired 3D room assets must not be fetched by the current foyer.');
    await page.locator('[data-chapter-id="1"]').click();
    const waitViewer = () => page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.getAttribute('data-journey-phase') === 'SCROLL_VIEWER', null, { timeout: 60000 });
    await waitViewer();
    await page.locator('.painting canvas').waitFor();
    await page.locator('.scene-loading').waitFor({ state: 'hidden', timeout: 60000 });
    const ornamentPaths = await page.locator('.exhibition-atmosphere img').evaluateAll(images => images.map(image => ({ src: image.src, loaded: image.complete && image.naturalWidth > 0 })));
    if (ornamentPaths.length)
        assert(ornamentPaths.every(image => image.src.startsWith(url) && image.loaded), 'Present ornamental images must load beneath the prefix.');
    // Extra exhibition-atmosphere images were retired; native art and actual brocade below remain mandatory.
    const brocade = await page.locator('.brocade-border__pattern').first().evaluate(element => getComputedStyle(element).backgroundImage);
    assert(brocade.includes(prefix + 'ui/'), 'CSS public asset references must use the nested prefix.');
    const ready = async (chapter) => page.waitForFunction(chapter => document.querySelector('.painting canvas')?.dataset.chapter === String(chapter) && document.querySelector('.scene-viewport.is-ready') && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0', chapter, { timeout: 60000 });
    for (let index = 0; index < (preflight ? 1 : 4); index++) {
        await page.locator('.chapter-link').nth(index).click();
        await waitViewer();
        await page.locator('.scene-viewport').getAttribute('aria-label').then(label => assert(label.startsWith(`第${index + 1}卷`)));
        await page.locator('.scene-loading').waitFor({ state: 'hidden', timeout: 60000 });
        await ready(index + 1);
        assert.equal(await page.locator('.painting canvas').count(), 1);
        const canvas = await page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
        const chapter = legacy ? revision.chapters[String(index + 1)] : activeManifests.get(index + 1);
        const expectedAdded = legacy ? chapter.addedLayers.length : 0;
        const expectedText = legacy ? chapter.textLayers.length : 0;
        assert.equal(Number(canvas.artAddedLayers), expectedAdded, 'The actual runtime must use this edition’s expected world additions.');
        assert.equal(Number(canvas.artTextLayers), expectedText, 'Revised works use their DOCX narrative instead of historical reconstruction lettering.');
        let resources;
        if (!legacy) {
            assert.equal(Number(canvas.editionAtmosphereLayers), expectedAdded);
            assert.equal(Number(canvas.sourceHiddenVisibleLayers), 0);
            assert.equal(canvas.sourceRevision, 'peony-2.0-2026-10-23');
            assert.equal(canvas.sourceMaterialsReady, 'true');
            assert.equal(canvas.activeMotionNames, '[]');
            assert.equal(canvas.motionEnabled, 'false');
            resources = await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name));
            const base = new URL(chapterAssetBase(index + 1), url).href;
            assert(resources.includes(`${base}scene.json`), 'The browser must actually request the active scene manifest beneath the prefix.');
            for (const file of ['source-materials.json', 'render-settings.json'])
                assert(resources.includes(base + file), 'Actual native metadata must load beneath prefix: ' + file);
            assert(resources.includes(`${base}cover.webp`), 'The loading ceremony must actually decode this chapter’s cover beneath the prefix.');
            assert(resources.some(name => name.startsWith(`${base}textures/`)), 'The actual scene must stream its new source textures.');
            await page.locator(`.narrative-calligraphy[data-chapter="${index + 1}"] .narrative-passage.is-visible`).waitFor();
        }
        assert.equal(Number(canvas.textureFailed), 0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        assert.equal(overflow, false);
        chapters.push({ chapter: index + 1, loaded: true, sourceRevision: legacy ? undefined : chapter.sourceRevision, meshes: legacy ? undefined : chapter.meshes.length, addedLayers: Number(canvas.artAddedLayers), textLayers: Number(canvas.artTextLayers), overflow, resources: resources?.filter(name => name.includes(`/chapter-${index + 1}/`)) });
    }
    let localFont, audio;
    if (!legacy) {
        localFont = await page.evaluate(async () => {
            await document.fonts.load('20px "MDGS Kai"', '国色长卷牡丹');
            await document.fonts.ready;
            return { faces: [...document.fonts].filter(face => face.family.replaceAll('"', '').replaceAll("'", '') === 'MDGS Kai').map(face => ({ family: face.family, status: face.status })), check: document.fonts.check('20px "MDGS Kai"', '国色长卷牡丹'), computed: getComputedStyle(document.querySelector('.narrative-ink p')).fontFamily, resources: performance.getEntriesByType('resource').map(item => item.name).filter(name => name.includes('/fonts/')) };
        });
        assert(localFont.check && localFont.faces.some(face => face.status === 'loaded') && localFont.computed.includes('MDGS Kai'), 'The local Kai typeface must be loaded and used by the real narrative.');
        assert(localFont.resources.some(name => name.startsWith(url) && new URL(name).pathname.endsWith('/fonts/wenkai-web.woff2')), 'Local Kai must load beneath the nested prefix.');
        await page.getByRole('button', { name: '开启原创数字声景', exact: true }).click();
        await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing', null, { timeout: 30000 });
        await page.getByRole('button', { name: '调整声景音量', exact: true }).click();
        const volume = page.getByRole('slider', { name: '原创数字声景音量', exact: true });
        await volume.focus();
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowRight');
        assert.equal(await volume.inputValue(), '1');
        audio = await page.evaluate(() => ({ ...window.__MDGS_AUDIO__.snapshot(), resources: performance.getEntriesByType('resource').map(item => item.name).filter(name => name.includes('/audio/')) }));
        assert.equal(audio.enabled, true);
        assert.deepEqual(audio.loopDurations, [160, 160, 24]);
        assert.equal(audio.sourceCount, 3);
        for (const file of ['peony-v3-strings.mp3', 'peony-v3-breath.mp3', 'peony-v3-atmosphere.mp3'])
            assert(audio.resources.includes(new URL('audio/' + file, url).href), 'Each original digital stem must load beneath the prefix.');
        assert(!audio.resources.some(name => /courtyard-v2|audition|guzheng-original/.test(name)), 'Unselected or archived audio must not be fetched.');
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '关闭原创数字声景', exact: true }).click();
        await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'off' && window.__MDGS_AUDIO__.snapshot().retiredGraphs === 0);
    }
    await page.getByRole('button', { name: '打开文化解读' }).click();
    await page.locator('.culture-panel').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('.culture-panel').waitFor({ state: 'hidden' });
    assert(await page.getByRole('button', { name: '打开文化解读' }).evaluate(button => button === document.activeElement));
    await page.locator('.chapter-link').first().click();
    await waitViewer();
    await page.locator('.scene-loading').waitFor({ state: 'hidden', timeout: 60000 });
    await ready(1);
    const progress = () => page.locator('.painting canvas').evaluate(canvas => Number(canvas.dataset.progress));
    const advance = async (previous) => page.waitForFunction(previous => Number(document.querySelector('.painting canvas')?.dataset.progress) > previous + .002, previous);
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
    assert.equal(await page.getByRole('button', { name: '画中轻动', exact: true }).count(), 0);
    const nativeMotion = await page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
    assert.equal(nativeMotion.motionEnabled, 'false');
    assert.equal(nativeMotion.activeMotionNames, '[]');
    assert.equal(nativeMotion.editionAtmosphereLayers, '0');
    await page.getByRole('button', { name: '进入全屏', exact: true }).click();
    await page.waitForFunction(() => document.fullscreenElement !== null);
    await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    await page.waitForFunction(() => document.fullscreenElement === null);
    await page.getByRole('slider', { name: '画卷游观进度', exact: true }).focus();
    await page.keyboard.press('Home');
    await page.waitForFunction(() => Number(document.querySelector('.painting canvas')?.dataset.progress) < .001);
    await ready(1);
    await page.screenshot({ path: path.join(out, 'portable-subpath-1280x720.png') });
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedResources, []);
    const result = { ...report(preflight ? 'preflight-pass' : 'pass'), testedAt: new Date().toISOString(), ornaments: ornamentPaths, cssAssetRebased: true, cultureDialog: true, homepage, homeLayers, localFont, audio, notRun: preflight ? ['chapters 2-4 resources'] : [], checks: [{ test: 'nested-prefix-current-edition-scenes-font-sound-input-and-controls', passed: true }], interactions: ['wheel', 'drag', 'keyboard', 'next-scene', 'autoplay-pause', 'native-source-only-motion-policy', 'fullscreen', 'progress-home', 'drawer-escape-focus', ...(!legacy ? ['local-kai-font', 'user-enabled-audio-volume-off', 'active-source-covers-and-textures'] : [])] };
    await writeFile(reportPath, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({status:result.status,chapters:chapters.length,checks:result.checks.length,failedResources:failedResources.length,pageErrors:pageErrors.length}));
}
catch (error) {
    await writeFile(reportPath, JSON.stringify({ ...report('fail'), failure: { message: error.message, stack: error.stack } }, null, 2) + '\n');
    throw error;
}
finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

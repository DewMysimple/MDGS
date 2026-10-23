/** Four actual entry buttons, physical closed-to-open scrolls and stale-load recovery. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), dir = process.env.MDGS_ACCEPTANCE_OUTPUT, build = process.env.MDGS_ACCEPTANCE_BUILD, preflight = process.env.MDGS_ACCEPTANCE_PREFLIGHT === 'true';
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const report = { status: 'running', startedAt: new Date().toISOString(), scope: 'Actual current-production four home entries, physical paper geometry, at least 4s visible loading, repeated input, return, slow resource waiting, cover failure/retry, and cancelled manifest invalidation.', checks: [], errors: [], expectedHttpFailures: [] };
let server, browser, page;
await mkdir(dir, { recursive: true });
const save = () => writeFile(path.join(dir, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
await save();
const phase = async (value) => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 90000 });
const home = async () => { await phase('HOME'); await page.waitForFunction(() => window.__MDGS_ATLAS__?.snapshot().ready); };
const snap = () => page.locator('.art-loading').evaluate(e => ({ ...e.dataset }));
const shot = name => page.screenshot({ path: path.join(dir, 'journey-' + name + '.png') });
try {
    if (!process.env.MDGS_PREVIEW_URL)
        server = await preview({ root, build: { outDir: build }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    const url = process.env.MDGS_PREVIEW_URL || server.resolvedUrls.local[0];
    report.url = url;
    report.preflight = preflight;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    report.httpHtmlSha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    report.buildHtmlSha256 = createHash('sha256').update(await readFile(path.join(build, 'index.html'))).digest('hex');
    assert.equal(report.httpHtmlSha256, report.buildHtmlSha256);
    browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
    report.browserVersion = browser.version();
    if (preflight)
        report.scope = 'Chapter-1 painted-foyer lifecycle, actual entry geometry/minimum loading and return preflight only. Full four-chapter resource-failure/cancellation checks not yet run.';
    page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
    page.on('pageerror', error => report.errors.push(error.message));
    await page.addInitScript(() => { window.__journeyEvents = []; new MutationObserver(() => { const phase = document.querySelector('[data-journey-phase]')?.dataset.journeyPhase; if (phase && window.__journeyEvents.at(-1)?.phase !== phase)
        window.__journeyEvents.push({ phase, at: performance.now() }); }).observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ['data-journey-phase'] }); });
    await page.goto(url);
    await home();
    await foyerLifecycle();
    for (const id of (preflight ? [1] : [1, 2, 3, 4])) {
        await page.evaluate(() => window.__journeyEvents = []);
        await page.locator(`.study-entry-button[data-chapter-id="${id}"]`).click();
        await page.locator('.study-entry-button').evaluateAll(buttons => { for (const button of buttons)
            button.click(); });
        assert.equal(new URL(page.url()).hash, `#chapter-${id}`);
        await phase('SCROLL_LOADING');
        await page.waitForFunction(() => Number(document.querySelector('.art-loading')?.dataset.unfurl) < .08 && Number(document.querySelector('.art-loading')?.dataset.paperVertices) > 2000);
        const closed = await snap();
        await shot(`c${id}-closed`);
        const hidden = await page.locator('.painting canvas').evaluate(e => ({ ...e.dataset }));
        await page.waitForFunction(() => { const open = Number(document.querySelector('.art-loading')?.dataset.unfurl); return open > .43 && open < .8; });
        const half = await snap();
        await shot(`c${id}-half`);
        const hiddenLater = await page.locator('.painting canvas').evaluate(e => ({ ...e.dataset }));
        assert.equal(hidden.motionTime, hiddenLater.motionTime, 'Covered target world must not run a second environmental clock.');
        await page.waitForFunction(() => Number(document.querySelector('.art-loading')?.dataset.unfurl) > .999);
        const opened = await snap();
        await shot(`c${id}-opened`);
        assert(Number(closed.paperZRange) > .1 && Number(closed.paperCurvature) > Number(opened.paperCurvature));
        assert(Number(opened.rodSeparation) > Number(closed.rodSeparation) * 4);
        assert.equal(opened.paperVertices, closed.paperVertices);
        assert(opened.paintingSrc && opened.paintingSrc === half.paintingSrc, 'Captured native presentation must stay bound while opening.');
        await phase('SCROLL_VIEWER');
        const events = await page.evaluate(() => window.__journeyEvents);
        const loaded = events.find(e => e.phase === 'SCROLL_LOADING'), revealed = events.find(e => e.phase === 'PAINTING_REVEAL');
        assert(revealed.at - loaded.at >= 3998, '4s minimum, with 2ms mutation-observer sampling tolerance.');
        assert.equal(await page.locator('.painting canvas').getAttribute('data-chapter'), String(id));
        assert.equal(await page.locator('.painting canvas').getAttribute('data-source-revision'), 'peony-2.0-2026-10-23');
        assert.equal(await page.locator('.painting canvas').getAttribute('data-source-materials-ready'), 'true');
        assert.equal(await page.locator('.painting canvas').getAttribute('data-edition-atmosphere-layers'), '0');
        report.checks.push({ test: `real-entry-${id}-closed-coil-unfurl-four-seconds`, closed, half, opened, loadingMs: revealed.at - loaded.at, events, passed: true });
        if (id === 1)
            await page.getByRole('button', { name: '自动展卷', exact: true }).click();
        await page.getByRole('button', { name: '返回序厅', exact: true }).click();
        await home();
        assert.equal(await page.locator('.painting canvas').count(), 0);
        console.log(`chapter ${id}: real entry, physical unfurl and return passed`);
        await save();
    }
    if (!preflight) {
        // A slow target texture keeps this same living scroll visible past its minimum.
        let release;
        const held = new Promise(resolve => release = resolve);
        await page.route('**/assets/new-scrolls/chapter-2/textures/**', async (route) => { await held; await route.continue().catch(() => { }); });
        await page.locator('.study-entry-button[data-chapter-id="2"]').click();
        await phase('SCROLL_LOADING');
        await page.waitForTimeout(4300);
        assert.equal(await page.locator('[data-journey-phase]').getAttribute('data-journey-phase'), 'SCROLL_LOADING');
        const slowA = await snap();
        await page.waitForTimeout(650);
        const slowB = await snap();
        assert(Number(slowB.renderCount) > Number(slowA.renderCount));
        assert.equal(await page.locator('.scene-viewport').getAttribute('aria-disabled'), 'true');
        await shot('slow-waiting');
        release();
        await phase('SCROLL_VIEWER');
        await page.unroute('**/assets/new-scrolls/chapter-2/textures/**');
        report.checks.push({ test: 'slow-textures-wait-with-continuous-art-rendering', frames: Number(slowB.renderCount) - Number(slowA.renderCount), passed: true });
        await page.getByRole('button', { name: '返回序厅', exact: true }).click();
        await home();
        // At progress zero ScrollLoadingScene explicitly selects the authored
        // cover even when a snapshot exists. Observe the actual failed request.
        let failCover = true;
        let coverFailures = 0;
        await page.route('**/chapter-3/cover.webp', route => { if (failCover) {
            coverFailures++;
            report.expectedHttpFailures.push('chapter-3 cover 503');
            return route.fulfill({ status: 503, body: 'intentional cover outage' });
        } return route.continue(); });
        await page.locator('.study-entry-button[data-chapter-id="3"]').click();
        await page.getByRole('button', { name: '重新展卷', exact: true }).waitFor();
        assert(coverFailures > 0, 'The initial-cover error must be caused by an observed real HTTP request.');
        await shot('cover-error');
        failCover = false;
        await page.getByRole('button', { name: '重新展卷', exact: true }).click();
        await phase('SCROLL_VIEWER');
        await page.unroute('**/chapter-3/cover.webp');
        report.checks.push({ test: 'chapter-specific-loading-art-error-and-full-retry', coverFailures, documentState: 'Same HOME document after visiting all four chapters; zero-progress entry explicitly selects the authored cover.', passed: true });
        await page.getByRole('button', { name: '返回序厅', exact: true }).click();
        await home();
        let pendingRoute, notify;
        const arrived = new Promise(resolve => notify = resolve);
        await page.route('**/chapter-4/scene.json', route => { pendingRoute = route; notify(); });
        await page.locator('.study-entry-button[data-chapter-id="4"]').click();
        let arrivalTimeout;
        try {
            await Promise.race([arrived, new Promise((_, reject) => { arrivalTimeout = setTimeout(() => reject(new Error('Expected real chapter-4 manifest request was not observed.')), 30000); })]);
        } finally { clearTimeout(arrivalTimeout); }
        await phase('SCROLL_LOADING');
        await page.locator('.art-loading__return').click();
        await home();
        await pendingRoute.continue().catch(() => { });
        await page.unroute('**/chapter-4/scene.json');
        await page.locator('.study-entry-button[data-chapter-id="1"]').click();
        await phase('SCROLL_VIEWER');
        assert.equal(new URL(page.url()).hash, '#chapter-1');
        assert.equal(await page.locator('.painting canvas').count(), 1);
        report.checks.push({ test: 'cancelled-old-manifest-cannot-switch-or-revive-a-second-world', passed: true });
        // Desktop soundscape acceptance: a missing independent stem can retry;
        // returning to the home preserves the shared clock instead of unloading it.
        await page.setViewportSize({ width: 1280, height: 720 });
        let failAudio = true;
        await page.route('**/audio/peony-v3-breath.mp3', route => { if (failAudio) {
            report.expectedHttpFailures.push('soundscape stem 503');
            return route.fulfill({ status: 503, body: 'intentional stem outage' });
        } return route.continue(); });
        await page.getByRole('button', { name: '开启原创数字声景', exact: true }).click();
        await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'error');
        failAudio = false;
        await page.getByRole('button', { name: '重试原创数字声景', exact: true }).click();
        await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing', null, { timeout: 30000 });
        const beforeReturn = await page.evaluate(() => window.__MDGS_AUDIO__.snapshot());
        assert.deepEqual(beforeReturn.loopDurations, [160, 160, 24]);
        assert.equal(beforeReturn.sourceCount, 3);
        await page.getByRole('button', { name: '调整声景音量', exact: true }).click();
        const volume = await page.getByRole('slider', { name: '原创数字声景音量', exact: true }).boundingBox(), popup = await page.getByRole('group', { name: '原创声景音量设置', exact: true }).boundingBox();
        assert(volume && popup && popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= 1280 && popup.y + popup.height <= 720, 'Desktop volume popover must fit the viewport.');
        await page.keyboard.press('Escape');
        await shot('desktop-original-soundscape');
        await page.getByRole('button', { name: '返回序厅', exact: true }).click();
        await home();
        const returned = await page.evaluate(() => window.__MDGS_AUDIO__.snapshot());
        assert(returned.enabled && returned.playback === 'playing' && returned.clock > beforeReturn.clock);
        assert.equal(returned.sourceCount, 3);
        await page.getByRole('button', { name: '关闭原创数字声景', exact: true }).click();
        await page.waitForFunction(() => window.__MDGS_AUDIO__.snapshot().playback === 'off' && window.__MDGS_AUDIO__.snapshot().retiredGraphs === 0);
        report.checks.push({ test: 'desktop-soundscape-stem-retry-popover-return-continuity-and-fade-release', beforeReturn, returned, volume, popup, passed: true });
    }
    else
        report.notRun = ['entry chapters 2-4', 'slow native textures', 'cover failure/retry', 'cancelled manifest', 'stem retry/return continuity'];
    assert.deepEqual(report.errors, []);
    report.status = preflight ? 'preflight-pass' : 'pass';
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length }));
}
catch (error) {
    report.status = 'fail';
    report.failure = { message: error.message, stack: error.stack };
    if (page)
        await shot('failure').catch(() => { });
    throw error;
}
finally {
    await browser?.close();
    if (server)
        await server.close();
    report.completedAt = new Date().toISOString();
    await save();
}
async function foyerLifecycle() {
    const snapshot = () => page.evaluate(() => ({ ...window.__MDGS_ATLAS__.snapshot(), paused: document.querySelector('.peony-atlas')?.dataset.paused, pigment: document.querySelector('.atlas-pigment')?.dataset.pigmentState, pigmentFrames: Number(document.querySelector('[data-role="peony-pigment-surface"]')?.dataset.renderCount || 0) }));
    const layers = await page.locator('.atlas-landscape,.atlas-peonies,.atlas-ivory-branch,.atlas-title img').evaluateAll(elements => elements.map(element => ({ src: element.currentSrc, width: element.naturalWidth, height: element.naturalHeight, complete: element.complete })));
    assert.equal(layers.length, 4);
    assert(layers.every(layer => layer.complete && layer.width > 0));
    assert.equal((await snapshot()).layers, 4);
    await page.mouse.move(20, 20);
    await page.waitForTimeout(3400);
    const a = await snapshot();
    await page.waitForTimeout(500);
    const idle = await snapshot();
    assert.equal(a.renderCount, idle.renderCount, 'Pointer parallax must settle and then stop requesting frames.');
    await page.getByRole('button', { name: '风物轻动', exact: true }).click();
    await page.waitForTimeout(200);
    const off = await snapshot();
    await page.mouse.move(850, 350);
    await page.waitForTimeout(500);
    const still = await snapshot();
    assert.equal(still.paused, 'true');
    assert.equal(off.pigmentFrames, still.pigmentFrames);
    await page.getByRole('button', { name: '风物轻动', exact: true }).click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(200);
    const reduced = await snapshot();
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).pigmentFrames, reduced.pigmentFrames);
    assert.equal((await snapshot()).paused, 'true');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(150);
    const hidden = await snapshot();
    await page.waitForTimeout(350);
    assert.equal((await snapshot()).pigmentFrames, hidden.pigmentFrames);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(150);
    assert.equal((await snapshot()).animated, true);
    report.checks.push({ test: 'four-painted-foyer-layers-idle-off-reduced-hidden-resume', layers, idle, off: still, reduced, hidden, restored: await snapshot(), optionalSurface: (await snapshot()).pigment, note: 'Wet-pigment WebGL is optional; decoded image fallback is supported. Real GL-loss/image-retry coverage is in the UI driver. Visibility uses injected document.hidden, not system-background emulation.', passed: true });
    await save();
}

/** Current direct successor of validate-viewer-settings.mjs; desktop original-text readability and real default poetic setting. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), dir = process.env.MDGS_ACCEPTANCE_OUTPUT, build = process.env.MDGS_ACCEPTANCE_BUILD, preflight = process.env.MDGS_ACCEPTANCE_PREFLIGHT === 'true';
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const report = { status: 'running', startedAt: new Date().toISOString(), scope: 'Production Chromium: four independent wheel settings, bounded wheel jumps, time-based smoothing, persistent and invalid settings, text plates, desktop compact controls, large margins, idle and background lifecycle. Frame timings describe this machine only.', checks: [], errors: [], frames: [] };
if(preflight)report.scope='Bounded settings preflight: sanitization, real default poetic mode and UI selection of original mode, four desktop sizes, chapter-1 live wheel/plate controls only. Remaining persistence, GL and four-chapter lifecycle checks are not run.';
await mkdir(dir, { recursive: true });
const save = () => writeFile(path.join(dir, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sanitizeViewerSettings, defaultViewerSettings, viewerSettingsKey } = await import(`data:text/javascript;base64,${Buffer.from(compile(await readFile(path.join(root, 'src/data/viewerSettings.ts'), 'utf8'))).toString('base64')}`);
const defaults = defaultViewerSettings();
assert.equal(defaults.narrativeMode, 'poetic');
assert.equal(sanitizeViewerSettings({ version: 2, narrativeMode: 'unknown' }).narrativeMode, 'poetic');
for (const mode of ['poetic', 'original', 'quiet'])
    assert.equal(sanitizeViewerSettings({ version: 2, narrativeMode: mode }).narrativeMode, mode);
assert.deepEqual(sanitizeViewerSettings(null), defaults);
assert.deepEqual(sanitizeViewerSettings({ version: 9 }), defaults);
const malformed = sanitizeViewerSettings({ version: 2, chapters: { 1: { wheelSpeed: Infinity, smoothingMs: -30 }, 2: { wheelSpeed: 900 } }, textPlate: { color: '#000000', opacity: 900, padding: -30, radius: 'huge' } });
assert.equal(malformed.chapters[1].wheelSpeed, .5);
assert.equal(malformed.chapters[1].smoothingMs, 60);
assert.equal(malformed.chapters[2].wheelSpeed, 2);
assert.equal(malformed.textPlate.color, defaults.textPlate.color);
assert.equal(malformed.textPlate.opacity, 1);
assert.equal(malformed.textPlate.padding, 4);
assert.equal(malformed.textPlate.radius, 0);
report.checks.push({ test: 'invalid-version-corrupt-values-and-readable-palette', passed: true });
await save();
let browser, server, page;
const phase = value => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 90000 });
const data = () => page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
const progress = async () => Number((await data()).progress);
const settle = () => page.waitForTimeout(1700);
async function seek(value) {
    await page.locator('input[aria-label="画卷游观进度"]').evaluate((element, value) => { element.step = 'any'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value)); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await page.waitForFunction(value => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - value) < .00001 && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0', value, { timeout: 90000 });
    await page.waitForTimeout(950);
}
async function wheel(deltaY, deltaMode = 0) {
    await page.locator('.scene-viewport').dispatchEvent('wheel', { deltaY, deltaMode, bubbles: true, cancelable: true });
}
async function openSettings() { await page.getByRole('button', { name: '打开设置', exact: true }).filter({ visible: true }).click(); await page.getByRole('dialog', { name: '设置', exact: true }).waitFor(); }
async function closeSettings() { await page.getByRole('button', { name: '关闭设置', exact: true }).click(); }
async function typography() {
    return page.evaluate(() => {
        const ink = document.querySelector('.narrative-passage.is-visible .narrative-ink'), paper = document.querySelector('.painting').getBoundingClientRect();
        const rect = ink?.getBoundingClientRect();
        const overflow = [...(ink?.querySelectorAll('h2,p,.narrative-ordinal') || [])].map(element => {
            const range = document.createRange();
            range.selectNodeContents(element);
            const r = range.getBoundingClientRect();
            return { text: element.textContent, rect: r.toJSON(), outside: r.left < rect.left - 2 || r.right > rect.right + 2 || r.top < rect.top - 2 || r.bottom > rect.bottom + 2 };
        });
        return { ink: rect?.toJSON(), paper: paper.toJSON(), fill: ink ? getComputedStyle(ink, '::before').backgroundImage : '', mask: ink ? getComputedStyle(ink, '::before').maskImage : '', textOpacity: ink ? getComputedStyle(ink).opacity : '', overflow, documentOverflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
}
async function verifyResponsive() {
    for (const [width, height] of [[1280, 720], [1672, 941], [1920, 1080], [2560, 1440]]) {
        await page.setViewportSize({ width, height });
        await seek(.4);
        const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 1, header: document.querySelector('.site-header').getBoundingClientRect().toJSON(), painting: document.querySelector('.painting').getBoundingClientRect().toJSON(), controls: document.querySelector('.scroll-controls').getBoundingClientRect().toJSON(), buttons: [...document.querySelectorAll('.site-header button,.scroll-controls button,.scroll-controls input')].filter(button => button.getClientRects().length && getComputedStyle(button).visibility !== 'hidden').map(button => ({ text: button.textContent || button.getAttribute('aria-label'), box: button.getBoundingClientRect().toJSON() })) }));
        assert(!layout.overflow, JSON.stringify({ width, height, layout }));
        assert(layout.buttons.every(button => button.box.left >= 0 && button.box.right <= width + 1), JSON.stringify({ width, height, layout }));
        assert(layout.header.bottom <= layout.painting.top + 1 && layout.painting.bottom <= layout.controls.top + 1, JSON.stringify({ width, height, layout }));
        const plate = await typography();
        assert(plate.ink && !plate.overflow.some(item => item.outside), JSON.stringify({ width, height, plate }));
        assert(plate.ink.x >= plate.paper.x - 1 && plate.ink.right <= plate.paper.right + 1 && plate.ink.y >= plate.paper.y - 1 && plate.ink.bottom <= plate.paper.bottom + 1, JSON.stringify({ width, height, plate }));
        report.checks.push({ test: `responsive-header-${width}x${height}`, passed: true });
        if (width === 1280 || width === 1920)
            await page.screenshot({ path: path.join(dir, `layout-${width}x${height}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1672, height: 941 });
}
try {
    if (!process.env.MDGS_PREVIEW_URL)
        server = await preview({ root, build: { outDir: build }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    const url = process.env.MDGS_PREVIEW_URL || server.resolvedUrls.local[0];
    report.preflight = preflight;
    report.buildHtmlSha256 = createHash('sha256').update(await readFile(path.join(build, 'index.html'))).digest('hex');
    report.url = url;
    const response = await fetch(url);
    assert.equal(response.status, 200);
    report.httpHtmlSha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    assert.equal(report.httpHtmlSha256, report.buildHtmlSha256);
    browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
    report.browserVersion = browser.version();
    page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error')
        report.errors.push(message.text()); });
    await page.goto(url + '#chapter-1');
    await phase('SCROLL_VIEWER');
    assert.equal(defaults.narrativeMode, 'poetic');
    assert.equal(await page.locator('.narrative-calligraphy').getAttribute('data-mode'), 'poetic');
    await openSettings();
    assert(await page.locator('input[name="narrative-mode"][value="poetic"]').isChecked());
    await page.locator('input[name="narrative-mode"][value="original"]').check();
    await closeSettings();
    assert.equal(await page.locator('.narrative-calligraphy').getAttribute('data-mode'), 'original');
    report.checks.push({ test: 'actual-default-poetic-and-explicit-original-mode-for-reading-regression', passed: true });
    await verifyResponsive();
    for (const id of (preflight ? [1] : [1, 2, 3, 4])) {
        if (id > 1) {
            await page.locator('.chapter-link').nth(id - 1).click();
            await phase('SCROLL_VIEWER');
        }
        await seek(.25);
        const first = await data();
        assert.equal(first.sourceHiddenVisibleLayers, '0');
        assert.equal(first.sourceRevision, 'peony-2.0-2026-10-23');
        assert.equal(first.sourceMaterialsReady, 'true');
        assert.equal(first.editionAtmosphereLayers, '0');
        assert.equal(first.activeMotionNames, '[]');
        await wheel(100);
        await settle();
        assert(Math.abs(await progress() - .255) < .00002, `chapter ${id}: default 100px advances 0.5%`);
        await wheel(99999);
        await settle();
        assert(Math.abs(await progress() - .263) < .00002, `chapter ${id}: extreme wheel is bounded`);
        await wheel(-100, 1);
        await settle();
        assert(Math.abs(await progress() - .255) < .00002, 'line input shares same bound');
        await page.evaluate(() => { window.__beforeSettingsCanvas = document.querySelector('.painting canvas'); });
        await openSettings();
        await page.locator(`#wheel-speed-${id}`).fill(String(id * .25));
        await closeSettings();
        assert(await page.evaluate(() => window.__beforeSettingsCanvas === document.querySelector('.painting canvas')), 'live settings must preserve the renderer');
        await seek(.25);
        await wheel(100);
        await settle();
        assert(Math.abs(await progress() - (.25 + id * .0025)) < .00002, 'each chapter uses its own live speed');
        const diagnostic = await data();
        assert(Number(diagnostic.narrativeSamplePixels) <= 256 * 192);
        assert.equal(diagnostic.sourceHiddenVisibleLayers, '0');
        assert.equal(diagnostic.textureFailed, '0');
        const plate = await typography();
        assert(plate.ink && plate.fill.includes('gradient') && plate.fill.includes('0.8') && plate.mask !== 'none' && plate.textOpacity === '1');
        assert(!plate.documentOverflow);
        assert(!plate.overflow.some(item => item.outside), JSON.stringify(plate));
        await page.screenshot({ path: path.join(dir, `chapter-${id}-desktop.png`) });
        report.checks.push({ test: `chapter-${id}-wheel-default-large-line-live-speed-and-plate`, samplePixels: diagnostic.narrativeSamplePixels, plate, passed: true });
        await save();
    }
    if (!preflight) {
        await openSettings();
        for (const id of [1, 2, 3, 4])
            assert.equal(await page.locator(`#wheel-speed-${id}`).inputValue(), String(id * .25));
        await page.locator('#wheel-smoothing-4').fill('500');
        await page.locator('#text-plate-color').selectOption('#e7ede4');
        await page.locator('#text-plate-opacity').fill('0.55');
        await page.locator('#text-plate-padding').fill('24');
        await page.locator('#text-plate-radius').fill('16');
        await page.locator('#text-plate-border').fill('0.45');
        await page.screenshot({ path: path.join(dir, 'settings-desktop.png') });
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.viewer-settings').evaluate(element => element.open), false);
        assert(await page.getByRole('button', { name: '打开设置', exact: true }).filter({ visible: true }).evaluate(button => button === document.activeElement));
        const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), viewerSettingsKey);
        assert.equal(stored.textPlate.padding, 24);
        assert.equal(stored.chapters[4].smoothingMs, 500);
        await page.reload();
        await phase('SCROLL_VIEWER');
        await openSettings();
        assert.equal(await page.locator('#text-plate-padding').inputValue(), '24');
        assert.equal(await page.locator('#wheel-smoothing-4').inputValue(), '500');
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.screenshot({ path: path.join(dir, 'settings-desktop-compact.png') });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        await closeSettings();
        await seek(.5);
        for (const id of [4, 3, 2, 1]) {
            if (id !== 4) {
                await page.locator('.chapter-link').nth(id - 1).click();
                await phase('SCROLL_VIEWER');
                await seek(.5);
            }
            const plate = await typography();
            assert(plate.ink && !plate.overflow.some(item => item.outside), JSON.stringify(plate));
            assert(!plate.documentOverflow);
            assert(plate.ink.x >= plate.paper.x - 1 && plate.ink.right <= plate.paper.right + 1 && plate.ink.y >= plate.paper.y - 1 && plate.ink.bottom <= plate.paper.bottom + 1, JSON.stringify(plate));
            const layout = await page.evaluate(() => {
                const box = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
                return { brand: box('.brand-wordmark'), title: box('.viewer-work-title'), nav: box('.chapter-nav'), painting: box('.painting'), controls: box('.scroll-controls') };
            });
            const header = await page.locator('.site-header').boundingBox();
            assert(header.y + header.height <= layout.painting.top + 1 && layout.painting.bottom <= layout.controls.top + 1);
            await page.screenshot({ path: path.join(dir, `chapter-${id}-desktop-compact-large-margin.png`) });
            report.checks.push({ test: `chapter-${id}-desktop-compact-maximum-margin-and-header`, plate, layout, passed: true });
        }
        await openSettings();
        await page.getByRole('button', { name: '恢复全部默认', exact: true }).click();
        await closeSettings();
        assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), viewerSettingsKey), defaults);
        await page.setViewportSize({ width: 1672, height: 941 });
        await seek(.4);
        assert.equal(await page.getByRole('button', { name: '画中轻动', exact: true }).count(), 0);
        assert.equal((await data()).activeMotionNames, '[]');
        await page.mouse.move(1, 1);
        await settle();
        const idle = await data();
        await page.waitForTimeout(600);
        const idleAfter = await data();
        assert.equal(idleAfter.renderCount, idle.renderCount, 'idle world has no draw loop');
        await page.evaluate(() => { window.__wheelFrames = []; const start = performance.now(); const sample = now => { window.__wheelFrames.push({ at: now, progress: Number(document.querySelector('.painting canvas').dataset.progress), reads: Number(document.querySelector('.painting canvas').dataset.narrativeReads) }); if (now - start < 1300)
            requestAnimationFrame(sample); }; requestAnimationFrame(sample); });
        for (let i = 0; i < 15; i++) {
            await wheel(20);
            await page.waitForTimeout(30);
        }
        await page.waitForTimeout(1000);
        const frames = await page.evaluate(() => window.__wheelFrames);
        report.frames = frames;
        assert(frames.length > 5);
        assert(frames.at(-1).progress > frames[0].progress);
        const activeFrames = frames.filter(item => item.at < frames[0].at + 350);
        assert(activeFrames.at(-1).reads - activeFrames[0].reads <= 1, 'no repeated pixel sampling during scrolling');
        report.checks.push({ test: 'restored-defaults-idle-rendering-and-bounded-sampling-during-wheel', idleRenderCount: idle.renderCount, sampleCount: frames.length, activeReadDelta: activeFrames.at(-1).reads - activeFrames[0].reads, passed: true });
        await page.getByRole('button', { name: '自动展卷', exact: true }).click();
        await page.waitForTimeout(200);
        const hidden = await page.evaluate(() => {
            const canvas = document.querySelector('.painting canvas');
            const keys = Object.keys(sessionStorage).filter(key => key.startsWith('guose-fanghua:') && key.endsWith(`:chapter-${canvas.dataset.chapter}:position`));
            if (keys.length !== 1) throw new Error('Expected one actual controller position key for the active chapter');
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            return { positionKey: keys[0], position: sessionStorage.getItem(keys[0]), requestedProgress: canvas.dataset.progress, renderCount: canvas.dataset.renderCount, rafTicks: canvas.dataset.rafTicks };
        });
        assert.notEqual(hidden.position, null);
        await page.getByRole('button', { name: '自动展卷', exact: true }).waitFor({ state: 'visible' });
        const paused = await page.locator('input[aria-label="画卷游观进度"]').evaluate(input => ({ value: input.value, step: input.step }));
        await page.waitForTimeout(400);
        const hiddenAfter = await page.evaluate(key => {
            const canvas = document.querySelector('.painting canvas');
            return { position: sessionStorage.getItem(key), input: document.querySelector('input[aria-label="画卷游观进度"]').value, requestedProgress: canvas.dataset.progress, renderCount: canvas.dataset.renderCount, rafTicks: canvas.dataset.rafTicks };
        }, hidden.positionKey);
        // Requested-progress diagnostics can refresh after an async narrative
        // read without another draw. Keep exact comparisons within each real
        // controller/input representation, and require draw/tick counters idle.
        report.hiddenAutoplay = { suspended: hidden, pausedInput: paused, after400ms: hiddenAfter, canvasProgressRole: 'requested progress diagnostics, not a presented-frame timestamp' };
        await save();
        assert.equal(hiddenAfter.position, hidden.position, 'the actual controller position remains frozen while hidden');
        assert.equal(hiddenAfter.input, paused.value, 'the committed raw input remains frozen while hidden');
        assert.equal(hiddenAfter.renderCount, hidden.renderCount, 'the painting does not draw while hidden');
        assert.equal(hiddenAfter.rafTicks, hidden.rafTicks, 'the painting does not advance RAF ticks while hidden');
        await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
        assert(await page.getByRole('button', { name: '自动展卷', exact: true }).count());
        await seek(.4);
        await page.evaluate(() => document.querySelector('.painting canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
        await page.getByRole('button', { name: '恢复画卷', exact: true }).click();
        await page.waitForFunction(() => Number(document.querySelector('.painting canvas')?.dataset.contextRestores) >= 1 && document.querySelector('.painting canvas')?.dataset.contextLost === 'false', null, { timeout: 30000 });
        await settle();
        assert(Math.abs(await progress() - .4) < .00001);
        report.checks.push({ test: 'actual-webgl-context-loss-recovery-preserves-position', passed: true });
        await page.getByRole('button', { name: '返回序厅', exact: true }).click();
        await phase('HOME');
        await openSettings();
        assert.equal(await page.locator('#wheel-speed-1').inputValue(), '0.5');
        await closeSettings();
        await openSettings();
        await page.evaluate(() => { location.hash = '#chapter-2'; });
        await page.waitForFunction(() => !document.querySelector('.viewer-settings').open);
        await phase('SCROLL_VIEWER');
        await page.getByRole('button', { name: '返回序厅', exact: true }).click();
        await phase('HOME');
        report.checks.push({ test: 'background-stops-autoplay-and-home-settings', passed: true });
        await page.evaluate(key => localStorage.setItem(key, '{broken'), viewerSettingsKey);
        await page.reload();
        await phase('HOME');
        await openSettings();
        assert.equal(await page.locator('#text-plate-opacity').inputValue(), '0.8');
        await closeSettings();
        report.checks.push({ test: 'corrupt-browser-storage-recovers-defaults', passed: true });
    }
    else
        report.notRun = ['chapters 2-4 wheel and original plates', 'settings persistence/reload', 'four-chapter compact large margins', 'restore defaults', 'idle wheel sampling', 'background autoplay', 'actual GL loss/recovery', 'home settings/corrupt storage'];
    assert.deepEqual(report.errors, []);
    report.status = preflight ? 'preflight-pass' : 'pass';
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, frameSamples: report.frames.length }));
}
catch (error) {
    report.status = 'fail';
    report.failure = { message: error.message, stack: error.stack };
    if (page) {
        report.lastPage = await page.evaluate(() => ({ url: location.href, phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase, canvas: { ...document.querySelector('.painting canvas')?.dataset } })).catch(() => null);
        await page.screenshot({ path: path.join(dir, 'failure.png') }).catch(() => { });
    }
    throw error;
}
finally {
    await browser?.close();
    await server?.close();
    report.completedAt = new Date().toISOString();
    await save();
}

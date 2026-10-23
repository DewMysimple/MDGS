/** Current edition browser acceptance, against actual production WebGL pixels.
 * Static successor of validate-new-scroll-runtime.mjs; mapping is in the entry wrapper.
 * Explicit original narration; desktop only. Preflight samples chapter 1 only.
 * One browser/page owns the GPU. Native fidelity is checked separately. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.MDGS_ACCEPTANCE_OUTPUT;
const build = process.env.MDGS_ACCEPTANCE_BUILD, preflight = process.env.MDGS_ACCEPTANCE_PREFLIGHT === 'true';
const shots = process.env.MDGS_ACCEPTANCE_SHOTS;
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const report = { status: 'running', startedAt: new Date().toISOString(), scope: 'Actual revised four-world WebGL, original-mode reading nodes at 1672x941 and desktop compact 1280x720, paper narration bounds/fades, local Kai font, native-only source clock, exact final hold/stamp, shared three-stem digital soundscape and playback lifecycle. Exhaustive timeline jumps use the supported 60ms smoothing setting; default 180ms wheel behavior is checked by validate-viewer-settings.', checks: [], nodes: [], errors: [], expectedErrors: [] };
let browser, server, page;
await mkdir(output, { recursive: true });
await mkdir(shots, { recursive: true });
const save = () => writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
await save();
report.buildHtmlSha256 = createHash('sha256').update(await readFile(path.join(build, 'index.html'))).digest('hex');
const narrativeSource = JSON.parse(await readFile(path.join(root, 'reports/new-scrolls/narrative-source.json'), 'utf8')).paragraphs.filter(text => !text.startsWith('画卷'));
assert.equal(narrativeSource.length, 25);
report.transcriptionParagraphs = 25;
if (preflight) {
    report.scope = 'Bounded chapter-1 preflight: three sampled native nodes and first three actual original passages at each desktop size; complete chapter-1 source-character parity, ending, real inputs, native clock and shared audio lifecycle. Not a four-chapter pass.';
    report.notRun = ['chapters 2-4', 'all remaining chapter-1 nodes/passages'];
}
const phase = () => page.locator('[data-journey-phase]').getAttribute('data-journey-phase');
const waitViewer = () => page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 90000 });
const data = () => page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
async function seek(value) {
    await page.locator('input[aria-label="画卷游观进度"]').evaluate((element, value) => { element.step = 'any'; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value)); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await page.waitForFunction(value => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - value) < .00001 && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0', value, { timeout: 90000 });
    await page.waitForTimeout(800);
}
async function shot(name, permanent = false) { await page.screenshot({ path: path.join(permanent ? output : shots, name + '.png') }); }
try {
    const external = process.env.MDGS_PREVIEW_URL;
    if (!external)
        server = await preview({ root, build: { outDir: build }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    const url = external || server.resolvedUrls.local[0];
    report.url = url;
    report.preflight = preflight;
    report.narrativeMode = 'original';
    const response = await fetch(url);
    assert.equal(response.status, 200);
    report.httpHtmlSha256 = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
    assert.equal(report.httpHtmlSha256, report.buildHtmlSha256, 'HTTP must serve the selected production build.');
    browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
    report.browserVersion = browser.version();
    page = await browser.newPage({ viewport: { width: 1672, height: 941 } });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error')
        report.errors.push(message.text()); });
    await page.addInitScript(() => {
        localStorage.setItem('guose-fanghua:painting-motion', 'on');
        localStorage.setItem('guose-fanghua:viewer-settings:v2', JSON.stringify({ version: 2, narrativeMode: 'original', chapters: Object.fromEntries([1, 2, 3, 4].map(id => [id, { wheelSpeed: .5, smoothingMs: 60 }])) }));
        window.__audioAudit = { contexts: [], sources: [], gains: [] };
        const Original = window.AudioContext;
        window.AudioContext = class extends Original {
            constructor(...args) { super(...args); window.__audioAudit.contexts.push(this); }
            createBufferSource() { const node = super.createBufferSource(); window.__audioAudit.sources.push(node); return node; }
            createGain() { const node = super.createGain(), connect = node.connect.bind(node); node.connect = (target, ...rest) => { if (target === this.destination)
                node.__mdgsOutput = true; return connect(target, ...rest); }; window.__audioAudit.gains.push(node); return node; }
        };
    });
    await page.goto(url + '#chapter-1');
    for (const id of (preflight ? [1] : [1, 2, 3, 4])) {
        if (id > 1)
            await page.locator('.chapter-link').nth(id - 1).click();
        await waitViewer();
        const manifest = JSON.parse(await readFile(path.join(root, `public/assets/new-scrolls/chapter-${id}/scene.json`), 'utf8'));
        assert.equal(manifest.sourceRevision, 'peony-2.0-2026-10-23');
        const first = await data();
        assert.equal(first.chapter, String(id));
        assert.equal(first.artReplacements, '0');
        assert.equal(first.artTextLayers, '0');
        assert.equal(first.sourceHiddenVisibleLayers, '0');
        if (!report.webgl)
            report.webgl = await page.locator('.painting canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return { vendor: gl.getParameter(debug?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), version: gl.getParameter(gl.VERSION) }; });
        assert.equal(first.editionAtmosphereLayers, '0');
        assert.equal(first.activeMotionNames, '[]');
        assert.equal(first.sourceMaterialsReady, 'true');
        assert.equal(first.sourceRevision, 'peony-2.0-2026-10-23');
        assert.equal(await page.locator('.viewer-work-title').innerText().then(text => text.includes(['神都花事', '花入万家', '锦绣花意', '国色倾城'][id - 1])), true);
        assert((await page.locator('.art-loading').count()) === 0);
        for (const [name, width, height] of [['desktop', 1672, 941], ['desktop-compact', 1280, 720]]) {
            await page.setViewportSize({ width, height });
            await seek(0);
            const bounds = await page.locator('.painting').boundingBox();
            const header = await page.locator('.site-header').boundingBox(), tools = await page.locator('.scroll-controls').boundingBox();
            assert(header.y + header.height <= bounds.y + 1 && bounds.y + bounds.height <= tools.y + 1, 'Header, painting and lower controls must not overlap.');
            assert(bounds.width / width > .9 && bounds.height / height > (name === 'desktop' ? .7 : .6), 'Painting must fill the available page.');
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
            const stops = await page.locator('.timeline-stop').evaluateAll(buttons => buttons.map(button => ({ name: button.title, progress: parseFloat(button.style.left) / 100 })));
            assert.equal(stops.length, [15, 7, 9, 9][id - 1]);
            const nodeIndices = preflight ? [0, Math.floor(stops.length / 2), stops.length - 1] : stops.map((_, index) => index);
            for (const index of nodeIndices) {
                const value = Math.min(.978, Math.max(0, Math.round(stops[index].progress * 1000) / 1000));
                await seek(value);
                const result = await page.evaluate(() => {
                    const canvas = document.querySelector('.painting canvas'), paper = canvas.getBoundingClientRect(), passage = document.querySelector('.narrative-passage.is-visible'), ink = passage?.querySelector('.narrative-ink'), p = passage?.querySelector('p');
                    const r = ink?.getBoundingClientRect(), t = p?.getBoundingClientRect();
                    return { data: { ...canvas.dataset }, cue: document.querySelector('.narrative-calligraphy')?.dataset, ink: r?.toJSON(), text: t?.toJSON(), paper: paper.toJSON(), opacity: passage ? getComputedStyle(passage).opacity : null, font: p ? getComputedStyle(p).fontFamily : null, textValue: p?.textContent, overflow: !!p && (p.scrollWidth > p.clientWidth + 3 || p.scrollHeight > p.clientHeight + 3) };
                });
                assert.equal(result.data.sourceHiddenVisibleLayers, '0');
                assert.equal(result.data.textureFailed, '0');
                assert.equal(result.cue.mode, 'original');
                assert(result.ink && Number(result.opacity) > .95 && result.font.startsWith('"MDGS Kai"'), 'Every node has real visible Kai narration.');
                assert(!result.overflow, 'Narration text must not overflow its own typesetting box.');
                for (const r of [result.ink, result.text])
                    assert(r.x >= result.paper.x - 2 && r.y >= result.paper.y - 2 && r.right <= result.paper.right + 2 && r.bottom <= result.paper.bottom + 2, 'Narration must stay inside the actual painting.');
                const filename = `runtime-c${id}-${name}-${String(index + 1).padStart(2, '0')}`;
                await shot(filename, index === 0);
                report.nodes.push({ chapter: id, layout: name, node: index + 1, name: stops[index].name, progress: value, quietFraction: Number(result.cue.quietFraction), text: result.textValue, bounds: result.ink, sourceHiddenVisibleLayers: result.data.sourceHiddenVisibleLayers, activeMotionNames: JSON.parse(result.data.activeMotionNames), screenshot: index === 0 ? filename + '.png' : path.relative(root, path.join(shots, filename + '.png')).replaceAll('\\', '/') });
            }
            report.checks.push({ test: `all-current-reading-nodes-${id}-${name}`, nodes: stops.length, visitedNodes: nodeIndices.length, complete: !preflight, paintingBounds: bounds, headerBounds: header, controlsBounds: tools, passed: true });
            // Visit every displayed passage, not just one point per native scene. This
            // catches late paragraphs collapsed by route remapping or short cue ranges.
            await seek(0);
            const passages = await page.locator('.narrative-passage').evaluateAll(elements => elements.map(element => ({ id: element.dataset.narrativeId, start: Number(element.dataset.rangeStart), end: Number(element.dataset.rangeEnd), text: element.querySelector('p').textContent })));
            const expected = narrativeSource.slice([0, 6, 12, 18][id - 1], [6, 12, 18, 25][id - 1]).join('');
            assert.equal(passages.map(passage => passage.text).join(''), expected, 'All supplied characters must survive responsive typesetting.');
            for (const passage of (preflight ? passages.slice(0, 3) : passages)) {
                assert(passage.end > passage.start);
                await seek((passage.start + passage.end) / 2);
                const visible = page.locator('.narrative-passage.is-visible');
                assert.equal(await visible.getAttribute('data-narrative-id'), passage.id, 'Each actual responsive passage must become selectable.');
                assert.equal(await visible.locator('p').innerText(), passage.text);
                const ink = await visible.locator('.narrative-ink').boundingBox();
                assert(ink.x >= bounds.x - 2 && ink.y >= bounds.y - 2 && ink.x + ink.width <= bounds.x + bounds.width + 2 && ink.y + ink.height <= bounds.y + bounds.height + 2);
            }
            report.checks.push({ test: `all-responsive-transcription-passages-${id}-${name}`, passages: passages.length, visitedPassages: preflight ? Math.min(3, passages.length) : passages.length, complete: !preflight, characters: [...expected].length, passed: true });
            console.log(`chapter ${id} ${name}: ${nodeIndices.length}/${stops.length} nodes, ${preflight ? Math.min(3, passages.length) : passages.length}/${passages.length} original passages passed`);
            await save();
            await seek(1);
            await page.locator('.end-colophon').waitFor();
            assert.equal(await page.locator('.end-colophon h2').innerText(), ['神都花事', '花入万家', '锦绣花意', '国色倾城'][id - 1]);
            const stamp = await page.locator('.end-seal').evaluate(element => ({ animation: getComputedStyle(element).animationName, opacity: getComputedStyle(element).opacity, rect: element.getBoundingClientRect().toJSON() }));
            assert.equal(stamp.animation, 'final-impression');
            await page.waitForTimeout(1000);
            const a = await data();
            await page.waitForTimeout(600);
            const b = await data();
            assert.equal(b.progress, '1.000000');
            assert.equal(a.renderCount, b.renderCount);
            assert.equal(a.motionTime, b.motionTime);
            assert.equal(a.sourceFrame, b.sourceFrame);
            assert.equal(b.editionAtmosphereOpacityMax, '0.000000');
            assert.equal(b.activeMotionNames, '[]');
            const endBox = await page.locator('.end-colophon').boundingBox();
            assert(stamp.rect.y >= endBox.y - 1 && stamp.rect.bottom <= endBox.y + endBox.height + 1, 'Stamp must not be clipped by the ending paper.');
            await shot(`runtime-end-c${id}-${name}`, true);
            report.checks.push({ test: `exact-final-frame-and-stamp-${id}-${name}`, progress: b.progress, renderCount: b.renderCount, stamp, passed: true });
        }
        await page.setViewportSize({ width: 1672, height: 941 });
        await seek(.32);
        const viewport = page.locator('.scene-viewport'), box = await viewport.boundingBox(), progress = () => page.locator('input[aria-label="画卷游观进度"]').inputValue().then(Number);
        await viewport.focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(500);
        assert(Math.abs(await progress() - .345) < .0001);
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(500);
        assert(Math.abs(await progress() - .32) < .0001);
        await page.mouse.move(box.x + box.width * .45, box.y + box.height * .72);
        await page.mouse.wheel(0, 120);
        await page.waitForTimeout(500);
        const wheeled = await progress();
        assert(Math.abs(wheeled - .326) < .0002);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * .35, box.y + box.height * .72, { steps: 8 });
        await page.waitForTimeout(150);
        await page.mouse.up();
        await page.waitForTimeout(500);
        const dragged = await progress();
        assert(Math.abs(dragged - wheeled - .02) < .0005);
        await viewport.focus();
        await page.keyboard.press('Home');
        await page.waitForFunction(() => Number(document.querySelector('input[aria-label="画卷游观进度"]').value) === 0);
        assert.equal(await progress(), 0);
        await page.keyboard.press('End');
        await page.waitForFunction(() => Number(document.querySelector('input[aria-label="画卷游观进度"]').value) === 1);
        assert.equal(await progress(), 1);
        report.checks.push({ test: 'real-wheel-drag-keyboard-' + id, wheelDelta: wheeled - .32, dragDelta: dragged - wheeled, passed: true });
        await seek(.125);
        const stillBefore = await data();
        await page.waitForTimeout(350);
        const stillAfter = await data();
        assert.equal(stillBefore.sourceFrame, stillAfter.sourceFrame);
        assert.equal(await page.getByRole('button', { name: '画中轻动', exact: true }).count(), 0);
        const clock = () => page.evaluate(range => ({ frame: range[0] + Number(document.querySelector('input[aria-label="画卷游观进度"]').value) * (range[1] - range[0]), now: performance.now() }), manifest.frameRange);
        const beforePlay = await clock();
        await page.getByRole('button', { name: '自动展卷', exact: true }).click();
        await page.waitForTimeout(700);
        await page.getByRole('button', { name: '暂停展卷', exact: true }).click();
        const afterPlay = await clock();
        const frameDelta = afterPlay.frame - beforePlay.frame, expectedDelta = (afterPlay.now - beforePlay.now) / 1000 * manifest.fps / (manifest.fpsBase || 1);
        assert(frameDelta > 0 && Math.abs(frameDelta - expectedDelta) < 8);
        await page.waitForTimeout(400);
        assert.equal((await clock()).frame, afterPlay.frame);
        await page.waitForFunction(frame => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.sourceFrame) - frame) < 1e-7, afterPlay.frame, { timeout: 30000 });
        const stopped = await data();
        await page.waitForTimeout(400);
        const frozen = await data();
        assert.equal(frozen.sourceFrame, stopped.sourceFrame);
        assert.equal(frozen.renderCount, stopped.renderCount);
        assert.equal(frozen.editionAtmosphereLayers, '0');
        assert.equal(frozen.activeMotionNames, '[]');
        report.checks.push({ test: 'native-source-clock-and-no-extra-motion-' + id, frameDelta, expectedDelta, passed: true });
    }
    await page.setViewportSize({ width: 1672, height: 941 });
    await seek(.1);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.evaluate(() => document.fonts.check('20px "MDGS Kai"')), true);
    const fonts = await page.locator('.poetic-viewer :is(button,h1,h2,p,input,small,strong)').evaluateAll(elements => elements.filter(element => { const r = element.getBoundingClientRect(), s = getComputedStyle(element); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none' && !element.closest('[inert],[aria-hidden="true"]'); }).map(element => ({ text: element.textContent?.slice(0, 25), font: getComputedStyle(element).fontFamily })).filter(item => !item.font.startsWith('"MDGS Kai"')));
    assert.deepEqual(fonts, []);
    report.checks.push({ test: 'local-kai-loaded-and-all-visible-viewer-html-typography', scope: 'All visible viewer button/h1/h2/p/input/small/strong elements; hidden or inert home/panels excluded.', passed: true });
    // One click enables the shared original digital soundscape. Three loops
    // remain on one clock; short incidental cues are intentionally not loops.
    await page.getByRole('button', { name: '开启原创数字声景', exact: true }).click();
    await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing', null, { timeout: 30000 });
    const audio = () => page.evaluate(() => ({ ...window.__MDGS_AUDIO__.snapshot(),
        nativeStates: window.__audioAudit.contexts.map(context => context.state),
        nativeLoops: window.__audioAudit.sources.filter(source => source.loop).map(source => ({ duration: source.buffer?.duration, channels: source.buffer?.numberOfChannels, rate: source.playbackRate.value })),
        masterGain: window.__audioAudit.gains.findLast(node => node.__mdgsOutput)?.gain.value }));
    const a = await audio();
    assert.deepEqual(a.loopDurations, [160, 160, 24]);
    assert.deepEqual(a.nativeLoops.map(item => item.channels), [2, 1, 1]);
    assert(a.nativeLoops.every(item => item.rate === 1));
    assert.equal(a.sourceCount, 3);
    assert.equal(a.nativeStates.filter(state => state === 'running').length, 1);
    await page.waitForTimeout(400);
    assert((await audio()).clock > a.clock);
    await page.getByRole('button', { name: '调整声景音量', exact: true }).click();
    await page.getByRole('slider', { name: '原创数字声景音量', exact: true }).fill('25');
    await page.waitForTimeout(250);
    assert(Math.abs((await audio()).masterGain - .25) < .01);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'paused');
    const paused = await audio();
    await page.waitForTimeout(400);
    assert(Math.abs((await audio()).clock - paused.clock) < .02);
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing');
    await page.getByRole('button', { name: '关闭原创数字声景', exact: true }).click();
    await page.waitForFunction(() => window.__audioAudit.contexts.every(context => context.state === 'closed') && window.__MDGS_AUDIO__.snapshot().retiredGraphs === 0);
    report.checks.push({ test: 'shared-original-digital-three-stem-decode-volume-background-pause-fade-dispose', audio: a, passed: true });
    assert.deepEqual(report.errors, []);
    report.status = preflight ? 'preflight-pass' : 'pass';
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, nodes: report.nodes.length }));
}
catch (error) {
    report.status = 'fail';
    report.failure = { message: error.message, stack: error.stack };
    if (page) {
        report.lastPage = await page.evaluate(() => ({ url: location.href, phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase, canvas: { ...document.querySelector('.painting canvas')?.dataset } })).catch(() => null);
        await shot('runtime-failure', true).catch(() => { });
    }
    throw error;
}
finally {
    await browser?.close();
    if (server)
        await server.close();
    report.completedAt = new Date().toISOString();
    await save();
}

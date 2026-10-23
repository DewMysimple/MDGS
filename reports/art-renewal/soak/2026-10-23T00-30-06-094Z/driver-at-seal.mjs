/** Real-time production soak: four native films twice, real UI only.
 * Prepare only: node scripts/validate-art-renewal-soak.mjs --plan
 * Run after the core/snapshot freeze:
 * node scripts/validate-art-renewal-soak.mjs --build --build-dir tmp/soak-dist
 * No fake clock, source seek shortcut, playback-rate override or shortened rounds.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build as viteBuild, preview } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const build = path.resolve(root, option('--build-dir', 'tmp/soak-dist'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const manifests = await Promise.all([1, 2, 3, 4].map(async (id) => JSON.parse(await readFile(path.join(root, `public/assets/new-scrolls/chapter-${id}/scene.json`), 'utf8'))));
const durations = manifests.map(manifest => (manifest.frameRange[1] - manifest.frameRange[0]) * (manifest.fpsBase || 1) / manifest.fps);
const coreFiles = [
    'src/App.tsx', 'src/hooks/useStudyJourney.ts', 'src/hooks/useScrollController.ts', 'src/hooks/scrollMotion.ts',
    'src/hooks/usePeonySoundscape.tsx', 'src/audio/PeonySoundscape.ts', 'src/audio/cueMap.ts',
    'src/components/ScrollViewport.tsx', 'src/components/ScrollLoadingScene.tsx', 'src/components/ArtEncounters.tsx',
    'src/components/ScrollColophon.tsx', 'src/components/FlowerLetterDialog.tsx', 'src/components/AudioController.tsx', 'src/art/flowerLetter.ts',
    'src/scene/artworkSnapshot.ts', 'src/scene/scrollHandoff.ts', 'src/scene/SceneRenderer.ts',
    'src/scene/ScrollUnfurlScene.ts', 'src/scene/sourceClock.ts', 'src/data/artEncounters.ts',
    'src/data/sourceEdition.ts', 'scripts/validate-art-renewal-soak.mjs',
];
for (const file of await readdir(path.join(root, 'src/scene')))
    if (file.endsWith('.ts') && !coreFiles.includes('src/scene/' + file))
        coreFiles.push('src/scene/' + file);
const plan = {
    rounds: 2, chapters: [1, 2, 3, 4], nativeDurationsSeconds: durations,
    nativeFilmSeconds: durations.reduce((a, b) => a + b, 0) * 2,
    expectedWallClock: 'About 12–14 minutes including real loading, eight reading pauses, end/return/resume/next and two keepsake previews.',
    clock: 'Native autoplay at rate 1; no fake time. Only the encounter UI may make its own small seek to the authored encounter target. Round two starts through the real replay button.',
    urlPolicy: 'Classify snapshot/letter URLs using actual toBlob metadata. Stable HOME/VIEWER: at most one unreleased snapshot per chapter, <=4 total. During transitions, older URLs retained by active DOM/loading consumers are counted separately. Browser document teardown is not reported as explicit URL.revokeObjectURL calls.',
    audioPolicy: 'One actual AudioContext, exactly three cumulative looping source starts; incidental one-shot cues are separate. Reading -6dB measured on native music gain, then restoration.',
    memoryScope: 'Actual optional performance.memory JS heap, CDP JS heap and DOM counters, application texture-byte estimate. None is VRAM or a whole-process memory measurement; no forced GC and no monotonic-memory leak verdict.',
    binding: 'Frozen production bundle plus selected lifecycle/source-clock/snapshot/audio core hashes. Unrelated CSS/report edits do not invalidate core binding. Native pixel fidelity remains separate.',
    coreFiles,
};
if (args.includes('--plan')) {
    console.log(JSON.stringify({ status: 'prepared-not-run', ...plan }, null, 2));
    process.exit(0);
}
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const ts = createRequire(import.meta.url)('typescript');
const encountersCode = ts.transpileModule(await readFile(path.join(root, 'src/data/artEncounters.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { artEncounters } = await import('data:text/javascript;base64,' + Buffer.from(encountersCode).toString('base64'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(root, 'reports/art-renewal/soak', runId), shots = path.join(root, 'tmp/art-renewal-soak', runId);
await mkdir(out, { recursive: true });
await mkdir(shots, { recursive: true });
const report = { status: 'running', startedAt: new Date().toISOString(), runId, plan, checks: [], samples: [], phases: [], errors: [], consoleErrors: [], failedResources: [], urlViolations: [], segments: [], visits: [], screenshots: [] };
const save = () => writeFile(path.join(out, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
let browser, page, server, cdp, interval, sampling = false, sampleFailure, audioEpoch, previousAudioClock = -1, previousAudioAt = -1;
const savedPositions = new Map();
const hashes = async (files) => Object.fromEntries(await Promise.all(files.map(async (file) => [file, digest(await readFile(path.resolve(root, file)))])));
async function bundleHashes() {
    const files = ['index.html', ...(await readdir(path.join(build, 'assets'))).filter(file => /\.(js|css)$/.test(file)).map(file => 'assets/' + file)];
    return Object.fromEntries(await Promise.all(files.map(async (file) => [file, digest(await readFile(path.join(build, file)))])));
}
async function fileHash(file) { const hash = createHash('sha256'); for await (const chunk of createReadStream(file))
    hash.update(chunk); return hash.digest('hex'); }
async function allProductHashes(){
    const result={};
    async function walk(directory){for(const item of await readdir(path.join(root,directory),{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isDirectory())await walk(file);else result[file.replaceAll('\\','/')]=await fileHash(path.join(root,file));}}
    await walk('src');await walk('public');result['index.html']=await fileHash(path.join(root,'index.html'));return result;
}
async function assetHashes() {
    const result = {};
    async function walk(relativeDir) {
        for (const item of await readdir(path.join(root, 'public', relativeDir), { withFileTypes: true })) {
            const name = path.join(relativeDir, item.name);
            if (item.isDirectory())
                await walk(name);
            else {
                const source = await fileHash(path.join(root, 'public', name)), production = await fileHash(path.join(build, name));
                assert.equal(production, source, 'Production core asset differs from public: ' + name);
                result[name.replaceAll('\\', '/')] = source;
            }
        }
    }
    for (const id of [1, 2, 3, 4])
        await walk('assets/new-scrolls/chapter-' + id);
    for (const name of ['peony-v3-strings.mp3', 'peony-v3-breath.mp3', 'peony-v3-atmosphere.mp3']) {
        const file = 'audio/' + name;
        const source = await fileHash(path.join(root, 'public', file));
        assert.equal(await fileHash(path.join(build, file)), source);
        result[file] = source;
    }
    return result;
}
async function check(test, run) {
    try {
        const evidence = await run();
        report.checks.push({ test, passed: true, ...evidence });
        console.log('PASS ' + test);
    }
    catch (error) {
        report.checks.push({ test, passed: false, message: error.message });
        throw error;
    }
    finally {
        await save();
    }
}
const button = name => page.getByRole('button', { name, exact: true });
const phase = name => page.waitForFunction(name => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === name, name, { timeout: 90000 });
const home = async () => { await phase('HOME'); await page.waitForFunction(() => window.__MDGS_ATLAS__?.snapshot().ready, null, { timeout: 90000 }); };
const viewer = async (id) => {
    await phase('SCROLL_VIEWER');
    await page.waitForFunction(id => document.querySelector('.painting canvas')?.dataset.chapter === String(id) && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0' && document.querySelector('.painting canvas')?.dataset.sourceMaterialsReady === 'true', id, { timeout: 90000 });
};
const progress = () => page.getByRole('slider', { name: '画卷游观进度', exact: true }).inputValue().then(Number);
const audio = () => page.evaluate(() => window.__MDGS_AUDIO__.snapshot());
/** Observe native APIs without changing their clocks, lifecycle or results.
 * WeakRefs avoid keeping disposed graphs/canvases alive solely for this audit.
 */
function installAudit() {
    const audit = window.__MDGS_SOAK__ = { urls: [], contexts: [], nodes: [], gl: [], phases: [], events: [], ends: [], nextId: 1 };
    const blobMetadata = new WeakMap(), ids = new WeakMap(), glRecords = new WeakMap();
    const id = object => { if (!ids.has(object))
        ids.set(object, audit.nextId++); return ids.get(object); };
    const controllerProgress = () => Number(document.querySelector('input[aria-label="画卷游观进度"]')?.value ?? 0);
    const state = () => ({ at: performance.now(), phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase ?? '', chapter: Number(document.querySelector('.painting canvas')?.dataset.chapter ?? 0), progress: controllerProgress() });
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...rest) {
        const metadata = { ...state(), width: this.width, height: this.height };
        return originalToBlob.call(this, blob => { if (blob)
            blobMetadata.set(blob, metadata); callback(blob); }, ...rest);
    };
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => {
        const src = create(blob), metadata = blobMetadata.get(blob);
        const kind = metadata?.width === 1200 && metadata?.height === 1600 ? 'letter' : metadata && blob.type === 'image/png' ? 'snapshot' : 'other';
        audit.urls.push({ src, kind, ...state(), metadata, bytes: blob.size, type: blob.type, revokedAt: null, revokeCalls: 0 });
        return src;
    };
    URL.revokeObjectURL = src => { const record = audit.urls.find(record => record.src === src); if (record) {
        record.revokedAt = performance.now();
        record.revokeCalls++;
    } return revoke(src); };
    function trackNode(node, kind, contextId) {
        const record = { id: id(node), kind, contextId, ref: new WeakRef(node), targets: [], startedAt: null, endedAt: null, stopRequestedAt:null,disconnectedAt:null,loopAtStart: false };
        audit.nodes.push(record);
        const connect = node.connect.bind(node);
        node.connect = (target, ...rest) => { record.targets.push(id(target)); return connect(target, ...rest); };
        const disconnect=node.disconnect.bind(node);node.disconnect=(...rest)=>{record.disconnectedAt=performance.now();return disconnect(...rest);};
        if (kind === 'source') {
            const stop=node.stop.bind(node);node.stop=(...rest)=>{record.stopRequestedAt=performance.now();return stop(...rest);};
            const start = node.start.bind(node);
            node.start = (...rest) => { record.startedAt = performance.now(); record.loopAtStart = node.loop; record.when = rest[0]; record.offset = rest[1]; record.duration = node.buffer?.duration; record.channels = node.buffer?.numberOfChannels; record.rate = node.playbackRate.value; return start(...rest); };
            node.addEventListener('ended', () => { record.endedAt = performance.now(); });
        }
        return node;
    }
    const OriginalAudioContext = window.AudioContext;
    window.AudioContext = class extends OriginalAudioContext {
        constructor(...rest) { super(...rest); const record = { id: id(this), ref: new WeakRef(this), createdAt: performance.now(), destinationId: id(this.destination), lastState: this.state }; audit.contexts.push(record); this.addEventListener('statechange', () => { record.lastState = this.state; }); }
        createGain() { return trackNode(super.createGain(), 'gain', id(this)); }
        createBufferSource() { return trackNode(super.createBufferSource(), 'source', id(this)); }
        createBiquadFilter() { return trackNode(super.createBiquadFilter(), 'filter', id(this)); }
    };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
        const context = getContext.call(this, kind, ...rest);
        if (context && (kind === 'webgl' || kind === 'webgl2') && !glRecords.has(context)) {
            const record = { id: id(context), ref: new WeakRef(context), canvas: new WeakRef(this), createdAt: performance.now(), lostAt: null, kind: 'unknown', chapter: 0 };
            audit.gl.push(record);
            glRecords.set(context, record);
            this.addEventListener('webglcontextlost', () => { record.lostAt = performance.now(); });
        }
        return context;
    };
    let ending = false;
    new MutationObserver(() => {
        const value = state();
        if (value.phase && audit.phases.at(-1)?.phase !== value.phase)
            audit.phases.push(value);
        const ended = value.phase === 'SCROLL_VIEWER' && value.progress === 1 && !!document.querySelector('.end-colophon');
        if (ended && !ending)
            audit.ends.push(value);
        ending = ended;
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-journey-phase', 'data-progress'] });
    document.addEventListener('click', event => { const element = event.target instanceof Element ? event.target.closest('button') : null; if (element?.matches('.play-button,.art-encounter-entrance,.brand,.end-actions button'))
        audit.events.push({ ...state(), text: element.textContent, label: element.getAttribute('aria-label') }); }, true);
    window.__MDGS_SOAK_READ__ = () => {
        const current = state(), canvas = document.querySelector('.painting canvas'), data = canvas ? { ...canvas.dataset } : null;
        const consumers = [...new Set([...document.querySelectorAll('img[src^="blob:"],[data-painting-src^="blob:"]')].filter(element => !element.closest('dialog:not([open])')).map(element => element instanceof HTMLImageElement ? element.src : element.dataset.paintingSrc))];
        const urls = audit.urls.map(record => ({ ...record, consumed: consumers.includes(record.src) }));
        const contexts = audit.contexts.map(record => ({ id: record.id, createdAt: record.createdAt, destinationId: record.destinationId, state: record.ref.deref()?.state ?? record.lastState }));
        const nodes = audit.nodes.map(record => { const node = record.ref.deref(); return { id: record.id, kind: record.kind, contextId: record.contextId, targets: record.targets, startedAt: record.startedAt, endedAt: record.endedAt,stopRequestedAt:record.stopRequestedAt,disconnectedAt:record.disconnectedAt,loop: record.loopAtStart, when: record.when, offset: record.offset, duration: record.duration, channels: record.channels, rate: node?.playbackRate?.value ?? record.rate, gain: node?.gain?.value }; });
        const filter = nodes.find(node => node.kind === 'filter'), music = nodes.find(node => node.id === filter?.targets[0]);
        const gl = audit.gl.map(record => {
            const context = record.ref.deref(), canvas = record.canvas.deref();
            if (canvas?.dataset.chapter) {
                record.kind = 'native';
                record.chapter = Number(canvas.dataset.chapter);
            }
            else if (canvas?.dataset.role === 'peony-pigment-surface')
                record.kind = 'pigment';
            else if (canvas?.closest('.art-loading'))
                record.kind = 'unfurl';
            return { id: record.id, createdAt: record.createdAt, kind: record.kind, chapter: record.chapter, connected: canvas?.isConnected ?? false, collected: !context, lost: context ? context.isContextLost() : true, lostAt: record.lostAt };
        });
        const heap = performance.memory;
        return { ...current, data, audio: window.__MDGS_AUDIO__?.snapshot(), contexts, loops: nodes.filter(node => node.kind === 'source' && node.loop), oneShots: nodes.filter(node => node.kind === 'source' && !node.loop && node.startedAt !== null).map(({ id, startedAt, endedAt }) => ({ id, startedAt, endedAt })), nativeMusicGain: music?.gain, urls, consumers, gl, playing: document.querySelector('.play-button')?.getAttribute('aria-pressed') === 'true', viewerCanvases: document.querySelectorAll('.painting canvas').length, loader: document.querySelector('.art-loading') ? { ...document.querySelector('.art-loading').dataset } : null, heap: heap ? { usedJSHeapSize: heap.usedJSHeapSize, totalJSHeapSize: heap.totalJSHeapSize, jsHeapSizeLimit: heap.jsHeapSizeLimit } : null, phases: audit.phases, ends: audit.ends };
    };
}
const read = () => page.evaluate(() => window.__MDGS_SOAK_READ__());
function validateHealth(value, enabled = true) {
    if (['HOME', 'SCROLL_VIEWER'].includes(value.phase))
        assert.equal(value.viewerCanvases, value.phase === 'HOME' ? 0 : 1, 'Only the current native viewer may remain mounted.');
    else
        assert(value.viewerCanvases <= 1, 'A transition may not mount a second native world.');
    if (value.data && (value.phase === 'SCROLL_VIEWER' || value.data.sourceRevision)) {
        assert.equal(value.data.sourceRevision, 'peony-2.0-2026-10-23');
        assert.equal(value.data.shaderErrors, '[]');
        assert.equal(value.data.textureFailed, '0');
        assert.equal(value.data.sourceHiddenVisibleLayers, '0');
        assert.equal(value.data.contextLost, 'false');
    }
    if (enabled) {
        assert.equal(value.contexts.length, 1);
        assert.equal(value.contexts[0].state, 'running');
        assert.equal(value.audio.playback, 'playing');
        assert.equal(value.audio.sourceCount, 3);
        assert.equal(value.loops.length, 3);
        assert(value.loops.every(loop => !loop.endedAt && loop.rate === 1));
        assert.deepEqual(value.loops.map(loop => loop.duration), [160, 160, 24]);
        assert.equal(value.audio.sourceEpoch, audioEpoch);
        if (value.at >= previousAudioAt) {
            assert(value.audio.clock >= previousAudioClock - .001);
            previousAudioClock = value.audio.clock;
            previousAudioAt = value.at;
        }
    }
    for (const record of value.urls)
        assert(!(record.kind === 'snapshot' && record.consumed && record.revokedAt !== null), 'An active snapshot consumer still references an explicitly revoked URL: ' + record.src);
    const live = value.urls.filter(record => record.kind === 'snapshot' && record.revokedAt === null);
    for (const id of [1, 2, 3, 4]) {
        const chapterURLs = live.filter(record => record.metadata?.chapter === id), olderConsumers = chapterURLs.slice(0, -1).filter(record => record.consumed);
        assert(chapterURLs.length <= 1 + olderConsumers.length + chapterURLs.filter(record => !record.consumed && value.at - record.at < 1800).length, 'Snapshot ownership exceeded one cache plus retained active consumers during transition.');
    }
}
async function takeSample(label, strict = false) {
    const value = await read();
    if (audioEpoch !== undefined)
        validateHealth(value);
    const liveSnapshots = value.urls.filter(record => record.kind === 'snapshot' && record.revokedAt === null), liveLetters = value.urls.filter(record => record.kind === 'letter' && record.revokedAt === null);
    if (strict) {
        assert(!value.loader, 'Quiescent ownership check must not count a live loading consumer as a cache leak.');
        for (const id of [1, 2, 3, 4])
            assert(liveSnapshots.filter(record => record.metadata?.chapter === id).length <= 1, 'At rest each chapter may retain at most one snapshot URL.');
        assert(liveSnapshots.length <= 4);
        assert.equal(liveLetters.length, 0);
        const orphans = value.gl.filter(context => context.kind === 'native' && !context.connected && !context.lost && !context.collected);
        assert.deepEqual(orphans, [], 'Unmounted native viewer must release its real GL context.');
    }
    const metrics = cdp ? await cdp.send('Performance.getMetrics').catch(() => null) : null;
    const dom = cdp ? await cdp.send('Memory.getDOMCounters').catch(() => null) : null;
    const sample = { label, at: value.at, phase: value.phase, chapter: value.chapter, progress: value.progress, playing: value.playing, nativeFrame: value.data?.sourceFrame, sourceTextureBudgetBytes: Number(value.data?.textureBytes ?? 0), textureCount: Number(value.data?.textureCount ?? 0), loadingTextures: Number(value.data?.loadingTextures ?? 0), renderCount: Number(value.data?.renderCount ?? 0), viewerCanvases: value.viewerCanvases, audio: value.audio, nativeMusicGain: value.nativeMusicGain, contexts: value.contexts, loopSourceIds: value.loops.map(loop => loop.id), oneShotStarted: value.oneShots.length, oneShotNotEnded: value.oneShots.filter(shot => !shot.endedAt).length, urlCounts: { created: value.urls.length, explicitlyRevoked: value.urls.filter(record => record.revokedAt !== null).length, liveSnapshots: liveSnapshots.length, retainedOlderConsumers: liveSnapshots.filter(record => record.consumed).map(record => record.src), liveLetters: liveLetters.length }, gl: value.gl, performanceMemory: value.heap, cdpJSHeap: metrics ? Object.fromEntries(metrics.metrics.filter(item => ['JSHeapUsedSize', 'JSHeapTotalSize'].includes(item.name)).map(item => [item.name, item.value])) : null, domCounters: dom };
    report.samples.push(sample);
    report.phases = value.phases;
    return value;
}
async function screenshot(name) { const file = path.join(shots, name + '.png'); await page.screenshot({ path: file }); const item = { path: relative(file), sha256: digest(await readFile(file)) }; report.screenshots.push(item); return item; }
async function stable(label) {
    await page.waitForFunction(() => {
        const canvas = document.querySelector('.painting canvas');
        return !canvas || canvas.dataset.rafRunning === 'false' && canvas.dataset.narrativeReadPending === 'false' && canvas.dataset.loadingTextures === '0';
    }, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    return takeSample(label, true);
}
async function waitProgress(target, timeout) {
    const started = Date.now();
    while (true) {
        const state = await page.evaluate(() => ({ progress: Number(document.querySelector('input[aria-label="画卷游观进度"]')?.value ?? 0), playing: document.querySelector('.play-button')?.getAttribute('aria-pressed') === 'true' }));
        if (state.progress >= target)
            return;
        if (sampleFailure)
            throw sampleFailure;
        assert(Date.now() - started < timeout, 'Native autoplay did not reach ' + target + ' in its real-time budget.');
        assert.equal(state.playing, true, 'Autoplay stopped without a requested reading pause.');
        await page.waitForTimeout(150);
    }
}
async function playTo(target, id, round) {
    const before = await read();
    assert.equal(before.playing, false);
    await button('自动展卷').click();
    const start = await read();
    await waitProgress(target, Math.ceil(durations[id - 1] * 1000 + 12000));
    const end = await read();
    const lastEnd = target === 1 ? end.ends.find(item => item.chapter === id && item.at >= start.at) : null;
    const wallMs = (lastEnd?.at ?? end.at) - start.at, expectedSourceMs = (end.progress - start.progress) * durations[id - 1] * 1000;
    assert(Math.abs(wallMs - expectedSourceMs) <= 1600, 'Actual native source advance must follow wall time without acceleration.');
    const segment = { chapter: id, round, target, startProgress: start.progress, endProgress: end.progress, startAt: start.at, endAt: lastEnd?.at ?? end.at, wallMs, expectedSourceMs, clockDifferenceMs: wallMs - expectedSourceMs };
    report.segments.push(segment);
    return segment;
}
async function readingEncounter(id, round) {
    const target = artEncounters.find(item => item.chapterId === id).progress, before = await read();
    await page.locator('.poetic-viewer .art-encounter-entrance').click();
    await page.locator('.art-encounters').waitFor();
    await page.waitForFunction(() => { const state = window.__MDGS_SOAK_READ__(); return state.audio.reading && state.nativeMusicGain > .49 && state.nativeMusicGain < .505; }, null, { timeout: 12000 });
    const range=manifests[id-1].frameRange,expectedFrame=range[0]+target*(range[1]-range[0]);
    await page.waitForFunction(frame=>Math.abs(Number(document.querySelector('.painting canvas')?.dataset.sourceFrame)-frame)<1e-7,expectedFrame,{timeout:30000});
    const duck = await read(), duckDb = 20 * Math.log10(duck.nativeMusicGain / before.nativeMusicGain);
    assert(duckDb >= -7 && duckDb <= -5);
    assert.equal(duck.playing, false);
    assert(Math.abs(duck.progress - target) <= .000501,'The native range value is legitimately quantized to step=.001. Exact authored position is checked on sourceFrame.');
    assert(Math.abs(Number(duck.data.sourceFrame)-expectedFrame)<1e-7);
    assert(Math.abs(duck.progress - before.progress) < .02, 'Opening the real encounter may make only its authored small seek.');
    if (id === 1) {
        await page.locator('.art-reading-tabs').getByRole('button', { name: '史料', exact: true }).click();
        await page.locator('.art-reading-tabs').getByRole('button', { name: '传说', exact: true }).click();
    }
    if (id === 2) {
        await page.locator('.art-gaze-steps').getByRole('button', { name: /舟中/ }).click();
        await page.locator('.art-gaze-steps').getByRole('button', { name: /桥上/ }).click();
    }
    if (id === 3) {
        const flower = page.getByRole('button', { name: '选取原画牡丹的花意，可拖至锦面或按回车选取', exact: true });
        await flower.focus();
        await page.keyboard.press('Enter');
        await button('将已选的花意入锦').click();
        assert.equal(await page.locator('.art-brocade-detail').getAttribute('data-phase'), 'woven');
    }
    if (id === 4) {
        await button('展读原诗').click();
        await button('合笺').click();
    }
    await page.waitForTimeout(800);
    const held = await read();
    assert.equal(held.progress, duck.progress);
    await button('收起画中有遇').click();
    await page.locator('.art-encounters').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => { const state = window.__MDGS_SOAK_READ__(); return !state.audio.reading && state.nativeMusicGain > .997; }, null, { timeout: 12000 });
    const restored = await read();
    assert.equal(restored.playing, false);
    assert.equal(restored.progress, duck.progress);
    validateHealth(restored);
    return { round, chapter: id, encounter: artEncounters.find(item => item.chapterId === id).id, duckDb, actualMusicGain: duck.nativeMusicGain, restoredMusicGain: restored.nativeMusicGain, actualUISeek: duck.progress - before.progress };
}
async function keepsake(round) {
    const before = await read();
    await button('留一笺春色').click();
    await page.locator('.flower-letter-dialog[open]').waitFor();
    await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false' && window.__MDGS_AUDIO__.snapshot().musicGain < .505, null, { timeout: 30000 });
    const reading = await read();
    assert(reading.urls.some(record => record.kind === 'letter' && record.revokedAt === null));
    const duckDb = 20 * Math.log10(reading.nativeMusicGain / before.nativeMusicGain);
    assert(duckDb >= -7 && duckDb <= -5);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__MDGS_AUDIO__.snapshot().reading && window.__MDGS_AUDIO__.snapshot().musicGain > .997);
    await page.waitForTimeout(200);
    const closed = await read();
    assert.equal(closed.urls.filter(record => record.kind === 'letter' && record.revokedAt === null).length, 0);
    return { round, duckDb, previewURLs: reading.urls.filter(record => record.kind === 'letter').length, explicitlyRevokedPreviewURLs: closed.urls.filter(record => record.kind === 'letter' && record.revokedAt !== null).length };
}
try {
    report.coreBeforeBuild = await hashes(coreFiles);
    if (args.includes('--build')) {
        console.log('Building isolated production package…');
        await viteBuild({ root, build: { outDir: build }, logLevel: 'error' });
    }
    report.coreAtStart = await hashes(coreFiles);
    report.allProductAtStart=await allProductHashes();
    assert.deepEqual(report.coreAtStart, report.coreBeforeBuild, 'Lifecycle core changed while building; rebuild before soak.');
    report.bundleAtStart = await bundleHashes();
    report.buildDirectory = relative(build);
    report.coreAssetsAtStart = await assetHashes();
    for (const id of [1, 2, 3, 4])
        for (const name of ['scene.json', 'source-materials.json', 'render-settings.json', 'cover.webp'])
            assert.equal(digest(await readFile(path.join(build, `assets/new-scrolls/chapter-${id}/${name}`))), digest(await readFile(path.join(root, `public/assets/new-scrolls/chapter-${id}/${name}`))), 'Production source metadata must match current public assets.');
    server = await preview({ root, build: { outDir: build }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
    report.url = server.resolvedUrls.local[0];
    const response = await fetch(report.url);
    assert.equal(response.status, 200);
    report.httpHtmlSha256 = digest(Buffer.from(await response.arrayBuffer()));
    assert.equal(report.httpHtmlSha256, report.bundleAtStart['index.html']);
    browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
    report.browserVersion = browser.version();
    page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error')
        report.consoleErrors.push(message.text()); });
    page.on('response', response => { if (/^https?:/.test(response.url()) && response.status() >= 400)
        report.failedResources.push({ url: response.url(), status: response.status() }); });
    await page.addInitScript(installAudit);
    await page.goto(report.url);
    await home();
    cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await check('explicit-foyer-gesture-creates-one-context-and-three-loop-sources', async () => {
        const before = await read();
        assert.equal(before.contexts.length, 0);
        await button('开启原创数字声景').click();
        await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing', null, { timeout: 30000 });
        const enabled = await read();
        audioEpoch = enabled.audio.sourceEpoch;
        validateHealth(enabled);
        assert(enabled.loops.every(loop => loop.when === enabled.loops[0].when));
        return { sourceEpoch: audioEpoch, loops: enabled.loops };
    });
    interval = setInterval(async () => { if (sampling || !page)
        return; sampling = true; try {
        await takeSample('periodic');
        if (report.samples.length % 15 === 0) {
            console.log('SOAK ' + JSON.stringify({ samples: report.samples.length, phase: report.samples.at(-1).phase, chapter: report.samples.at(-1).chapter, progress: report.samples.at(-1).progress }));
            await save();
        }
    }
    catch (error) {
        sampleFailure ??= error;
    }
    finally {
        sampling = false;
    } }, 1000);
    await page.locator('.study-entry-button[data-chapter-id="1"]').click();
    await viewer(1);
    for (let round = 1; round <= 2; round++)
        for (const id of [1, 2, 3, 4]) {
            await viewer(id);
            if (sampleFailure)
                throw sampleFailure;
            await check(`r${round}-c${id}-native-real-time-full-autoplay-and-encounter`, async () => {
                const initial = await progress();
                if (round === 2) {
                    assert.equal(initial, 1, 'Second-round route must retain its actual ended position.');
                    await button('再观此卷').click();
                    await page.waitForFunction(() => Number(document.querySelector('input[aria-label="画卷游观进度"]').value) === 0);
                }
                else
                    assert.equal(initial, 0);
                await stable(`r${round}-c${id}-start`);
                const target = artEncounters.find(item => item.chapterId === id).progress;
                const first = await playTo(target, id, round), reading = await readingEncounter(id, round), last = await playTo(1, id, round);
                await page.locator('.end-colophon').waitFor();
                assert.equal(await progress(), 1);
                assert.equal(await page.locator('.play-button').getAttribute('aria-pressed'), 'false');
                const a = await stable(`r${round}-c${id}-end`);
                await page.waitForTimeout(500);
                const b = await read();
                assert.equal(a.data.sourceFrame, b.data.sourceFrame);
                assert.equal(a.data.renderCount, b.data.renderCount);
                assert.equal(Number(b.data.sourceFrame), manifests[id - 1].frameRange[1]);
                savedPositions.set(id, 1);
                const image = await screenshot(`r${round}-c${id}-natural-end`);
                report.visits.push({ round, chapter: id, first, reading, last });
                return { nativeDurationSeconds: durations[id - 1], segments: [first, last], reading, exactFinalFrame: b.data.sourceFrame, screenshot: image };
            });
            if (id === 4)
                await check(`r${round}-actual-keepsake-preview-duck-and-url-release`, () => keepsake(round));
            await check(`r${round}-c${id}-return-unload-real-resume-snapshot-and-next`, async () => {
                await button('返回序厅').click();
                await home();
                const returned = await stable(`r${round}-c${id}-home`);
                assert.equal(returned.viewerCanvases, 0);
                await page.locator(`.study-entry-button[data-chapter-id="${id}"]`).click();
                await viewer(id);
                assert.equal(await progress(), 1, 'The actual completed chapter must resume at the saved end.');
                const resumed = await stable(`r${round}-c${id}-resumed-end`);
                assert.equal(Number(resumed.data.sourceFrame), manifests[id - 1].frameRange[1]);
                const nextId = id === 4 ? 1 : id + 1;
                await button(id === 4 ? '重游四卷' : '展开下一卷').click();
                await viewer(nextId);
                assert.equal(await progress(), savedPositions.get(nextId) ?? 0);
                const next = await stable(`r${round}-c${id}-next-${nextId}`);
                return { resumedProgress: resumed.progress, resumedFrame: resumed.data.sourceFrame, nextChapter: next.chapter, nextProgress: next.progress, retainedSnapshotsAtHome: returned.urls.filter(record => record.kind === 'snapshot' && record.revokedAt === null).map(record => ({ chapter: record.metadata?.chapter, src: record.src })) };
            });
        }
    await button('返回序厅').click();
    await home();
    const finalHome = await stable('final-home');
    await check('two-rounds-retain-only-bounded-cache-no-native-world-and-one-shared-audio-graph', async () => {
        assert.equal(finalHome.viewerCanvases, 0);
        validateHealth(finalHome);
        const loopIds = [...new Set(report.samples.flatMap(sample => sample.loopSourceIds))];
        assert.equal(loopIds.length, 3);
        assert.equal(report.visits.length, 8);
        const sourceSeconds = report.segments.reduce((sum, segment) => sum + segment.expectedSourceMs / 1000, 0);
        assert(Math.abs(sourceSeconds - plan.nativeFilmSeconds) < 3, 'Two complete original timelines must have actually advanced; incidental encounter UI alignment is bounded.');
        return { visits: 8, retainedSnapshotURLs: finalHome.urls.filter(record => record.kind === 'snapshot' && record.revokedAt === null).length, actualAudioContextCount: finalHome.contexts.length, cumulativeLoopSources: finalHome.loops.length, sourceSeconds, originalFilmSeconds: plan.nativeFilmSeconds };
    });
    clearInterval(interval);
    interval = null;
    while (sampling)
        await new Promise(resolve => setTimeout(resolve, 30));
    if (sampleFailure)
        throw sampleFailure;
    await check('explicit-stop-fades-and-releases-the-single-native-audio-graph', async () => {
        await button('关闭原创数字声景').click();
        await page.waitForFunction(() => { const s = window.__MDGS_SOAK_READ__(); return s.audio.playback === 'off' && s.audio.retiredGraphs === 0 && s.contexts.every(context => context.state === 'closed'); }, null, { timeout: 15000 });
        const stopped = await read();
        assert.equal(stopped.audio.sourceCount, 0);
        assert(stopped.loops.every(loop=>loop.stopRequestedAt!==null&&loop.disconnectedAt!==null),'Each loop must actually receive native stop() and disconnect(); ended event dispatch after context close is not assumed synchronous.');
        report.final = stopped;
        report.urlLedger = stopped.urls;
        return { contexts: stopped.contexts, releasedLoops: stopped.loops.map(loop => ({ id: loop.id,stopRequestedAt:loop.stopRequestedAt,disconnectedAt:loop.disconnectedAt, endedEventObservedAt: loop.endedAt })), retainedCacheURLCount: stopped.urls.filter(record => record.kind === 'snapshot' && record.revokedAt === null).length, note: 'Up to four cache URLs and optional mounted home pigment remain intentional while the App stays mounted. Document teardown is not counted as explicit URL revocation; ended dispatch is observed, not required synchronously after context.close().' };
    });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.consoleErrors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'pass';
}
catch (error) {
    report.status = 'fail';
    report.failure = { message: error.message, stack: error.stack };
    if (page) {
        report.lastState = await read().catch(() => null);
        await screenshot('failure').catch(() => { });
    }
    process.exitCode = 1;
    console.error(error.stack);
}
finally {
    clearInterval(interval);
    while (sampling)
        await new Promise(resolve => setTimeout(resolve, 30));
    if (page) {
        report.instrumentation = await read().catch(() => null);
        report.urlLedger ??= report.instrumentation?.urls;
    }
    await browser?.close();
    if (server)
        await server.close();
    report.coreAtEnd = await hashes(coreFiles);
    report.changedCoreFiles = coreFiles.filter(file => report.coreAtStart?.[file] !== report.coreAtEnd[file]);
    report.bundleAtEnd = await bundleHashes().catch(() => null);
    report.coreStable = report.changedCoreFiles.length === 0;
    report.bundleStable = JSON.stringify(report.bundleAtStart) === JSON.stringify(report.bundleAtEnd);
    report.coreAssetsAtEnd = await assetHashes().catch(error => ({ error: error.message }));
    report.coreAssetsStable = JSON.stringify(report.coreAssetsAtStart) === JSON.stringify(report.coreAssetsAtEnd);
    report.allProductAtEnd=await allProductHashes();report.changedProductFiles=Object.keys({...report.allProductAtStart,...report.allProductAtEnd}).filter(file=>report.allProductAtStart?.[file]!==report.allProductAtEnd[file]);report.allProductStable=report.changedProductFiles.length===0;
    if (report.status === 'pass' && (!report.coreStable || !report.bundleStable || !report.coreAssetsStable)) {
        report.status = 'invalidated-core-or-build-changed';
        process.exitCode = 1;
    }
    else if(report.status==='pass'&&!report.allProductStable)report.status='pass-core-only-product-changed';
    report.completedAt = new Date().toISOString();
    report.wallClockSeconds = (Date.parse(report.completedAt) - Date.parse(report.startedAt)) / 1000;
    report.memorySummary = { scope: plan.memoryScope, samples: report.samples.length, jsHeapUsedMin: Math.min(...report.samples.map(sample => sample.cdpJSHeap?.JSHeapUsedSize).filter(Number.isFinite)), jsHeapUsedMax: Math.max(...report.samples.map(sample => sample.cdpJSHeap?.JSHeapUsedSize).filter(Number.isFinite)), note: 'Audit histories are held in Node; browser instrumentation uses WeakRefs. No forced GC, no process/GPU memory claim and no assumption that a higher heap maximum proves a leak.' };
    await save();
    const pointer = { status: report.status, runId, report: relative(path.join(out, 'validation.json')), checks: report.checks.length, completedVisits: report.visits.length, wallClockSeconds: report.wallClockSeconds, coreStable: report.coreStable, bundleStable: report.bundleStable,coreAssetsStable:report.coreAssetsStable,allProductStable:report.allProductStable,completedAt: report.completedAt };
    await writeFile(path.join(root, 'reports/art-renewal/soak-latest.json'), JSON.stringify(pointer, null, 2) + '\n');
    console.log(JSON.stringify(pointer, null, 2));
}

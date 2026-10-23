/** Reproducible current-production soundscape acceptance through the real App.
 * Build first, then: node scripts/validate-peony-soundscape.mjs [--build-dir DIR] [--report-file FILE]
 * Browser tools are supplied by MDGS_PLAYWRIGHT_MODULE / MDGS_TEST_BROWSER.
 * A nested HTTP prefix also verifies BASE_URL and selected-audio deployment. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, stat, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const build = path.resolve(root, option('--build-dir', 'dist'));
const output = path.resolve(root, option('--report-file', 'reports/art-renewal/audio-final-app-validation.json'));
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const stems = ['peony-v3-strings.mp3', 'peony-v3-breath.mp3', 'peony-v3-atmosphere.mp3'];
const prefix = '/exhibition/audio-qa/';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.mp3': 'audio/mpeg' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { status: 'running', startedAt: new Date().toISOString(), scope: 'Real current built App at a nested HTTP prefix: truthful original-digital wording, selected stems, opt-in, failure/retry, shared home/unfurl/four-scroll clock, actual cultural/encounter/keepsake reading buttons, chapter-four withdrawal, keyboard volume, injected document visibility pause signal, fade/disposal and cancelled requests. Existing 623.8s native sync is not repeated.', checks: [], errors: [], expectedHttpFailures: [] };
let browser, page;
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (!pathname.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    let filename = path.resolve(build, pathname.slice(prefix.length) || 'index.html');
    if (filename !== build && !filename.startsWith(build + path.sep)) { response.writeHead(403); response.end(); return; }
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
    response.writeHead(200, { 'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(filename));
  } catch { response.writeHead(404); response.end(); }
});
const save = async () => { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n'); };
const snapshot = () => page.evaluate(() => window.__MDGS_AUDIO__.snapshot());
const playback = value => page.waitForFunction(value => window.__MDGS_AUDIO__?.snapshot().playback === value, value, { timeout: 40000 });
const home = () => page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'HOME' && document.querySelector('.peony-atlas')?.classList.contains('is-ready'), null, { timeout: 90000 });
const viewer = () => page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 90000 });
const button = name => page.getByRole('button', { name, exact: true });
async function seek(value) {
  await page.getByRole('slider', { name: '画卷游观进度', exact: true }).fill(String(value));
  await page.waitForFunction(value => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - value) < .00005, value, { timeout: 60000 });
}
try {
  report.buildHtmlSha256 = digest(await readFile(path.join(build, 'index.html')));
  report.sourceSha256 = {};
  for (const file of ['src/audio/PeonySoundscape.ts', 'src/audio/cueMap.ts', 'src/hooks/usePeonySoundscape.tsx', 'src/components/AudioController.tsx', 'src/styles/audio-controller.css', 'scripts/validate-peony-soundscape.mjs']) report.sourceSha256[file] = digest(await readFile(path.join(root, file)));
  report.buildJavascript = {};
  for (const file of await readdir(path.join(build, 'assets'))) if (file.endsWith('.js')) report.buildJavascript[file] = digest(await readFile(path.join(build, 'assets', file)));
  const deployed = await readdir(path.join(build, 'audio'));
  assert(!deployed.some(file => /courtyard-v2|audition/.test(file)), 'Self-created audition/candidates must stay outside the deploy directory.');
  for (const file of stems) assert(deployed.includes(file));
  const original = await readFile(path.join(root, 'public/audio/peony-guzheng-original.mp3'));
  assert.equal(digest(original), '0bc51f9d166ab5522f2068994bb14671838fbe91d0f8c16398cf0ec2f2b30fc7');
  report.checks.push({ test: 'runtime-excludes-own-candidates-and-audition-preserves-user-original-bytes', deployed, passed: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}${prefix}`; report.url = url;
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => report.errors.push(error.message));
  const requests = []; page.on('request', request => { if (request.url().includes('/audio/') && request.url().endsWith('.mp3')) requests.push(request.url()); });
  await page.addInitScript(() => {
    window.__soundscapeAudit = { contexts: [], sources: [], gains: [], starts: [] };
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.__soundscapeAudit.contexts.push(this); }
      createBufferSource() { const node = super.createBufferSource(), start = node.start.bind(node); window.__soundscapeAudit.sources.push(node); node.start = (...args) => { window.__soundscapeAudit.starts.push({ node, context: this, args }); return start(...args); }; return node; }
      createGain() { const node = super.createGain(), connect = node.connect.bind(node); node.connect = (target, ...args) => { if (target === this.destination) node.__mdgsOutput = true; return connect(target, ...args); }; window.__soundscapeAudit.gains.push(node); return node; }
    };
  });
  await page.goto(url); await home();
  assert.equal(requests.length, 0); assert.equal(await page.evaluate(() => window.__soundscapeAudit.contexts.length), 0);
  const labels = await page.locator('.audio-control [aria-label]').evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')));
  assert(labels.every(label => !/古筝|真人|唐乐/.test(label)));
  report.checks.push({ test: 'truthful-wording-and-no-audio-before-explicit-gesture', labels, passed: true });
  let fail = true;
  await page.route('**/audio/peony-v3-breath.mp3', route => { if (fail) { report.expectedHttpFailures.push('breath stem 503'); return route.fulfill({ status: 503, body: 'intentional test outage' }); } return route.continue(); });
  await button('开启原创数字声景').click(); await playback('error');
  assert(await page.evaluate(() => window.__soundscapeAudit.contexts.every(context => context.state === 'closed')));
  fail = false; await button('重试原创数字声景').click(); await playback('playing');
  const first = await snapshot(); assert.deepEqual(first.loopDurations, [160, 160, 24]); assert.equal(first.sourceCount, 3);
  const native = await page.evaluate(() => window.__soundscapeAudit.starts.filter(item => item.node.loop).map(item => ({ when: item.args[0], offset: item.args[1], channels: item.node.buffer.numberOfChannels, context: window.__soundscapeAudit.contexts.indexOf(item.context), rate: item.node.playbackRate.value })));
  assert.deepEqual(native.map(item => item.channels), [2, 1, 1]); assert(native.every(item => item.when === native[0].when && item.context === native[0].context && item.rate === 1));
  report.checks.push({ test: 'actual-mp3-failure-release-retry-three-independent-synchronized-stems', first, native, passed: true });
  const requestCount = requests.length;
  await page.locator('.study-entry-button[data-chapter-id="1"]').click();
  await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_LOADING');
  const loading = await snapshot(); assert.equal(loading.playback, 'playing'); assert.equal(loading.sourceEpoch, first.sourceEpoch);
  await viewer(); const entered = await snapshot(); assert(entered.clock > loading.clock); assert.equal(entered.sourceEpoch, first.sourceEpoch); assert.equal(entered.sourceCount, 3);
  report.checks.push({ test: 'real-home-unfurl-painting-keeps-one-music-clock', loading, entered, passed: true });
  await button('调整声景音量').click();
  const volumeSlider = page.getByRole('slider', { name: '原创数字声景音量', exact: true });
  await volumeSlider.focus(); await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight');
  assert.equal(await volumeSlider.inputValue(), '1');
  const popup = await page.getByRole('group', { name: '原创声景音量设置', exact: true }).evaluate(element => ({ rect: element.getBoundingClientRect().toJSON(), fonts: [...element.querySelectorAll('*')].map(child => Number.parseFloat(getComputedStyle(child).fontSize)).filter(Number.isFinite) }));
  assert(popup.rect.x >= 0 && popup.rect.right <= 1440 && popup.rect.y >= 0 && popup.rect.bottom <= 900 && Math.min(...popup.fonts) >= 12);
  await volumeSlider.fill('25'); await page.waitForTimeout(300);
  const volume = await page.evaluate(() => ({ saved: localStorage.getItem('guose-fanghua:music-volume'), gain: window.__soundscapeAudit.gains.findLast(node => node.__mdgsOutput)?.gain.value }));
  assert.equal(volume.saved, '25'); assert(Math.abs(volume.gain - .25) < .002); await page.keyboard.press('Escape');
  report.checks.push({ test: 'keyboard-volume-real-native-master-gain-storage-and-desktop-popup', volume, popup, passed: true });
  const beforeRead = await snapshot();
  await button('打开文化解读').click(); await page.getByRole('dialog').waitFor();
  await page.waitForFunction(() => window.__MDGS_AUDIO__.snapshot().reading && window.__MDGS_AUDIO__.snapshot().musicGain < .503);
  const reading = await snapshot(); const duckDb = 20 * Math.log10(reading.musicGain / beforeRead.musicGain); assert(duckDb < -5.9 && duckDb > -6.1);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.__MDGS_AUDIO__.snapshot().reading && window.__MDGS_AUDIO__.snapshot().musicGain > .997);
  report.checks.push({ test: 'actual-cultural-reading-button-ducks-six-decibels-and-releases', duckDb, passed: true });
  await page.locator('.art-encounter-entrance').click();
  await page.waitForFunction(() => window.__MDGS_AUDIO__.snapshot().reading && window.__MDGS_AUDIO__.snapshot().musicGain < .503);
  const encounter = await snapshot(); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__MDGS_AUDIO__.snapshot().reading && window.__MDGS_AUDIO__.snapshot().musicGain > .997);
  report.checks.push({ test: 'actual-art-encounter-opening-shares-reading-duck', musicGain: encounter.musicGain, passed: true });
  const middleChapters = [];
  for (const id of [2, 3]) {
    await page.locator('.chapter-link').nth(id - 1).click(); await viewer();
    await page.waitForFunction(id => Number(document.querySelector('.painting canvas')?.dataset.chapter) === id, id);
    const current = await snapshot(); assert.equal(current.sourceEpoch, first.sourceEpoch); assert.equal(current.sourceCount, 3); assert.equal(current.playback, 'playing');
    middleChapters.push({ chapter: id, clock: current.clock, sourceEpoch: current.sourceEpoch, sourceCount: current.sourceCount });
  }
  report.checks.push({ test: 'middle-two-scrolls-keep-original-music-clock-and-three-native-sources', chapters: middleChapters, passed: true });
  await page.locator('.chapter-link').nth(3).click(); await viewer(); await seek(.3); await page.waitForFunction(() => window.__MDGS_AUDIO__.snapshot().zone === '沉香亭畔'); await page.waitForTimeout(2100);
  const bright = await snapshot(); await seek(.5); await page.waitForFunction(() => window.__MDGS_AUDIO__.snapshot().zone === '盛景渐远'); await page.waitForTimeout(2800);
  const fall = await snapshot(); assert(fall.levels[0] < bright.levels[0] * .2 && fall.levels[1] < .015); assert.equal(fall.sourceEpoch, first.sourceEpoch);
  report.checks.push({ test: 'real-fourth-scroll-authored-fall-withdraws-bright-layer-without-restart', bright, fall, passed: true });
  const cueCount = fall.cuesPlayed;
  await page.getByRole('slider', { name: '画卷游观进度', exact: true }).evaluate(async slider => { for (const value of [.2, .8, .3, .9, .5]) { slider.value = String(value); slider.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 20)); } });
  await page.waitForTimeout(500); assert.equal((await snapshot()).cuesPlayed, cueCount); assert.equal((await snapshot()).sourceCount, 3);
  report.checks.push({ test: 'reverse-progress-seeks-do-not-queue-audio-or-recreate-stems', passed: true });
  await seek(1); await button('留一笺春色').click(); await page.locator('.flower-letter-dialog[open]').waitFor();
  await page.waitForFunction(() => window.__MDGS_AUDIO__.snapshot().reading && window.__MDGS_AUDIO__.snapshot().musicGain < .503);
  const letter = await snapshot(); await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__MDGS_AUDIO__.snapshot().reading && window.__MDGS_AUDIO__.snapshot().musicGain > .997);
  report.checks.push({ test: 'actual-end-colophon-keepsake-button-shares-reading-duck', musicGain: letter.musicGain, passed: true });
  await button('返回序厅').click(); await home(); const returned = await snapshot(); assert(returned.enabled && returned.clock > fall.clock); assert.equal(returned.sourceEpoch, first.sourceEpoch);
  assert.equal(requests.length, requestCount); assert(await page.evaluate(() => window.__soundscapeAudit.contexts.filter(context => context.state === 'running').length === 1));
  for (const file of stems) assert(requests.some(request => request === new URL('audio/' + file, url).href));
  assert(!requests.some(request => /courtyard-v2|audition|guzheng-original/.test(request)));
  report.checks.push({ test: 'return-home-and-nested-prefix-keep-shared-clock-without-refetching-or-candidate-downloads', returned, requests: [...new Set(requests)], passed: true });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); }); await playback('paused');
  const paused = await snapshot(); await page.waitForTimeout(450); assert(Math.abs((await snapshot()).clock - paused.clock) < .02);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await playback('playing');
  report.checks.push({ test: 'document-visibility-signal-pauses-shared-audio-clock-and-resumes', passed: true });
  await button('关闭原创数字声景').click(); await playback('off');
  await page.waitForFunction(() => window.__soundscapeAudit.contexts.every(context => context.state === 'closed') && window.__MDGS_AUDIO__.snapshot().retiredGraphs === 0);
  const stopped = await snapshot(), fetchesBeforeEnable = requests.length;
  await button('开启原创数字声景').click(); await playback('playing'); assert.equal(requests.length, fetchesBeforeEnable);
  const restoredStarts = await page.evaluate(() => window.__soundscapeAudit.starts.filter(item => item.node.loop).slice(-3).map(item => ({ offset: item.args[1], duration: item.node.buffer.duration })));
  assert(restoredStarts.every(item => Math.abs(item.offset - stopped.clock % item.duration) < .000001));
  await button('关闭原创数字声景').click(); await page.waitForFunction(() => window.__soundscapeAudit.contexts.every(context => context.state === 'closed'));
  report.checks.push({ test: 'fade-closes-native-context-and-reenable-restores-all-three-loop-positions-from-cache', stoppedClock: stopped.clock, restoredStarts, passed: true });
  await page.reload(); await home(); let release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/audio/peony-v3-strings.mp3', async route => { await held; await route.continue().catch(() => {}); });
  await button('开启原创数字声景').click(); await playback('loading'); await button('关闭原创数字声景').click(); release();
  await page.waitForTimeout(550); assert.equal((await snapshot()).sourceCount, 0); assert.equal((await snapshot()).playback, 'off');
  assert(await page.evaluate(() => window.__soundscapeAudit.contexts.every(context => context.state === 'closed')));
  report.checks.push({ test: 'cancelled-real-app-stem-request-cannot-revive-playback', passed: true });
  assert.deepEqual(report.errors, []); report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = { message: error.message, stack: error.stack }; throw error; }
finally {
  await browser?.close(); if (server.listening) await new Promise(resolve => server.close(resolve));
  report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, errors: report.errors, output: path.relative(root, output) }));
}

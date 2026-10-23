/** Record actual exhibition gestures and its live mixed WebAudio sound.
 * This is a guided excerpt, not a complete playback or an acceptance test.
 * node scripts/capture-exhibition-tour.mjs --build-dir <frozen build>
 * Needs Playwright, Chrome, ffmpeg and ffprobe; uses the same browser env as QA.
 * Product assets and source are read only. All output is in one fresh run folder.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { installLiveAudioCapture } from './exhibition-tour-audio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
assert(args.includes('--build-dir') && option('--build-dir'), 'An explicit frozen --build-dir is required.');
const build = path.resolve(root, option('--build-dir'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.resolve(root, option('--output-dir', 'tmp/exhibition-tour'), runId);
await mkdir(path.join(output, 'frames'), { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rel = file => path.relative(root, file).replaceAll('\\', '/');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const report = {
  status: 'recording', runId, startedAt: new Date().toISOString(),
  kind: 'Guided interaction excerpt / 导览录像（节选交互）',
  method: 'Actual unaccelerated page gestures. CDP composited JPEG frames retain wall-clock timestamps. A passive native AudioWorklet tap records lossless Float32 stereo from the actual master WebAudio mix, including ducking and incidental cues. Sample positions and getOutputTimestamp associate the actual output clock with video epoch. No external recording, voice, substitute soundtrack, product clocks or source data are changed.',
  buildDirectory: rel(build), outputDirectory: rel(output), actions: [], errors: [],
};
const save = () => writeFile(path.join(output, 'recording.json'), JSON.stringify(report, null, 2) + '\n');
const inputFiles = ['index.html', ...(await readdir(path.join(build, 'assets'))).filter(name => /\.(js|css)$/.test(name)).map(name => 'assets/' + name)];
const inputHashes = async () => Object.fromEntries(await Promise.all(inputFiles.map(async file => [file, digest(await readFile(path.join(build, file)))])));
report.bundleBefore = await inputHashes();
const recorderFiles = ['scripts/capture-exhibition-tour.mjs', 'scripts/exhibition-tour-audio.mjs'];
const recorderBytes = await Promise.all(recorderFiles.map(file => readFile(path.join(root, file))));
report.recorderSha256 = Object.fromEntries(recorderFiles.map((file, index) => [file, digest(recorderBytes[index])]));
await mkdir(path.join(output, 'recorder'));
await Promise.all(recorderFiles.map((file, index) => writeFile(path.join(output, 'recorder', path.basename(file)), recorderBytes[index])));
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(build, pathname === '/' ? 'index.html' : pathname.slice(1));
    assert(file.startsWith(build + path.sep));
    assert((await stat(file)).isFile());
    const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
let browser, context, page, cdp, audioCapture;
const frames = [], writes = [], subtitles = [];
const frameWriteErrors = [];
let lastFrame = -Infinity;
let acceptingFrames = true;
async function run(command, commandArgs) {
  let log = '';
  const child = spawn(command, commandArgs, { cwd: output, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { log += bytes; }); child.stderr.on('data', bytes => { log += bytes; });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error(command + ' exited ' + code + '\n' + log.slice(-3000)))); });
  return log;
}
async function mark(label) {
  const state = await page.evaluate(() => ({ epoch: Date.now() / 1000, phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase, chapter: document.querySelector('.painting canvas')?.dataset.chapter, progress: document.querySelector('.painting canvas')?.dataset.progress }));
  report.actions.push({ label, ...state }); console.log(label); await save();
}
const pause = milliseconds => page.waitForTimeout(milliseconds);
async function click(locator) {
  const bounds = await locator.boundingBox();
  if (bounds) await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { steps: 18 });
  await pause(180); await locator.click();
}
async function readyViewer(id) {
  await page.waitForFunction(id => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER' && document.querySelector('.painting canvas')?.dataset.chapter === String(id) && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0', id, { timeout: 90000 });
  await pause(1000);
}
async function chapter(id) {
  await mark('展开第' + id + '卷');
  await click(page.locator('.chapter-link').nth(id - 1)); await readyViewer(id);
}
async function playFor(milliseconds) {
  await click(page.getByRole('button', { name: '自动展卷', exact: true })); await pause(milliseconds);
  await click(page.getByRole('button', { name: '暂停展卷', exact: true }));
}
async function openEncounter() {
  await click(page.locator('.art-encounter-entrance'));
  await page.locator('.art-encounters').waitFor({ state: 'visible' }); await pause(1000);
}
async function closeEncounter() { await click(page.getByRole('button', { name: '收起画中有遇', exact: true })); await pause(500); }
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
  page = await context.newPage(); report.browser = browser.version();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(response.status() + ' ' + response.url()); });
  audioCapture = await installLiveAudioCapture(page, path.join(output, 'live-sound.f32'));
  const url = `http://127.0.0.1:${server.address().port}/`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.peony-atlas')?.classList.contains('is-ready'));
  await pause(2600); await documentReady();
  cdp = await context.newCDPSession(page);
  cdp.on('Page.screencastFrame', event => {
    void cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    if (!acceptingFrames) return;
    const timestamp = event.metadata.timestamp;
    if (timestamp - lastFrame < 1 / 30 - .001) return;
    lastFrame = timestamp;
    const file = 'frames/' + String(frames.length).padStart(6, '0') + '.jpg';
    frames.push({ file, timestamp });
    // Attach a rejection handler in this same task; disk errors must reach the
    // recording report instead of becoming unhandled rejections mid-tour.
    writes.push(writeFile(path.join(output, file), Buffer.from(event.data, 'base64')).catch(error => {
      frameWriteErrors.push({ file, error: String(error) });
    }));
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 86, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  await mark('以花为引 · 序厅'); await pause(3500);
  await click(page.getByRole('button', { name: '开启原创数字声景', exact: true }));
  await page.waitForFunction(() => document.querySelector('.audio-control')?.dataset.audioState === 'playing');
  await audioCapture.ready();
  await mark('启声 · 原创数字声景');
  await click(page.getByRole('button', { name: '轻拂花影，唤醒牡丹花色', exact: true })); await pause(3500);
  await mark('启卷 · 入画'); await click(page.locator('.atlas-begin')); await readyViewer(1);
  await mark('神都花事 · 原速游观节选'); await playFor(8500);
  await mark('一花，两种记忆 · 辨读传说与史料'); await openEncounter(); await pause(2500);
  await click(page.getByRole('button', { name: '史料', exact: true })); await pause(3000); await closeEncounter();
  await chapter(2); await mark('花入万家 · 原速游观节选'); await playFor(6500);
  await mark('共此一城春 · 循花、舟、桥'); await openEncounter();
  for (const name of ['望向花间', '望向舟中', '望向桥上']) { await click(page.getByRole('button', { name, exact: true })); await pause(2000); }
  await closeEncounter(); await chapter(3); await mark('锦绣花意 · 原速游观节选'); await playFor(5500);
  await mark('选花入锦 · 原画花意与纹样'); await openEncounter();
  const flower = await page.locator('.art-anchor--flower').boundingBox(), cloth = await page.locator('.art-anchor--cloth').boundingBox();
  assert(flower && cloth); await page.mouse.move(flower.x + flower.width / 2, flower.y + flower.height / 2, { steps: 20 });
  await page.mouse.down(); await pause(400);
  for (let step = 1; step <= 45; step++) {
    const t = step / 45, ease = t * t * (3 - 2 * t);
    await page.mouse.move(flower.x + flower.width / 2 + (cloth.x + cloth.width / 2 - flower.x - flower.width / 2) * ease,
      flower.y + flower.height / 2 + (cloth.y + cloth.height / 2 - flower.y - flower.height / 2) * ease - Math.sin(Math.PI * t) * 24);
    await pause(28);
  }
  await pause(250); await page.mouse.up();
  await page.locator('.art-brocade-detail[data-phase="woven"]').waitFor(); await pause(4000); await closeEncounter();
  await chapter(4); await mark('国色倾城 · 人花相映'); await playFor(10500);
  await mark('花容入诗 · 展读清平调'); await openEncounter();
  await click(page.getByRole('button', { name: '展读原诗', exact: true })); await pause(5000); await closeEncounter();
  await mark('从盛景到回望 · 连续原速至卷末');
  await click(page.getByRole('button', { name: '自动展卷', exact: true }));
  await page.waitForFunction(() => Number(document.querySelector('.painting canvas')?.dataset.progress) === 1, null, { timeout: 60000 });
  await mark('卷末 · 千年余韵');
  await page.waitForFunction(() => Number(document.querySelector('.painting canvas')?.dataset.progress) === 1 && document.querySelector('.painting canvas')?.dataset.loadingTextures === '0');
  await pause(3000); await click(page.getByRole('button', { name: '留一笺春色', exact: true }));
  await page.locator('.flower-letter-dialog[open]').waitFor();
  await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false');
  await pause(2000); await mark('钤印 · 留芳'); await click(page.getByRole('button', { name: '钤印 · 留芳', exact: true }));
  await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false' && !document.querySelector('.flower-letter-primary')?.disabled);
  await pause(2500);
  const pendingDownload = page.waitForEvent('download'); await click(page.getByRole('button', { name: '存为花笺', exact: true }));
  const download = await pendingDownload; await download.saveAs(path.join(output, download.suggestedFilename()));
  report.keepsake = download.suggestedFilename(); await pause(1500); await page.keyboard.press('Escape');
  await mark('收卷 · 归于画境'); await click(page.getByRole('button', { name: '返回序厅', exact: true }));
  await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'HOME');
  await pause(3500); await audioCapture.armTail();
  await click(page.getByRole('button', { name: '关闭原创数字声景', exact: true })); await pause(1000);
  const audio = await audioCapture.finish(); audioCapture = null;
  await writeFile(path.join(output, 'audio-clock.json'), JSON.stringify(audio, null, 2) + '\n');
  await cdp.send('Page.stopScreencast'); acceptingFrames = false;
  const end = Date.now() / 1000; await Promise.all(writes);
  assert.equal(frameWriteErrors.length, 0, 'One or more actual frame files could not be written.');
  assert(frames.length > 100); assert.equal((await stat(path.join(output, 'live-sound.f32'))).size, audio.bytes);
  await writeFile(path.join(output, 'frames.json'), JSON.stringify(frames, null, 2));
  const first = frames[0].timestamp, duration = end - first, offset = audio.start - first;
  const concat = ['ffconcat version 1.0'];
  frames.forEach((frame, index) => { concat.push(`file '${frame.file}'`, `duration ${(Math.max(.001, (frames[index + 1]?.timestamp ?? end) - frame.timestamp)).toFixed(6)}`); });
  concat.push(`file '${frames.at(-1).file}'`); await writeFile(path.join(output, 'frames.ffconcat'), concat.join('\n') + '\n');
  report.video = { width: 1920, height: 1080, frames: frames.length, firstFrameEpoch: first, lastFrameEpoch: frames.at(-1).timestamp, durationSeconds: duration, soundStartEpoch: audio.start, soundOffsetSeconds: offset, soundSampleRate: audio.sampleRate, soundClockSpreadSeconds: audio.clockSpreadSeconds, soundSampleFrames: audio.frames, frameRate: 30 };
  const timecode = seconds => { const ms = Math.round(Math.max(0, seconds) * 1000); return [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60].map(n => String(n).padStart(2, '0')).join(':') + ',' + String(ms % 1000).padStart(3, '0'); };
  for (const [index, action] of report.actions.entries()) subtitles.push(`${index + 1}\n${timecode(action.epoch - first)} --> ${timecode(Math.min(duration, (report.actions[index + 1]?.epoch ?? end) - first, action.epoch - first + 4.5))}\n${action.label}\n`);
  await writeFile(path.join(output, '导览字幕.srt'), subtitles.join('\n'));
  await context.close(); context = null; await browser.close(); browser = null;
  report.status = 'encoding'; await save();
  const soundFilter = offset >= 0 ? `adelay=${Math.round(offset * 1000)}:all=1,apad` : `atrim=start=${(-offset).toFixed(6)},asetpts=PTS-STARTPTS,apad`;
  // Retain the source screencast JPEG matrix/range. A tested 709 conversion
  // introduced a larger RGB shift than direct full-range encoding.
  const encodingLog = await run(process.env.MDGS_FFMPEG || 'ffmpeg', ['-hide_banner', '-f', 'concat', '-safe', '0', '-i', 'frames.ffconcat', '-f', 'f32le', '-ar', String(audio.sampleRate), '-ac', '2', '-i', 'live-sound.f32', '-filter_complex', `[1:a]${soundFilter}[sound]`, '-map', '0:v', '-map', '[sound]', '-vf', 'fps=30,format=yuv420p', '-color_range', 'pc', '-colorspace', 'bt470bg', '-t', duration.toFixed(6), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '国色长卷-导览录像.mp4']);
  await writeFile(path.join(output, 'encoding.log'), encodingLog);
  report.probe = JSON.parse(await run(process.env.MDGS_FFPROBE || 'ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', '国色长卷-导览录像.mp4']));
  assert(report.probe.streams.some(stream => stream.codec_type === 'video' && stream.width === 1920 && stream.height === 1080));
  assert(report.probe.streams.some(stream => stream.codec_type === 'audio'));
  report.bundleAfter = await inputHashes(); assert.deepEqual(report.bundleAfter, report.bundleBefore);
  report.recorderAfter = Object.fromEntries(await Promise.all(recorderFiles.map(async file => [file, digest(await readFile(path.join(root, file)))])));
  assert.deepEqual(report.recorderAfter, report.recorderSha256, 'Recorder source changed during this recording.');
  assert.equal(report.errors.length, 0, report.errors.join('\n'));
  report.status = 'recorded'; report.completedAt = new Date().toISOString(); await save();
  console.log('Recorded ' + rel(path.join(output, '国色长卷-导览录像.mp4')));
} catch (error) {
  report.status = 'failed'; report.failure = error.stack; await save();
  // Keep the actual capture evidence even when a strict clock/sample assertion
  // rejects the recording. A failed recording must remain visibly failed.
  if (audioCapture) {
    try {
      await writeFile(path.join(output, 'audio-failure-diagnostics.json'), JSON.stringify(await audioCapture.diagnostics(), null, 2) + '\n');
      report.audioFailureDiagnostics = 'audio-failure-diagnostics.json';
    } catch (diagnosticError) { report.audioDiagnosticFailure = String(diagnosticError); }
  }
  await cdp?.send('Page.stopScreencast').catch(() => {});
  await Promise.allSettled(writes);
  await writeFile(path.join(output, 'frames.json'), JSON.stringify(frames, null, 2) + '\n');
  report.failedCapture = { frames: frames.length, firstEpoch: frames[0]?.timestamp, lastEpoch: frames.at(-1)?.timestamp };
  report.frameWriteErrors = frameWriteErrors;
  await save();
  await page?.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await cdp?.send('Page.stopScreencast').catch(() => {});
  await Promise.allSettled(writes);
  await audioCapture?.dispose().catch(() => {});
  await context?.close().catch(() => {}); await browser?.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
async function documentReady() { await page.evaluate(() => document.fonts.ready); }

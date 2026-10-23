/** Verify the actual packaged Electron application with its bundled browser.
 * node scripts/validate-desktop.mjs --executable PATH [--report PATH]
 * MDGS_PLAYWRIGHT_MODULE supplies the local QA tool, never an app dependency.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) assert(['--executable', '--report'].includes(args[i]) && args[i + 1], 'Expected --executable PATH [--report PATH].');
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
assert(option('--executable'), '--executable must point to the packaged application EXE.');
const executable = path.resolve(option('--executable'));
const reportPath = path.resolve(root, option('--report', 'reports/desktop/validation.json'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifacts = path.join(root, 'tmp/desktop-validation', runId);
const downloadPath = path.join(artifacts, 'flower-letter.png');
const profile = path.join(artifacts, 'profile');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
async function hashFile(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
const { _electron } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const report = {
  status: 'running', startedAt: new Date().toISOString(), runId,
  scope: 'Actual Windows packaged Electron executable, bundled Chromium/Node versions, local inventory SHA, standard secure custom protocol, four real scrolls/encounters/original text, local audio/font/art, PNG download and F11/Escape. HTTP(S) requests are aborted throughout the reload and interactions; this is a runtime dependency test, not a complete cross-device visual fidelity certification.',
  executable: relative(executable), checks: [], errors: [], browserErrors: [], badResponses: [], failedRequests: [], externalRequests: [],
};
let app, page;
let allowedAborts = 0;
const requested = [];
await mkdir(artifacts, { recursive: true });
await mkdir(path.dirname(reportPath), { recursive: true });
async function save() { await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); }
async function check(name, run) {
  try { const evidence = await run(); report.checks.push({ test: name, passed: true, ...evidence }); console.log('PASS ' + name); }
  catch (error) {
    const screenshot = path.join(artifacts, name + '-failed.png');
    await page?.screenshot({ path: screenshot }).catch(() => {});
    report.checks.push({ test: name, passed: false, error: error.stack || String(error), screenshot: relative(screenshot),
      state: await page?.evaluate(() => ({ phase: document.querySelector('[data-journey-phase]')?.dataset.journeyPhase, canvas: { ...document.querySelector('.painting canvas')?.dataset } })).catch(() => null) });
    console.log('FAIL ' + name + ': ' + error.message); throw error;
  } finally { await save(); }
}
const phase = value => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 120000 });
const ready = chapter => page.waitForFunction(chapter => {
  const canvas = document.querySelector('.painting canvas');
  return Number(canvas?.dataset.chapter) === chapter && canvas?.dataset.firstFrameReady === 'true' && canvas.dataset.loadingTextures === '0' && canvas.dataset.shaderErrors === '[]';
}, chapter, { timeout: 120000 });
async function seek(progress) {
  await page.locator('input[aria-label="画卷游观进度"]').evaluate((input, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, progress);
  await page.waitForFunction(value => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - value) < .00001, progress, { timeout: 120000 });
}
await save();
try {
  assert((await stat(executable)).isFile());
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  app = await _electron.launch({ executablePath: executable, args: ['--mdgs-smoke', '--mdgs-smoke-profile=' + profile], cwd: artifacts,
    env: environment, timeout: 60000 });
  page = await app.firstWindow({ timeout: 60000 });
  page.setDefaultTimeout(45000);
  await check('bundled-electron-chromium-node-and-isolated-renderer', async () => {
    report.runtime = await app.evaluate(({ app, BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return { packaged: app.isPackaged, name: app.name, versions: { ...process.versions }, executable: process.execPath,
        resourcesPath: process.resourcesPath, appPath: app.getAppPath(), userData: app.getPath('userData'),
        preferences: window.webContents.getLastWebPreferences() };
    });
    assert.equal(report.runtime.packaged, true);
    assert(report.runtime.versions.electron && report.runtime.versions.chrome && report.runtime.versions.node);
    assert.equal(path.resolve(report.runtime.executable), executable);
    assert.equal(report.runtime.preferences.nodeIntegration, false);
    assert.equal(report.runtime.preferences.contextIsolation, true);
    assert.equal(report.runtime.preferences.sandbox, true);
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
    return { runtime: report.runtime };
  });
  const web = path.join(report.runtime.resourcesPath, 'web');
  const inventoryFile = path.join(web, '.mdgs-exhibition-package.json');
  const inventoryBytes = await readFile(inventoryFile);
  const inventory = JSON.parse(inventoryBytes);
  await check('packaged-resource-inventory-original-bytes-and-license-files', async () => {
    const excluded = new Set(['serve.cjs', '启动展览.cmd', '运行说明.txt']);
    const verified = [];
    for (const item of inventory.files) {
      if (excluded.has(item.path)) continue;
      const file = path.resolve(web, item.path);
      assert(file.startsWith(web + path.sep), 'Inventory path must stay within web root.');
      assert.equal(await hashFile(file), item.sha256, item.path);
      verified.push(item.path);
    }
    for (const item of ['ui/peony-line.svg', 'ui/roller-band.svg', 'fonts/OFL-WenKai.txt', 'third-party-licenses/NOTICE.txt']) assert(verified.includes(item), item);
    const applicationDirectory = path.dirname(executable);
    assert((await stat(path.join(applicationDirectory, 'LICENSE.electron.txt')).catch(() => stat(path.join(applicationDirectory, 'LICENSE')))).isFile());
    assert((await stat(path.join(applicationDirectory, 'LICENSES.chromium.html'))).isFile());
    report.inventory = { sha256: sha(inventoryBytes), verifiedFiles: verified.length, bytes: inventory.bytesExcludingInventory };
    return report.inventory;
  });
  await check('custom-protocol-gzip-mime-and-path-boundary', async () => {
    const field = inventory.files.find(item => item.path.endsWith('.f16.gz')); assert(field);
    const responses = await app.evaluate(async ({ net }, urls) => {
      const result = [];
      for (const url of urls) {
        try {
          const response = await net.fetch(url);
          const bytes = new Uint8Array(await response.arrayBuffer());
          result.push({ url, status: response.status, type: response.headers.get('content-type'), encoding: response.headers.get('content-encoding'),
            size: bytes.byteLength, magic: [...bytes.slice(0, 2)], base64: Buffer.from(bytes).toString('base64') });
        } catch (error) { result.push({ url, error: error.message }); }
      }
      return result;
    }, ['mdgs://app/' + encodeURI(field.path), 'mdgs://app/ui/peony-line.svg', 'mdgs://app/..%5c..%5cpackage.json', 'mdgs://app/%00', 'mdgs://app/deliberately-missing-qa-file.txt', 'mdgs://other/index.html']);
    for (const response of responses) if (response.base64 !== undefined) { response.sha256 = sha(Buffer.from(response.base64, 'base64')); delete response.base64; }
    report.protocolResponses = responses;
    assert.equal(responses[0].status, 200); assert.deepEqual(responses[0].magic, [31, 139]); assert.equal(responses[0].encoding, null);
    assert.equal(responses[0].sha256, field.sha256);
    assert.equal(responses[1].status, 200); assert.match(responses[1].type, /image\/svg\+xml/);
    for (const response of responses.slice(2)) assert(response.error || [400, 403, 404, 405].includes(response.status), JSON.stringify(response));
    return { field: field.path, responses };
  });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() }); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('request', request => { requested.push(request.url()); });
  await app.context().route(/^https?:\/\//, route => { report.externalRequests.push(route.request().url()); return route.abort('internetdisconnected'); });
  await page.goto('mdgs://app/');
  await check('offline-home-font-four-art-layers-and-original-soundscape', async () => {
    await phase('HOME'); await page.waitForFunction(() => document.querySelector('.peony-atlas')?.classList.contains('is-ready'), null, { timeout: 90000 });
    assert.equal(await page.evaluate(() => location.origin), 'mdgs://app');
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    const images = await page.locator('.peony-atlas img').evaluateAll(images => images.map(image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight })));
    assert(images.filter(image => image.src.includes('/ui/peony-atlas/') && image.width > 0).length >= 4);
    const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(face => face.family.includes('MDGS Kai')).map(face => ({ family: face.family, status: face.status })); });
    assert(fonts.some(face => face.status === 'loaded'));
    await page.locator('.audio-control--foyer').getByRole('button', { name: '开启原创数字声景', exact: true }).click();
    await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing');
    const sound = await page.evaluate(() => window.__MDGS_AUDIO__.snapshot());
    assert.equal(sound.sourceCount, 3); assert.equal(sound.contextState, 'running'); assert.deepEqual(sound.loopDurations, [160, 160, 24]);
    await page.screenshot({ path: path.join(artifacts, 'home.png') });
    return { images, fonts, sound };
  });
  await check('desktop-f11-and-escape-fullscreen', async () => {
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      globalThis.__MDGS_TEST_KEYS__ = [];
      window.webContents.on('before-input-event', (_event, input) => { globalThis.__MDGS_TEST_KEYS__.push({ type: input.type, key: input.key, code: input.code }); });
      window.show(); window.focus();
    });
    const key = code => app.evaluate(({ BrowserWindow }, code) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.sendInputEvent({ type: 'keyDown', keyCode: code });
      contents.sendInputEvent({ type: 'keyUp', keyCode: code });
    }, code);
    const fullscreen = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
    const wait = async value => { const start = Date.now(); while ((await fullscreen()) !== value) { assert(Date.now() - start < 10000, 'Fullscreen transition timed out.'); await new Promise(resolve => setTimeout(resolve, 100)); } };
    if (await fullscreen()) { await key('Escape'); await wait(false); }
    await key('F11'); await wait(true);
    await key('Escape'); await wait(false);
    return { entered: true, escaped: true, driver: 'Electron webContents.sendInputEvent', inputEvents: await app.evaluate(() => globalThis.__MDGS_TEST_KEYS__) };
  });
  for (const chapter of [1, 2, 3, 4]) await check('offline-chapter-' + chapter + '-real-graphics-interaction-and-original-text', async () => {
    if (chapter === 1) await page.locator('.study-entry-button[data-chapter-id="1"]').click(); else await page.locator('.chapter-link').nth(chapter - 1).click();
    await phase('SCROLL_VIEWER'); await ready(chapter);
    const canvas = await page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
    if (!report.gpu) report.gpu = await page.locator('.painting canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), version: gl.getParameter(gl.VERSION) }; });
    await seek(.5); await ready(chapter);
    await page.screenshot({ path: path.join(artifacts, `chapter-${chapter}-middle.png`) });
    await page.locator('.art-encounter-entrance').click(); await page.locator('.art-encounters').waitFor();
    if (chapter === 1) {
      await page.locator('.art-reading-tabs').getByRole('button', { name: '史料', exact: true }).click(); assert.match(await page.locator('.art-copy').innerText(), /洛阳牡丹始盛/);
    } else if (chapter === 2) {
      await page.locator('.art-gaze-steps button').nth(2).click(); assert.match(await page.locator('.art-gaze-reading').innerText(), /桥上人相望/);
    } else if (chapter === 3) {
      await page.getByRole('button', { name: '选取原画牡丹的花意，可拖至锦面或按回车选取', exact: true }).click();
      await page.getByRole('button', { name: '将已选的花意入锦', exact: true }).click(); await page.locator('.art-brocade-detail[data-phase="woven"]').waitFor();
    } else {
      await page.locator('.art-poem-toggle').click(); await page.locator('.art-poem-lines').waitFor(); assert.match(await page.locator('.art-poem-lines').innerText(), /云想衣裳花想容/);
    }
    await page.waitForFunction(() => [...document.querySelectorAll('.art-encounters img')].every(image => image.complete && image.naturalWidth > 0));
    const encounter = await page.locator('.art-encounters').innerText();
    await page.screenshot({ path: path.join(artifacts, `chapter-${chapter}-encounter.png`) });
    await page.getByRole('button', { name: '收起画中有遇', exact: true }).click();
    await page.getByRole('button', { name: '打开文化解读', exact: true }).click();
    await page.getByRole('tab', { name: '原作全文', exact: true }).click();
    const original = await page.locator('.culture-panel [role="tabpanel"]:visible').innerText(); assert(original.length > 100);
    await page.getByRole('button', { name: '关闭文化解读', exact: true }).click();
    await seek(1); await ready(chapter); await page.locator('.end-colophon').waitFor();
    await page.screenshot({ path: path.join(artifacts, `chapter-${chapter}-end.png`) });
    assert.equal((await page.evaluate(() => window.__MDGS_AUDIO__.snapshot())).playback, 'playing');
    return { chapter, canvas, encounter, originalCharacters: original.length, sourceEndFrame: await page.locator('.painting canvas').getAttribute('data-source-frame') };
  });
  await check('flower-letter-real-native-download-1200x1600-png', async () => {
    await app.evaluate(({ session }, file) => {
      globalThis.__MDGS_TEST_DOWNLOAD__ = { state: 'waiting', file };
      session.defaultSession.once('will-download', (_event, item) => {
        item.setSavePath(file);
        globalThis.__MDGS_TEST_DOWNLOAD__.filename = item.getFilename();
        item.once('done', (_event, state) => { globalThis.__MDGS_TEST_DOWNLOAD__.state = state; });
      });
    }, downloadPath);
    await page.getByRole('button', { name: '留一笺春色', exact: true }).click();
    await page.waitForFunction(() => { const image = document.querySelector('.flower-letter-dialog[open] img'); return image?.complete && image.naturalWidth === 1200; });
    await page.getByRole('button', { name: /钤印/ }).click();
    await page.waitForFunction(() => !document.querySelector('.flower-letter-primary')?.disabled);
    await page.getByRole('button', { name: '存为花笺', exact: true }).click();
    const started = Date.now(); let download;
    do {
      download = await app.evaluate(() => globalThis.__MDGS_TEST_DOWNLOAD__);
      assert(!['cancelled', 'interrupted'].includes(download.state), JSON.stringify(download));
      assert(Date.now() - started < 45000, 'Native PNG download did not complete.');
      if (download.state !== 'completed') await new Promise(resolve => setTimeout(resolve, 100));
    } while (download.state !== 'completed');
    const bytes = await readFile(downloadPath);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG'); assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 1600);
    assert(requested.some(url => /\/assets\/flowerLetter-[^/]+\.js$/.test(url)), 'Real lazy export chunk must execute.');
    await page.screenshot({ path: path.join(artifacts, 'sealed-flower-letter.png') });
    await page.getByRole('button', { name: '收起观者花笺', exact: true }).click();
    return { download: relative(downloadPath), bytes: bytes.length, sha256: sha(bytes), suggestedFilename: download.filename };
  });
  await check('no-missing-resource-page-error-or-external-network-dependency', async () => {
    assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.badResponses, []); assert.deepEqual(report.externalRequests, []);
    const unexpected = report.failedRequests.filter(item => item.error !== 'net::ERR_ABORTED'); assert.deepEqual(unexpected, []);
    allowedAborts = report.failedRequests.length;
    const stems = ['strings', 'breath', 'atmosphere'].map(name => `audio/peony-v3-${name}.mp3`);
    assert(stems.every(file => requested.some(url => url.endsWith(file))));
    assert.equal(sha(await readFile(inventoryFile)), sha(inventoryBytes));
    return { requestedURLs: [...new Set(requested)].sort(), expectedRendererDisposalAborts: allowedAborts, inventoryUnchanged: true };
  });
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.errors.push(error.stack || String(error)); }
finally {
  if (app) await app.close().catch(error => report.errors.push('App close: ' + error.message));
  report.completedAt = new Date().toISOString(); report.artifactDirectory = relative(artifacts); await save();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter(item => !item.passed).map(item => item.test), report: relative(reportPath), errors: report.errors }));
  if (report.status !== 'passed') process.exitCode = 1;
}

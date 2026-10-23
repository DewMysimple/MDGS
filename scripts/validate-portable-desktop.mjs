/** Smoke-test the delivered single-file portable EXE, including its NSIS
 * extraction/launch/exit path. Playwright is only a local QA dependency.
 * node scripts/validate-portable-desktop.mjs --executable PATH
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
assert(args.length === 2 && args[0] === '--executable' && args[1], 'Usage: node scripts/validate-portable-desktop.mjs --executable PATH');
assert.equal(process.platform, 'win32', 'This smoke test launches the Windows portable EXE.');
const executable = path.resolve(args[1]);
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const artifacts = path.join(root, 'tmp/portable-desktop-validation', runId);
const profile = path.join(artifacts, 'profile');
const reportPath = path.join(root, 'reports/desktop/portable-validation.json');
const relative = file => path.relative(root, file).split(path.sep).join('/');
const report = {
  status: 'running', startedAt: new Date().toISOString(), runId, executable,
  scope: 'Launch the final single-file portable Windows EXE with its NSIS extraction layer; attach to its bundled Chromium over CDP, reload with HTTP(S) blocked, verify local home/font/audio and chapter-one native first frame, then close the browser and require the owned portable parent to exit successfully. This is a launch smoke test, not full visual certification.',
  checks: [], errors: [], browserErrors: [], badResponses: [], failedRequests: [], externalRequests: [],
};
let child, childResult, browser, page, browserSession;
let exitResult;
let stdout = '', stderr = '';
const requested = [];
await mkdir(artifacts, { recursive: true });
await mkdir(path.dirname(reportPath), { recursive: true });
const save = () => writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
async function check(name, callback) {
  try {
    const evidence = await callback();
    report.checks.push({ test: name, passed: true, ...evidence });
    console.log('PASS ' + name);
  } catch (error) {
    report.checks.push({ test: name, passed: false, error: error.stack || String(error) });
    console.log('FAIL ' + name + ': ' + error.message);
    throw error;
  } finally { await save(); }
}
async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', resolve); });
  const port = listener.address().port;
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}
function debuggingVersion(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({ hostname: '127.0.0.1', port, path: '/json/version', timeout: 1000 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        try { assert.equal(response.statusCode, 200); resolve(JSON.parse(body)); }
        catch (error) { reject(error); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('CDP endpoint not ready.')));
    request.on('error', reject);
  });
}
async function processEvidence(pid) {
  const literalProfile = profile.replaceAll("'", "''");
  const command = `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -eq ${pid} -or ($_.CommandLine -and $_.CommandLine.Contains('${literalProfile}')) } | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Json -Compress`;
  return new Promise(resolve => {
    const process_ = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    process_.stdout.on('data', bytes => { stdout += bytes; });
    process_.stderr.on('data', bytes => { stderr += bytes; });
    const timer = setTimeout(() => process_.kill(), 10000);
    process_.on('error', error => { clearTimeout(timer); resolve({ unavailable: error.message }); });
    process_.on('close', code => {
      clearTimeout(timer);
      try { resolve(code === 0 ? { processes: stdout.trim() ? JSON.parse(stdout) : [] } : { unavailable: stderr.trim() || `PowerShell exited ${code}` }); }
      catch (error) { resolve({ unavailable: error.message }); }
    });
  });
}
async function waitForOwnedExit(milliseconds) {
  if (exitResult) return exitResult;
  let timer;
  try {
    return await Promise.race([childResult, new Promise(resolve => { timer = setTimeout(() => resolve(null), milliseconds); })]);
  } finally { clearTimeout(timer); }
}
async function terminateOwnedTree() {
  if (!child?.pid || exitResult) return;
  report.forcedCleanup = { rootPid: child.pid, scope: 'Only the process tree owned by this test.' };
  await new Promise(resolve => {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', resolve); killer.on('close', resolve);
  });
  await waitForOwnedExit(10000);
}

await save();
try {
  const info = await stat(executable);
  assert(info.isFile() && info.size > 100 * 1024 * 1024, 'Expected the final portable EXE containing the bundled browser and exhibition.');
  report.executableBytes = info.size;
  report.executableSha256 = await hashFile(executable);
  const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const expectedElectron = packageMetadata.devDependencies.electron;
  assert.match(expectedElectron, /^45\./, 'This acceptance is bound to the selected Electron 45 runtime.');
  const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
  const port = await availablePort();
  const environment = { ...process.env };
  delete environment.ELECTRON_RUN_AS_NODE;
  report.launch = { executable, args: ['--mdgs-smoke', '--mdgs-smoke-profile=' + profile, '--remote-debugging-port=' + port], profile, port, windowsHide: true };
  child = spawn(executable, report.launch.args, { cwd: artifacts, env: environment, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  report.launch.pid = child.pid;
  child.stdout.on('data', bytes => { stdout = (stdout + bytes.toString()).slice(-16000); });
  child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-16000); });
  childResult = new Promise(resolve => {
    child.once('error', error => { exitResult = { error: error.message }; resolve(exitResult); });
    child.once('close', (code, signal) => { exitResult = { code, signal }; resolve(exitResult); });
  });
  await check('portable-exe-extracts-and-starts-bundled-electron-45', async () => {
    const deadline = Date.now() + 120000;
    let endpoint, lastError;
    while (Date.now() < deadline) {
      assert(!exitResult, 'Portable parent exited before CDP became ready: ' + JSON.stringify(exitResult));
      try { endpoint = await debuggingVersion(port); break; }
      catch (error) { lastError = error; await delay(500); }
    }
    assert(endpoint, 'Portable EXE did not expose its browser within 120 seconds: ' + lastError?.message);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 10000 });
    browserSession = await browser.newBrowserCDPSession();
    const version = await browserSession.send('Browser.getVersion');
    assert(version.userAgent.includes('Electron/' + expectedElectron), 'Unexpected Electron user agent: ' + version.userAgent);
    assert.match(version.product, /^Chrome\/\d+\./);
    assert(version.userAgent.includes('Chrome/' + version.product.split('/')[1].split('.')[0] + '.'), 'CDP product and application user agent must agree on the Chromium major version.');
    report.runtime = { expectedElectron, endpoint, browserVersion: version, chromiumVersion: browser.version() };
    const contexts = browser.contexts();
    assert(contexts.length, 'The portable application did not create a browser context.');
    const context = contexts[0];
    await context.route(/^https?:\/\//, route => { report.externalRequests.push(route.request().url()); return route.abort('internetdisconnected'); });
    const pageDeadline = Date.now() + 20000;
    while (!page && Date.now() < pageDeadline) {
      page = context.pages().find(candidate => candidate.url().startsWith('mdgs://app/'));
      if (!page) await delay(100);
    }
    assert(page, 'No mdgs://app/ page appeared.');
    page.setDefaultTimeout(45000);
    page.on('pageerror', error => report.browserErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() }); });
    page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('request', request => requested.push(request.url()));
    report.windowsProcesses = await processEvidence(child.pid);
    await page.goto('mdgs://app/');
    return { pid: child.pid, runtime: report.runtime, windowsProcesses: report.windowsProcesses };
  });
  await check('portable-extracted-application-matches-validated-unpacked-build', async () => {
    assert(!report.windowsProcesses.unavailable, 'CIM evidence is required to bind the extracted portable runtime: ' + report.windowsProcesses.unavailable);
    const processes = [].concat(report.windowsProcesses.processes || []);
    const candidates = [...new Set(processes.filter(item => item.ProcessId !== child.pid && item.ExecutablePath
      && path.resolve(item.ExecutablePath).toLowerCase() !== executable.toLowerCase()).map(item => item.ExecutablePath))];
    const matches = [];
    for (const actualExecutable of candidates) {
      const resources = path.join(path.dirname(actualExecutable), 'resources');
      if (!(await stat(path.join(resources, 'app.asar')).catch(() => null))?.isFile()) continue;
      const bindings = [];
      for (const item of ['app.asar', 'web/.mdgs-exhibition-package.json']) {
        const actual = path.join(resources, item);
        const expected = path.join(root, 'dist-desktop/win-unpacked/resources', item);
        const actualSha256 = await hashFile(actual), expectedSha256 = await hashFile(expected);
        assert.equal(actualSha256, expectedSha256, 'Final portable contains a different build: ' + item);
        bindings.push({ resource: item, actual, expected: relative(expected), actualSha256, expectedSha256 });
      }
      matches.push({ actualExecutable, bindings });
    }
    assert.equal(matches.length, 1, 'Expected exactly one extracted Electron executable associated with the owned isolated profile.');
    report.extractedBuildAssociation = matches[0];
    return matches[0];
  });
  await check('portable-offline-home-local-font-and-four-art-layers', async () => {
    await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'HOME' && document.querySelector('.peony-atlas')?.classList.contains('is-ready'), null, { timeout: 90000 });
    const security = await page.evaluate(() => ({ origin: location.origin, secure: window.isSecureContext, require: typeof window.require, process: typeof window.process }));
    assert.deepEqual(security, { origin: 'mdgs://app', secure: true, require: 'undefined', process: 'undefined' });
    const images = await page.locator('.atlas-landscape,.atlas-peonies,.atlas-ivory-branch,.atlas-title>img').evaluateAll(images => images.map(image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight })));
    assert.equal(images.length, 4);
    assert(images.every(image => image.src.startsWith('mdgs://app/ui/peony-atlas/') && image.width > 0 && image.height > 0));
    const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(face => face.family.includes('MDGS Kai')).map(face => ({ family: face.family, status: face.status })); });
    assert(fonts.some(face => face.status === 'loaded'));
    await page.screenshot({ path: path.join(artifacts, 'home.png') });
    return { security, images, fonts };
  });
  await check('portable-offline-original-three-track-soundscape', async () => {
    await page.locator('.audio-control--foyer').getByRole('button', { name: '开启原创数字声景', exact: true }).click();
    await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing');
    const sound = await page.evaluate(() => window.__MDGS_AUDIO__.snapshot());
    assert.equal(sound.sourceCount, 3); assert.equal(sound.contextState, 'running'); assert.deepEqual(sound.loopDurations, [160, 160, 24]);
    return { sound };
  });
  await check('portable-chapter-one-native-first-frame', async () => {
    await page.locator('.study-entry-button[data-chapter-id="1"]').click();
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.painting canvas');
      return document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER' && canvas?.dataset.chapter === '1'
        && canvas.dataset.firstFrameReady === 'true' && canvas.dataset.loadingTextures === '0' && canvas.dataset.shaderErrors === '[]';
    }, null, { timeout: 120000 });
    const canvas = await page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
    assert.equal(canvas.sourceRevision, 'peony-2.0-2026-10-23');
    await page.screenshot({ path: path.join(artifacts, 'chapter-1.png') });
    return { canvas };
  });
  await check('portable-smoke-no-missing-resource-or-external-runtime-request', async () => {
    assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.badResponses, []); assert.deepEqual(report.externalRequests, []);
    assert.deepEqual(report.failedRequests.filter(request => request.error !== 'net::ERR_ABORTED'), []);
    report.executableSha256After = await hashFile(executable);
    assert.equal(report.executableSha256After, report.executableSha256);
    return { requestedURLs: [...new Set(requested)].sort(), executableUnchanged: true, expectedDisposalAborts: report.failedRequests.length };
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.errors.push(error.stack || String(error));
  await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
} finally {
  if (browserSession) {
    let closeTimer;
    try {
      // Electron can close the CDP transport before replying to Browser.close.
      // Keep a bounded timer alive so Node can still await the portable parent.
      await Promise.race([browserSession.send('Browser.close'), new Promise(resolve => {
        closeTimer = setTimeout(() => { report.closeMessage = 'CDP transport closed without a Browser.close reply; checking the owned parent exit.'; resolve(); }, 5000);
      })]);
    }
    catch (error) { report.closeMessage = error.message; }
    finally { clearTimeout(closeTimer); }
  }
  if (childResult) {
    const exited = await waitForOwnedExit(30000);
    report.portableParentExit = exited;
    if (!exited || exited.code !== 0) {
      report.status = 'failed';
      report.errors.push('Portable parent did not exit successfully after Browser.close: ' + JSON.stringify(exited));
      await terminateOwnedTree();
    } else {
      report.checks.push({ test: 'portable-parent-exits-cleanly-after-browser-close', passed: true, ...exited });
      console.log('PASS portable-parent-exits-cleanly-after-browser-close');
      const extractedExecutable = report.extractedBuildAssociation?.actualExecutable;
      if (extractedExecutable) {
        const directory = path.dirname(extractedExecutable);
        report.portableExtractionCleanup = { directory, existsAfterParentExit: !!(await stat(directory).catch(() => null)) };
      }
    }
  }
  if (browser?.isConnected()) await Promise.race([browser.close().catch(() => {}), delay(2000)]);
  report.launchOutput = { stdout, stderr };
  report.completedAt = new Date().toISOString(); report.artifactDirectory = relative(artifacts);
  await save();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter(item => !item.passed).map(item => item.test), report: relative(reportPath), errors: report.errors }));
  if (report.status !== 'passed') process.exitCode = 1;
}

/** Tool safety runs only in freshly created tmp fixtures. The real exhibition
 * folder is read/served, never replaced, edited, or recursively removed.
 * node scripts/validate-exhibition-package.mjs [--package-dir dist-exhibition]
 * [--suite all|safety|runtime]
 * MDGS_EXHIBITION_REQUIRE_CURRENT_DIST=1 additionally requires the mutable
 * workspace dist to still match. Standalone historical packages are otherwise
 * checked against their own inventory and selected original public bytes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readFile, writeFile, readdir, mkdir, lstat, symlink, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const suite = option('--suite', 'all');
assert(['all', 'safety', 'runtime'].includes(suite));
for (let index = 0; index < args.length; index += 2) assert(['--suite', '--package-dir'].includes(args[index]) && args[index + 1], 'Unknown/incomplete argument.');
const exhibition = path.resolve(root, option('--package-dir', 'dist-exhibition'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'reports/art-renewal');
const directory = path.join(output, 'exhibition-validation-runs', runId);
const fixtures = path.join(root, 'tmp/exhibition-tool-smoke', runId);
const target = path.join(output, 'exhibition-validation.json');
const marker = '.mdgs-exhibition-package.json';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const portable = file => path.relative(root, file).split(path.sep).join('/');
const report = { status: 'running', runId, suite, startedAt: new Date().toISOString(),
  scope: 'Fresh isolated tool fixtures for unmarked/symlink/lock protection, then read-only actual standalone package inventory/HTTP/Chrome four-scroll interactions/audio/PNG export. Fixture build commands are explicit stubs, not production-build proof.',
  checks: [], errors: [], expectedFailures: [], browserErrors: [], badResponses: [], failedRequests: [], externalRequests: [] };
const save = () => writeFile(target, JSON.stringify(report, null, 2) + '\n');
let serverProcess, browser, activePage;
let tools;

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Unexpected symlink in evidence/package: ${portable(path.join(directory, entry.name))}`);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file)); else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}
async function hash(file) { return sha(await readFile(file)); }
async function toolHashes() {
  return Object.fromEntries(await Promise.all(['scripts/package-exhibition.mjs', 'scripts/serve-exhibition.cjs', 'scripts/validate-exhibition-package.mjs']
    .map(async file => [file, await hash(path.join(root, file))])));
}
async function check(name, callback) {
  try {
    const evidence = await callback(); report.checks.push({ test: name, passed: true, ...evidence }); console.log('PASS ' + name);
  } catch (error) {
    let screenshot;
    if (activePage && !activePage.isClosed()) {
      screenshot = path.join(directory, name.replace(/[^a-z\d_-]/gi, '-') + '-failed.png');
      await activePage.screenshot({ path: screenshot }).catch(() => {});
    }
    report.checks.push({ test: name, passed: false, error: error.stack || String(error), ...(screenshot ? { screenshot: portable(screenshot) } : {}) });
    console.log('FAIL ' + name + ': ' + error.message);
  }
  await save();
}
function launch(file, arguments_, cwd, timeout = 30000, environment = {}) {
  const child = spawn(process.execPath, [file, ...arguments_], { cwd, windowsHide: true, env: { ...process.env, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', finished = false;
  child.stdout.on('data', bytes => { stdout += bytes.toString(); }); child.stderr.on('data', bytes => { stderr += bytes.toString(); });
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Owned child timed out after ${timeout}ms: ${file}`)); }, timeout);
    child.on('error', error => { finished = true; clearTimeout(timer); reject(error); });
    child.on('close', code => { finished = true; clearTimeout(timer); resolve({ code, stdout, stderr, pid: child.pid }); });
  });
  return { child, result, async waitFor(pattern, milliseconds = 12000) {
    const started = Date.now();
    while (Date.now() - started < milliseconds) {
      const match = stdout.match(pattern); if (match) return match;
      if (finished) throw new Error(`Child exited before expected output: ${stdout}\n${stderr}`);
      await delay(20);
    }
    throw new Error(`Child did not print ${pattern}: ${stdout}\n${stderr}`);
  } };
}
async function logProcess(name, result) {
  const file = path.join(directory, name + '.log');
  await writeFile(file, `exit=${result.code}\npid=${result.pid}\nSTDOUT\n${result.stdout}\nSTDERR\n${result.stderr}\n`);
  return { code: result.code, pid: result.pid, log: portable(file), logSha256: await hash(file) };
}
async function fixture(name, variant = {}) {
  const base = path.join(fixtures, name), project = path.join(base, 'project'), outside = path.join(base, 'external');
  await mkdir(base); await mkdir(project); await mkdir(outside);
  const canary = path.join(outside, 'sentinel.txt');
  const sentinel = Buffer.from(`Unowned-by-the-packer external sentinel ${name}\n`); await writeFile(canary, sentinel);
  const put = async (relative, bytes) => { const file = path.join(project, relative); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes); };
  await put('scripts/package-exhibition.mjs', tools.package); await put('scripts/serve-exhibition.cjs', tools.server);
  await put('src/main.ts', 'export const fixture = true;\n');
  await put('index.html', '<!doctype html><title>Safety fixture source</title>');
  await put('vite.config.ts', '// Explicit fixture, no production compilation.\n');
  await put('package.json', JSON.stringify({ private: true, type: 'module' })); await put('package-lock.json', '{}');
  for (const library of ['react', 'react-dom', 'scheduler', 'three', 'lucide-react']) {
    await put(`node_modules/${library}/LICENSE`, 'Fixture license bytes; not a real distribution.\n');
    await put(`node_modules/${library}/package.json`, JSON.stringify({ name: library, version: '0.0.0-fixture' }));
  }
  const contents = new Map([
    ['favicon.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'], ['ui/brocade.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['ui/peony-line.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'], ['ui/roller-band.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'],
    ['ui/peony-atlas/provenance.json', '{}'], ['ui/peony-atlas/landscape.webp', 'fixture-bitmap'],
    ['fonts/wenkai-web.woff2', 'fixture-font'], ['fonts/OFL-WenKai.txt', 'fixture-font-license'], ['fonts/provenance.json', '{}'],
    ...['strings', 'breath', 'atmosphere'].map(name => [`audio/peony-v3-${name}.mp3`, 'fixture-sound']),
    ...['manifest', 'provenance', 'score'].map(name => [`audio/peony-v3-${name}.json`, '{}']),
    ...[1, 2, 3, 4].flatMap(chapter => [[`assets/new-scrolls/chapter-${chapter}/scene.json`, JSON.stringify({ sourceRevision: 'peony-2.0-2026-10-23' })],
      [`assets/new-scrolls/chapter-${chapter}/cover.webp`, 'fixture-cover']]),
    ['assets/new-scrolls/chapter-1/material-fields/fixture.f16.gz', gzipSync(Buffer.from([0, 0, 0, 0]))],
  ]);
  const actualDist = variant.distRootLink ? path.join(outside, 'dist') : path.join(project, 'dist');
  for (const [relative, bytes] of contents) {
    let source = path.join(project, 'public', relative);
    if (variant.publicDirectoryLink && relative.startsWith(variant.publicDirectoryLink + '/')) source = path.join(outside, 'redirected-public', relative);
    if (variant.publicFileLink && relative === variant.publicFileLink) source = path.join(outside, 'linked-public-file.svg');
    await mkdir(path.dirname(source), { recursive: true }); await writeFile(source, bytes);
    let built = path.join(actualDist, relative);
    if (variant.distFileLink && relative === variant.distFileLink) built = path.join(outside, 'linked-dist-file.svg');
    await mkdir(path.dirname(built), { recursive: true }); await writeFile(built, bytes);
  }
  await mkdir(path.join(actualDist, 'assets'), { recursive: true });
  await writeFile(path.join(actualDist, 'assets/index-smoke.js'), '// Deliberately tiny compiled fixture.\n');
  await writeFile(path.join(actualDist, 'index.html'), '<!doctype html><script type="module" src="./assets/index-smoke.js"></script>');
  if (variant.distRootLink) await symlink(actualDist, path.join(project, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
  if (variant.publicDirectoryLink) await symlink(path.join(outside, 'redirected-public', variant.publicDirectoryLink), path.join(project, 'public', variant.publicDirectoryLink), process.platform === 'win32' ? 'junction' : 'dir');
  if (variant.publicFileLink) await symlink(path.join(outside, 'linked-public-file.svg'), path.join(project, 'public', variant.publicFileLink), 'file');
  if (variant.distFileLink) await symlink(path.join(outside, 'linked-dist-file.svg'), path.join(actualDist, variant.distFileLink), 'file');
  if (variant.outputLink) {
    const linked = path.join(outside, 'linked-output'); await mkdir(linked);
    await writeFile(path.join(linked, marker), JSON.stringify({ generator: 'MDGS exhibition package', status: 'ready' }));
    await writeFile(path.join(linked, 'another-sentinel.txt'), sentinel);
    await symlink(linked, path.join(project, variant.outputLink), process.platform === 'win32' ? 'junction' : 'dir');
  }
  return { base, project, outside, canary, sentinel, async unchanged() {
    assert.deepEqual(await readFile(canary), sentinel);
    if (variant.outputLink) assert.deepEqual(await readFile(path.join(outside, 'linked-output/another-sentinel.txt')), sentinel);
  }, put };
}
async function runFixture(item, arguments_ = ['--skip-build']) {
  return launch(path.join(item.project, 'scripts/package-exhibition.mjs'), arguments_, item.project).result;
}
async function safety() {
  await mkdir(fixtures, { recursive: true });
  await check('fixture-successful-byte-copy-and-explicit-prebuilt-association', async () => {
    const item = await fixture('success'), result = await runFixture(item); assert.equal(result.code, 0, result.stderr);
    const inventory = JSON.parse(await readFile(path.join(item.project, 'dist-exhibition', marker), 'utf8'));
    assert.equal(inventory.status, 'ready'); assert.equal(inventory.buildSourceVerified, false);
    for (const required of ['ui/brocade.svg', 'ui/peony-line.svg', 'ui/roller-band.svg'])
      assert(inventory.files.some(file => file.path === required), 'Missing stylesheet dependency: ' + required);
    for (const file of inventory.files) assert.equal(await hash(path.join(item.project, 'dist-exhibition', file.path)), file.sha256);
    await item.unchanged(); return { ...(await logProcess('fixture-success', result)), inventoryFiles: inventory.files.length, fixture: portable(item.project) };
  });
  for (const name of ['dist-exhibition', 'dist-exhibition.staging']) await check('unmarked-' + name + '-sentinel-preserved', async () => {
    const item = await fixture('unmarked-' + name), output = path.join(item.project, name);
    await mkdir(output); await writeFile(path.join(output, 'user-sentinel.txt'), item.sentinel);
    const result = await runFixture(item); assert.notEqual(result.code, 0); assert.match(result.stderr, /unmarked|Refusing to replace/i);
    assert.deepEqual(await readdir(output), ['user-sentinel.txt']); assert.deepEqual(await readFile(path.join(output, 'user-sentinel.txt')), item.sentinel);
    await item.unchanged(); report.expectedFailures.push({ fixture: name, rejection: result.stderr.trim() });
    return { ...(await logProcess('unmarked-' + name, result)), fixture: portable(item.project) };
  });
  await check('actual-concurrent-export-lock-rejects-second-process', async () => {
    const item = await fixture('concurrent'), release = path.join(item.project, 'fixture-release.flag');
    await item.put('node_modules/typescript/package.json', '{"type":"commonjs"}');
    await item.put('node_modules/vite/package.json', '{"type":"commonjs"}');
    await item.put('node_modules/typescript/bin/tsc', `const fs=require('node:fs');console.log('FIXTURE_BUILD_BARRIER');const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)})){clearInterval(timer);process.exit(0)}},20);setTimeout(()=>process.exit(9),15000);`);
    await item.put('node_modules/vite/bin/vite.js', 'process.exit(0);');
    const first = launch(path.join(item.project, 'scripts/package-exhibition.mjs'), [], item.project);
    try {
      await first.waitFor(/FIXTURE_BUILD_BARRIER/);
      const lock = path.join(item.project, '.mdgs-exhibition.lock'), before = await hash(lock), owner = JSON.parse(await readFile(lock, 'utf8'));
      assert.equal(owner.pid, first.child.pid);
      const second = await runFixture(item); assert.notEqual(second.code, 0); assert.match(second.stderr, /export may be running|lock|EEXIST/i);
      assert.equal(await hash(lock), before, 'Rejected process must not replace/remove the first owner lock.');
      await writeFile(release, 'release owned fixture\n'); const completed = await first.result; assert.equal(completed.code, 0, completed.stderr);
      assert.equal(await lstat(lock).then(() => true, error => error.code !== 'ENOENT'), false);
      await item.unchanged(); return { first: await logProcess('concurrent-first', completed), second: await logProcess('concurrent-second', second) };
    } finally { await writeFile(release, 'release owned fixture\n'); if (first.child.exitCode === null) first.child.kill(); await first.result.catch(() => {}); }
  });
  for (const [name, variant] of [
    ['dist-root', { distRootLink: true }], ['public-root', { publicDirectoryLink: 'fonts' }],
    ['public-parent', { publicDirectoryLink: 'audio' }], ['public-single-file', { publicFileLink: 'favicon.svg' }],
    ['dist-single-file', { distFileLink: 'favicon.svg' }], ['destination', { outputLink: 'dist-exhibition' }],
    ['staging', { outputLink: 'dist-exhibition.staging' }],
  ]) await check('reject-linked-' + name + '-external-sentinel-preserved', async () => {
    const item = await fixture('linked-' + name, variant), result = await runFixture(item);
    assert.notEqual(result.code, 0, 'Linked fixture must be rejected.');
    assert.match(result.stderr, /link|redirect|real directory|SymbolicLink|expected location/i);
    await item.unchanged(); report.expectedFailures.push({ fixture: name, rejection: result.stderr.trim() });
    return { ...(await logProcess('linked-' + name, result)), fixture: portable(item.project), externalSentinelSha256: sha(item.sentinel) };
  });
}
function request(address, relative, headers = {}, method = 'GET') {
  const url = new URL(address);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: relative, method, headers }, response => {
      const chunks = []; response.on('data', bytes => chunks.push(bytes)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) })); response.on('error', reject);
    });
    req.on('error', reject); req.setTimeout(45000, () => req.destroy(new Error('HTTP request timeout'))); req.end();
  });
}
async function runtime() {
  const inventoryPath = path.join(exhibition, marker), inventoryBytes = await readFile(inventoryPath), inventory = JSON.parse(inventoryBytes);
  assert.equal(inventory.status, 'ready'); assert.equal(inventory.generator, 'MDGS exhibition package');
  report.package = { directory: portable(exhibition), inventorySha256: sha(inventoryBytes), createdAt: inventory.createdAt,
    runtimeEdition: inventory.runtimeEdition, buildSourceVerified: inventory.buildSourceVerified, files: inventory.files.length, bytes: inventory.bytesExcludingInventory };
  await check('actual-package-closed-inventory-and-original-public-bytes', async () => {
    const files = await walk(exhibition);
    assert.deepEqual(files.map(file => path.relative(exhibition, file).split(path.sep).join('/')).sort(), [...inventory.files.map(file => file.path), marker].sort());
    const publicInputs = new Map(inventory.sourceInputs.filter(file => file.path.startsWith('public/')).map(file => [file.path.slice(7), file]));
    let publicBindings = 0, distBindings = 0;
    const mismatches = [];
    for (const file of inventory.files) {
      const resolved = path.resolve(exhibition, file.path);
      assert(resolved.startsWith(exhibition + path.sep), 'Inventory file escaped its package.');
      const bytes = await readFile(path.join(exhibition, file.path)); assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
      if (file.origin.startsWith('dist/')) {
        const actual = await hash(path.join(root, file.origin)).catch(error => { if (error.code === 'ENOENT') return 'missing'; throw error; });
        if (actual === file.sha256) distBindings++; else mismatches.push({ path: file.origin, packageSha256: file.sha256, currentDistSha256: actual });
      }
      if (publicInputs.has(file.path)) { assert.equal(await hash(path.join(root, 'public', file.path)), file.sha256); assert.equal(publicInputs.get(file.path).sha256, file.sha256); publicBindings++; }
    }
    report.currentDistAssociation = { required: process.env.MDGS_EXHIBITION_REQUIRE_CURRENT_DIST === '1', matchedFiles: distBindings, mismatches,
      note: 'A later workspace build can replace hashed chunks without changing the independently runnable package. Final unified freeze requires this list to be empty.' };
    if (report.currentDistAssociation.required) assert.deepEqual(mismatches, [], 'Current mutable dist differs from the tested package.');
    for (const required of ['serve.cjs', '创作与来源.txt', 'fonts/OFL-WenKai.txt', 'ui/brocade.svg', 'ui/peony-line.svg', 'ui/roller-band.svg', ...['react', 'react-dom', 'scheduler', 'three', 'lucide-react'].map(name => `third-party-licenses/${name}.txt`)])
      assert(inventory.files.some(file => file.path === required), 'Missing runtime/source notice: ' + required);
    return { files: inventory.files.length, publicBindings, distBindings, packageBytes: inventory.bytesExcludingInventory };
  });
  serverProcess = launch(path.join(exhibition, 'serve.cjs'), [], directory, 600000);
  report.url = (await serverProcess.waitFor(/http:\/\/127\.0\.0\.1:\d+\//))[0]; await save();
  await check('actual-http-all-inventory-files-byte-identical', async () => {
    const responses = new Array(inventory.files.length); let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < inventory.files.length) {
        const index = next++, file = inventory.files[index], response = await request(report.url, '/' + encodeURI(file.path));
        assert.equal(response.status, 200, file.path); assert.equal(sha(response.body), file.sha256, file.path);
        responses[index] = { path: file.path, status: response.status, bytes: response.body.length, sha256: sha(response.body), contentType: response.headers['content-type'] };
      }
    }));
    report.httpFiles = responses; return { responses: responses.length, bytes: responses.reduce((sum, response) => sum + response.bytes, 0) };
  });
  await check('http-gzip-q0-native-field-head-etag-and-paths', async () => {
    const file = 'audio/peony-v3-manifest.json', expected = await hash(path.join(exhibition, file));
    const plain = await request(report.url, '/' + file), gzip = await request(report.url, '/' + file, { 'Accept-Encoding': 'gzip' });
    const q0 = await request(report.url, '/' + file, { 'Accept-Encoding': 'gzip;q=0, identity;q=1' });
    assert.equal(plain.status, 200); assert(!plain.headers['content-encoding']); assert.equal(sha(plain.body), expected);
    assert.equal(gzip.headers['content-encoding'], 'gzip'); assert.equal(sha(gunzipSync(gzip.body)), expected);
    assert(!q0.headers['content-encoding']); assert.equal(sha(q0.body), expected);
    const cached = await request(report.url, '/' + file, { 'If-None-Match': gzip.headers.etag, 'Accept-Encoding': 'gzip' });
    assert.equal(cached.status, 304); assert.equal(cached.body.length, 0);
    const head = await request(report.url, '/' + file, { 'Accept-Encoding': 'gzip' }, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body.length, 0);
    const field = inventory.files.find(file => file.path.endsWith('.f16.gz')); assert(field);
    const native = await request(report.url, '/' + field.path, { 'Accept-Encoding': 'gzip' });
    assert.equal(native.status, 200); assert(!native.headers['content-encoding'], 'A native gzip field must not be marked HTTP-gzip a second time.');
    assert.equal(sha(native.body), field.sha256); assert.equal(native.body.readUInt16BE(0), 0x1f8b); assert(gunzipSync(native.body).length > 0);
    const escaped = await request(report.url, '/..%5c..%5cscripts/package-exhibition.mjs'); assert([403, 404].includes(escaped.status));
    const malformed = await request(report.url, '/%00'); assert.equal(malformed.status, 400);
    const missing = await request(report.url, '/missing-deliberate-validator-file.txt'); assert.equal(missing.status, 404);
    return { plainHeaders: plain.headers, gzipHeaders: gzip.headers, q0Headers: q0.headers, cachedStatus: cached.status, nativeField: field.path,
      nativeFieldHeaders: native.headers, nativeFieldSha256: sha(native.body), escapedStatus: escaped.status, malformedStatus: malformed.status };
  });
  const require = createRequire(import.meta.url), { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER, args: ['--enable-unsafe-swiftshader'] });
  report.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true, recordVideo: { dir: directory, size: { width: 1280, height: 720 } } });
  const page = activePage = await context.newPage(), requested = [];
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() }); });
  page.on('requestfailed', request => report.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('request', request => { requested.push(request.url()); if (/^https?:/.test(request.url()) && !request.url().startsWith(report.url)) report.externalRequests.push(request.url()); });
  const phase = value => page.waitForFunction(value => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === value, value, { timeout: 90000 });
  const ready = chapter => page.waitForFunction(chapter => {
    const canvas = document.querySelector('.painting canvas');
    return Number(canvas?.dataset.chapter) === chapter && canvas?.dataset.firstFrameReady === 'true' && canvas.dataset.loadingTextures === '0' && canvas.dataset.shaderErrors === '[]';
  }, chapter, { timeout: 90000 });
  const seek = async progress => {
    await page.locator('input[aria-label="画卷游观进度"]').evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value)); input.dispatchEvent(new Event('input', { bubbles: true }));
    }, progress);
    await page.waitForFunction(value => Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress) - value) < .00001, progress);
  };
  await page.goto(report.url);
  await check('standalone-home-font-four-layers-and-local-original-soundscape', async () => {
    await phase('HOME'); await page.waitForFunction(() => document.querySelector('.peony-atlas')?.classList.contains('is-ready'));
    const images = await page.locator('.peony-atlas img').evaluateAll(images => images.map(image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight })));
    assert(images.filter(image => image.src.includes('/ui/peony-atlas/') && image.width > 0).length >= 4);
    const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter(face => face.family.includes('MDGS Kai')).map(face => ({ family: face.family, status: face.status })); });
    assert(fonts.some(face => face.status === 'loaded'));
    await page.locator('.audio-control--foyer').getByRole('button', { name: '开启原创数字声景', exact: true }).click();
    await page.waitForFunction(() => window.__MDGS_AUDIO__?.snapshot().playback === 'playing');
    const sound = await page.evaluate(() => window.__MDGS_AUDIO__.snapshot()); assert.equal(sound.sourceCount, 3); assert.equal(sound.contextState, 'running'); assert.deepEqual(sound.loopDurations, [160, 160, 24]);
    await page.screenshot({ path: path.join(directory, 'home.png') }); return { images, fonts, sound };
  });
  for (const chapter of [1, 2, 3, 4]) await check('standalone-chapter-' + chapter + '-nodes-encounter-and-culture', async () => {
    if (chapter === 1) await page.locator('.study-entry-button[data-chapter-id="1"]').click(); else await page.locator('.chapter-link').nth(chapter - 1).click();
    await phase('SCROLL_VIEWER'); await ready(chapter);
    const canvas = await page.locator('.painting canvas').evaluate(canvas => ({ ...canvas.dataset }));
    if (!report.gpu) report.gpu = await page.locator('.painting canvas').evaluate(canvas => { const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info'); return { renderer: gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER), version: gl.getParameter(gl.VERSION) }; });
    await seek(.5); await ready(chapter); await page.screenshot({ path: path.join(directory, `chapter-${chapter}-middle.png`) });
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
    const encounter = await page.locator('.art-encounters').innerText(); await page.screenshot({ path: path.join(directory, `chapter-${chapter}-encounter.png`) });
    await page.getByRole('button', { name: '收起画中有遇', exact: true }).click();
    await page.getByRole('button', { name: '打开文化解读', exact: true }).click(); await page.getByRole('tab', { name: '原作全文', exact: true }).click();
    const original = await page.locator('.culture-panel [role="tabpanel"]:visible').innerText(); assert(original.length > 100);
    await page.getByRole('button', { name: '关闭文化解读', exact: true }).click();
    await seek(1); await ready(chapter); await page.locator('.end-colophon').waitFor(); await page.screenshot({ path: path.join(directory, `chapter-${chapter}-end.png`) });
    assert.equal((await page.evaluate(() => window.__MDGS_AUDIO__.snapshot())).playback, 'playing');
    return { chapter, canvas, encounter, originalCharacters: original.length, sourceEndFrame: await page.locator('.painting canvas').getAttribute('data-source-frame') };
  });
  await check('standalone-lazy-flower-letter-seal-and-real-png-download', async () => {
    await page.getByRole('button', { name: '留一笺春色', exact: true }).click();
    await page.waitForFunction(() => { const image = document.querySelector('.flower-letter-dialog[open] img'); return image?.complete && image.naturalWidth === 1200; });
    await page.getByRole('button', { name: /钤印/ }).click();
    const store = page.getByRole('button', { name: '存为花笺', exact: true }); await store.waitFor(); await page.waitForFunction(() => !document.querySelector('.flower-letter-primary')?.disabled);
    const event = page.waitForEvent('download'); await store.click(); const download = await event;
    const file = path.join(directory, 'flower-letter.png'); await download.saveAs(file); const bytes = await readFile(file);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG'); assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 1600);
    assert(requested.some(url => /\/assets\/flowerLetter-[^/]+\.js$/.test(url)), 'The actual lazy export chunk must execute.');
    await page.screenshot({ path: path.join(directory, 'sealed-flower-letter.png') });
    await page.getByRole('button', { name: '收起观者花笺', exact: true }).click();
    return { download: portable(file), bytes: bytes.length, sha256: sha(bytes), suggestedFilename: download.suggestedFilename() };
  });
  await check('standalone-browser-no404-no-external-runtime-dependency', async () => {
    assert.deepEqual(report.browserErrors, []); assert.deepEqual(report.badResponses, []); assert.deepEqual(report.externalRequests, []);
    const unexpected = report.failedRequests.filter(request => request.error !== 'net::ERR_ABORTED'); assert.deepEqual(unexpected, []);
    const stems = ['strings', 'breath', 'atmosphere'].map(name => `audio/peony-v3-${name}.mp3`);
    assert(stems.every(file => requested.some(url => url.endsWith(file))));
    return { requestedURLs: [...new Set(requested)].sort(), expectedRendererDisposalAborts: report.failedRequests.length };
  });
  await context.close(); activePage = undefined;
  await check('standalone-package-immutable-after-http-browser-and-download', async () => {
    report.package.inventorySha256After = await hash(inventoryPath);
    assert.equal(report.package.inventorySha256After, sha(inventoryBytes));
    for (const file of inventory.files) assert.equal(await hash(path.join(exhibition, file.path)), file.sha256);
    if (process.env.MDGS_EXHIBITION_REQUIRE_CURRENT_DIST === '1')
      for (const file of inventory.files.filter(file => file.origin.startsWith('dist/'))) assert.equal(await hash(path.join(root, file.origin)), file.sha256, file.origin);
    return { filesRechecked: inventory.files.length, inventorySha256: sha(inventoryBytes) };
  });
}

await mkdir(directory, { recursive: true });
try { await copyFile(target, path.join(directory, 'previous-validation.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await save();
try {
  report.inputsBefore = await toolHashes();
  tools = { package: await readFile(path.join(root, 'scripts/package-exhibition.mjs')), server: await readFile(path.join(root, 'scripts/serve-exhibition.cjs')) };
  if (suite !== 'runtime') await safety();
  if (suite !== 'safety') await runtime();
  report.inputsAfter = await toolHashes(); assert.deepEqual(report.inputsAfter, report.inputsBefore, 'Tool/driver inputs changed while validating.');
  report.status = report.checks.length && report.checks.every(check => check.passed) ? 'passed' : 'failed';
} catch (error) { report.status = 'failed'; report.errors.push(error.stack || String(error)); }
finally {
  await browser?.close();
  if (serverProcess) { serverProcess.child.kill(); await serverProcess.result.catch(() => {}); }
  report.artifacts = Object.fromEntries(await Promise.all((await walk(directory)).filter(file => !file.endsWith('previous-validation.json')).map(async file => [portable(file), await hash(file)])));
  report.completedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter(check => !check.passed).map(check => check.test), errors: report.errors }));
  if (report.status !== 'passed') process.exitCode = 1;
}

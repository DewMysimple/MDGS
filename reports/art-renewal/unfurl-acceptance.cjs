/** Production-bound orchestration. Existing per-feature drivers keep their
 * thresholds; a nonzero child, stale report or changed source fails this run. */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const output = __dirname;
const dist = path.resolve(root, process.env.MDGS_UNFURL_DIST || 'dist');
const id = new Date().toISOString().replace(/[:.]/g, '-');
const runDirectory = path.join(output, 'unfurl-history', id);
const entry = path.join(output, 'unfurl-acceptance.json');
const portable = file => path.relative(root, file).split(path.sep).join('/');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const hash = async file => sha(await fs.readFile(file));
const report = { status: 'running', runId: id, startedAt: new Date().toISOString(),
  scope: '37 check groups against a freshly reproduced production build: 23 desktop/browser, 3 lifecycle, 1 slow cover, 2 geometry, 8 screenshot-to-cover comparisons. No product or source artwork is changed.',
  productionDirectory: portable(dist), groups: [], errors: [], actualHTTP: {} };
let server;

async function below(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await below(file));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort();
}

const driverFiles = ['unfurl-acceptance.cjs', 'unfurl-validate.cjs', 'unfurl-lifecycle-validate.cjs',
  'unfurl-cover-timing-validate.cjs', 'unfurl-geometry-validate.cjs', 'unfurl-geometry-harness.html',
  'unfurl-pixel-capture.cjs', 'unfurl-pixel-validate.py'];
async function inputHashes() {
  const files = [...await below(path.join(root, 'src')), ...driverFiles.map(file => path.join(output, file)),
    ...['index.html', 'vite.config.ts', 'package.json', 'package-lock.json'].map(file => path.join(root, file)),
    ...[1, 2, 3, 4].map(chapter => path.join(root, `public/assets/new-scrolls/chapter-${chapter}/cover.webp`)),
    path.join(root, 'public/ui/peony-atlas/landscape.webp')];
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [portable(file), await hash(file)])));
}

async function run(executable, args, name) {
  const log = path.join(runDirectory, name + '.log');
  const lines = [];
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env: { ...process.env, MDGS_PREVIEW_URL: report.url }, windowsHide: true });
    child.stdout.on('data', bytes => { const line = bytes.toString(); lines.push(line); process.stdout.write(line); });
    child.stderr.on('data', bytes => { const line = bytes.toString(); lines.push(line); process.stderr.write(line); });
    child.on('error', reject); child.on('close', resolve);
  });
  await fs.writeFile(log, lines.join(''));
  assert.equal(code, 0, `${name} exited ${code}; see ${portable(log)}`);
  return { command: [executable, ...args], log: portable(log), logSha256: await hash(log) };
}

async function group(name, steps, filename, count) {
  const started = Date.now();
  const commands = [];
  for (const [index, step] of steps.entries()) commands.push(await run(step[0], step.slice(1), name + '-' + index));
  const file = path.join(output, filename), info = await fs.stat(file);
  assert(info.mtimeMs >= started - 1000, `${filename} is stale; a failed child must not inherit an old passed report.`);
  const data = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(data.status, 'passed', filename);
  assert.equal(data.checks.length, count, filename);
  assert(data.checks.every(check => check.passed), filename);
  report.groups.push({ name, checks: count, report: portable(file), reportSha256: await hash(file), commands });
  await fs.writeFile(entry, JSON.stringify(report, null, 2) + '\n');
}

(async () => {
  await fs.mkdir(runDirectory, { recursive: true });
  // Previous flat reports did not carry complete run-time fingerprints. Keep
  // them explicitly provisional; never retrofit a historical source identity.
  for (const name of await fs.readdir(output)) if (/^unfurl-.*(?:validation|acceptance|fingerprints|captures)\.json$/.test(name)) {
    await fs.copyFile(path.join(output, name), path.join(runDirectory, 'previous-' + name));
  }
  await fs.writeFile(entry, JSON.stringify(report, null, 2) + '\n');
  report.inputsBefore = await inputHashes();
  const { build, preview } = await import('vite');
  const bundles = await build({ root, logLevel: 'error', build: { write: false, copyPublicDir: false, emptyOutDir: false } });
  const compiled = {};
  for (const bundle of Array.isArray(bundles) ? bundles : [bundles]) for (const item of bundle.output) {
    const bytes = item.type === 'chunk' ? Buffer.from(item.code) : Buffer.from(item.source);
    compiled[item.fileName] = sha(bytes);
    assert.equal(await hash(path.join(dist, item.fileName)), compiled[item.fileName], `Production build differs from current source: ${item.fileName}`);
  }
  const actualCode = (await below(dist)).filter(file => /\.(?:js|css)$/.test(file)).map(file => path.relative(dist, file).split(path.sep).join('/'));
  assert.deepEqual(actualCode.sort(), Object.keys(compiled).filter(file => /\.(?:js|css)$/.test(file)).sort());
  report.buildReproduction = { method: 'independent-vite-build-write-false', files: compiled };
  server = await preview({ root, build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
  report.url = server.resolvedUrls.local[0];
  const resources = [...Object.keys(compiled), ...[1, 2, 3, 4].map(chapter => `assets/new-scrolls/chapter-${chapter}/cover.webp`), 'ui/peony-atlas/landscape.webp'];
  for (const relative of resources) {
    const response = await fetch(new URL(relative, report.url));
    assert.equal(response.status, 200, relative);
    const digest = sha(Buffer.from(await response.arrayBuffer()));
    assert.equal(digest, await hash(path.join(dist, relative)), relative);
    if (!compiled[relative]) assert.equal(digest, await hash(path.join(root, 'public', relative)), relative);
    report.actualHTTP[relative] = { sha256: digest, probe: 'served-by-the-same-preview-used-by-drivers' };
  }
  const node = process.execPath, driver = name => path.join(output, name);
  await group('desktop-browser', [[node, driver('unfurl-validate.cjs')]], 'unfurl-validation.json', 23);
  await group('lifecycle', [[node, driver('unfurl-lifecycle-validate.cjs')]], 'unfurl-lifecycle-validation.json', 3);
  await group('slow-cover', [[node, driver('unfurl-cover-timing-validate.cjs')]], 'unfurl-cover-timing-validation.json', 1);
  await group('geometry', [[node, driver('unfurl-geometry-validate.cjs')]], 'unfurl-geometry-validation.json', 2);
  await group('pixel', [[node, driver('unfurl-pixel-capture.cjs')], [process.env.MDGS_PYTHON || 'python', '-X', 'utf8', driver('unfurl-pixel-validate.py')]], 'unfurl-pixel-validation.json', 8);
  report.contactSheet = await run(process.env.MDGS_FFMPEG || 'ffmpeg', ['-hide_banner', '-loglevel', 'error',
    '-i', driver('unfurl-c4-1920.webm'), '-vf', 'fps=4,scale=480:-1,tile=4x8', '-frames:v', '1',
    driver('unfurl-c4-handoff-contact.png'), '-y'], 'contact-sheet');
  report.inputsAfter = await inputHashes();
  assert.deepEqual(report.inputsAfter, report.inputsBefore, 'Source or driver changed during the acceptance run.');
  const implementationFiles = ['src/scene/ScrollUnfurlScene.ts', 'src/scene/scrollGeometry.ts', 'src/scene/scrollHandoff.ts',
    'src/components/ScrollLoadingScene.tsx', 'src/styles/scroll-loading.css'];
  await fs.writeFile(path.join(output, 'unfurl-source-fingerprints.json'), JSON.stringify({
    verifiedAt: new Date().toISOString(), bindingRunId: id, algorithm: 'SHA256',
    files: implementationFiles.map(file => ({ file, sha256: report.inputsAfter[file] })) }, null, 2) + '\n');
  report.artifacts = {};
  for (const name of await fs.readdir(output)) if (/^unfurl-/.test(name) && /\.(?:png|webm|json)$/.test(name) && name !== 'unfurl-acceptance.json') {
    report.artifacts[name] = await hash(path.join(output, name));
  }
  report.totalChecks = report.groups.reduce((sum, group) => sum + group.checks, 0);
  assert.equal(report.totalChecks, 37);
  report.status = 'passed';
})().catch(async error => {
  report.status = 'failed'; report.errors.push(error.stack || String(error)); process.exitCode = 1;
  // Preserve failed visuals before the next attempt can replace flat outputs.
  for (const name of await fs.readdir(output)) if (/^unfurl-/.test(name) && /\.(?:png|webm|json)$/.test(name)) {
    await fs.copyFile(path.join(output, name), path.join(runDirectory, 'failed-' + name));
  }
}).finally(async () => {
  await server?.close();
  report.completedAt = new Date().toISOString();
  await fs.writeFile(entry, JSON.stringify(report, null, 2) + '\n');
  await fs.copyFile(entry, path.join(runDirectory, 'acceptance.json'));
  console.log(JSON.stringify({ status: report.status, totalChecks: report.totalChecks, errors: report.errors }));
});

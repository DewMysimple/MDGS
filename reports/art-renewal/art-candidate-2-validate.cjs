/** One frozen product milestone; no build writes and no deployment. */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), candidate = path.join(root, 'tmp/art-candidate-2-dist');
const runId = new Date().toISOString().replace(/[:.]/g, '-'), directory = path.join(__dirname, 'art-candidate-2-runs', runId);
const target = path.join(__dirname, 'art-candidate-2-freeze.json');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const portable = file => path.relative(root, file).split(path.sep).join('/');
const hash = async file => sha(await fs.readFile(file));
const report = { status: 'running', milestone: 'art-candidate-2', runId, startedAt: new Date().toISOString(),
  scope: 'Frozen product milestone, not the end of the user ten-hour art task. Strict standalone22, original59 plus full structural/RGBA, unroll37, resumed-frame15 and resumed screenshot24. Same candidate source/build; thresholds and native references unchanged.',
  steps: [], errors: [] };
let resumed;
const save = () => fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), 'Unexpected symlink in frozen inputs: ' + portable(path.join(directory, entry.name)));
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file)); else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}
const drivers = ['scripts/validate-exhibition-package.mjs', 'scripts/package-exhibition.mjs', 'scripts/serve-exhibition.cjs',
  'scripts/validate-peony2-fidelity.mjs', 'scripts/validate-peony2-contact.py',
  ...['art-candidate-2-validate.cjs', 'unfurl-acceptance.cjs', 'unfurl-validate.cjs', 'unfurl-lifecycle-validate.cjs',
    'unfurl-cover-timing-validate.cjs', 'unfurl-geometry-validate.cjs', 'unfurl-geometry-harness.html',
    'unfurl-pixel-capture.cjs', 'unfurl-pixel-validate.py', 'unfurl-snapshot-validate.cjs', 'unfurl-snapshot-pixels.py'].map(file => 'reports/art-renewal/' + file)];
async function inputs() {
  const native = JSON.parse(await fs.readFile(path.join(root, 'reports/peony2-fidelity/validation-native.json'), 'utf8'));
  const references = ['reports/peony2-fidelity/validation-native.json'];
  for (const chapter of native.chapters) {
    references.push(chapter.evidence);
    const evidence = JSON.parse(await fs.readFile(path.resolve(root, chapter.evidence), 'utf8'));
    references.push(...evidence.renders.map(frame => frame.path));
  }
  const files = [...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'public')),
    ...[...drivers, ...references, 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json',
      ...(await fs.readdir(root)).filter(file => /^tsconfig.*\.json$/.test(file))].map(file => path.resolve(root, file))];
  const unique = [...new Set(files)].sort(), result = {}; let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (next < unique.length) { const file = unique[next++]; result[portable(file)] = await hash(file); } }));
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
async function codeBinding() {
  const files = (await walk(candidate)).filter(file => /\.(?:js|css|html)$/.test(file));
  const result = {};
  for (const file of files) {
    const relative = path.relative(candidate, file), digest = await hash(file);
    assert.equal(await hash(path.join(root, 'dist', relative)), digest, 'Main dist differs: ' + relative);
    assert.equal(await hash(path.join(root, 'dist-exhibition', relative)), digest, 'Exhibition differs: ' + relative);
    result[relative.split(path.sep).join('/')] = digest;
  }
  return result;
}
async function step(name, executable, arguments_, environment, relativeReport, verify, expectedStatus = 'passed') {
  const started = Date.now(), file = path.join(directory, name + '.log'), chunks = [];
  const evidence = { name, command: [executable, ...arguments_].map(item => item.startsWith(root) ? portable(item) : item), startedAt: new Date().toISOString() };
  report.steps.push(evidence); await save();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: root, windowsHide: true, env: { ...process.env, ...environment } });
    child.stdout.on('data', data => { chunks.push(data); process.stdout.write(data); });
    child.stderr.on('data', data => { chunks.push(data); process.stderr.write(data); });
    child.on('error', reject); child.on('close', resolve);
  });
  await fs.writeFile(file, Buffer.concat(chunks)); evidence.exitCode = code; evidence.log = portable(file); evidence.logSha256 = await hash(file);
  evidence.completedAt = new Date().toISOString(); await save(); assert.equal(code, 0, name + ' failed; see ' + evidence.log);
  if (relativeReport) {
    const reportFile = path.join(root, relativeReport); assert((await fs.stat(reportFile)).mtimeMs >= started - 1000, 'Stale report: ' + relativeReport);
    const data = JSON.parse(await fs.readFile(reportFile, 'utf8')); assert.equal(data.status, expectedStatus); verify(data);
    const archived = path.join(directory, 'reports', path.basename(relativeReport)); await fs.mkdir(path.dirname(archived), { recursive: true }); await fs.copyFile(reportFile, archived);
    evidence.report = portable(archived); evidence.reportSha256 = await hash(archived);
  }
  await save();
}
async function inherit(name, relativeReport, verify, expectedStatus = 'passed') {
  const previous = resumed.steps.find(step => step.name === name);
  assert(previous && previous.exitCode === 0, 'No completed successful child process to reuse: ' + name);
  assert.equal(await hash(path.resolve(root, previous.log)), previous.logSha256, 'Historical process log changed.');
  const reportFile = path.resolve(root, previous.report || relativeReport);
  if (previous.reportSha256) assert.equal(await hash(reportFile), previous.reportSha256, 'Historical child report changed.');
  else {
    const time = (await fs.stat(reportFile)).mtimeMs;
    assert(time >= Date.parse(previous.startedAt) - 1000 && time <= Date.parse(previous.completedAt) + 1000, 'Unarchived report is outside its completed child run.');
  }
  const data = JSON.parse(await fs.readFile(reportFile, 'utf8')); assert.equal(data.status, expectedStatus); verify(data);
  const archived = path.join(directory, 'reports', path.basename(relativeReport)); await fs.mkdir(path.dirname(archived), { recursive: true }); await fs.copyFile(reportFile, archived);
  report.steps.push({ name, inherited: true, sourceMilestoneRunId: resumed.runId, originalExitCode: previous.exitCode,
    originalStartedAt: previous.startedAt, originalCompletedAt: previous.completedAt, originalLog: previous.log, originalLogSha256: previous.logSha256,
    report: portable(archived), reportSha256: await hash(archived), verifiedAt: new Date().toISOString(),
    verification: 'Same product/public/child drivers/native references/build/pack inventory as the recorded capture; only outer status-schema adapter changed.' });
  console.log('REUSE ' + name + ' from ' + resumed.runId); await save();
}
(async () => {
  await fs.mkdir(directory, { recursive: true });
  try { await fs.copyFile(target, path.join(directory, 'previous-freeze.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await save(); report.inputsBefore = await inputs(); report.buildBefore = await codeBinding();
  report.exhibitionInventoryBefore = await hash(path.join(root, 'dist-exhibition/.mdgs-exhibition-package.json')); await save();
  if (process.env.MDGS_CANDIDATE2_RESUME_RUN) {
    const name = process.env.MDGS_CANDIDATE2_RESUME_RUN;
    assert(/^[\dTZ-]+$/.test(name), 'Invalid resume run identifier.');
    const checkpoint = path.join(__dirname, 'art-candidate-2-runs', name, 'freeze.json');
    resumed = JSON.parse(await fs.readFile(checkpoint, 'utf8')); assert.equal(resumed.status, 'failed');
    const adapter = 'reports/art-renewal/art-candidate-2-validate.cjs';
    const withoutAdapter = object => Object.fromEntries(Object.entries(object).filter(([file]) => file !== adapter));
    assert.deepEqual(withoutAdapter(report.inputsBefore), withoutAdapter(resumed.inputsBefore), 'Product or child inputs changed since the capture run; full rerun required.');
    assert.deepEqual(report.buildBefore, resumed.buildBefore); assert.equal(report.exhibitionInventoryBefore, resumed.exhibitionInventoryBefore);
    report.resume = { runId: name, checkpoint: portable(checkpoint), checkpointSha256: await hash(checkpoint),
      permittedAdapterChange: { file: adapter, oldSha256: resumed.inputsBefore[adapter], newSha256: report.inputsBefore[adapter] },
      reason: "Outer wrapper expected passed while the original source-fidelity schema correctly returns pass. Successful child evidence remains bound to identical frozen product and reference inputs." };
    await save();
  }
  const node = process.execPath, local = file => path.join(root, file), checkCount = count => data => {
    assert.equal(data.checks.length, count); assert(data.checks.every(check => check.passed));
  };
  await step('typescript', node, [local('node_modules/typescript/bin/tsc'), '-b'], {}, null);
  const verifyFidelity = data => { assert.equal(data.visualPassed, true); assert.equal(data.pixels.length, 59); assert(data.pixels.every(pixel => pixel.passed)); assert.equal(data.chapters.length, 4); };
  const verifySnapshot = data => { checkCount(15)(data); assert.equal(data.inputsUnchanged, true); };
  if (resumed) {
    await inherit('exhibition22', 'reports/art-renewal/exhibition-validation.json', data => { checkCount(22)(data); assert.deepEqual(data.currentDistAssociation.mismatches, []); });
    await inherit('source59-structural', 'reports/peony2-fidelity/validation-fidelity.json', verifyFidelity, 'pass');
    await inherit('snapshot15', 'reports/art-renewal/unfurl-snapshot-validation.json', verifySnapshot);
    await inherit('snapshot-pixels24', 'reports/art-renewal/unfurl-snapshot-pixel-validation.json', checkCount(24));
  } else {
  await step('exhibition22', node, [local('scripts/validate-exhibition-package.mjs')], { MDGS_EXHIBITION_REQUIRE_CURRENT_DIST: '1' },
    'reports/art-renewal/exhibition-validation.json', data => { checkCount(22)(data); assert.deepEqual(data.currentDistAssociation.mismatches, []); });
  const parallel = await Promise.allSettled([
    step('source59-structural', node, [local('scripts/validate-peony2-fidelity.mjs'), '--capture-browser', '--dist-dir', 'tmp/art-candidate-2-dist',
      '--raw-cache', process.env.MDGS_RAW_CACHE || '.asset-cache/new-scrolls/peony-2.0-2026-10-23'], {},
      'reports/peony2-fidelity/validation-fidelity.json', verifyFidelity, 'pass'),
    (async () => {
      await step('snapshot15', node, [local('reports/art-renewal/unfurl-snapshot-validate.cjs')], { MDGS_SNAPSHOT_DIST: 'tmp/art-candidate-2-dist', MDGS_SNAPSHOT_REQUIRE_FREEZE: '1' },
        'reports/art-renewal/unfurl-snapshot-validation.json', verifySnapshot);
      await step('snapshot-pixels24', process.env.MDGS_PYTHON || 'python', ['-X', 'utf8', local('reports/art-renewal/unfurl-snapshot-pixels.py')], {},
        'reports/art-renewal/unfurl-snapshot-pixel-validation.json', checkCount(24));
    })(),
  ]);
  for (const result of parallel) assert.equal(result.status, 'fulfilled', result.reason?.stack || 'A parallel acceptance failed.');
  }
  await step('unroll37', node, [local('reports/art-renewal/unfurl-acceptance.cjs')], { MDGS_UNFURL_DIST: 'tmp/art-candidate-2-dist' },
    'reports/art-renewal/unfurl-acceptance.json', data => assert.equal(data.totalChecks, 37));
  report.inputsAfter = await inputs(); assert.deepEqual(report.inputsAfter, report.inputsBefore, 'Frozen source/public/drivers/native references changed.');
  report.buildAfter = await codeBinding(); assert.deepEqual(report.buildAfter, report.buildBefore);
  report.exhibitionInventoryAfter = await hash(path.join(root, 'dist-exhibition/.mdgs-exhibition-package.json'));
  assert.equal(report.exhibitionInventoryAfter, report.exhibitionInventoryBefore);
  const archive = path.join(directory, 'unfurl'); await fs.mkdir(archive);
  for (const name of await fs.readdir(__dirname)) if (/^unfurl-/.test(name) && /\.(?:json|png|webm)$/.test(name)) await fs.copyFile(path.join(__dirname, name), path.join(archive, name));
  await fs.copyFile(path.join(root, 'reports/peony2-fidelity/browser-captures.json'), path.join(directory, 'reports/browser-captures.json'));
  report.artifacts = {};
  for (const file of await walk(directory)) if (!file.endsWith('previous-freeze.json')) report.artifacts[portable(file)] = await hash(file);
  report.inputsUnchanged = true; report.counts = { exhibition: 22, originalFrames: 59, unroll: 37, resumedFrame: 15, resumedPixels: 24 };
  report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => {
    report.completedAt = new Date().toISOString(); await save(); await fs.copyFile(target, path.join(directory, 'freeze.json'));
    console.log(JSON.stringify({ status: report.status, milestone: report.milestone, counts: report.counts, errors: report.errors }));
  });

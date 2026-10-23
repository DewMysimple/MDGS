/** Full, content-bound milestone verification. This tool never builds or exports product files. */
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const crypto = require('node:crypto'), { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..'), milestone = process.env.MDGS_ART_CANDIDATE || 'art-candidate-3';
assert(/^art-candidate-\d+$/.test(milestone), 'Use an explicit numbered art-candidate milestone.');
const candidateRelative = process.env.MDGS_ART_DIST || 'tmp/' + milestone + '-dist', candidate = path.resolve(root, candidateRelative);
const runId = new Date().toISOString().replace(/[:.]/g, '-'), directory = path.join(__dirname, milestone + '-runs', runId);
const target = path.join(__dirname, milestone + '-freeze.json'), sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const portable = file => path.relative(root, file).split(path.sep).join('/'), hash = async file => sha(await fs.readFile(file));
const report = { status: 'running', milestone, runId, startedAt: new Date().toISOString(), productionDirectory: portable(candidate),
  scope: 'Full frozen automated milestone, not the end of the user ten-hour creative task. Exhibition22; original59 with full structural/RGBA checks; unroll37 including actual partial cancellation to zero; resumed-frame15 and screenshot24. No reused child results, relaxed thresholds or altered native references.',
  steps: [], errors: [] };
const save = () => fs.writeFile(target, JSON.stringify(report, null, 2) + '\n');
async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), 'Unexpected symlink in frozen inputs: ' + portable(file));
    if (entry.isDirectory()) result.push(...await walk(file)); else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}
const drivers = ['scripts/validate-exhibition-package.mjs', 'scripts/package-exhibition.mjs', 'scripts/serve-exhibition.cjs',
  'scripts/validate-peony2-fidelity.mjs', 'scripts/validate-peony2-contact.py',
  ...['art-candidate-validate.cjs', 'unfurl-acceptance.cjs', 'unfurl-validate.cjs', 'unfurl-lifecycle-validate.cjs',
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
  const result = {};
  for (const file of (await walk(candidate)).filter(file => /\.(?:js|css|html)$/.test(file))) {
    const relative = path.relative(candidate, file), digest = await hash(file);
    assert.equal(await hash(path.join(root, 'dist', relative)), digest, 'Main dist differs: ' + relative);
    assert.equal(await hash(path.join(root, 'dist-exhibition', relative)), digest, 'Exhibition differs: ' + relative);
    result[relative.split(path.sep).join('/')] = digest;
  }
  return result;
}
async function step(name, executable, arguments_, environment, relativeReport, verify, expectedStatus = 'passed') {
  const started = Date.now(), logfile = path.join(directory, name + '.log'), chunks = [];
  const evidence = { name, command: [executable, ...arguments_].map(item => item.startsWith(root) ? portable(item) : item), startedAt: new Date().toISOString() };
  report.steps.push(evidence); await save();
  const code = await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd: root, windowsHide: true, env: { ...process.env, ...environment } });
    child.stdout.on('data', data => { chunks.push(data); process.stdout.write(data); });
    child.stderr.on('data', data => { chunks.push(data); process.stderr.write(data); });
    child.on('error', reject); child.on('close', resolve);
  });
  await fs.writeFile(logfile, Buffer.concat(chunks)); evidence.exitCode = code; evidence.log = portable(logfile); evidence.logSha256 = await hash(logfile);
  evidence.completedAt = new Date().toISOString(); await save();
  if (relativeReport) {
    const file = path.join(root, relativeReport);
    // Archive real failed child reports too, while rejecting stale successful leftovers.
    assert((await fs.stat(file)).mtimeMs >= started - 1000, 'Stale report: ' + relativeReport);
    const archived = path.join(directory, 'reports', path.basename(relativeReport));
    await fs.mkdir(path.dirname(archived), { recursive: true }); await fs.copyFile(file, archived);
    evidence.report = portable(archived); evidence.reportSha256 = await hash(archived); await save();
    assert.equal(code, 0, name + ' failed; see ' + evidence.log);
    const data = JSON.parse(await fs.readFile(archived, 'utf8')); assert.equal(data.status, expectedStatus); verify(data);
  } else assert.equal(code, 0, name + ' failed; see ' + evidence.log);
  await save();
}
(async () => {
  await fs.mkdir(directory, { recursive: true });
  try { await fs.copyFile(target, path.join(directory, 'previous-freeze.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await save(); report.inputsBefore = await inputs(); report.buildBefore = await codeBinding();
  report.exhibitionInventoryBefore = await hash(path.join(root, 'dist-exhibition/.mdgs-exhibition-package.json')); await save();
  const node = process.execPath, local = file => path.join(root, file), count = number => data => {
    assert.equal(data.checks.length, number); assert(data.checks.every(check => check.passed));
  };
  await step('typescript', node, [local('node_modules/typescript/bin/tsc'), '-b'], {}, null);
  await step('exhibition22', node, [local('scripts/validate-exhibition-package.mjs')], { MDGS_EXHIBITION_REQUIRE_CURRENT_DIST: '1' },
    'reports/art-renewal/exhibition-validation.json', data => { count(22)(data); assert.deepEqual(data.currentDistAssociation.mismatches, []); });
  const fidelityOutput = path.join(directory, 'fidelity');
  const parallel = await Promise.allSettled([
    step('source59-structural', node, [local('scripts/validate-peony2-fidelity.mjs'), '--capture-browser', '--dist-dir', candidateRelative,
      '--report-dir', portable(fidelityOutput),
      '--raw-cache', process.env.MDGS_RAW_CACHE || '.asset-cache/new-scrolls/peony-2.0-2026-10-23'], {},
      portable(path.join(fidelityOutput, 'validation-fidelity.json')), data => {
        assert.equal(data.visualPassed, true); assert.equal(data.structuralPassed, true);
        assert.equal(data.pixels.length, 59); assert(data.pixels.every(pixel => pixel.passed)); assert.equal(data.chapters.length, 4);
      }, 'pass'),
    (async () => {
      await step('snapshot15', node, [local('reports/art-renewal/unfurl-snapshot-validate.cjs')], { MDGS_SNAPSHOT_DIST: candidateRelative, MDGS_SNAPSHOT_REQUIRE_FREEZE: '1' },
        'reports/art-renewal/unfurl-snapshot-validation.json', data => { count(15)(data); assert.equal(data.inputsUnchanged, true); });
      await step('snapshot-pixels24', process.env.MDGS_PYTHON || 'python', ['-X', 'utf8', local('reports/art-renewal/unfurl-snapshot-pixels.py')], {},
        'reports/art-renewal/unfurl-snapshot-pixel-validation.json', count(24));
    })(),
  ]);
  for (const result of parallel) assert.equal(result.status, 'fulfilled', result.reason?.stack || 'A parallel acceptance failed.');
  await step('unroll37', node, [local('reports/art-renewal/unfurl-acceptance.cjs')], { MDGS_UNFURL_DIST: candidateRelative },
    'reports/art-renewal/unfurl-acceptance.json', data => assert.equal(data.totalChecks, 37));
  report.inputsAfter = await inputs(); assert.deepEqual(report.inputsAfter, report.inputsBefore, 'Frozen source/public/drivers/native references changed.');
  report.buildAfter = await codeBinding(); assert.deepEqual(report.buildAfter, report.buildBefore);
  report.exhibitionInventoryAfter = await hash(path.join(root, 'dist-exhibition/.mdgs-exhibition-package.json'));
  assert.equal(report.exhibitionInventoryAfter, report.exhibitionInventoryBefore);
  const archive = path.join(directory, 'unfurl'); await fs.mkdir(archive);
  for (const name of await fs.readdir(__dirname)) if (/^unfurl-/.test(name) && /\.(?:json|png|webm)$/.test(name)) await fs.copyFile(path.join(__dirname, name), path.join(archive, name));
  await fs.copyFile(path.join(fidelityOutput, 'browser-captures.json'), path.join(directory, 'reports/browser-captures.json'));
  report.artifacts = {};
  for (const file of await walk(directory)) if (!file.endsWith('previous-freeze.json')) report.artifacts[portable(file)] = await hash(file);
  report.inputsUnchanged = true; report.counts = { exhibition: 22, originalFrames: 59, unroll: 37, resumedFrame: 15, resumedPixels: 24 };
  report.status = 'passed';
})().catch(error => { report.status = 'failed'; report.errors.push(error.stack || String(error)); process.exitCode = 1; })
  .finally(async () => {
    report.completedAt = new Date().toISOString(); await save(); await fs.copyFile(target, path.join(directory, 'freeze.json'));
    console.log(JSON.stringify({ status: report.status, milestone, counts: report.counts, errors: report.errors }));
  });

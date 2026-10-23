/** Serial, frozen-candidate acceptance. Does not build or modify the product.
 * node scripts/validate-art-renewal-final.mjs --build-dir <explicit-frozen-build>
 * Add --plan to print the independent report destinations without running tests.
 * Requires the completed, same-bundle real-time soak referenced by soak-latest.
 * Browser dependencies use MDGS_PLAYWRIGHT_MODULE / MDGS_TEST_BROWSER.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, copyFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
assert(args.includes('--build-dir') && option('--build-dir') && !option('--build-dir').startsWith('--'), 'An explicit --build-dir is required; no candidate directory is assumed.');
const build = path.resolve(root, option('--build-dir'));
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const output = path.join(root, 'reports/art-renewal/final-regressions', runId);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function productHashes() {
  const result = {};
  async function walk(directory) {
    for (const item of (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(directory, item.name);
      if (item.isDirectory()) await walk(file);
      else result[file.replaceAll('\\', '/')] = await fileHash(path.join(root, file));
    }
  }
  await walk('src'); await walk('public');
  result['index.html'] = await fileHash(path.join(root, 'index.html'));
  return result;
}
async function bundleHashes() {
  const files = ['index.html', ...(await readdir(path.join(build, 'assets'))).filter(name => /\.(js|css)$/.test(name)).map(name => 'assets/' + name)];
  return Object.fromEntries(await Promise.all(files.map(async file => [file, await fileHash(path.join(build, file))])));
}
const same = (a, b) => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].every(key => a?.[key] === b?.[key]);
};
const uiReportDir = relative(path.join(output, 'ui'));
const uiShots = relative(path.join(root, 'tmp/art-renewal-final', runId, 'ui'));
const suites = [
  { id: 'ui', script: 'validate-art-renewal-ui.mjs', args: ['--suite', 'all', '--report-dir', uiReportDir, '--shots-dir', uiShots], result: uiReportDir + '/ui-all-validation.json', expectedChecks: 83, passStatus: 'passed', shots: uiShots },
  { id: 'audio', script: 'validate-peony-soundscape.mjs', args: ['--report-file', relative(path.join(output, 'audio-app-validation.json'))], result: relative(path.join(output, 'audio-app-validation.json')), expectedChecks: 15, passStatus: 'passed' },
  ...['runtime', 'journey', 'settings', 'subpath'].map(mode => {
    const reportDir = relative(path.join(output, 'legacy', mode));
    return { id: mode, script: mode === 'settings' || mode === 'subpath' ? 'validate-peony2-regressions.mjs' : 'validate-peony2-runtime.mjs', args: [...(mode === 'runtime' ? [] : ['--' + mode]), '--report-dir', reportDir, '--shots-dir', relative(path.join(root, 'tmp/art-renewal-final', runId, mode))], pointer: reportDir + '/' + mode + '-latest.json', passStatus: 'pass' };
  }),
];
if (args.includes('--plan')) {
  console.log(JSON.stringify({ status: 'prepared-not-run', buildDirectory: relative(build), strictBinding: 'The accepted soak must have identical product and production bundle hashes. Source/product/driver changes during this chain invalidate a passing result.', suites: suites.map(suite => ({ id: suite.id, command: ['node', 'scripts/' + suite.script, ...suite.args, '--build-dir', relative(build)], report: suite.result ?? suite.pointer })) }, null, 2));
  process.exit(0);
}
await mkdir(output, { recursive: true });
const report = { status: 'running', startedAt: new Date().toISOString(), runId, buildDirectory: relative(build), scope: 'Sequential real production UI83, shared sound15, original-mode desktop runtime, journey, settings and nested subpath. Native fidelity and poetic narrative have separate reports. No build, asset transformation, clock acceleration or product mutation.', suites: [] };
const save = () => writeFile(path.join(output, 'validation.json'), JSON.stringify(report, null, 2) + '\n');
async function artifact(file, destination) {
  const source = path.resolve(root, file);
  const bytes = await readFile(source);
  if (destination) await writeFile(path.join(output, destination), bytes);
  return { path: relative(source), sha256: digest(bytes), bytes: bytes.length, ...(destination ? { archived: relative(path.join(output, destination)) } : {}) };
}
async function runSuite(suite) {
  const item = { id: suite.id, startedAt: new Date().toISOString(), command: ['node', 'scripts/' + suite.script, ...suite.args, '--build-dir', relative(build)] };
  report.suites.push(item); await save();
  let log = '';
  const child = spawn(process.execPath, item.command.slice(1), { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', bytes => { log += bytes.toString(); process.stdout.write(bytes); });
  child.stderr.on('data', bytes => { log += bytes.toString(); process.stderr.write(bytes); });
  const exit = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, error: error.message }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  item.exit = exit; item.completedAt = new Date().toISOString();
  await writeFile(path.join(output, suite.id + '.log'), log);
  item.log = await artifact(path.join(output, suite.id + '.log'));
  try {
    let resultPath = suite.result;
    if (suite.pointer) {
      const pointer = JSON.parse(await readFile(path.join(root, suite.pointer), 'utf8'));
      assert(Date.parse(pointer.completedAt ?? pointer.finishedAt ?? 0) >= Date.parse(item.startedAt), 'Runtime pointer is not fresh for this invocation.');
      item.acceptance = await artifact(suite.pointer, suite.id + '-pointer.json');
      const acceptancePath = pointer.acceptance ?? pointer.manifest;
      if (acceptancePath) {
        const acceptance = JSON.parse(await readFile(path.join(root, acceptancePath), 'utf8'));
        resultPath = acceptance.report;
        item.acceptanceManifest = await artifact(acceptancePath, suite.id + '-acceptance.json');
      } else {
        resultPath = pointer.report;
        if (pointer.runId) item.acceptanceManifest = await artifact(path.join(path.dirname(suite.pointer), pointer.runId, 'acceptance.json'), suite.id + '-acceptance.json');
      }
    }
    const result = JSON.parse(await readFile(path.join(root, resultPath), 'utf8'));
    assert(Date.parse(result.completedAt ?? result.finishedAt ?? result.endedAt ?? 0) >= Date.parse(item.startedAt), 'Result is not fresh for this invocation.');
    item.result = await artifact(resultPath, suite.id + '-validation.json');
    item.status = result.status; item.checks = result.checks?.length;
    item.errorCount = result.errors?.length ?? result.pageErrors?.length ?? null;
    assert.equal(exit.code, 0); assert.equal(result.status, suite.passStatus);
    if (suite.expectedChecks) assert.equal(item.checks, suite.expectedChecks);
    assert(!result.checks?.some(check => check.passed === false));
    item.passed = true;
  } catch (error) { item.passed = false; item.failure = error.message; }
  if (suite.shots) {
    const archive = path.join(root, 'tmp/art-renewal-final', runId, suite.id);
    await mkdir(archive, { recursive: true }); item.screenshots = [];
    for (const name of await readdir(path.join(root, suite.shots))) {
      if (!name.endsWith('.png')) continue;
      const source = path.join(root, suite.shots, name), target = path.join(archive, name);
      if ((await stat(source)).mtimeMs < Date.parse(item.startedAt)) continue;
      if (source !== target) await copyFile(source, target);
      item.screenshots.push(await artifact(target));
    }
  }
  await save();
  console.log('FINAL SUITE ' + suite.id + ' ' + (item.passed ? 'PASS' : 'FAIL: ' + item.failure));
}
try {
  const soakPointer = JSON.parse(await readFile(path.join(root, 'reports/art-renewal/soak-latest.json'), 'utf8'));
  const soak = JSON.parse(await readFile(path.join(root, soakPointer.report), 'utf8'));
  assert.equal(soak.status, 'pass', 'Complete the frozen-candidate soak first.');
  report.soak = await artifact(soakPointer.report);
  report.productBefore = await productHashes(); report.bundleBefore = await bundleHashes();
  assert(same(report.productBefore, soak.allProductAtEnd), 'Product changed after the accepted soak.');
  assert(same(report.bundleBefore, soak.bundleAtEnd), 'Candidate bundle differs from the accepted soak.');
  report.driversBefore = {};
  for (const name of ['validate-art-renewal-final.mjs', ...new Set(suites.map(suite => suite.script)), ...['original', 'journey', 'settings', 'subpath'].map(name => 'validate-peony2-' + name + '-driver.mjs')]) report.driversBefore['scripts/' + name] = await fileHash(path.join(root, 'scripts', name));
  await save();
  for (const suite of suites) await runSuite(suite);
  report.status = report.suites.every(suite => suite.passed) ? 'pass' : 'fail';
} catch (error) { report.status = 'fail'; report.failure = { message: error.message, stack: error.stack }; }
finally {
  report.productAfter = await productHashes(); report.bundleAfter = await bundleHashes();
  report.changedProductFiles = Object.keys({ ...report.productBefore, ...report.productAfter }).filter(file => report.productBefore?.[file] !== report.productAfter[file]);
  report.productStable = report.changedProductFiles.length === 0;
  report.bundleStable = same(report.bundleBefore, report.bundleAfter);
  report.driversAfter = {};
  for (const file of Object.keys(report.driversBefore ?? {})) report.driversAfter[file] = await fileHash(path.join(root, file));
  report.driversStable = same(report.driversBefore, report.driversAfter);
  if (report.status === 'pass' && (!report.productStable || !report.bundleStable || !report.driversStable)) report.status = 'invalidated-input-changed';
  report.completedAt = new Date().toISOString(); await save();
  const pointer = { status: report.status, runId, report: relative(path.join(output, 'validation.json')), suiteCount: report.suites.length, productStable: report.productStable, bundleStable: report.bundleStable, driversStable: report.driversStable, completedAt: report.completedAt };
  await writeFile(path.join(root, 'reports/art-renewal/final-regression-latest.json'), JSON.stringify(pointer, null, 2) + '\n');
  console.log(JSON.stringify(pointer, null, 2));
  if (report.status !== 'pass') process.exitCode = 1;
}

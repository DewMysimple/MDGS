/** Independently bind a completed soak + six-suite run to an explicit frozen build.
 * Reads existing evidence only; does not build, launch a browser or edit the product.
 * node reports/art-renewal/seal-candidate-runtime.mjs --freeze <json> --soak <json> --final <json> --output <new-json>
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
const option = name => {
  const at = args.indexOf(name);
  assert(at >= 0 && args[at + 1] && !args[at + 1].startsWith('--'), `Required ${name}`);
  return args[at + 1];
};
const resolved = name => {
  const result = path.resolve(root, name);
  const within = path.relative(root, result);
  assert(!path.isAbsolute(within) && !within.startsWith('..'), `Outside repository: ${name}`);
  return result;
};
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const hashFile = async file => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(resolved(file))) hash.update(chunk);
  return hash.digest('hex');
};
const load = async file => JSON.parse(await readFile(resolved(file), 'utf8'));
const same = (a, b) => {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].every(key => a?.[key] === b?.[key]);
};
const freezePath = option('--freeze'), soakPath = option('--soak'), finalPath = option('--final');
const output = resolved(option('--output'));
const [freeze, soak, final] = await Promise.all([load(freezePath), load(soakPath), load(finalPath)]);
const candidate = Number(path.basename(freeze.directory).match(/^art-candidate-(\d+)-dist$/)?.[1]);
assert(Number.isInteger(candidate) && candidate > 0, 'Explicit numbered candidate build required.');
assert.equal(soak.buildDirectory, freeze.directory);
assert.equal(final.buildDirectory, freeze.directory);
assert.equal(soak.status, 'pass'); assert.equal(final.status, 'pass');
assert.equal(soak.checks.length, 21); assert(soak.checks.every(check => check.passed === true));
assert.equal(soak.visits.length, 8);
assert.deepEqual(soak.visits.map(visit => `${visit.round}:${visit.chapter}`).sort(), ['1:1', '1:2', '1:3', '1:4', '2:1', '2:2', '2:3', '2:4']);
assert.equal(final.suites.length, 6);
assert.deepEqual(final.suites.map(suite => suite.id), ['ui', 'audio', 'runtime', 'journey', 'settings', 'subpath']);
assert(final.suites.every(suite => suite.passed === true && suite.exit.code === 0));
assert.equal(final.suites[0].checks, 83); assert.equal(final.suites[1].checks, 15);
for (const key of ['coreStable', 'coreAssetsStable', 'bundleStable', 'allProductStable']) assert.equal(soak[key], true, `soak ${key}`);
for (const key of ['productStable', 'bundleStable', 'driversStable']) assert.equal(final[key], true, `final ${key}`);
const configNames = ['vite.config.ts', 'package.json', 'package-lock.json', 'tsconfig.json'];
const products = Object.fromEntries(Object.entries(freeze.sourceInputs).filter(([file]) => !configNames.includes(file)));
for (const actual of [soak.allProductAtStart, soak.allProductAtEnd, final.productBefore, final.productAfter]) assert(same(actual, products), 'Frozen product input set/digests mismatch.');
for (const actual of [soak.bundleAtStart, soak.bundleAtEnd, final.bundleBefore, final.bundleAfter]) assert(same(actual, freeze.code), 'Frozen code input set/digests mismatch.');
const productionExpected = [...Object.keys(freeze.code), ...Object.keys(freeze.sourceInputs).filter(file => file.startsWith('public/')).map(file => file.slice(7))].sort();
const productionActual = [];
async function walkProduction(directory, prefix = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walkProduction(path.join(directory, entry.name), name);
    else { assert(entry.isFile(), `Unexpected production entry: ${name}`); productionActual.push(name); }
  }
}
await walkProduction(resolved(freeze.directory));
assert.deepEqual(productionActual.sort(), productionExpected, 'Production file set differs from frozen public assets plus emitted code.');
assert(same(soak.coreAtStart, soak.coreAtEnd));
assert(same(soak.coreAssetsAtStart, soak.coreAssetsAtEnd));
assert(same(final.driversBefore, final.driversAfter));
assert.equal(final.soak.path, soakPath);
assert.equal(final.soak.sha256, await hashFile(soakPath));

const expected = new Map();
function add(file, sha256, category) {
  assert(typeof file === 'string' && file.length && /^[a-f0-9]{64}$/.test(sha256 ?? ''), `Invalid artifact binding: ${file}`);
  const normalized = relative(resolved(file));
  const prior = expected.get(normalized);
  assert(!prior || prior.sha256 === sha256, `Conflicting artifact digests: ${file}`);
  expected.set(normalized, { sha256, categories: [...new Set([...(prior?.categories ?? []), category])] });
}
function collect(value, category) {
  if (!value || typeof value !== 'object') return;
  if (value.path && value.sha256) {
    add(value.path, value.sha256, category);
    if (value.archived) add(value.archived, value.sha256, category + '-exact-copy');
  }
  if (value.artifacts && !Array.isArray(value.artifacts)) {
    for (const [file, artifact] of Object.entries(value.artifacts)) add(file, artifact.sha256, category + '-artifact');
  }
  for (const item of Object.values(value)) if (item && typeof item === 'object') collect(item, category);
}
collect(final, 'final-evidence');
for (const shot of soak.screenshots) add(shot.path, shot.sha256, 'soak-screenshot');
for (const suite of final.suites) {
  if (suite.acceptanceManifest) collect(await load(suite.acceptanceManifest.path), suite.id + '-acceptance');
}
for (const [file, sha256] of Object.entries(freeze.sourceInputs)) add(file, sha256, 'current-frozen-input');
for (const [file, sha256] of Object.entries(freeze.sourceInputs)) {
  if (file.startsWith('public/')) add(path.join(freeze.directory, file.slice(7)), sha256, 'current-production-public-asset');
}
for (const [file, sha256] of Object.entries(freeze.code)) add(path.join(freeze.directory, file), sha256, 'current-production-code');
for (const [file, sha256] of Object.entries(final.driversAfter)) add(file, sha256, 'executed-driver');
for (const [file, sha256] of Object.entries(soak.coreAtEnd)) add(file, sha256, 'soak-core');
const artifacts = {};
for (const [file, entry] of expected) {
  const actual = await hashFile(file);
  artifacts[file] = { expected: entry.sha256, actual, bytes: (await stat(resolved(file))).size, passed: actual === entry.sha256, categories: entry.categories };
}
const failures = Object.entries(artifacts).filter(([, entry]) => !entry.passed).map(([file]) => file);
assert.equal(failures.length, 0, `Changed evidence: ${failures.join(', ')}`);
for (const key of ['errors', 'consoleErrors', 'failedResources', 'urlViolations']) assert.equal(soak[key].length, 0, key);
assert.equal(soak.final.contexts.length, 1);
assert(soak.final.contexts.every(context => context.state === 'closed'));
assert.equal(soak.final.loops.length, 3);
assert(soak.final.loops.every(loop => Number.isFinite(loop.stopRequestedAt) && Number.isFinite(loop.disconnectedAt)));
const snapshots = soak.urlLedger.filter(url => url.kind === 'snapshot');
const letters = soak.urlLedger.filter(url => url.kind === 'letter');
const retained = snapshots.filter(url => url.revokedAt === null);
assert(retained.length <= 4 && new Set(retained.map(url => url.chapter)).size === retained.length);
assert(letters.every(url => url.revokedAt !== null));
const duck = soak.visits.map(visit => visit.reading.duckDb);
const report = {
  status: 'passed-bound-local-functional-scope', candidate, sealedAt: new Date().toISOString(),
  command: ['node', relative(fileURLToPath(import.meta.url)), ...args],
  browserVersion: soak.browserVersion,
  checker: { path: relative(fileURLToPath(import.meta.url)), sha256: await hashFile(relative(fileURLToPath(import.meta.url))) },
  freeze: { path: freezePath, sha256: await hashFile(freezePath) },
  soak: { path: soakPath, sha256: await hashFile(soakPath), runId: soak.runId, checks: 21, visits: 8, wallClockSeconds: soak.wallClockSeconds, samples: soak.samples.length },
  final: { path: finalPath, sha256: await hashFile(finalPath), runId: final.runId, suites: final.suites.map(({ id, checks, passed, result }) => ({ id, checks, passed, result })) },
  bindings: { frozenInputs: Object.keys(freeze.sourceInputs).length, productInputs: Object.keys(products).length, codeFiles: Object.keys(freeze.code).length, productionPublicAssets: Object.keys(freeze.sourceInputs).filter(file => file.startsWith('public/')).length, completeProductionFiles: productionActual.length, drivers: Object.keys(final.driversAfter).length, soakCore: Object.keys(soak.coreAtEnd).length, activeCoreAssets: Object.keys(soak.coreAssetsAtEnd).length, artifactFilesChecked: expected.size, mismatches: failures },
  lifecycle: { audioContexts: 1, loops: 3, explicitStopAndDisconnect: true, finalContextClosed: true, readingDuckDb: { min: Math.min(...duck), max: Math.max(...duck) }, snapshotsCreated: snapshots.length, snapshotsRevoked: snapshots.length - retained.length, retainedCacheChapterIds: retained.map(url => url.chapter), lettersCreated: letters.length, lettersRevoked: letters.filter(url => url.revokedAt !== null).length, sourceClockMaxObservedAbsoluteErrorMs: Math.max(...soak.segments.map(segment => Math.abs(segment.clockDifferenceMs))), errors: 0 },
  limitations: 'This seals the actual local frozen-build soak and six functional suites. It is not native pixel fidelity, a quiet performance benchmark, human musical approval, all-browser certification, online deployment or final movie acceptance. Optional performance.memory/CDP counters are not VRAM. Four intentional snapshot cache URLs may remain while the mounted App is at HOME; document destruction is not counted as explicit URL.revokeObjectURL.',
  artifacts,
};
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, candidate, output: relative(output), bindings: report.bindings, suites: report.final.suites.map(({ id, checks, passed }) => ({ id, checks, passed })) }, null, 2));

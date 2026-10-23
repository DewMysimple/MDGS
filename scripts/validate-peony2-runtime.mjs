/** Direct Peony 2.0 acceptance; no runtime string adapter.
 * node scripts/validate-peony2-runtime.mjs [--journey|--settings|--subpath] [--preflight] [--build-dir dist]
 * Optional --report-dir DIR --shots-dir DIR isolate the reports and their latest pointers.
 * Each run preserves its own report; historical failures/partials are untouched.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url)), args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const selectedModes = ['journey', 'settings', 'subpath'].filter(name => args.includes('--' + name));
assert(selectedModes.length <= 1, 'Select only one of --journey, --settings or --subpath.');
const mode = selectedModes[0] || 'runtime', preflight = args.includes('--preflight');
assert.notEqual(process.env.MDGS_LEGACY_RECONSTRUCTION, '1', 'Current-edition acceptance cannot run a historical reconstruction fixture.');
const build = path.resolve(root, option('--build-dir', 'dist'));
const runId = new Date().toISOString().replace(/[:.]/g, '-') + '-' + mode + (preflight ? '-preflight' : '');
const reportRoot = path.resolve(root, option('--report-dir', 'reports/art-renewal/runtime'));
const output = path.join(reportRoot, runId), shots = path.join(path.resolve(root, option('--shots-dir', 'tmp/art-renewal-runtime')), runId);
const driver = `validate-peony2-${mode === 'runtime' ? 'original' : mode}-driver.mjs`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const mapping = [
    { old: 'Four current-edition worlds/source readiness/hidden layers/replacements', current: 'Four peony-2.0 manifests, native materials ready, zero art replacement/art text/hidden visible layers', state: 'retained', limitation: 'Runtime diagnostics do not replace the separate native pixel-fidelity acceptance.' },
    { old: 'All nodes and 25 original paragraphs at two sizes', current: 'Explicit narrativeMode=original, accepted 25-paragraph transcription parity, every authored node and responsive passage; 1672x941 + desktop compact 1280x720', state: 'retained-with-desktop-scope', limitation: 'Original DOCX is absent; accepted transcription regression only. Default poetic mode is tested separately.' },
    { old: 'Phone 390x844; controls above painting', current: 'Compact desktop 1280x720; header then painting then controls without overlap', state: 'replaced', reason: 'User requested desktop only and current artwork layout places controls below the painting.' },
    { old: 'Extra environmental-motion clock, layers and toggle', current: 'Zero extra atmosphere/motion controls; authored FPS autoplay and exact paused native source frame', state: 'replaced', reason: 'Native-only artwork policy.' },
    { old: '__MDGS_STUDY__ / previous 3D room statistics', current: '__MDGS_ATLAS__ four decoded layers; optional pigment surface; actual idle/off/reduced/visibility/return lifecycle', state: 'retired-and-replaced', reason: 'Current foyer uses four painted planes. No retired StudyRoomRenderer metrics are invented.' },
    { old: 'Exact ending, bounded seal and local Kai typography', current: 'Exact stopped end frame/render count, bounded colophon/seal and loaded local Kai', state: 'retained' },
    { old: 'Audio decode/volume/background/retry/disposal', current: 'Shared original digital soundscape; native three-stem decode [160,160,24], output gain, suspended clock, fade disposal, retry and foyer continuity', state: 'retained-with-shared-engine' },
    { old: 'Four entries, repeated input, physical scroll, minimum loading, slow textures, cover failure and cancellation', current: 'Actual four painted-foyer buttons and native snapshot scroll; same resource-delay/retry/stale-request assertions', state: 'retained-with-captured-presentation' },
    { old: 'Timeline seek and autoplay input', current: 'Retain both, add real pointer drag, wheel, ArrowRight/Left and Home/End', state: 'extended' },
    { old: 'Settings and nested-prefix historical adapters', current: 'Reviewed static settings/subpath drivers; retain source scene/material/render/cover hashes, invalid-value recovery, chapter settings, plate controls, live persistence, sampling/GL lifecycle, actual nested asset loads, dialog focus and fullscreen', state: 'retained-with-current-home', limitation: 'A --preflight run explicitly leaves the remaining chapters/persistence/error-path suites unrun.' },
];
if (args.includes('--check-adapter')) {
    console.log(JSON.stringify({ status: 'syntax-plan-only', mode, driver, build, mapping, note: 'Compatibility flag; no generated adapter and no browser execution.' }, null, 2));
    process.exit(0);
}
await mkdir(output, { recursive: true });
await mkdir(shots, { recursive: true });
async function fingerprints() {
    const hashes = {};
    async function walk(dir) { for (const item of await readdir(path.join(root, dir), { withFileTypes: true })) {
        const file = path.join(dir, item.name);
        if (item.isDirectory())
            await walk(file);
        else
            hashes[file.replaceAll('\\', '/')] = digest(await readFile(path.join(root, file)));
    } }
    await walk('src');
    for (const file of ['index.html', 'scripts/validate-peony2-runtime.mjs', 'scripts/validate-peony2-regressions.mjs', 'scripts/' + driver, 'scripts/validate-new-scroll-runtime.mjs', 'scripts/validate-new-scroll-journey.mjs', 'scripts/validate-viewer-settings.mjs', 'scripts/validate-subpath.mjs', 'reports/new-scrolls/narrative-source.json'])
        hashes[file] = digest(await readFile(path.join(root, file)));
    for (const file of ['index.html', ...(await readdir(path.join(build, 'assets'))).filter(file => /\.(js|css)$/.test(file)).map(file => 'assets/' + file)])
        hashes[relative(path.join(build, file))] = digest(await readFile(path.join(build, file)));
    for (const id of [1, 2, 3, 4])
        for (const name of ['scene.json', 'source-materials.json', 'render-settings.json', 'cover.webp']) {
            const source = path.join(root, 'public', `assets/new-scrolls/chapter-${id}`, name), production = path.join(build, `assets/new-scrolls/chapter-${id}`, name);
            hashes[relative(source)] = digest(await readFile(source));
            hashes[relative(production)] = digest(await readFile(production));
            assert.equal(hashes[relative(production)], hashes[relative(source)], 'Rebuild: production differs from ' + relative(source));
        }
    return hashes;
}
const manifest = { status: 'running', startedAt: new Date().toISOString(), mode, preflight, runId, driver, buildDirectory: relative(build), report: relative(path.join(output, 'validation.json')), mapping };
manifest.inputsBefore = await fingerprints();
manifest.driverSnapshot = relative(path.join(output, 'executed-driver.mjs'));
await writeFile(path.join(output, 'executed-driver.mjs'), await readFile(path.join(root, 'scripts', driver)));
const save = () => writeFile(path.join(output, 'acceptance.json'), JSON.stringify(manifest, null, 2) + '\n');
await save();
// Child drivers are reviewed, committed source files. Environment only passes this
// invocation's paths; unlike the previous adapter, no legacy source is rewritten.
process.env.MDGS_ACCEPTANCE_OUTPUT = output;
process.env.MDGS_ACCEPTANCE_SHOTS = shots;
process.env.MDGS_ACCEPTANCE_BUILD = build;
process.env.MDGS_ACCEPTANCE_PREFLIGHT = String(preflight);
try {
    await import('./' + driver);
    const result = JSON.parse(await readFile(path.join(output, 'validation.json'), 'utf8'));
    assert.equal(result.status, preflight ? 'preflight-pass' : 'pass');
    manifest.status = result.status;
    manifest.checks = result.checks.length;
    manifest.nodes = result.nodes?.length;
}
catch (error) {
    manifest.status = 'fail';
    manifest.failure = { message: error.message, stack: error.stack };
    process.exitCode = 1;
    console.error(error.stack);
}
finally {
    manifest.inputsAfter = await fingerprints();
    manifest.changedInputs = Object.keys(manifest.inputsBefore).filter(file => manifest.inputsBefore[file] !== manifest.inputsAfter[file]);
    manifest.sourceStable = manifest.changedInputs.length === 0;
    if (!preflight && !manifest.sourceStable) {
        manifest.status = 'invalidated-source-changed';
        process.exitCode = 1;
    }
    manifest.artifacts = {};
    async function artifacts(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) await artifacts(file);
            else if (file !== path.join(output, 'acceptance.json')) {
                const bytes = await readFile(file);
                manifest.artifacts[relative(file)] = { bytes: bytes.length, sha256: digest(bytes) };
            }
        }
    }
    await artifacts(output); await artifacts(shots);
    manifest.completedAt = new Date().toISOString();
    await save();
    const pointer = { status: manifest.status, mode, preflight, runId, acceptance: relative(path.join(output, 'acceptance.json')), report: manifest.report, checks: manifest.checks, nodes: manifest.nodes, sourceStable: manifest.sourceStable, completedAt: manifest.completedAt };
    await writeFile(path.join(reportRoot, `${mode}-${preflight ? 'preflight' : 'latest'}.json`), JSON.stringify(pointer, null, 2) + '\n');
    console.log(JSON.stringify(pointer, null, 2));
}

/** Retain upstream settings / nested-prefix acceptance for the native edition.
 * node scripts/validate-peony2-regressions.mjs --settings [--check-adapter]
 * node scripts/validate-peony2-regressions.mjs --subpath [--check-adapter]
 * --check-adapter only checks the generated driver syntax; it starts no server
 * or browser. Actual acceptance must run serially with other GPU checks.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const modes = ['settings', 'subpath'].filter(name => process.argv.includes(`--${name}`));
assert.equal(modes.length, 1, 'Select exactly one mode: --settings or --subpath.');
const mode = modes[0], edition = 'peony-2.0-2026-10-23';
assert.notEqual(process.env.MDGS_LEGACY_RECONSTRUCTION, '1', 'The current-edition adapter does not run a historical reconstruction fixture.');
const originalName = mode === 'settings' ? 'validate-viewer-settings.mjs' : 'validate-subpath.mjs';
const original = await readFile(path.join(root, 'scripts', originalName), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const output = `reports/peony2-fidelity/${mode}`;
let source = original;
function replaceOnce(before, after) {
  assert.equal(source.split(before).length - 1, 1, 'Review upstream acceptance changes before adapting: ' + before.slice(0, 120));
  source = source.replace(before, after);
}

// Bind the actual production artifacts and every chapter's scene, shader graph,
// render metadata and cover. Do not claim visual/native fidelity from these
// interaction checks; the independent pixel acceptance owns that comparison.
const inputHashes = {};
async function record(file) { inputHashes[file] = sha(await readFile(path.join(root, file))); }
async function buildFiles(directory) {
  for (const entry of (await readdir(path.join(root, directory), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await buildFiles(file);
    else if (/\.(js|css|html)$/.test(entry.name)) await record(file);
  }
}
await record('dist/index.html');
await buildFiles('dist/assets');
const sourceSha256 = {};
for (const id of [1, 2, 3, 4]) {
  const base = `assets/new-scrolls/chapter-${id}/`;
  for (const name of ['scene.json', 'source-materials.json', 'render-settings.json', 'cover.webp']) {
    const publicFile = `public/${base}${name}`, distFile = `dist/${base}${name}`;
    await record(publicFile); await record(distFile);
    assert.equal(inputHashes[distFile], inputHashes[publicFile], `Rebuild before regression: dist differs from ${publicFile}.`);
  }
  const manifest = JSON.parse(await readFile(path.join(root, `public/${base}scene.json`), 'utf8'));
  assert.equal(manifest.sourceRevision, edition);
  sourceSha256[id] = manifest.sourceSha256;
}
const applicability = { sourceRevision: edition, sourceSha256, upstreamAcceptance: originalName,
  upstreamAcceptanceSha256: sha(original), inputHashes,
  retained: mode === 'settings'
    ? 'All original wheel bounds, live speed, smoothing/storage, invalid settings, plate typography/bounds, responsive controls, idle/background lifecycle, real WebGL context recovery, home/settings and dialog focus assertions.'
    : 'All original nested-prefix homepage references, ornaments/CSS, four source scenes/covers/textures, local font, enabled audio/volume/off, typography, wheel/drag/keyboard/next/autoplay, fullscreen, progress-home, culture dialog and resource-error assertions.',
  changed: 'Current edition identity; zero additional atmosphere layers; explicit absence of the retired extra-motion toggle; new report destination. Source-authored animation remains enabled by the source clock.',
  limitation: 'Interaction/resource regression; no FPS, pixel equivalence, or whole-browser portability claim.' };
const bindingCode = `const adapterApplicability=${JSON.stringify(applicability)};
async function verifyAdapterInputs(){
 for(const [file,expected] of Object.entries(adapterApplicability.inputHashes)){
  assert.equal(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex'),expected,'Production inputs changed during regression: '+file);
 }
}
`;
replaceOnce("fileURLToPath(new URL('../', import.meta.url))", JSON.stringify(root));
if (mode === 'settings') {
  replaceOnce("'reports/viewer-settings'", JSON.stringify(output));
  replaceOnce("const report = { status: 'running',", bindingCode + "const report = { status: 'running',");
  replaceOnce('checks: [], errors: [], frames: [] };', 'checks: [], errors: [], frames: [], applicability: adapterApplicability };');
  replaceOnce("assert.equal(first.sourceHiddenVisibleLayers, '0');", `assert.equal(first.sourceHiddenVisibleLayers, '0');
    assert.equal(first.sourceRevision,${JSON.stringify(edition)});assert.equal(first.sourceMaterialsReady,'true');
    assert.equal(first.editionAtmosphereLayers,'0');assert.equal(first.activeMotionNames,'[]');assert.equal(first.motionEnabled,'false');`);
  replaceOnce("await page.getByRole('button', { name: '画中轻动', exact: true }).click();", `assert.equal(await page.getByRole('button',{name:'画中轻动',exact:true}).count(),0,'The native edition must not offer additional ambient motion.');
  assert.equal((await data()).motionEnabled,'false');assert.equal((await data()).activeMotionNames,'[]');`);
  replaceOnce('assert.deepEqual(report.errors, []); report.status', 'await verifyAdapterInputs(); assert.deepEqual(report.errors, []); report.status');
} else {
  source = "import { createHash } from 'node:crypto';\n" + source;
  replaceOnce("const reportPath=path.join(root,`reports/validation-portable-subpath${legacy?'-legacy':''}.json`);", `const reportPath=path.join(root,${JSON.stringify(output + '/validation.json')});`);
  replaceOnce("await mkdir(path.join(root,'reports/screenshots'),{recursive:true});", `await mkdir(path.join(root,${JSON.stringify(output)}),{recursive:true});`);
  replaceOnce("'reports/screenshots/portable-subpath-1280x720.png'", JSON.stringify(output + '/portable-subpath-1280x720.png'));
  replaceOnce('const report = status=>({status,startedAt,', bindingCode + 'const report = status=>({status,applicability:adapterApplicability,startedAt,');
  replaceOnce('const expectedAdded=legacy?chapter.addedLayers.length:chapter.stops.length*2;', 'const expectedAdded=legacy?chapter.addedLayers.length:0;');
  replaceOnce('assert.equal(Number(canvas.sourceHiddenVisibleLayers),0);', `assert.equal(Number(canvas.sourceHiddenVisibleLayers),0);
      assert.equal(canvas.sourceRevision,${JSON.stringify(edition)});assert.equal(canvas.sourceMaterialsReady,'true');
      assert.equal(canvas.activeMotionNames,'[]');assert.equal(canvas.motionEnabled,'false');`);
  replaceOnce("assert(resources.includes(`${base}scene.json`),'The browser must actually request the active scene manifest beneath the prefix.');", "assert(resources.includes(`${base}scene.json`),'The browser must actually request the active scene manifest beneath the prefix.');\n      for(const file of ['source-materials.json','render-settings.json'])assert(resources.includes(`${base}${file}`),'Native shader and render metadata must actually load beneath the nested prefix: '+file);");
  replaceOnce(`  const motion = page.getByRole('button', { name: '画中轻动', exact: true });
  await motion.click();
  await page.waitForFunction(() => document.querySelector('.motion-button')?.getAttribute('aria-pressed') === 'false');
  await motion.click();
  await page.waitForFunction(() => document.querySelector('.motion-button')?.getAttribute('aria-pressed') === 'true');`, `  assert.equal(await page.getByRole('button',{name:'画中轻动',exact:true}).count(),0,'The native edition must not offer additional ambient motion.');
  const nativeMotion=await page.locator('.painting canvas').evaluate(canvas=>({...canvas.dataset}));
  assert.equal(nativeMotion.motionEnabled,'false');assert.equal(nativeMotion.activeMotionNames,'[]');
  assert.equal(nativeMotion.editionAtmosphereLayers,'0');`);
  replaceOnce("'motion-toggle'", "'native-source-only-motion-policy'");
  replaceOnce('assert.deepEqual(pageErrors, []);', 'await verifyAdapterInputs(); assert.deepEqual(pageErrors, []);');
}

const directory = path.join(root, '.asset-cache/peony2-validation');
await mkdir(directory, { recursive: true });
const driver = path.join(directory, `${mode}-${process.pid}-${Date.now()}.mjs`);
await writeFile(driver, source);
try {
  if (process.argv.includes('--check-adapter')) {
    execFileSync(process.execPath, ['--check', driver], { stdio: 'pipe' });
    console.log(JSON.stringify({ status: 'adapter-syntax-pass', mode, upstreamAcceptanceSha256: applicability.upstreamAcceptanceSha256,
      boundArtifacts: Object.keys(inputHashes).length, reportDirectory: output, browserStarted: false }));
  } else await import(pathToFileURL(driver).href);
} finally {
  await unlink(driver).catch(() => {});
}

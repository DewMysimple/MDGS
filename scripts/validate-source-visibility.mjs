/** Scope the reviewed source residency correction without changing animation. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const source = await readFile(new URL('../src/scene/SourceVisibility.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
} }).outputText;
const { shouldUseSourceVisibility, sourceResidencyObjects } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const sceneText = await readFile(new URL('../public/assets/new-scrolls/chapter-1/scene.json', import.meta.url), 'utf8');
const manifest = JSON.parse(sceneText);
const manifestBefore = JSON.stringify(manifest);
const materialText = await readFile(new URL('../public/assets/new-scrolls/chapter-1/source-materials.json', import.meta.url), 'utf8');
const materials = JSON.parse(materialText);
const checks = [];
function check(name, callback) { callback(); checks.push({ name, passed: true }); }

check('complete-reviewed-residency-allowlist', () => {
  assert.equal(sourceResidencyObjects.length, 120);
  assert.equal(new Set(sourceResidencyObjects).size, 120);
  const meshNames = new Set(manifest.meshes.map(mesh => mesh.name));
  for (const name of sourceResidencyObjects) {
    assert(meshNames.has(name), `Reviewed card is missing: ${name}`);
    assert(manifest.visibility[name].length > 1, `No residency window: ${name}`);
    assert.equal(shouldUseSourceVisibility(manifest, name), false);
  }
  for (const mesh of manifest.meshes) {
    assert.equal(shouldUseSourceVisibility(manifest, mesh.name), !sourceResidencyObjects.includes(mesh.name));
  }
});

check('green-mountains-visible-before-late-residency-key', () => {
  const names = ['远景 · 03_中央群山瀑布', '转场 · 06_右下山石松树.001'];
  for (const name of names) {
    const track = manifest.visibility[name];
    const before = track.filter(key => key.progress <= 191 / 3023).at(-1).visible;
    const after = track.filter(key => key.progress <= 192 / 3023 + 1e-7).at(-1).visible;
    assert.equal(before, false);
    assert.equal(after, true);
    assert.equal(shouldUseSourceVisibility(manifest, name), false);
    const program = Object.values(materials.programs).find(value => value.objectName === name);
    assert.deepEqual(program.uniforms, {}, `Static card gained an entrance track: ${name}`);
  }
});

check('other-sources-and-unreviewed-objects-keep-authored-visibility', () => {
  const name = sourceResidencyObjects[0];
  for (const changed of [
    { ...manifest, sourceSha256: 'unreviewed-source' },
    { ...manifest, sourceRevision: 'unreviewed-revision' },
    { ...manifest, id: 'chapter-2' },
    { ...manifest, sourceSha256: undefined },
  ]) assert.equal(shouldUseSourceVisibility(changed, name), true);
  for (const unreviewed of ['背景图', '可视路径 · 仅编辑辅助', '主体 · 03_中央花车巡游与曲水', 'unknown']) {
    assert.equal(shouldUseSourceVisibility(manifest, unreviewed), true);
  }
});

check('designated-entrance-tracks-and-input-data-remain-intact', () => {
  const animated = Object.values(materials.programs).filter(program => Object.keys(program.uniforms).length);
  assert.equal(animated.length, 11);
  assert.equal(Object.keys(materials.tracks).length, 11);
  for (const program of animated) for (const definition of Object.values(program.uniforms)) {
    assert(materials.tracks[definition.track]);
    assert(definition.track.includes('指定入场进度'));
  }
  assert.equal(JSON.stringify(manifest), manifestBefore, 'Visibility policy mutated source data');
});

console.log(JSON.stringify({ status: 'passed', checks,
  sourceSha256: manifest.sourceSha256,
  sourceMaterialSha256: createHash('sha256').update(materialText).digest('hex'),
  scope: 'Pure visibility-policy checks; source material/camera playback and GPU rendering require runtime verification.',
}, null, 2));

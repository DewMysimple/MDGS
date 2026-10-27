/** Geometry and residency invariants for native shadows; no GPU pixel claim. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const threeUrl = pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href;
const qualityCompiled = ts.transpileModule(await readFile(path.join(root, 'src/scene/renderQuality.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const qualityUrl = `data:text/javascript;base64,${Buffer.from(qualityCompiled).toString('base64')}`;
const compiled = ts.transpileModule(await readFile(path.join(root, 'src/scene/SourceLighting.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/from (['"])three\1/g, `from ${JSON.stringify(threeUrl)}`)
  .replace(/from (['"])\.\/renderQuality\1/g, `from ${JSON.stringify(qualityUrl)}`);
const { createSourceLighting } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const settings = type => ({
  world: { color: [0, 0, 0], strength: 0 }, lights: [{ name: 'fixture', type, color: [1, 1, 1], energy: 1,
    position: [0, 0, 5], direction: type === 'SUN' ? [-.5, 0, -1] : [0, 0, -1],
    axisX: [1, 0, 0], axisY: [0, 1, 0], angle: .3, size: 2, use_shadow: true }],
});
function sheet(scene, name, width, height, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.name = name; mesh.position.set(x, y, z); mesh.userData.sourceVisible = true;
  scene.add(mesh); mesh.updateMatrixWorld(true); return mesh;
}
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(30, 16 / 9, .08, 140);
camera.updateMatrixWorld(true);
const receiver = sheet(scene, 'receiver', 4, 3, 0, 0, -6);
const offscreen = sheet(scene, 'offscreen-source-caster', 1, 1, 3, 0, -1);
offscreen.visible = false;
const remote = sheet(scene, 'irrelevant-remote', 4, 4, 5000, 0, -3000);
const hidden = sheet(scene, 'author-hidden', 2, 2, 0, 0, -4); hidden.userData.sourceVisible = false;
const artHidden = sheet(scene, 'art-hidden', 2, 2, 0, 0, -3); artHidden.userData.artHidden = true;
const longPaper = sheet(scene, 'long-paper', 20000, 2, 0, -1, -10);
const lighting = createSourceLighting(settings('SUN'));
lighting.setRenderQuality('2k'); // Preserve this fixture's existing 2048px raster oracle.
let casters = new Set(lighting.requiredShadowCasters(scene, camera, 6));
assert(casters.has(receiver));
assert(casters.has(offscreen), 'A source-visible unloaded caster outside the main camera must be required.');
assert(!casters.has(remote) && !casters.has(hidden) && !casters.has(artHidden));
const matrix = lighting.uniforms.nativeLamp0ShadowMatrix.value.toArray();
const parameters = lighting.uniforms.nativeLamp0ShadowParameters.value.toArray();
assert(parameters[1] < 256, 'Remote objects and the long paper outside the receiver volume cannot consume the depth range.');
offscreen.visible = true; remote.visible = false; receiver.visible = false;
assert.deepEqual(new Set(lighting.requiredShadowCasters(scene, camera, 6)), casters, 'Texture residency cannot change the logical caster set.');
assert.deepEqual(lighting.uniforms.nativeLamp0ShadowMatrix.value.toArray(), matrix, 'Texture residency cannot change the light projection.');
assert.deepEqual(lighting.uniforms.nativeLamp0ShadowParameters.value.toArray(), parameters);
scene.remove(remote); lighting.requiredShadowCasters(scene, camera, 6);
assert.deepEqual(lighting.uniforms.nativeLamp0ShadowMatrix.value.toArray(), matrix, 'An irrelevant remote sheet cannot affect fitting.');
camera.position.x += 1e-6; camera.updateMatrixWorld(true); lighting.requiredShadowCasters(scene, camera, 6);
assert.deepEqual(lighting.uniforms.nativeLamp0ShadowMatrix.value.toArray(), matrix, 'Sub-texel camera motion must retain the same SUN projection.');
assert(!lighting.fragment.includes('dFdx(p)') && lighting.fragment.includes('projection*vec4(sourceWorldDx,0.0)'),
  'Receiver-plane gradients must use derivatives evaluated before peel discard.');

receiver.visible = offscreen.visible = remote.visible = true;
const beforeVisibility = new Map(); scene.traverse(object => { if (object instanceof THREE.Mesh) beforeVisibility.set(object, object.visible); });
let draws = 0, pass = '';
let precisionQueries = 0;
const context = { SUBPIXEL_BITS: 0x0D50, getParameter() { precisionQueries++; return 8; } };
const renderer = {
  getContext: () => context,
  autoClear: false, getRenderTarget: () => null, getViewport: target => target.set(0, 0, 640, 360),
  getScissor: target => target.set(0, 0, 640, 360), getScissorTest: () => false,
  getClearColor: target => target.set(0), getClearAlpha: () => 1, setScissorTest() {}, setClearColor() {},
  setRenderTarget() {}, clear() {}, setViewport() {}, setScissor() {},
  render(currentScene) {
    draws++;
    currentScene.traverse(object => { if (object instanceof THREE.Mesh && object.visible) assert(casters.has(object)); });
  },
};
const materials = { setPass: next => { pass = next; } };
lighting.prepareShadows(renderer, scene, materials, camera, 6);
assert.equal(draws, 1); assert.equal(pass, 'color');
assert.equal(lighting.shadowSubpixelBits, 8);
assert.equal(lighting.uniforms.sourceShadowRasterHalfStep.value, .5 / (2048 * 256));
for (const [mesh, visible] of beforeVisibility) assert.equal(mesh.visible, visible, 'A shadow draw must restore main-scene visibility.');
renderer.render = () => { throw new Error('fixture-shadow-failure'); };
assert.throws(() => lighting.prepareShadows(renderer, scene, materials, camera, 6), /fixture-shadow-failure/);
for (const [mesh, visible] of beforeVisibility) assert.equal(mesh.visible, visible, 'A failed shadow draw must also restore visibility.');
assert.equal(pass, 'color');
assert.equal(precisionQueries, 1, 'GPU raster precision is queried once per context rather than each frame.');
// A linear triangle depth field with independently rounded projected vertices.
// Its barycentric depth error cannot exceed the slope-scaled raster bound.
const halfStep = lighting.uniforms.sourceShadowRasterHalfStep.value;
for (const gradient of [[3, 0], [-2, 4], [.02, -.01]]) for (const weights of [[1, 0, 0], [.2, .3, .5], [1 / 3, 1 / 3, 1 / 3]]) {
  const errors = [[halfStep, -halfStep], [-halfStep, halfStep], [halfStep, halfStep]];
  const residual = Math.abs(weights.reduce((sum, weight, i) => sum + weight * (gradient[0] * errors[i][0] + gradient[1] * errors[i][1]), 0));
  const bound = (Math.abs(gradient[0]) + Math.abs(gradient[1])) * halfStep;
  assert(residual <= bound + Number.EPSILON);
}
lighting.dispose();
const area = createSourceLighting(settings('AREA'));
area.setRenderQuality('2k');
const areaBefore = new Set(area.requiredShadowCasters(scene, camera, 6));
receiver.visible = false;
assert.deepEqual(new Set(area.requiredShadowCasters(scene, camera, 6)), areaBefore, 'AREA caster selection also ignores residency.');
area.dispose();
for (const mesh of [receiver, offscreen, remote, hidden, artHidden, longPaper]) { mesh.geometry.dispose(); mesh.material.dispose(); }
console.log(JSON.stringify({ status: 'pass', checks: [
  'source-visible-offscreen-caster-is-required', 'hidden-and-remote-casters-are-excluded',
  'residency-cannot-change-casters-or-projection', 'long-paper-is-clipped-before-depth-fitting',
  'sun-sub-texel-motion-keeps-projection', 'pre-discard-derivative-contract',
  'per-light-draw-restores-visibility-on-success-and-error', 'area-caster-selection-ignores-residency',
  'gpu-subpixel-precision-is-cached', 'raster-depth-error-is-bounded-by-slope-and-half-grid',
] }));

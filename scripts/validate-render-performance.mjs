/** CPU checks for bounded reading placement and prioritized source-layer streaming.
 * Real GPU readback, frame times and rendered fidelity require browser acceptance. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = file => readFile(path.join(root, file), 'utf8');
const placementUrl = moduleUrl(compile(await read('src/scene/NarrativeSpace.ts')));
const { narrativeSampleSize, findNarrativeSpace } = await import(placementUrl);
const checks = [];
for (const [width, height] of [[1, 1], [320, 568], [390, 844], [1672, 941], [3840, 2160], [7680, 4320]]) {
  const sample = narrativeSampleSize(width, height);
  assert(sample.width > 0 && sample.height > 0 && sample.width <= 256 && sample.height <= 192);
  assert(sample.width * sample.height <= 49152);
  const pixels = new Uint8Array(sample.width * sample.height * 4).fill(255);
  const quiet = findNarrativeSpace(pixels, sample.width, sample.height);
  assert.equal(quiet.dense, false); assert.equal(quiet.quietFraction, 1);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; }
  assert.equal(findNarrativeSpace(pixels, sample.width, sample.height).dense, true);
}
checks.push({ test: 'placement-buffer-bounded-through-8k-and-distinguishes-paper-from-ink', maximumPixels: 49152, passed: true });
assert.equal(findNarrativeSpace(new Uint8Array(256 * 100 * 4).fill(255), 256, 100, undefined, true).orientation, 'horizontal', 'Short landscape reading areas need horizontal text even when their thumbnail is wide.');

// GPU and unrelated presentation surfaces are replaced, while the production
// streaming, visibility, readiness and shader-failure logic executes unchanged.
const threeUrl = pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href;
const gpuUrl = moduleUrl(`export * from ${JSON.stringify(threeUrl)};
export class WebGLRenderer {
 debug={}; domElement={dataset:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}};
 capabilities={getMaxAnisotropy(){return 1;}}; info={render:{calls:0},memory:{geometries:0}};
 setPixelRatio(){} setClearColor(){} dispose(){} forceContextLoss(){}
 getContext(){return {getExtension(){return null;}};}
}`);
const surfaceUrl = moduleUrl(`export class CalligraphyLayer {dispose(){}}
export class MotionDirector {} export class StableLayerSorting {}
export const getMotionProfile=()=>({enabled:false}); export const prepareScene=x=>x;
export const applyArtDirection=()=>{}; export const createNewScrollAtmosphere=()=>{};
export const activeSourceEdition='test'; export const chapterAssetBase=()=>'';`);
const imports = { three: gpuUrl, './NarrativeSpace': placementUrl };
const rendererSource = compile(await read('src/scene/SceneRenderer.ts')).replace(/from (['"])([^'"]+)\1/g, (match, quote, name) => `from ${JSON.stringify(imports[name] || surfaceUrl)}`);
const { SceneRenderer } = await import(moduleUrl(rendererSource));
globalThis.devicePixelRatio = 1;
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
globalThis.window = { clearTimeout() {}, setTimeout() { return 0; } };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const statuses = [], preparation = [];
const renderer = new SceneRenderer({ appendChild() {}, closest() { return null; } }, status => statuses.push(status), state => preparation.push(state));
const requested = [], callbacks = new Map();
renderer.loader = { load(url, success, progress, failure) { requested.push(url); callbacks.set(url, { success, failure }); } };
renderer.camera.aspect = 1; renderer.camera.updateProjectionMatrix(); renderer.camera.updateMatrixWorld(true);
const objects = [];
function layer(url, visible) {
  const geometry = new THREE.PlaneGeometry(1, 1), material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.z = -5; mesh.updateMatrixWorld(true); mesh.userData.sourceVisible = visible; mesh.visible = false;
  const object = { mesh, material, url, visibility: visible ? undefined : [{ progress: 0, visible: false }, { progress: .01, visible: true }] };
  objects.push(object); return object;
}
const future = [layer('future-a', false), layer('future-b', false)];
renderer.objects = objects;
renderer.updateTextures();
assert.equal(requested.length, 1, 'Only one speculative image may occupy the four download slots.');
assert.equal(renderer.ready, true, 'Upcoming hidden layers cannot hold the current frame readiness gate.');
const current = Array.from({ length: 4 }, (_, index) => layer(`current-${index}`, true));
renderer.updateTextures();
assert.deepEqual(requested.slice(1), ['current-0', 'current-1', 'current-2']);
assert.equal(renderer.ready, false);
function complete(url) {
  const texture = new THREE.Texture({ width: 4, height: 4 });
  callbacks.get(url).success(texture);
}
for (const object of current) complete(object.url);
assert.equal(renderer.ready, true);
assert.equal(requested.filter(url => url.startsWith('future')).length, 1);
assert(future.every(object => !object.mesh.visible), 'Prefetch must preserve the source hidden state.');
complete('future-a');
assert.equal(requested.at(-1), 'future-b');
assert.equal(renderer.ready, true, 'An unfinished speculative image must not turn off current readiness.');
callbacks.get('future-b').failure();
assert.equal(statuses.at(-1), null, 'A speculative failure must not report missing current artwork.');
checks.push({ test: 'visible-resource-priority-single-speculative-slot-readiness-source-visibility-and-failure', requested: [...requested], passed: true });
// Fail a shader while four visible textures are in flight and a fifth is
// queued. Their late completions must leave the failure and recovery intact.
for (let index = 0; index < 5; index++) layer(`shader-late-${index}`, true);
renderer.updateTextures();
assert(callbacks.has('shader-late-0') && callbacks.has('shader-late-3'));
assert(!callbacks.has('shader-late-4'));
renderer.firstFrameReady = true;
renderer.renderer.debug.onShaderError();
assert.equal(renderer.ready, false); assert.equal(preparation.at(-1).stage, 'error');
assert.equal(renderer.firstFrameReady, false);
const shaderErrorStatus = statuses.at(-1), shaderErrorPreparation = preparation.at(-1), startedBeforeFailure = requested.length;
complete('shader-late-0');
callbacks.get('shader-late-1').failure();
renderer.updateTextures(); renderer.pumpQueue();
assert.equal(renderer.ready, false); assert.equal(renderer.firstFrameReady, false);
assert.equal(statuses.at(-1), shaderErrorStatus); assert.equal(preparation.at(-1), shaderErrorPreparation);
assert.equal(requested.length, startedBeforeFailure, 'Late callbacks must not restart the queue after a shader failure.');
renderer.manifest = {}; renderer.loaded = true;
assert(shaderErrorStatus.startsWith('画面暂时中断'), 'The viewport must expose its existing recovery button for shader errors.');
assert.equal(renderer.retryFailedAssets(), false, 'Shader failures must rebuild the renderer instead of retrying only textures.');
renderer.frame = 0; renderer.requestFrame(); assert.equal(renderer.frame, 0, 'Failed shaders must stop RAF and never unlock first-frame readiness.');
renderer.dispose();
checks.push({ test: 'shader-failure-invalidates-first-frame-and-survives-late-texture-success-failure', queuedStartsBeforeFailure: startedBeforeFailure, queuedStartsAfterFailure: requested.length, passed: true });
const report = { status: 'pass', testedAt: new Date().toISOString(), scope: 'CPU thumbnail bounds and production streaming/failure logic with GPU stubbed. No FPS or rendered-pixel claim.', checks };
await writeFile(path.join(root, 'reports/new-scrolls/render-performance-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, checks: checks.length }));

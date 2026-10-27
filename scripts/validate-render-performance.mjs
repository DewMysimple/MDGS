/** CPU checks for bounded reading placement and prioritized source-layer streaming.
 * Real GPU readback, frame times and rendered fidelity require browser acceptance. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const read = file => readFile(path.join(root, file), 'utf8');
const framePacerUrl = moduleUrl(compile(await read('src/scene/FramePacer.ts')));
const renderQualityUrl = moduleUrl(compile(await read('src/scene/renderQuality.ts')));
const placementUrl = moduleUrl(compile(await read('src/scene/NarrativeSpace.ts')));
const viewportUrl = moduleUrl(compile(await read('src/scene/sourceViewport.ts'))
  .replace(/from (['"])\.\/renderQuality\1/g, `from ${JSON.stringify(renderQualityUrl)}`));
const texturePreparationUrl = moduleUrl(compile(await read('src/scene/texturePreparation.ts')));
const { narrativeSampleSize, findNarrativeSpace } = await import(placementUrl);
const { fitSourceViewport, sourceViewportLayout } = await import(viewportUrl);
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
for (const [width, height] of [[390, 844], [1672, 941], [1920, 480]]) {
  const gate = fitSourceViewport(width, height, { width: 1920, height: 1080, pixelAspectX: 1, pixelAspectY: 1 });
  assert(Math.abs(gate.width / gate.height - 16 / 9) < 1e-10);
  assert(gate.x >= 0 && gate.y >= 0 && gate.width <= width && gate.height <= height);
  assert(Math.abs(gate.x * 2 + gate.width - width) < 1e-10);
  assert(Math.abs(gate.y * 2 + gate.height - height) < 1e-10);
}
assert.equal(fitSourceViewport(400, 400, { width: 100, height: 100, pixelAspectX: 2, pixelAspectY: 1 }).aspect, 2);
const sourceRender = { width: 1920, height: 1080, pixelAspectX: 1, pixelAspectY: 1 };
const insetLayout = sourceViewportLayout(2048, 1079, sourceRender, 8).viewport;
assert(Math.abs(insetLayout.x - 2048 * .08) < 1e-10);
assert(Math.abs(2048 - insetLayout.x - insetLayout.width - insetLayout.x) < 1e-10, 'configured paper gutters are equal');
assert(insetLayout.y > 0 && insetLayout.y * 2 + insetLayout.height <= 1079 + 1e-10);
const noInsetWide = sourceViewportLayout(1920, 480, sourceRender).viewport;
assert.equal(noInsetWide.x, 0); assert.equal(noInsetWide.width, 1920); assert.equal(noInsetWide.height, 480);
const boundedInset = sourceViewportLayout(2048, 1079, sourceRender, 80).viewport;
assert(Math.abs(boundedInset.x - 2048 * .49) < 1e-10);
checks.push({ test: 'whole-source-camera-gate-centered-with-adjustable-equal-paper-gutters', passed: true });

// GPU and unrelated presentation surfaces are replaced, while the production
// streaming, visibility, readiness and shader-failure logic executes unchanged.
const threeUrl = pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href;
const gpuUrl = moduleUrl(`export * from ${JSON.stringify(threeUrl)};
export class WebGLRenderer {
 debug={}; domElement={dataset:{},style:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}};
 capabilities={getMaxAnisotropy(){return 1;}}; info={render:{calls:0},memory:{geometries:0}};
 setPixelRatio(){} setClearColor(){} setViewport(){} dispose(){} forceContextLoss(){}
 setDrawingBufferSize(width,height,ratio){this.domElement.width=Math.floor(width*ratio);this.domElement.height=Math.floor(height*ratio);}
 preparedTextures=[]; initTexture(texture){this.preparedTextures.push(texture);}
 getContext(){return {getExtension(){return null;}};}
}`);
// Each presentation/GPU dependency has an explicit module boundary. A new
// production import must be reviewed instead of silently receiving an unrelated
// catch-all surface. Source geometry and queue/readiness methods stay real.
const editionUrl = moduleUrl("export const activeSourceEdition='peony-2.0-2026-10-23'; export const chapterAssetBase=()=>'';");
const imports = {
  three: gpuUrl,
  './NarrativeSpace': placementUrl,
  './sourceViewport': viewportUrl,
  './FramePacer': framePacerUrl,
  './renderQuality': renderQualityUrl,
  './SourceVisibility': moduleUrl(compile(await read('src/scene/SourceVisibility.ts'))),
  './texturePreparation': texturePreparationUrl,
  './ShaderWarmup': moduleUrl(compile(await read('src/scene/ShaderWarmup.ts')).replace(/from (['"])three\1/g, `from ${JSON.stringify(threeUrl)}`)),
  './artworkSnapshot': moduleUrl(compile(await read('src/scene/artworkSnapshot.ts')).replace(/from (['"])\.\.\/data\/sourceEdition\1/g, `from ${JSON.stringify(editionUrl)}`)),
  './artworkProjection': moduleUrl(compile(await read('src/scene/artworkProjection.ts')).replace(/from (['"])three\1/g, `from ${JSON.stringify(threeUrl)}`)),
  './prepareScene': moduleUrl('export const prepareScene=x=>x;'),
  './CalligraphyLayer': moduleUrl('export class CalligraphyLayer {dispose(){}}'),
  './MotionDirector': moduleUrl('export class MotionDirector {}'),
  './StableLayerSorting': moduleUrl('export class StableLayerSorting {}'),
  '../data/motionProfiles': moduleUrl('export const getMotionProfile=()=>({enabled:false});'),
  '../data/sourceEdition': editionUrl,
  './ArtDirectionLayer': moduleUrl('export const applyArtDirection=()=>{};'),
  './NewScrollAtmosphere': moduleUrl('export const createNewScrollAtmosphere=()=>{};'),
  './SourceMaterial': moduleUrl('export const loadSourceMaterialLibrary=()=>{throw new Error("Unexpected GPU material construction in CPU streaming test");};'),
  './SourceLighting': moduleUrl('export const loadSourceRenderSettings=()=>{throw new Error("Unexpected render-settings fetch in CPU streaming test");}; export const createSourceLighting=()=>{throw new Error("Unexpected GPU lighting construction in CPU streaming test");};'),
  './SourcePostProcessing': moduleUrl('export class SourcePostProcessing {constructor(){throw new Error("Unexpected GPU post-processing construction in CPU streaming test");}}'),
};
const rendererSource = compile(await read('src/scene/SceneRenderer.ts')).replace(/from (['"])([^'"]+)\1/g, (match, quote, name) => {
  assert(imports[name], `Review the CPU boundary for the new production dependency: ${name}`);
  return `from ${JSON.stringify(imports[name])}`;
});
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
const load = url => new Promise((success, failure) => { requested.push(url); callbacks.set(url, { success, failure }); });
renderer.loader = { loadAsync: load };
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
assert.equal(requested.length, 2, 'At most two speculative images may occupy the four download slots.');
assert.equal(renderer.ready, true, 'Upcoming hidden layers cannot hold the current frame readiness gate.');
const current = Array.from({ length: 4 }, (_, index) => layer(`current-${index}`, true));
renderer.updateTextures();
assert.deepEqual(requested.slice(2), ['current-0', 'current-1']);
assert.equal(renderer.ready, false);
const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
async function complete(url, texture = new THREE.Texture({ width: 4, height: 4 }), owner = renderer) {
  callbacks.get(url).success(texture); await settle();
  if (owner.shaderFailed || owner.preparationCancelled || owner.disposed) return texture;
  const entry = owner.textures.get(url);
  assert.equal(entry.loading, true, 'Decoded resources still occupy their bounded slot before GPU preparation.');
  assert.equal(entry.texture, undefined, 'A decoded image cannot become render-ready before its actual GPU variants are prepared.');
  const uploadsBefore = owner.renderer.preparedTextures.length;
  while (owner.textureUploads.length) {
    const before = owner.renderer.preparedTextures.length;
    owner.prepareNextTexture();
    assert.equal(owner.renderer.preparedTextures.length, before + 1, 'One preparation turn uploads at most one texture variant.');
  }
  assert(owner.renderer.preparedTextures.length > uploadsBefore);
  return texture;
}

// A source-visible plane outside the camera but inside its expanded prefetch
// frustum is not part of the displayed frame until it enters the camera.
const edge = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
edge.loader = { loadAsync: load };
edge.camera.aspect = 1; edge.camera.updateProjectionMatrix(); edge.camera.updateMatrixWorld(true);
const edgeMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
edgeMesh.position.set(3.5, 0, -5); edgeMesh.updateMatrixWorld(true);
edgeMesh.userData.sourceVisible = true; edgeMesh.visible = false;
edge.objects = [{ mesh: edgeMesh, material: edgeMesh.material, url: 'edge-prefetch' }];
edge.updateTextures();
assert(edge.prefetched.has('edge-prefetch') && !edge.currentVisible.has('edge-prefetch'));
assert.equal(edge.ready, true, 'A prefetch-only plane cannot block the completed current image.');
edgeMesh.position.x = 0; edgeMesh.updateMatrixWorld(true); edge.updateTextures();
assert(edge.currentVisible.has('edge-prefetch'));
assert.equal(edge.ready, false, 'A plane entering the camera must still gate the next frame until uploaded.');
assert.equal(edgeMesh.visible, false, 'An unready plane must not be drawn.');
assert.equal(requested.filter(url => url === 'edge-prefetch').length, 1, 'Promoting a prefetch must reuse its in-flight request.');
await complete('edge-prefetch', undefined, edge);
assert.equal(edge.ready, true); assert.equal(edgeMesh.visible, true);
edge.dispose();
checks.push({ test: 'expanded-frustum-is-speculative-until-actual-camera-entry-then-gates-complete-frame', passed: true });

const futureView = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
futureView.loader = { loadAsync: load };
futureView.width = 640; futureView.height = 360;
const cameraSample = (progress, x) => ({ progress, position: [x, 0, 0], quaternion: [0, 0, 0, 1], fov: 45 });
futureView.manifest = { sourceRevision: 'peony-2.0-2026-10-23', frameRange: [1, 301], fps: 30, fpsBase: 1,
  cameras: [cameraSample(0, 0), cameraSample(1, 100)], render: { width: 1920, height: 1080, pixelAspectX: 1, pixelAspectY: 1 } };
futureView.progress = .3; futureView.sourceProgress = .3;
futureView.camera.position.x = 30; futureView.camera.aspect = 16 / 9;
futureView.camera.updateProjectionMatrix(); futureView.camera.updateMatrixWorld(true);
const distantLayer = (url, x) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(x, 0, -5); mesh.updateMatrixWorld(true); mesh.visible = false; mesh.userData.sourceVisible = true;
  return { mesh, material: mesh.material, url };
};
const nextLayer = distantLayer('forecast-camera', 50), futureShadow = distantLayer('forecast-shadow', 100), reverseLayer = distantLayer('reverse-camera', 10);
futureView.objects = [nextLayer, futureShadow, reverseLayer];
const fitted = [];
futureView.sourceLighting = { requiredShadowCasters(scene, camera) {
  fitted.push(camera.position.x);
  return new Set(camera.position.x >= 40 ? [futureShadow.mesh] : []);
}, dispose() {} };
futureView.updateTextures();
assert.deepEqual(fitted, [50, 40, 30], 'Prediction must restore the real camera shadow fit after both speculative fits.');
assert(futureView.prefetched.has('forecast-camera') && futureView.prefetched.has('forecast-shadow'));
assert(!futureView.currentVisible.has('forecast-camera') && !futureView.currentVisible.has('forecast-shadow'));
assert.equal(futureView.ready, true); assert.equal(nextLayer.mesh.visible, false);
const competitors = Array.from({ length: 15 }, (_, index) => distantLayer(`forecast-budget-${index}`, 50));
futureView.objects.push(...competitors); futureView.updateTextures();
assert(futureView.prefetched.has('forecast-shadow'), 'A soon-required offscreen caster wins priority over farther-future planes.');
futureView.objects.splice(-competitors.length);
futureView.travelDirection = -1; futureView.updateTextures();
assert(futureView.prefetched.has('reverse-camera'), 'Direction reversal must replace the predicted look-ahead.');
assert(!futureView.prefetched.has('forecast-camera') && !futureView.prefetched.has('forecast-shadow'));
assert.equal(fitted.at(-1), 30, 'Actual shadow projection remains fitted to the displayed camera.');
futureView.objects.push(...Array.from({ length: 15 }, (_, index) => distantLayer(`reverse-budget-${index}`, 10)));
futureView.updateTextures();
assert.equal(futureView.prefetched.size, 12, 'The 720p future-camera reserve remains bounded even with many candidates.');
futureView.textures.set('reverse-camera', { texture: new THREE.Texture(), bytes: 60 * 1024 * 1024, lastSeen: performance.now(), loading: false });
futureView.updateTextures();
assert.equal(futureView.prefetched.size, 1, 'Decoded resource bytes count toward the future-camera budget.');
futureView.dispose();
const nextChapter = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
assert.equal(nextChapter.futurePredictionAt, -1, 'A newly mounted chapter starts without the previous prediction.');
assert.equal(nextChapter.futureSoonShadowCasters.size, 0); assert.equal(nextChapter.futureShadowCasters.size, 0);
nextChapter.dispose();
checks.push({ test: 'near-shadow-priority-stays-bounded-and-resets-on-reverse-and-chapter-remount', passed: true });

for (const object of current) await complete(object.url);
assert.equal(renderer.ready, true);
assert.equal(requested.filter(url => url.startsWith('future-')).length, 2);
assert(future.every(object => !object.mesh.visible), 'Prefetch must preserve the source hidden state.');
await complete('future-a');
assert.equal(renderer.ready, true, 'An unfinished speculative image must not turn off current readiness.');
callbacks.get('future-b').failure(new Error('Speculative source image unavailable')); await settle();
assert.equal(statuses.at(-1), null, 'A speculative failure must not report missing current artwork.');
checks.push({ test: 'visible-resource-priority-two-speculative-slots-readiness-source-visibility-and-failure', requested: [...requested], passed: true });
// Fail a shader while four visible textures are in flight and a fifth is
// queued. Their late completions must leave the failure and recovery intact.
for (let index = 0; index < 5; index++) layer(`shader-late-${index}`, true);
renderer.updateTextures();
assert(callbacks.has('shader-late-0') && callbacks.has('shader-late-3'));
assert(!callbacks.has('shader-late-4'));
renderer.firstFrameReady = true;
renderer.renderer.debug.onShaderError({ getProgramInfoLog: () => 'Intentional shader failure', getShaderInfoLog: () => '' }, {}, {}, {});
assert.equal(renderer.ready, false); assert.equal(preparation.at(-1).stage, 'error');
assert.equal(renderer.firstFrameReady, false);
const shaderErrorStatus = statuses.at(-1), shaderErrorPreparation = preparation.at(-1), startedBeforeFailure = requested.length;
await complete('shader-late-0');
callbacks.get('shader-late-1').failure(new Error('Late source image unavailable')); await settle();
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

// Real source fields and compositor plates use the same bounded queue, with
// different decoding providers. They must gate readiness just like the image,
// preserve linear float data and wait for every field before showing a mesh.
const native = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
native.loader = { loadAsync: load };
native.camera.aspect = 1; native.camera.updateProjectionMatrix(); native.camera.updateMatrixWorld(true);
const geometry = new THREE.PlaneGeometry(1, 1), material = new THREE.MeshBasicMaterial();
const mesh = new THREE.Mesh(geometry, material);
mesh.position.z = -5; mesh.updateMatrixWorld(true); mesh.userData.sourceVisible = true; mesh.visible = false;
const assigned = new Map(), providers = [];
let upcomingPost = [];
const fieldUrls = ['native-field-a', 'native-field-b', 'native-field-c'];
native.sourceFieldUrls = new Set(fieldUrls);
native.sourceMaterials = { loadTexture(url, signal) { assert(signal instanceof AbortSignal); providers.push(['material', url]); return load(url); }, dispose() {} };
native.sourcePost = {
  requiredUrls: () => ['native-glare'], prefetchUrls: () => upcomingPost, hasUrl: url => url.startsWith('native-glare'),
  getDiagnostics: () => null,
  loadTexture(url, signal) { assert(signal instanceof AbortSignal); providers.push(['post', url]); return load(url); },
  assign(url, texture) { assigned.set(url, texture); }, dispose() {},
};
native.objects = [{ mesh, material, url: 'native-image', fields: [...fieldUrls, fieldUrls[0]].map(url => ({ url, assign: texture => assigned.set(url, texture) })) }];
const nativeStart = requested.length;
native.updateTextures();
assert.deepEqual(requested.slice(nativeStart), ['native-image', ...fieldUrls]);
assert.equal(native.ready, false); assert.equal(mesh.visible, false);
assert.equal(native.queue.length, 1, 'The fifth resource must wait for one of the four shared slots.');
const image = await complete('native-image', undefined, native);
assert.equal(image.colorSpace, THREE.SRGBColorSpace);
assert.equal(requested.at(-1), 'native-glare');
assert.equal(native.ready, false); assert.equal(mesh.visible, false);
for (const url of fieldUrls) {
  const field = new THREE.DataTexture(new Uint16Array(2 * 2 * 4), 2, 2, THREE.RGBAFormat, THREE.HalfFloatType);
  await complete(url, field, native);
  assert.equal(field.colorSpace, THREE.NoColorSpace, 'A native half-float field must remain linear data.');
  assert.equal(field.generateMipmaps, false, 'Field decoding controls its sampling, not the ordinary-image loader.');
  assert.equal(native.textures.get(url).bytes, 32, 'Field residency must use the actual half-float byte count.');
  assert.equal(assigned.get(url), field);
  assert.equal(mesh.visible, url === fieldUrls.at(-1));
}
assert.equal(native.ready, false, 'A required compositor plate must hold the current-frame gate.');
const plate = await complete('native-glare', new THREE.DataTexture(new Uint16Array(16), 2, 2, THREE.RGBAFormat, THREE.HalfFloatType), native);
assert.equal(assigned.get('native-glare'), plate); assert.equal(native.ready, true);
assert.deepEqual(providers, [...fieldUrls.map(url => ['material', url]), ['post', 'native-glare']]);
assert.equal(requested.filter(url => url === fieldUrls[0]).length, 1, 'Repeated field bindings share a single request.');
upcomingPost = ['native-glare-future-a', 'native-glare-future-b'];
native.updateTextures();
assert.deepEqual(requested.slice(-2), upcomingPost, 'Compositor look-ahead may use two speculative slots.');
assert.equal(native.ready, true, 'Upcoming compositor frames cannot block the authored current frame.');
callbacks.get(upcomingPost[0]).failure(new Error('Speculative compositor frame unavailable')); await settle();
assert.equal(native.ready, true);
await complete(upcomingPost[1], new THREE.DataTexture(new Uint16Array(16), 2, 2, THREE.RGBAFormat, THREE.HalfFloatType), native);
assert.equal(native.ready, true);
native.dispose();
checks.push({ test: 'native-fields-and-compositor-share-four-slots-linear-decoding-and-current-readiness', requested: requested.slice(nativeStart), decodedProviders: providers, passed: true });

const { decodeTextureImage } = await import(texturePreparationUrl);
let releaseDecode, disposed = 0;
const decoded = new THREE.Texture({ width: 4, height: 4, decode: () => new Promise(resolve => { releaseDecode = resolve; }) });
decoded.addEventListener('dispose', () => disposed++);
let decodeResolved = false;
const decoding = decodeTextureImage(decoded).then(() => { decodeResolved = true; });
await settle(); assert.equal(decodeResolved, false);
releaseDecode(); await decoding; assert.equal(disposed, 0);
const invalid = new THREE.Texture({ decode: async () => { throw new Error('Intentional decode failure'); } });
invalid.addEventListener('dispose', () => disposed++);
await assert.rejects(decodeTextureImage(invalid), /Intentional decode failure/);
const controller = new AbortController(); controller.abort();
const aborted = new THREE.Texture({ width: 4, height: 4 });
aborted.addEventListener('dispose', () => disposed++);
await assert.rejects(decodeTextureImage(aborted, controller.signal), error => error.name === 'AbortError');
assert.equal(disposed, 2);
checks.push({ test: 'real-image-decode-boundary-awaits-completion-and-disposes-errors-or-owner-abort', passed: true });

const variants = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
const baseTexture = new THREE.Texture({ width: 4, height: 4 }), nodeSampler = baseTexture.clone();
nodeSampler.wrapS = THREE.RepeatWrapping;
const variantEntry = { loading: true, bytes: 64, lastSeen: performance.now() };
variants.textures.set('variant-image', variantEntry);
const variantMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
variantMesh.userData.sourceVisible = false;
variants.objects = [{ mesh: variantMesh, material: variantMesh.material, fields: [{ url: 'variant-image', prepare: () => nodeSampler, assign() {} }] }];
variants.textureUploads.push({ url: 'variant-image', texture: baseTexture, entry: variantEntry, variants: [baseTexture, nodeSampler], imageMaxEdge: 1024, bytes: 64 });
variants.prepareNextTexture();
assert.equal(variants.renderer.preparedTextures.length, 1);
assert.equal(variantEntry.loading, true); assert.equal(variantEntry.texture, undefined);
assert.deepEqual(variants.textureUploads[0].variants, [nodeSampler]);
variants.contextLost = true;
variants.onContextRestored();
assert.deepEqual(variants.textureUploads[0].variants, [baseTexture, nodeSampler], 'A completed upload prefix belongs to the lost GPU and must be prepared again.');
variants.prepareNextTexture();
assert.equal(variantEntry.loading, true); assert.equal(variantEntry.texture, undefined);
variants.prepareNextTexture();
assert.deepEqual(variants.renderer.preparedTextures, [baseTexture, baseTexture, nodeSampler]);
assert.equal(variantEntry.texture, baseTexture); assert.equal(variantEntry.loading, false);
assert.equal(nodeSampler.wrapS, THREE.RepeatWrapping, 'GPU preparation retains the actual authored node sampler state.');
variants.dispose(); nodeSampler.dispose();
checks.push({ test: 'actual-sampler-variants-prepare-one-per-turn-before-shared-resource-readiness', passed: true });
checks.push({ test: 'context-restoration-restarts-every-pending-sampler-variant-including-pre-loss-completed-prefix', passed: true });

const shared = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
const sharedBase = new THREE.Texture({ width: 4, height: 4 });
const identical = Array.from({ length: 40 }, () => sharedBase.clone());
const differentWrap = sharedBase.clone(); differentWrap.wrapS = THREE.RepeatWrapping;
const differentColor = sharedBase.clone(); differentColor.colorSpace = THREE.SRGBColorSpace;
const otherStates = [
  ['wrapT', THREE.RepeatWrapping], ['wrapR', THREE.RepeatWrapping], ['magFilter', THREE.NearestFilter],
  ['minFilter', THREE.NearestFilter], ['anisotropy', 2], ['internalFormat', 'RGBA8'], ['format', THREE.RGBFormat],
  ['type', THREE.FloatType], ['generateMipmaps', false], ['premultiplyAlpha', true], ['flipY', false], ['unpackAlignment', 8],
].map(([key, value]) => { const texture = sharedBase.clone(); texture[key] = value; return texture; });
const differentSource = new THREE.Texture(sharedBase.image);
const sharedEntry = { loading: true, bytes: 64, lastSeen: performance.now() };
shared.textures.set('shared-image', sharedEntry);
shared.textureUploads.push({ url: 'shared-image', texture: sharedBase, entry: sharedEntry,
  variants: [sharedBase, ...identical, differentWrap, differentColor, ...otherStates, differentSource], imageMaxEdge: 1024, bytes: 64 });
shared.prepareNextTexture();
assert.equal(shared.renderer.preparedTextures.length, 32, 'A single turn is bounded to 32 identical sampler registrations.');
assert.equal(sharedEntry.texture, undefined, 'The resource remains gated until every sampler group has been prepared.');
shared.prepareNextTexture();
assert.equal(shared.renderer.preparedTextures.length, 41, 'The remaining identical-source, identical-state clones share the next turn.');
assert.equal(sharedEntry.texture, undefined);
shared.prepareNextTexture();
assert.equal(shared.renderer.preparedTextures.length, 42, 'A different wrap mode gets a separate GPU-upload turn.');
assert.equal(sharedEntry.texture, undefined);
shared.prepareNextTexture();
assert.equal(shared.renderer.preparedTextures.length, 43, 'A different color space gets a separate GPU-upload turn.');
assert.equal(sharedEntry.texture, undefined);
for (const [index] of [...otherStates, differentSource].entries()) {
  shared.prepareNextTexture();
  assert.equal(shared.renderer.preparedTextures.length, 44 + index, 'Different cache keys and sources require separate turns.');
}
assert.equal(sharedEntry.texture, sharedBase); assert.equal(sharedEntry.loading, false);
shared.dispose(); for (const texture of [...identical, differentWrap, differentColor, ...otherStates, differentSource]) texture.dispose();
checks.push({ test: 'identical-sampler-registrations-batch-to-32-distinct-states-remain-separate-and-gated', passed: true });

const cancelled = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
cancelled.textureUploads.push({ url: 'cancelled-image', texture: decoded, entry: { loading: true, bytes: 64, lastSeen: performance.now() }, variants: [decoded], imageMaxEdge: 1024, bytes: 64 });
cancelled.cancelPreparation();
assert.equal(cancelled.textureUploads.length, 0);
cancelled.frame = 0; cancelled.requestFrame(); assert.equal(cancelled.frame, 0);
assert.equal(cancelled.renderer.preparedTextures.length, 0);
cancelled.dispose();
checks.push({ test: 'owner-return-discards-unprepared-textures-without-gpu-upload-or-raf', passed: true });

// The look-behind budget follows the selected quality tier; exercise every
// tier explicitly instead of assuming the pre-quality-settings 96 MiB default.
for (const [quality, imageBudget] of [['720p', 32], ['1080p', 64], ['2k', 96]]) {
  const recent = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
  recent.renderQuality = quality;
  recent.sourcePost = { requiredUrls: () => ['required'], prefetchUrls: () => [], hasUrl: url => url.startsWith('post-'), getDiagnostics: () => null, assign() {}, dispose() {} };
  const mb = 1024 * 1024, now = performance.now();
  recent.textures.set('required', { texture: new THREE.Texture(), loading: false, bytes: 240 * mb, lastSeen: now });
  for (let index = 0; index < 10; index++) recent.textures.set(`image-${index}`, { texture: new THREE.Texture(), loading: false, bytes: 32 * mb, lastSeen: now - index });
  for (let index = 0; index < 10; index++) recent.textures.set(`post-${index}`, { texture: new THREE.Texture(), loading: false, bytes: 12 * mb, lastSeen: now - index });
  // Exercise an eviction turn explicitly rather than depending on process uptime.
  recent.lastTextureEviction = -Infinity;
  recent.updateTextures();
  assert(recent.textures.has('required'), 'The soft cache budget never evicts unavoidable current source artwork.');
  assert.equal([...recent.textures].filter(([url]) => url.startsWith('image-')).reduce((sum, [, entry]) => sum + entry.bytes, 0), imageBudget * mb, `${quality} image look-behind budget`);
  assert.equal([...recent.textures].filter(([url]) => url.startsWith('post-')).reduce((sum, [, entry]) => sum + entry.bytes, 0), 24 * mb);
  for (const [url, entry] of recent.textures) if (url !== 'required') entry.lastSeen = now - 6000;
  recent.lastTextureEviction = -Infinity;
  recent.updateTextures();
  assert.deepEqual([...recent.textures.keys()], ['required'], 'The additional look-behind allowance expires instead of growing without bound.');
  recent.dispose();
  checks.push({ test: `recent-cache-${quality}-bounded-to-${imageBudget}mib-images-24mib-post-and-expires-without-evicting-current`, passed: true });
}

const shadowGate = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
const offscreenShadow = layer('shadow-only-image', true);
offscreenShadow.mesh.position.x = 100; offscreenShadow.mesh.updateMatrixWorld(true);
shadowGate.objects = [offscreenShadow];
shadowGate.sourceLighting = { requiredShadowCasters: () => new Set([offscreenShadow.mesh]), dispose() {} };
shadowGate.loader = { loadAsync: () => new Promise(() => {}) };
shadowGate.camera.updateMatrixWorld(true);
shadowGate.updateTextures();
assert(shadowGate.currentVisible.has('shadow-only-image'), 'A shadow-only alpha image must enter the hard readiness gate.');
assert.equal(shadowGate.ready, false);
const shadowImage = new THREE.Texture();
shadowGate.textures.set('shadow-only-image', { texture: shadowImage, loading: false, bytes: 64, lastSeen: performance.now() - 20000 });
shadowGate.assignTexture('shadow-only-image', shadowImage); shadowGate.lastTextureEviction = -Infinity;
shadowGate.updateTextures();
assert.equal(shadowGate.ready, true); assert(shadowGate.textures.has('shadow-only-image'), 'A required offscreen caster texture cannot be evicted.');
shadowGate.dispose();
checks.push({ test: 'offscreen-shadow-alpha-textures-block-incomplete-frames-and-remain-pinned', passed: true });

const presentationEvents = [];
const presented = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {}, undefined, undefined, undefined,
  blocked => presentationEvents.push(blocked ? 'blocked' : 'resumed'));
let presentationDraws = 0;
Object.assign(presented.renderer, { setScissorTest() {}, setScissor() {}, clear() {}, render() { presentationDraws++; presentationEvents.push('draw'); } });
presented.calligraphy = { render() {}, dispose() {} };
presented.manifest = { id: 'chapter-1', sourceRevision: 'peony-2.0-2026-10-23', frameRange: [1, 101], cameras: [] };
presented.loaded = true; presented.preparationActive = false; presented.width = 640; presented.height = 360;
presented.updateCamera = () => {}; presented.updateTextures = () => {}; presented.ready = true; presented.sourceProgress = .1;
assert.equal(presented.playbackBlocked, true); assert.equal(presented.renderedSourceFrame, null);
presented.render(10);
assert.equal(presentationDraws, 1); assert.equal(presented.renderedSourceFrame, 11); assert.equal(presented.playbackBlocked, false);
assert.deepEqual(presentationEvents, ['blocked', 'draw', 'resumed'], 'The clock resumes only after drawing a complete frame.');
presented.ready = false; presented.sourceProgress = .2; presented.dirty = true; presented.render(50);
assert.equal(presentationDraws, 1); assert.equal(presented.renderedSourceFrame, 11, 'A held image retains its actual source frame.');
assert.equal(presented.playbackBlocked, true);
presented.ready = true;
assert.equal(presented.playbackBlocked, true, 'Resource arrival alone cannot resume the clock.');
presented.dirty = true; presented.render(90);
assert.equal(presentationDraws, 2); assert.equal(presented.renderedSourceFrame, 21); assert.equal(presented.playbackBlocked, false);
presented.onContextLost({ preventDefault() {} });
assert.equal(presented.playbackBlocked, true);
presented.onContextRestored();
assert.equal(presented.playbackBlocked, true, 'GPU restoration must wait for the first complete redraw.');
presented.render(130);
assert.equal(presentationDraws, 3); assert.equal(presented.playbackBlocked, false);
assert.equal(presented.renderer.domElement.dataset.renderedSourceFrame, '21');
assert.equal(presented.renderer.domElement.dataset.playbackBlocked, 'false');
presented.dispose(); assert.equal(presented.playbackBlocked, true);
checks.push({ test: 'autoplay-gate-follows-draw-and-retains-presented-frame-during-streaming-and-gpu-recovery', passed: true });

for (const hadCompleteFrame of [false, true]) {
  const statuses = [], events = [];
  const failure = new SceneRenderer({ appendChild() {}, closest() { return null; } }, status => statuses.push(status),
    undefined, undefined, undefined, blocked => events.push(blocked));
  let draws = 0;
  Object.assign(failure.renderer, { setScissorTest() {}, setScissor() {}, clear() {}, render() { draws++; } });
  failure.calligraphy = { render() {}, dispose() {} };
  failure.manifest = { id: 'chapter-1', sourceRevision: 'peony-2.0-2026-10-23', frameRange: [1, 101], cameras: [] };
  failure.loaded = true; failure.preparationActive = false; failure.width = 640; failure.height = 360;
  failure.firstFrameReady = hadCompleteFrame; failure.renderedSourceFrame = hadCompleteFrame ? 11 : null;
  failure.camera.aspect = 1; failure.camera.updateProjectionMatrix(); failure.camera.updateMatrixWorld(true);
  const failedMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  failedMesh.position.z = -5; failedMesh.updateMatrixWorld(true); failedMesh.userData.sourceVisible = true; failedMesh.visible = false;
  const url = `recover-current-${hadCompleteFrame}`;
  failure.objects = [{ mesh: failedMesh, material: failedMesh.material, url }];
  failure.loader = { loadAsync: load }; failure.updateCamera = () => {}; failure.sourceProgress = .2;
  failure.updateTextures();
  callbacks.get(url).failure(new Error('Intentional current image load failure')); await settle();
  assert.equal(failure.ready, false, 'A failed required image is an incomplete frame.');
  assert.equal(failure.playbackBlockReason, 'resource-error');
  assert.equal(failure.getRecoveryState().canRetry, true);
  assert(statuses.at(-1).startsWith('部分'), 'The existing recovery UI must expose the failed resource.');
  failure.dirty = true; failure.render(100);
  assert.equal(draws, 0, 'A missing required image must not replace the last complete canvas with a partial frame.');
  assert.equal(failure.renderedSourceFrame, hadCompleteFrame ? 11 : null);
  assert.equal(failure.playbackBlockReason, 'resource-error');
  assert.equal(failure.retryFailedAssets(), true);
  await complete(url, undefined, failure);
  assert.equal(failure.ready, true);
  failure.render(150);
  assert.equal(draws, 1, 'A successful retry permits a complete redraw.');
  assert.equal(failure.playbackBlocked, false); assert.equal(failure.getRecoveryState().canRetry, false);
  failure.dispose();
}
checks.push({ test: 'required-resource-failure-keeps-complete-frame-and-explicit-retry-restores-drawing', passed: true });

// Exercise the real post-processing target allocation policy with drawing
// stubbed. Alternating material visibility must not reallocate GPU targets.
const postSource = compile(await read('src/scene/SourcePostProcessing.ts'))
  .replace(/from (['"])three\1/g, `from ${JSON.stringify(threeUrl)}`)
  .replace(/from (['"])\.\/sourceViewport\1/g, `from ${JSON.stringify(viewportUrl)}`)
  .replace(/from (['"])\.\/renderQuality\1/g, `from ${JSON.stringify(renderQualityUrl)}`);
const { SourcePostProcessing } = await import(moduleUrl(postSource));
const post = new SourcePostProcessing('', { compositor: { nodes: [] }, world: { color: [1, 1, 1], strength: 1 }, filmTransparent: false });
const postScene = new THREE.Scene(), postCamera = new THREE.PerspectiveCamera(45, 16 / 9, .1, 100);
postCamera.position.z = 5; postCamera.updateMatrixWorld(); postCamera.updateProjectionMatrix();
const postMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
postScene.add(postMesh); postScene.updateMatrixWorld(true);
const postRenderer = { autoClear: true, getPixelRatio: () => 1, getClearColor: color => color.set(0), getClearAlpha: () => 1,
  setScissorTest() {}, setClearColor() {}, setRenderTarget() {}, render() {}, setViewport() {}, clear() {}, setScissor() {} };
const postLibrary = { setImageLodBias() {}, setPeelDepths() {}, setPass() {} };
const postView = { x: 0, y: 0, width: 1280, height: 720, aspect: 16 / 9 };
const drawPost = () => post.render(postRenderer, postScene, postCamera, postLibrary, postView, 1280, 720);
const allocations = [];
for (const target of [post.color, post.accumulation, post.blended, post.depth, ...post.slices]) {
  const resize = target.setSize.bind(target);
  target.setSize = (width, height) => { allocations.push([width, height]); resize(width, height); };
}
postMesh.material.userData.sourceRenderMethod = 'BLENDED'; drawPost(); allocations.length = 0;
postMesh.visible = false; drawPost(); postMesh.visible = true; drawPost();
assert.equal(allocations.length, 0, 'Transient BLENDED visibility must not resize retained render targets.');
postMesh.material.userData.sourceRenderMethod = 'DITHERED'; drawPost(); allocations.length = 0;
postMesh.visible = false; drawPost(); postMesh.visible = true; drawPost();
assert.equal(allocations.length, 0, 'Transient DITHERED visibility must not resize retained render targets.');
post.dofEnabled = true; drawPost(); allocations.length = 0;
post.dofEnabled = false; drawPost(); post.dofEnabled = true; drawPost();
assert.equal(allocations.length, 0, 'Transient depth-of-field changes must not resize retained targets.');
post.setRenderQuality('1080p');
assert(allocations.some(([width, height]) => width === 1 && height === 1), 'A quality change releases old-sized targets.');
post.dispose(); postMesh.geometry.dispose(); postMesh.material.dispose();
checks.push({ test: 'transient-pass-visibility-retains-targets-and-quality-change-releases-them', passed: true });

const report = { status: 'pass', testedAt: new Date().toISOString(), scope: 'CPU thumbnail bounds, production streaming/failure logic and presentation feedback lifecycle with GPU stubbed. No FPS or rendered-pixel claim.', checks };
const output = path.join(root, 'reports/peony2-fidelity');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'render-performance-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, checks: checks.length }));

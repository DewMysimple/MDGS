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
const placementUrl = moduleUrl(compile(await read('src/scene/NarrativeSpace.ts')));
const viewportUrl = moduleUrl(compile(await read('src/scene/sourceViewport.ts')));
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
 debug={}; domElement={dataset:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}};
 capabilities={getMaxAnisotropy(){return 1;}}; info={render:{calls:0},memory:{geometries:0}};
 setPixelRatio(){} setClearColor(){} setViewport(){} dispose(){} forceContextLoss(){}
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
assert.equal(requested.length, 1, 'Only one speculative image may occupy the four download slots.');
assert.equal(renderer.ready, true, 'Upcoming hidden layers cannot hold the current frame readiness gate.');
const current = Array.from({ length: 4 }, (_, index) => layer(`current-${index}`, true));
renderer.updateTextures();
assert.deepEqual(requested.slice(1), ['current-0', 'current-1', 'current-2']);
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
for (const object of current) await complete(object.url);
assert.equal(renderer.ready, true);
assert.equal(requested.filter(url => url.startsWith('future')).length, 1);
assert(future.every(object => !object.mesh.visible), 'Prefetch must preserve the source hidden state.');
await complete('future-a');
assert.equal(requested.at(-1), 'future-b');
assert.equal(renderer.ready, true, 'An unfinished speculative image must not turn off current readiness.');
callbacks.get('future-b').failure(new Error('Speculative source image unavailable')); await settle();
assert.equal(statuses.at(-1), null, 'A speculative failure must not report missing current artwork.');
checks.push({ test: 'visible-resource-priority-single-speculative-slot-readiness-source-visibility-and-failure', requested: [...requested], passed: true });
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
assert.equal(requested.at(-1), upcomingPost[0]);
assert(!callbacks.has(upcomingPost[1]), 'Compositor look-ahead must respect the single speculative slot.');
assert.equal(native.ready, true, 'Upcoming compositor frames cannot block the authored current frame.');
callbacks.get(upcomingPost[0]).failure(new Error('Speculative compositor frame unavailable')); await settle();
assert.equal(requested.at(-1), upcomingPost[1]); assert.equal(native.ready, true);
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
variants.textureUploads.push({ url: 'variant-image', texture: baseTexture, entry: variantEntry, variants: [baseTexture, nodeSampler] });
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

const cancelled = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
cancelled.textureUploads.push({ url: 'cancelled-image', texture: decoded, entry: { loading: true, bytes: 64, lastSeen: performance.now() }, variants: [decoded] });
cancelled.cancelPreparation();
assert.equal(cancelled.textureUploads.length, 0);
cancelled.frame = 0; cancelled.requestFrame(); assert.equal(cancelled.frame, 0);
assert.equal(cancelled.renderer.preparedTextures.length, 0);
cancelled.dispose();
checks.push({ test: 'owner-return-discards-unprepared-textures-without-gpu-upload-or-raf', passed: true });

const recent = new SceneRenderer({ appendChild() {}, closest() { return null; } }, () => {});
recent.sourcePost = { requiredUrls: () => ['required'], prefetchUrls: () => [], hasUrl: url => url.startsWith('post-'), assign() {}, dispose() {} };
const mb = 1024 * 1024, now = performance.now();
recent.textures.set('required', { texture: new THREE.Texture(), loading: false, bytes: 240 * mb, lastSeen: now });
for (let index = 0; index < 10; index++) recent.textures.set(`image-${index}`, { texture: new THREE.Texture(), loading: false, bytes: 32 * mb, lastSeen: now - index });
for (let index = 0; index < 10; index++) recent.textures.set(`post-${index}`, { texture: new THREE.Texture(), loading: false, bytes: 12 * mb, lastSeen: now - index });
// Exercise an eviction turn explicitly rather than depending on process uptime.
recent.lastTextureEviction = -Infinity;
recent.updateTextures();
assert(recent.textures.has('required'), 'The soft cache budget never evicts unavoidable current source artwork.');
assert.equal([...recent.textures].filter(([url]) => url.startsWith('image-')).reduce((sum, [, entry]) => sum + entry.bytes, 0), 96 * mb);
assert.equal([...recent.textures].filter(([url]) => url.startsWith('post-')).reduce((sum, [, entry]) => sum + entry.bytes, 0), 24 * mb);
for (const [url, entry] of recent.textures) if (url !== 'required') entry.lastSeen = now - 6000;
recent.lastTextureEviction = -Infinity;
recent.updateTextures();
assert.deepEqual([...recent.textures.keys()], ['required'], 'The additional look-behind allowance expires instead of growing without bound.');
recent.dispose();
checks.push({ test: 'recent-cache-separately-bounded-to-96mib-images-24mib-post-and-expires-without-evicting-current', passed: true });

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
presented.ready = false; presented.sourceProgress = .2; presented.dirty = true; presented.render(20);
assert.equal(presentationDraws, 1); assert.equal(presented.renderedSourceFrame, 11, 'A held image retains its actual source frame.');
assert.equal(presented.playbackBlocked, true);
presented.ready = true;
assert.equal(presented.playbackBlocked, true, 'Resource arrival alone cannot resume the clock.');
presented.dirty = true; presented.render(30);
assert.equal(presentationDraws, 2); assert.equal(presented.renderedSourceFrame, 21); assert.equal(presented.playbackBlocked, false);
presented.onContextLost({ preventDefault() {} });
assert.equal(presented.playbackBlocked, true);
presented.onContextRestored();
assert.equal(presented.playbackBlocked, true, 'GPU restoration must wait for the first complete redraw.');
presented.render(40);
assert.equal(presentationDraws, 3); assert.equal(presented.playbackBlocked, false);
assert.equal(presented.renderer.domElement.dataset.renderedSourceFrame, '21');
assert.equal(presented.renderer.domElement.dataset.playbackBlocked, 'false');
presented.dispose(); assert.equal(presented.playbackBlocked, true);
checks.push({ test: 'autoplay-gate-follows-draw-and-retains-presented-frame-during-streaming-and-gpu-recovery', passed: true });
const report = { status: 'pass', testedAt: new Date().toISOString(), scope: 'CPU thumbnail bounds, production streaming/failure logic and presentation feedback lifecycle with GPU stubbed. No FPS or rendered-pixel claim.', checks };
const output = path.join(root, 'reports/peony2-fidelity');
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'render-performance-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, checks: checks.length }));

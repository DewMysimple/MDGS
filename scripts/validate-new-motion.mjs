/** CPU/geometry acceptance for the revised-source environment. Actual rendered
 * paint, media settings and RAF behavior still require the browser acceptance. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const threeUrl = pathToFileURL(path.join(root, 'node_modules/three/build/three.module.js')).href;
const replaceThree = text => text.replace(/from (['"])three\1/g, `from "${threeUrl}"`);
const oldProfile = dataUrl(compile(await read('src/data/motionProfiles.ts')));
const newProfile = dataUrl(compile(await read('src/data/newMotionProfiles.ts')));
const directorUrl = dataUrl(replaceThree(compile(await read('src/scene/MotionDirector.ts'))).replace(/from (['"])\.\.\/data\/motionProfiles\1/, `from "${oldProfile}"`));
const atmosphereUrl = dataUrl(replaceThree(compile(await read('src/scene/NewScrollAtmosphere.ts'))).replace(/from (['"])\.\.\/data\/newMotionProfiles\1/, `from "${newProfile}"`).replaceAll('import.meta.env.BASE_URL', '"./"'));
const sceneOptions = dataUrl(compile(await read('src/data/sceneOptions.ts')));
const prepareUrl = dataUrl(compile(await read('src/scene/prepareScene.ts')).replace(/from (['"])\.\.\/data\/sceneOptions\1/, `from "${sceneOptions}"`));
const { MotionDirector } = await import(directorUrl);
const { createNewScrollAtmosphere, newPetalSource } = await import(atmosphereUrl);
const { reviewedNewNativeMotion } = await import(newProfile);
const { prepareScene } = await import(prepareUrl);
const results = [];

const sourcePixels = await readFile(path.join(root, 'public', newPetalSource.url));
assert.equal(createHash('sha256').update(sourcePixels).digest('hex'), newPetalSource.sha256);
assert(newPetalSource.uvRect.every(value => value >= 0 && value <= 1));
results.push({ test: 'exact-reviewed-revised-source-petal-sha-and-isolated-uv-crop', passed: true });
const cameraAt = (cameras, progress, aspect) => {
  const index = cameras.findIndex(c => c.progress >= progress);
  const a = cameras[Math.max(0, index - 1)], b = cameras[Math.max(0, index)];
  const mix = index <= 0 ? 0 : (progress - a.progress) / Math.max(1e-8, b.progress - a.progress);
  const camera = new THREE.PerspectiveCamera(THREE.MathUtils.lerp(a.fov, b.fov, mix), aspect, .01, 5000);
  camera.position.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), mix);
  camera.quaternion.fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), mix);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); return camera;
};

for (let chapterId = 1; chapterId <= 4; chapterId++) {
  const source = JSON.parse(await read(`public/assets/new-scrolls/chapter-${chapterId}/scene.json`));
  const manifest = prepareScene(source, chapterId), extra = createNewScrollAtmosphere(manifest, chapterId);
  assert.equal(extra.objects.length, manifest.stops.length * 2);
  const sourceObjects = source.meshes.map(item => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(item.positions, 3));
    if (item.uvs.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(item.uvs, 2));
    if (item.indices) geometry.setIndex(item.indices);
    geometry.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ opacity: 1 });
    const mesh = new THREE.Mesh(geometry, material); mesh.name = item.name; mesh.matrix.fromArray(item.matrix); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
    return { mesh, material };
  });
  const objects = [...sourceObjects, ...extra.objects]; objects.forEach(object => { object.mesh.visible = true; });
  const baseline = new Map(objects.map(object => [object.mesh.name, object.mesh.matrix.clone()]));
  const director = new MotionDirector(chapterId, objects, manifest.stops, extra.profile);
  assert.equal(director.profile, extra.profile);
  for (const name of reviewedNewNativeMotion[chapterId]) assert(source.meshes.some(item => item.name === name), `Unresolved native motion ${name}`);
  const unsafe = ['远景 · 06_宫殿与灯笼', '远景 · 07_中央宫城云景', '08_中央牡丹纹样_01_中央牡丹双鸟飘带', '07_两盏牡丹花灯_01_两盏花灯', '04_下方灯市游行_06_下方游行市集', '09 · 01_左上宫灯市集.png · 远景', '09 · 构图补充 · 05_左下牡丹与飘带.png'];
  assert(extra.profile.bindings.every(binding => !unsafe.includes(binding.meshName)));
  const coverage = [];
  for (const aspect of [1440 / 650, 375 / 550, 620 / 250]) for (const [index, stop] of manifest.stops.entries()) {
    const camera = cameraAt(manifest.cameras, stop.progress, aspect);
    for (let frame = 0; frame < 13; frame++) director.advance(.05, stop.progress);
    director.update(camera, true, stop.progress);
    const diagnostics = director.getDiagnostics();
    assert(diagnostics.activeBindings > 0, `No environment at chapter ${chapterId}, node ${index}, aspect ${aspect}`);
    assert(diagnostics.activeBindings <= 3 && diagnostics.activeGroups.petal <= 2 && diagnostics.activeGroups.legacy <= 1);
    const movingPetals = extra.objects.filter(object => diagnostics.activeNames.includes(object.mesh.name));
    assert(movingPetals.length > 0, `No small independent petal visible at ${chapterId}/${index}`);
    assert(movingPetals.some(object => object.mesh.matrix.elements.some((value, i) => Math.abs(value - baseline.get(object.mesh.name).elements[i]) > 1e-6)));
    coverage.push({ node: stop.name, aspect, active: diagnostics.activeNames });
  }
  const bound = new Set(extra.profile.bindings.map(binding => binding.meshName));
  const unbound = sourceObjects.filter(object => !bound.has(object.mesh.name));
  assert(unbound.length > 0);
  for (const object of unbound) assert.deepEqual(object.mesh.matrix.elements, baseline.get(object.mesh.name).elements, `Static source moved: ${object.mesh.name}`);
  const endCamera = cameraAt(manifest.cameras, 1, 1440 / 650);
  const clock = director.getDiagnostics().elapsedSeconds;
  director.update(endCamera, false, 1);
  assert.equal(director.getDiagnostics().activeBindings, 0);
  assert.equal(director.getDiagnostics().elapsedSeconds, clock);
  for (const object of objects) assert.deepEqual(object.mesh.matrix.elements, baseline.get(object.mesh.name).elements);
  for (const object of extra.objects) assert.equal(object.material.opacity, 0);
  objects.forEach(object => { object.mesh.visible = false; });
  director.update(endCamera, true, 1); assert.equal(director.getDiagnostics().activeBindings, 0);
  // A completed texture must never revive a source-hidden layer through motion.
  objects.forEach(object => { object.mesh.visible = true; object.mesh.userData.sourceVisible = false; });
  director.update(endCamera, true, 1); assert.equal(director.getDiagnostics().activeBindings, 0);
  assert(objects.every(object => object.mesh.userData.sourceVisible === false));
  for (const object of extra.objects) assert.equal(object.material.opacity, 0);
  // Source Blender animation can replace the base without ambient reverting it.
  const native = sourceObjects.find(object => bound.has(object.mesh.name));
  if (native) {
    const nextSourcePose = native.mesh.matrix.clone().premultiply(new THREE.Matrix4().makeTranslation(.012, -.021, .004));
    director.setBaseMatrix(native.mesh, nextSourcePose);
    director.update(endCamera, false, 1);
    assert.deepEqual(native.mesh.matrix.elements, nextSourcePose.elements);
  }
  director.dispose();
  results.push({ test: `revised-chapter-${chapterId}-reviewed-local-motion-and-all-node-portrait-wide-coverage`, addedPetals: extra.objects.length, sourceBindings: reviewedNewNativeMotion[chapterId], staticSourceObjects: unbound.length, totalNodeAspectChecks: coverage.length, coverage, disabledRestoresSourceAndHidesAddedPetals: true, sourceVisibilityCannotBeRevived: true, sourceAnimationBasePreserved: true, passed: true });
  const geometries = new Set(objects.map(object => object.mesh.geometry)); geometries.forEach(geometry => geometry.dispose()); objects.forEach(object => object.material.dispose());
}

// Exercise the real SceneRenderer load and lifecycle methods with only its GPU,
// DOM host and unrelated lettering/placement surfaces stubbed. This checks the
// edition/profile/object integration; it is not rendered-pixel evidence.
const gpuStub = dataUrl(`export * from ${JSON.stringify(threeUrl)};
export class WebGLRenderer {
  debug = {};
  domElement = { dataset:{}, setAttribute(){}, addEventListener(){}, removeEventListener(){}, remove(){} };
  info = { render:{calls:0}, memory:{geometries:0} };
  capabilities = { getMaxAnisotropy(){return 1;} };
  setPixelRatio(){} setClearColor(){} setTransparentSort(){} setSize(){} setViewport(){} render(){} dispose(){} forceContextLoss(){}
  getContext(){return {getExtension(){return null;}};}
}`);
const surfaceStub = dataUrl(`
export class CalligraphyLayer { getMinimumReadingHeight(){return 0;} getCompactLayout(){} resize(){} render(){} load(){} dispose(){} }
export class StableLayerSorting { compare(){return 0;} updateBase(){} }
export const applyArtDirection = async()=>({replacements:0,geometryRepairs:0,edgeRepairs:0,addedLayers:0,textLayers:[]});
export const findNarrativeSpace = ()=>({});
export const narrativeSampleSize = ()=>({width:1,height:1});
export const isCompactNarrativeViewport = ()=>false;
`);
const sourceEdition = dataUrl(compile(await read('src/data/sourceEdition.ts')).replaceAll('import.meta.env.BASE_URL', '"./"'));
const imports = { three:gpuStub, './prepareScene':prepareUrl, './CalligraphyLayer':surfaceStub,
  './MotionDirector':directorUrl, '../data/motionProfiles':oldProfile, './ArtDirectionLayer':surfaceStub,
  './StableLayerSorting':surfaceStub, '../data/sourceEdition':sourceEdition,
  './NewScrollAtmosphere':atmosphereUrl, './NarrativeSpace':surfaceStub };
const rendererUrl = dataUrl(compile(await read('src/scene/SceneRenderer.ts')).replace(/from (['"])([^'"]+)\1/g, (match, quote, name) => imports[name] ? `from ${JSON.stringify(imports[name])}` : match));
const { SceneRenderer } = await import(rendererUrl);
let frameId = 0;
globalThis.devicePixelRatio = 1;
globalThis.document = { hidden:false, addEventListener(){}, removeEventListener(){} };
globalThis.window = { clearTimeout(){}, setTimeout(){return 0;} };
globalThis.requestAnimationFrame = ()=>++frameId;
globalThis.cancelAnimationFrame = ()=>{};
globalThis.matchMedia = ()=>({ matches:false, addEventListener(){}, removeEventListener(){} });
globalThis.fetch = async url=>({ ok:true, json:async()=>JSON.parse(await read(`public/${String(url).replace(/^\.\//,'')}`)) });
for (let chapterId = 1; chapterId <= 4; chapterId++) {
  const host = { appendChild(){}, closest(){return {style:{removeProperty(){},getPropertyValue(){return '';},setProperty(){}}};} };
  const renderer = new SceneRenderer(host, ()=>{});
  renderer.updateTextures = ()=>{};
  const manifest = await renderer.load(chapterId);
  const extras = renderer.objects.filter(object => object.mesh.userData.editionAtmosphere);
  assert.equal(extras.length, manifest.stops.length * 2);
  assert.equal(renderer.motionDirector.profile.chapterId, chapterId);
  assert.equal(renderer.motionDirector.profile.ambientFps, 30);
  assert.equal(renderer.getMotionState().supported, true);
  assert(renderer.motionDirector.profile.bindings.some(binding=>binding.meshName.startsWith(`N${chapterId}_WindPetal_`)));
  assert(extras.every(object=>renderer.scene.children.includes(object.mesh) && object.url.includes('/assets/new-scrolls/chapter-1/textures/76723c1dd92b9b3a.webp')));
  for (const object of renderer.objects) if (object.url) renderer.textures.set(object.url, { texture:new THREE.Texture(), loading:false,lastSeen:0,bytes:0 });
  renderer.ready = true; renderer.updateCamera(); renderer.render(100);
  assert(renderer.motionDirector.getDiagnostics().activeBindings > 0);
  const base = new Map(renderer.objects.map(object=>[object.mesh,object.mesh.matrix.clone()]));
  const restore = () => {
    assert.equal(renderer.motionDirector.getDiagnostics().activeBindings, 0);
    assert(extras.every(object=>object.material.opacity === 0));
    for(const object of renderer.objects.filter(object=>!renderer.motionDirector.profile.bindings.some(binding=>binding.meshName===object.mesh.name))) assert.deepEqual(object.mesh.matrix.elements,base.get(object.mesh).elements);
  };
  renderer.setMotionEnabled(false); restore();
  renderer.setMotionEnabled(true); renderer.render(200);
  renderer.motionMedia.matches = true; renderer.onMotionPreference(); restore();
  renderer.motionMedia.matches = false; renderer.onMotionPreference(); renderer.render(300);
  const clock = renderer.motionDirector.getDiagnostics().elapsedSeconds;
  document.hidden = true; renderer.onVisibility(); restore();
  assert.equal(renderer.motionDirector.getDiagnostics().elapsedSeconds,clock);
  document.hidden = false; renderer.onVisibility(); renderer.render(400);
  renderer.setProgress(1); renderer.updateCamera(); renderer.setMotionEnabled(false);
  assert(extras.every(object=>object.material.opacity === 0));
  renderer.updateDiagnostics();
  const diagnostics = renderer.renderer.domElement.dataset;
  assert.equal(diagnostics.editionAtmosphereActive,'0');
  assert.equal(diagnostics.editionAtmosphereOpacityMax,'0.000000');
  assert.equal(diagnostics.activeMotionNames,'[]');
  assert.equal(diagnostics.motionAmbientFps,'30');
  assert.equal(diagnostics.sourceHiddenVisibleLayers,'0');
  renderer.dispose();
  results.push({ test:`scene-renderer-chapter-${chapterId}-edition-profile-shared-objects-off-reduce-hidden-end`, addedPetals:extras.length, passed:true });
}
const report = { status: 'pass', testedAt: new Date().toISOString(), scope: 'CPU geometry, signed UV motion, source exclusion, all-node frustum coverage, disabled baseline and pending-texture visibility. Not browser/FPS/media evidence.', results };
await writeFile(path.join(root, 'reports/new-scrolls/motion-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, tests: results.length, nodeAspectChecks: results.reduce((sum, result) => sum + (result.totalNodeAspectChecks || 0), 0) }));

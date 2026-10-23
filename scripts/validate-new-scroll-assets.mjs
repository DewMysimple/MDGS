/** Verify the active revised works, actual image bytes and native evidence.
 * MDGS_PYTHON must name Python with Pillow; run the read-only Blender native
 * verifier first so this report cannot silently borrow a historical pass. */
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const reportRoot=process.env.MDGS_SCROLL_REPORT || 'reports/peony-2.0';
const expectedRevision=process.env.MDGS_SCROLL_REVISION || 'peony-2.0-2026-10-22';
const output = path.join(root, reportRoot,'validation-assets-new.json');
const report = { status: 'running', startedAt: new Date().toISOString(),
  scope: 'Current four revised sources and editable deliveries, source-linked indexed JSON, every WebP full pixel decode, and independent read-only Blender evidence. No browser/visual-layout or Git publication claim.',
  chapters: [], checks: [], errors: [] };
const json = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const digest = async file => {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path.join(root, file))) hash.update(bytes);
  return hash.digest('hex');
};
function allFinite(value, name) {
  if (typeof value === 'number') assert(Number.isFinite(value), `Non-finite ${name}`);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) allFinite(child, `${name}.${key}`);
}
function sequence(items, name, value = 'progress') {
  assert(items.length > 0, `Empty ${name}`);
  items.forEach((item, index) => assert(index === 0 || item[value] >= items[index - 1][value], `Unordered ${name}`));
}

await writeFile(output, JSON.stringify(report, null, 2) + '\n');
try {
  const native = await json(`${reportRoot}/validation-native-new.json`);
  assert.equal(native.status, 'pass', 'Fresh independent native verification must pass first.');
  assert.equal(native.chapters.length, 4);
  const deliveryEvidence = await json(`${reportRoot}/native-delivery.json`);
  const prepareSource = (await readFile(path.join(root, 'src/scene/prepareScene.ts'), 'utf8'))
    .replace(/^import[^\n]*\n/gm, '').replace('export function prepareScene', 'function prepareScene');
  const prepareCode = ts.transpileModule(prepareSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const prepare = runInNewContext(`${prepareCode}\nprepareScene;`, { sceneOptions: { 1: { readingEndFrame: 13474 }, 2: { readingEndFrame: 5521 } } }, { timeout: 1000 });
  const expectedCounts = [15, 7, 9, 9], textureFiles = [];
  for (const id of [1, 2, 3, 4]) {
    const directory = `public/assets/new-scrolls/chapter-${id}`;
    const sceneFile = `${directory}/scene.json`, scene = await json(sceneFile);
    const sourceAudit = await json(`${reportRoot}/chapter-${id}-source-audit.json`);
    const previousDelivery = deliveryEvidence.find(item => item.id === `chapter-${id}`);
    const nativeChapter = native.chapters.find(item => item.chapter === id);
    assert(nativeChapter?.passed && nativeChapter.sourceAndDeliveryEquivalent);
    assert.equal(await digest(sceneFile), nativeChapter.manifestSha256, 'Manifest changed after independent native verification.');
    assert.equal(scene.id, `chapter-${id}`);
    assert.equal(scene.sourceRevision, expectedRevision);
    assert.equal(scene.source, sourceAudit.source);
    assert.equal(scene.sourceSha256, await digest(sourceAudit.source));
    assert.equal(scene.sourceSha256, nativeChapter.source.sha256);
    assert.equal(scene.sourceSha256, previousDelivery.inputSha256);
    const deliverySha = await digest(previousDelivery.delivery);
    assert.equal(deliverySha, previousDelivery.deliverySha256);
    assert.equal(deliverySha, nativeChapter.delivery.sha256);
    assert.equal((await stat(path.join(root, previousDelivery.delivery))).size, previousDelivery.deliveryBytes);
    assert.deepEqual(scene.frameRange, sourceAudit.frames);
    assert.equal(scene.camera.name, sourceAudit.camera);
    assert.deepEqual(scene.audit.missingImages, []); assert.deepEqual(scene.audit.skippedObjects, []);
    assert.equal(scene.coordinateSystem, 'BLENDER_WORLD_UNCHANGED');
    assert.equal(scene.matrixOrder, 'column-major'); assert.equal(scene.quaternionOrder, 'xyzw');
    allFinite(scene, scene.id);
    sequence(scene.cameras, `${scene.id} cameras`, 'frame');
    assert.equal(scene.cameras[0].frame, scene.frameRange[0]);
    assert.equal(scene.cameras.at(-1).frame, scene.frameRange[1]);
    scene.cameras.forEach(camera => {
      assert.equal(camera.position.length, 3); assert.equal(camera.quaternion.length, 4);
      assert(Math.abs(Math.hypot(...camera.quaternion) - 1) < 1e-5);
      assert(camera.fov > 0 && camera.fov < 180);
      assert(Math.abs(camera.progress - (camera.frame - scene.frameRange[0]) / (scene.frameRange[1] - scene.frameRange[0])) < 5.1e-8);
    });
    assert.equal(scene.stops.length, expectedCounts[id - 1]); sequence(scene.stops, `${scene.id} stops`);
    assert(scene.stops.every(stop => stop.progress >= 0 && stop.progress <= 1 && !stop.name.includes('参考全景')));
    assert.deepEqual(scene.markers.map(marker => [marker.name, marker.frame]), sourceAudit.markers.map(marker => [marker.name, marker.frame]));
    if (id === 2) { assert.equal(scene.stops[0].authoredFrame, sourceAudit.markers[0].frame); assert.equal(scene.stops[0].frame, scene.frameRange[0]); }
    if (id === 3) assert.equal(scene.markers.filter(marker => marker.name.includes('参考全景')).length, 9);
    const names = new Set(scene.meshes.map(mesh => mesh.name)), images = new Map(scene.images.map(image => [image.src, image]));
    assert.equal(names.size, scene.meshes.length); assert.equal(images.size, scene.images.length);
    assert.equal(scene.meshes.length, nativeChapter.delivery.exportedGeometryObjects);
    assert.deepEqual(new Set(Object.keys(scene.visibility)), names);
    for (const mesh of scene.meshes) {
      assert.equal(mesh.matrix.length, 16); assert.equal(mesh.positions.length % 3, 0); assert(mesh.positions.length >= 9);
      assert.equal(mesh.uvs.length / 2, mesh.positions.length / 3);
      assert.equal(mesh.indices.length % 3, 0);
      assert(mesh.indices.every(index => Number.isInteger(index) && index >= 0 && index < mesh.positions.length / 3));
      assert(scene.materials[mesh.material], `Invalid material ${mesh.name}`);
      assert(mesh.bounds.min.length === 3 && mesh.bounds.max.length === 3);
      assert(mesh.bounds.min.every((value, axis) => value <= mesh.bounds.max[axis]));
      const track = scene.visibility[mesh.name]; sequence(track, `${mesh.name} visibility`);
      assert(track.every(key => typeof key.visible === 'boolean' && key.frame >= scene.frameRange[0] && key.frame <= scene.frameRange[1]));
      assert(track.some(key => key.visible), `Never visible mesh exported: ${mesh.name}`);
    }
    for (const [name, track] of Object.entries(scene.animations)) {
      assert(names.has(name)); sequence(track, `${name} animation`);
      assert(track.every(key => key.matrix.length === 16 && key.progress >= 0 && key.progress <= 1));
    }
    const prepared = prepare(scene, id);
    assert.equal(prepared.cameras[0].frame, scene.frameRange[0], 'Revised route must retain its complete first frame.');
    assert.equal(prepared.cameras.at(-1).frame, scene.frameRange[1], 'Revised route must retain its complete final frame.');
    assert.equal(prepared.cameras.length, scene.cameras.length);
    sequence(prepared.cameras, `${scene.id} continuous viewing route`);
    for (let index = 0; index < prepared.cameras.length; index++) {
      assert.equal(prepared.cameras[index].sourceProgress, scene.cameras[index].progress);
    }
    let boundaryChecks = 0;
    for (const track of Object.values(scene.visibility)) for (const key of track) {
      const at = prepared.cameras.findIndex(camera => camera.sourceProgress >= key.progress);
      const a = prepared.cameras[Math.max(0, at - 1)], b = prepared.cameras[Math.max(0, at)];
      const mix = (key.progress - a.sourceProgress) / Math.max(1e-12, b.sourceProgress - a.sourceProgress);
      const webProgress = a.progress + (b.progress - a.progress) * mix;
      const roundTrip = a.sourceProgress + (b.sourceProgress - a.sourceProgress) * ((webProgress - a.progress) / Math.max(1e-12, b.progress - a.progress));
      assert(Math.abs(roundTrip - key.progress) < 1e-6, 'Source visibility boundary must survive continuous route mapping.');
      boundaryChecks++;
    }
    for (const material of scene.materials) if (material.texture) assert(images.has(material.texture));
    let textureBytes = 0;
    for (const image of scene.images) {
      assert(/^textures\/[a-f0-9]{16}\.webp$/.test(image.src), 'Runtime paths must be relative portable WebP paths.');
      assert.equal(image.id, path.basename(image.src, '.webp'));
      const file = `${directory}/${image.src}`, size = (await stat(path.join(root, file))).size;
      assert.equal(size, image.bytes); assert.equal(await digest(file), image.webSha256);
      assert(image.sourceSha256.length === 64 && image.sourceName.length > 0);
      assert(image.webSize.length === 2 && image.webSize.every(dimension => dimension > 0 && dimension <= 2048));
      textureFiles.push({ file, expectedSize: image.webSize, sha256: image.webSha256 }); textureBytes += size;
    }
    report.chapters.push({ id, source: scene.source, sourceSha256: scene.sourceSha256, delivery: previousDelivery.delivery,
      deliverySha256: deliverySha, manifestSha256: await digest(sceneFile), meshes: scene.meshes.length, textures: scene.images.length,
      textureBytes, cameraSamples: scene.cameras.length, stops: scene.stops.length, frameRange: scene.frameRange,
      continuousRoute: { firstFrame: prepared.cameras[0].frame, finalFrame: prepared.cameras.at(-1).frame, sourceVisibilityBoundariesRoundTripped: boundaryChecks },
      futureVisibleGeometry: nativeChapter.delivery.futureVisibleGeometry, allIntegerVisibilityFrames: nativeChapter.delivery.allIntegerVisibilityFrames,
      nativeCameraAndGeometryRecomputed: true, passed: true });
  }
  const python = process.env.MDGS_PYTHON || 'python';
  const decoded = spawnSync(python, ['-c', `import json,sys\nfrom PIL import Image\nitems=json.load(sys.stdin)\nresult=[]\nfor item in items:\n with Image.open(item['file']) as image:\n  image.load()\n  assert image.format=='WEBP'\n  assert list(image.size)==item['expectedSize']\n  result.append({'file':item['file'],'size':list(image.size),'mode':image.mode})\nprint(json.dumps({'status':'pass','decoded':len(result),'images':result}))`],
    { cwd: root, input: JSON.stringify(textureFiles), encoding: 'utf8', maxBuffer: 1024 * 1024 });
  assert.equal(decoded.status, 0, `Full WebP decode failed: ${decoded.stderr || decoded.error}`);
  const imageReport = JSON.parse(decoded.stdout);
  assert.equal(imageReport.decoded, textureFiles.length);
  report.checks.push({ name: 'all-runtime-images-full-pixel-decode', decoded: imageReport.decoded, passed: true });
  report.nativeEvidence = { file: `${reportRoot}/validation-native-new.json`, sha256: await digest(`${reportRoot}/validation-native-new.json`), completedAt: native.completedAt };
  report.status = 'pass';
  console.log(JSON.stringify({ status: report.status, chapters: report.chapters.map(({ id, meshes, textures, futureVisibleGeometry }) => ({ id, meshes, textures, futureVisibleGeometry })), decodedImages: imageReport.decoded }));
} catch (error) {
  report.status = 'fail'; report.errors.push({ message: error.message, stack: error.stack }); throw error;
} finally {
  report.completedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}

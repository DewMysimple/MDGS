/** Validate the single, user-confirmed viewport card against native extraction.
 * node scripts/validate-viewport-restore.mjs [--recovery tmp/viewport-restore]
 * The optional Blender extraction additionally checks every triangulated vertex,
 * UV, normal and the source-compiled material graph. No blend is modified.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = path.join(root, 'public/assets/new-scrolls/chapter-1');
const json = async p => JSON.parse(await readFile(p, 'utf8'));
const scene = await json(path.join(folder, 'scene.json'));
const native = await json(path.join(folder, 'source-materials.json'));
const sourceSha = 'e459fad5ca48e209fa63555c5253c7650547036c6be247dd13cd48c1287f1402';
const imageSha = '8b4f178ca8a9504b40c83b2642350ca2a893e30da9391cf65c2f092ec0a171d0';
const name = '主体 · 03_中央花车巡游与曲水';
assert.equal(scene.sourceSha256, sourceSha);
assert.equal(native.sourceSha256, sourceSha);
const meshList = scene.meshes.filter(mesh => mesh.name === name);
assert.equal(meshList.length, 1);
const mesh = meshList[0], material = scene.materials[mesh.material];
const program = native.programs[`${mesh.material}:${name}`];
assert.equal(material.name, '08 · 03_中央花车巡游与曲水');
assert.equal(program.objectName, name);
assert.deepEqual(program.uniforms, {}, 'No manufactured entrance animation');
assert(scene.audit.neverVisibleGeometry.includes(name), 'Preserve true render-hide audit');
assert.deepEqual(scene.audit.viewportRestoredObjects.map(item => item.name), [name]);
assert.deepEqual(scene.visibility[name], [{progress:0,visible:true,frame:1}]);
const image = scene.images.find(item => item.src === material.texture);
assert.equal(image.sourceSha256, imageSha);
const bytes = await readFile(path.join(folder, image.src));
assert.equal(createHash('sha256').update(bytes).digest('hex'), image.webSha256);
assert.equal(image.lossless, true);
assert(program.fields.every(field => field.url === image.src && field.encoding === 'image'));
const argument = process.argv.indexOf('--recovery');
if (argument !== -1) {
  const patch = await json(path.resolve(root, process.argv[argument + 1], 'recovered.json'));
  assert.equal(patch.sourceSha256, sourceSha);
  assert.equal(patch.sourceImageSha256, imageSha);
  assert.deepEqual(mesh.matrix, patch.record.matrix);
  assert.deepEqual(mesh.bounds, patch.record.bounds);
  for (const [property, arity] of [['positions',3],['uvs',2],['normals',3]]) {
    const expanded = mesh.indices.flatMap(index => mesh[property].slice(index * arity, (index + 1) * arity));
    assert.deepEqual(expanded, patch.record[property], `${property} must match source geometry exactly`);
  }
  for (const field of patch.program.fields) field.url = image.src;
  assert.deepEqual(program, patch.program, 'Compiled native material must match the source graph');
}
console.log(JSON.stringify({status:'passed',sourceSha256:sourceSha,object:name,sourceImageSha256:imageSha,
  vertexCount:mesh.positions.length/3,triangles:mesh.indices.length/3,nativeExtractionCompared:argument!==-1},null,2));

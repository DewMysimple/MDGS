import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temporary = path.join(root, 'tmp', 'art-renewal');
await mkdir(temporary, { recursive: true });
const source = await readFile(path.join(root, 'src/scene/artworkProjection.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const compiledPath = path.join(temporary, 'artworkProjection.mjs');
await writeFile(compiledPath, compiled);
const { ArtworkProjector } = await import(pathToFileURL(compiledPath).href + `?test=${Date.now()}`);
const projector = new ArtworkProjector(), scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 100);
camera.position.z = 10; camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
mesh.name = 'actual-painting'; scene.add(mesh); scene.updateMatrixWorld(true);
const viewport = { x: 100, y: 0, width: 800, height: 800, aspect: 1 };
const spec = { id: 'flower', meshName: mesh.name, uv: [.75, .25] };
const point = () => projector.project(scene, camera, viewport, 1000, 800, [spec])[0];
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} vs ${expected}`);
const checks = [];
function check(name, fn) { fn(); checks.push({ name, passed: true }); }
check('UV attaches to a triangle and respects the paper letterbox', () => { const p = point(); assert(p.visible); near(p.x, .6, 'x'); near(p.y, .625, 'y'); });
check('An authored rotation moves the texture point with the artwork', () => { mesh.rotation.z = Math.PI / 2; scene.updateMatrixWorld(true); const p = point(); near(p.x, .6, 'rotated x'); near(p.y, .375, 'rotated y'); });
mesh.rotation.z = 0;
const morph = mesh.geometry.attributes.position.clone();
for (let i = 0; i < morph.count; i++) morph.setX(i, morph.getX(i) + 2);
mesh.geometry.morphAttributes.position = [morph]; mesh.updateMorphTargets(); mesh.morphTargetInfluences[0] = .5;
scene.updateMatrixWorld(true);
check('Morph pose participates in texture-point projection', () => { const p = point(); near(p.x, .8, 'morphed x'); near(p.y, .625, 'morphed y'); });
mesh.morphTargetInfluences[0] = 0;
check('Hidden authored layers do not leave active hotspots', () => { mesh.visible = false; assert(!point().visible); mesh.visible = true; });
check('Hidden ancestors suppress all attached points', () => { scene.visible = false; assert(!point().visible); scene.visible = true; });
check('Missing mesh and UV outside the actual triangles are inactive', () => {
  const p = projector.project(scene, camera, viewport, 1000, 800, [{ ...spec, meshName: 'missing' }, { ...spec, id: 'outside', uv: [4, -3] }]);
  assert(p.every(item => !item.visible));
});
check('Offscreen and behind-camera points are inactive', () => {
  mesh.position.x = 20; scene.updateMatrixWorld(true); assert(!point().visible);
  mesh.position.set(0, 0, 20); scene.updateMatrixWorld(true); assert(!point().visible);
  mesh.position.set(0, 0, 0); scene.updateMatrixWorld(true);
});
check('A portrait source gate maps into its own region after desktop resize', () => {
  const p = projector.project(scene, camera, { x: 440, y: 20, width: 1120, height: 800, aspect: 1.4 }, 2000, 840, [spec])[0];
  near(p.x, .57, 'resized x'); near(p.y, 520 / 840, 'resized y');
});
mesh.geometry.dispose(); mesh.material.dispose();
console.log(`Artwork projection: ${checks.length} checks passed (UV, author transform, morph, visibility, clipping, source gate).`);

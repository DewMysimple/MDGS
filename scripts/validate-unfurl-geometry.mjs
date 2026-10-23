/** CPU-only regression/benchmark for the physical opening sheet. No browser. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const report = { status: 'running', startedAt: new Date().toISOString(), checks: [], benchmark: null,
  scope: 'CPU-only actual paper deformation, analytic normals, stable conservative bounds, aspect-preserving full-surface crop and before/after geometry benchmark. Does not assert GPU/browser FPS.' };
let scroll;
const paper = new THREE.Texture(), wood = new THREE.Texture();
try {
  const { createPaintedScroll, getScrollPaintingCrop } = await server.ssrLoadModule('/src/scene/scrollGeometry.ts');
  scroll = createPaintedScroll({ width: 9.5, height: 3.55, paperTexture: paper, woodTexture: wood });
  const geometry = scroll.paperGeometry, positions = geometry.attributes.position, normals = geometry.attributes.normal;
  const originalUV = new Float32Array(geometry.attributes.uv.array);
  const sphere = geometry.boundingSphere, box = geometry.boundingBox;
  const front = scroll.group.getObjectByName('bending-silk-front'), back = scroll.group.getObjectByName('bending-silk-thickness');
  assert.equal(front.geometry, back.geometry); assert.equal(back.position.z, -.016);
  assert.equal(positions.count, 2415, 'Retain the authored curl sampling quality.');
  geometry.computeVertexNormals = () => { throw new Error('Per-frame normal topology walk returned.'); };
  geometry.computeBoundingSphere = () => { throw new Error('Per-frame bounding sphere walk returned.'); };
  const point = index => new THREE.Vector3().fromBufferAttribute(positions, index);
  let leastNormalAgreement = 1, largestUnitError = 0;
  const states = [];
  for (const open of [0, .12, .37, .68, .95, 1]) {
    scroll.setOpen(open);
    let low = Infinity, high = -Infinity;
    for (let index = 0; index < positions.count; index++) {
      const vertex = point(index), normal = new THREE.Vector3().fromBufferAttribute(normals, index);
      assert([...vertex, ...normal].every(Number.isFinite));
      assert(box.containsPoint(vertex)); assert(sphere.containsPoint(vertex));
      largestUnitError = Math.max(largestUnitError, Math.abs(normal.length() - 1));
      low = Math.min(low, vertex.z); high = Math.max(high, vertex.z);
    }
    assert(largestUnitError < 1e-6, 'Normals must remain finite unit vectors on the closed coils.');
    assert(Math.abs(high - low - scroll.group.userData.paperZRange) < 1e-6);
    assert.equal(geometry.boundingSphere, sphere); assert.equal(geometry.boundingBox, box);
    assert.deepEqual(geometry.attributes.uv.array, originalUV, 'Art stays attached to the winding sheet without stretching its UVs.');
    const flatHalf = scroll.group.userData.shaftSeparation / 2;
    for (const row of [2, 7, 12]) for (const column of [10, 34, 80, 126, 150]) {
      const originalX = (column / 160 - .5) * 9.5;
      if (Math.abs(Math.abs(originalX) - flatHalf) < .13) continue;
      const index = row * 161 + column;
      const dx = point(index + 1).sub(point(index - 1));
      const dy = point(index - 161).sub(point(index + 161));
      const sampledNormal = dx.cross(dy).normalize();
      const analyticNormal = new THREE.Vector3().fromBufferAttribute(normals, index);
      leastNormalAgreement = Math.min(leastNormalAgreement, sampledNormal.dot(analyticNormal));
    }
    const updates = scroll.group.userData.geometryUpdates;
    scroll.setOpen(open); assert.equal(scroll.group.userData.geometryUpdates, updates, 'A fully open waiting scroll must not rebuild geometry.');
    states.push({ open, shaftSeparation: scroll.group.userData.shaftSeparation, zRange: high - low });
  }
  assert(leastNormalAgreement > .99, 'Analytic normals must agree with finite-difference surface tangents.');
  assert(states[0].zRange > .1 && states.at(-1).shaftSeparation > states[0].shaftSeparation * 4);
  report.checks.push({ test: 'closed-coils-continuous-opening-and-shared-backface', states, largestUnitError, leastNormalAgreement, passed: true });

  const crops = [];
  for (const [width, height] of [[1536, 574], [1920, 1080], [1200, 1200], [4000, 900]]) {
    const crop = getScrollPaintingCrop(width, height, 1536, 574);
    assert(crop.x >= -1e-8 && crop.y >= -1e-8);
    assert(crop.x + crop.width <= width + 1e-8 && crop.y + crop.height <= height + 1e-8);
    assert(Math.abs(crop.width / crop.height - 1536 / 574) < 1e-10);
    assert(Math.abs(crop.width - width) < 1e-8 || Math.abs(crop.height - height) < 1e-8);
    crops.push({ source: [width, height], crop, destination: [0, 0, 1536, 574] });
  }
  assert.throws(() => getScrollPaintingCrop(0, 900, 1536, 574), RangeError);
  report.checks.push({ test: 'painting-covers-entire-silk-without-distortion-or-margin', crops, passed: true });

  // Retain the previous implementation here only as a measured CPU reference:
  // identical 160×14 topology, twin position updates, two normal/sphere walks.
  const oldFront = new THREE.PlaneGeometry(9.5, 3.55, 160, 14), oldBack = oldFront.clone();
  const original = new Float32Array(oldFront.attributes.position.array), core = 3.55 * .036;
  const previousSetOpen = value => {
    const radius = core * (2.28 - value * 1.18), flatHalf = THREE.MathUtils.lerp(core * 2.4, 9.5 / 2 - core * .22, value);
    const a = oldFront.attributes.position, b = oldBack.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const ox = original[i * 3], y = original[i * 3 + 1], side = Math.sign(ox), distance = Math.abs(ox);
      let x = ox, z = Math.sin(y / 3.55 * Math.PI) * .007 * (1 - value);
      if (distance > flatHalf) {
        const theta = (distance - flatHalf) / radius, coil = radius + theta * .0018;
        x = side * (flatHalf + Math.sin(theta) * coil); z += radius - Math.cos(theta) * coil;
      } else z += .015 * Math.pow(distance / Math.max(flatHalf, .01), 6);
      a.setXYZ(i, x, y, z + .008); b.setXYZ(i, x, y, z - .008);
    }
    a.needsUpdate = true; b.needsUpdate = true;
    oldFront.computeVertexNormals(); oldBack.computeVertexNormals();
    oldFront.computeBoundingSphere(); oldBack.computeBoundingSphere();
  };
  const bench = run => {
    for (let i = 0; i < 80; i++) run((i % 80) / 79);
    const runs = [];
    for (let pass = 0; pass < 5; pass++) {
      const start = performance.now();
      for (let i = 0; i < 240; i++) run((i % 120) / 119);
      runs.push((performance.now() - start) / 240);
    }
    return runs.sort((a, b) => a - b)[2];
  };
  const previousMs = bench(previousSetOpen), optimizedMs = bench(scroll.setOpen);
  oldFront.dispose(); oldBack.dispose();
  assert(optimizedMs < previousMs * .75, 'Deformation CPU work must improve materially rather than just retime the ceremony.');
  report.benchmark = { perFrameMedianMs: { previous: previousMs, optimized: optimizedMs }, speedup: previousMs / optimizedMs,
    runs: 5, framesPerRun: 240, vertexCount: positions.count, note: 'Same process and paper topology; CPU timings exclude WebGL upload/render and depend on host.' };
  report.status = 'pass';
} catch (error) {
  report.status = 'fail'; report.failure = { message: error.message, stack: error.stack }; throw error;
} finally {
  scroll?.dispose(); paper.dispose(); wood.dispose(); await server.close();
  report.completedAt = new Date().toISOString();
  const directory = new URL('../reports/peony-2.0/', import.meta.url); await mkdir(directory, { recursive: true });
  await writeFile(new URL('validation-unfurl-cpu.json', directory), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, benchmark: report.benchmark, checks: report.checks.length }, null, 2));
}

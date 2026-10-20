/** Inspect delivered world geometry and assets, including the failure that hid the first pilot behind paper. */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const canonicalBytes = await readFile(path.join(root, 'public/assets/reconstruction/manifest.json'));
const manifest = JSON.parse(canonicalBytes), baseline = await read('reports/blank-design/before/manifest.json');
const plan = await read('reports/blank-design/layout-plan.json');
const prepared = (await read('reports/blank-design/prepared-assets.json')).entries;
const applied = await read('reports/blank-design/applied-layers.json');
const hash = createHash('sha256').update(canonicalBytes).digest('hex');
assert.equal(applied.canonicalSha256, hash);
const reports = [], vite = await createServer({ server: { middlewareMode: true, watch: null }, logLevel: 'error' });
try {
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  for (const chapter of [1, 2, 3, 4]) {
    if (!manifest.blankDesign.appliedChapters.includes(chapter)) {
      assert.deepEqual(manifest.chapters[String(chapter)], baseline.chapters[String(chapter)], 'Unselected chapters must preserve the previous delivery.');
      continue;
    }
    const config = manifest.chapters[String(chapter)], planned = plan.chapters[String(chapter)];
    const source = prepareScene(await read(`public/assets/chapter-${chapter}/scene.json`), chapter);
    for (const key of ['replacements', 'geometryRepairs', 'edgeRepairs', 'textLayers']) assert.deepEqual(config[key], baseline.chapters[String(chapter)][key], 'This pass must not silently replace a prior source repair.');
    for (const name of planned.retireSourceMeshNames ?? []) assert(config.hiddenMeshNames.includes(name));
    for (const item of applied.layers.filter(layer => layer.chapter === chapter)) {
      const layer = config.addedLayers.find(layer => layer.id === item.id), asset = prepared[item.blankDesign.assetId];
      assert(layer && asset);
      const matrix = new THREE.Matrix4().fromArray(layer.matrix);
      assert(layer.matrix.every(Number.isFinite) && Math.abs(matrix.determinant()) > 1e-10);
      const scales = new THREE.Vector3().setFromMatrixScale(matrix);
      assert(Math.abs(scales.x / scales.y - asset.production.aspect) < .005, 'The whole padded PNG must retain its natural aspect.');
      for (const field of ['raw', 'production', 'web']) assert.equal(createHash('sha256').update(await readFile(path.join(root, asset[field].path))).digest('hex'), asset[field].sha256);
      const vertices = [[-.5, -.5, 0], [.5, -.5, 0], [.5, .5, 0], [-.5, .5, 0]].map(point => new THREE.Vector3().fromArray(point).applyMatrix4(matrix));
      const guard = item.placement.paperGuard;
      if (guard) {
        const backdrop = source.meshes.find(mesh => mesh.name === guard.backdrop);
        assert(backdrop && !source.materials[backdrop.material].texture);
        // Derive the source paper normal from its actual narrow world axis,
        // independently of the builder's camera-based clearance calculation.
        const spans = backdrop.bounds.min.map((value, axis) => backdrop.bounds.max[axis] - value);
        const axis = spans.indexOf(Math.min(...spans));
        const camera = source.cameras.reduce((best, value) => Math.abs(value.progress - layer.blankDesign.progress) < Math.abs(best.progress - layer.blankDesign.progress) ? value : best);
        const before = camera.position[axis] < backdrop.bounds.min[axis];
        const edge = before ? backdrop.bounds.min[axis] : backdrop.bounds.max[axis];
        assert(vertices.every(point => before ? point.getComponent(axis) < edge : point.getComponent(axis) > edge), 'All padded corners must be physically in front of the source paper backdrop.');
      }
      if (item.placement.support) {
        const support = applied.layers.find(other => other.id === item.placement.support.layerId);
        assert(support && support.chapter === chapter);
        assert.equal(support.placement.progress, item.placement.progress);
        assert(Math.abs(item.placement.distance / support.placement.distance - .998) < 1e-9, 'A prop must stay next to its actual supporting sheet under lateral viewing.');
      }
      reports.push({ id: layer.id, chapter, naturalAspect: true, physicalPaperClearance: !!guard, supportLayer: item.placement.support?.layerId ?? null, verifiedFiles: 3 });
    }
  }
  const output = { status: 'passed', canonicalSha256: hash, layers: reports, count: reports.length, scope: 'Actual matrices, four padded corners against the source paper, raw/production/WebP hashes, prop/support depth and preservation of earlier revisions. Actual framebuffer visibility and aesthetics require separate browser evidence.' };
  await writeFile(path.join(root, 'reports/blank-design/validation-placement.json'), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ status: output.status, count: output.count, canonicalSha256: hash }));
} finally { await vite.close(); }

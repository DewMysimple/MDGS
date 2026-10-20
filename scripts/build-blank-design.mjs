/** Add reviewed narrative connections to the frozen previous delivery, never to source scenes. */
import * as THREE from 'three';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const sha = data => createHash('sha256').update(data).digest('hex');
const basePath = 'reports/blank-design/before/manifest.json';
const baselineBytes = await readFile(path.join(root, basePath));
if (sha(baselineBytes) !== '290e865749ec5a27c48c1c6b7f3dda55bcd809e0d9610ab98d791fd5042ef115') throw new Error('Blank-design baseline changed. Preserve and review it before rebuilding.');
const manifest = JSON.parse(baselineBytes);
const plan = await read('reports/blank-design/layout-plan.json');
const packed = (await read('reports/blank-design/prepared-assets.json')).entries;
const selected = process.argv.find(value => value.startsWith('--chapters='))?.slice('--chapters='.length).split(',').map(Number) ?? plan.enabledChapters;
if (!selected?.length || selected.some(chapter => ![1, 2, 3, 4].includes(chapter))) throw new Error('Select reviewed chapter IDs.');
// The review gate covers all four chapters even when applying only the sample.
for (const file of ['audit-chapters-1-2.json', 'audit-chapters-3-4.json']) await read(`reports/blank-design/${file}`);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const applied = [];
try {
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  for (const chapter of selected) {
    const scene = prepareScene(await read(`public/assets/chapter-${chapter}/scene.json`), chapter);
    const chapterPlan = plan.chapters[String(chapter)];
    if (!chapterPlan?.reviewed) throw new Error(`Chapter ${chapter} needs a reviewed layout plan.`);
    const config = manifest.chapters[String(chapter)];
    if (chapterPlan.worldPaper) config.worldPaper = chapterPlan.worldPaper;
    config.backgroundMeshNames = [...new Set([...(config.backgroundMeshNames ?? []), ...(chapterPlan.paperBackgroundMeshNames ?? [])])];
    for (const name of chapterPlan.retireSourceMeshNames ?? []) if (!scene.meshes.some(mesh => mesh.name === name)) throw new Error(`Missing explicitly retired auxiliary: ${name}`);
    config.hiddenMeshNames = [...new Set([...(config.hiddenMeshNames ?? []), ...(chapterPlan.retireSourceMeshNames ?? [])])];
    const removed = new Set(chapterPlan.retirePriorAddedIds ?? []);
    for (const id of removed) if (!config.addedLayers.some(layer => layer.id === id)) throw new Error(`Retired derived layer not found: ${id}`);
    config.addedLayers = config.addedLayers.filter(layer => !removed.has(layer.id));
    for (const entry of chapterPlan.layers) {
      const asset = packed[entry.assetId];
      if (!asset || asset.chapter !== chapter) throw new Error(`Missing prepared asset for chapter ${chapter}: ${entry.assetId}`);
      for (const field of ['raw', 'production', 'web']) {
        if (sha(await readFile(path.join(root, asset[field].path))) !== asset[field].sha256) throw new Error(`Prepared asset changed: ${asset[field].path}`);
      }
      const gap = entry.gap ? [scene.stops[entry.gap - 1], scene.stops[entry.gap]] : undefined;
      const progress = entry.progress ?? (gap ? (gap[0].progress + gap[1].progress) / 2 : scene.stops[entry.stop - 1].progress);
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) throw new Error(`Invalid anchor: ${entry.id}`);
      let index = scene.cameras.findIndex(camera => camera.progress >= progress);
      if (index < 0) index = scene.cameras.length - 1;
      const a = scene.cameras[Math.max(0, index - 1)], b = scene.cameras[index];
      const mix = a === b ? 0 : THREE.MathUtils.clamp((progress - a.progress) / (b.progress - a.progress), 0, 1);
      const position = new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), mix);
      const quaternion = new THREE.Quaternion().fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), mix);
      const inverse = quaternion.clone().invert();
      const fov = THREE.MathUtils.lerp(a.fov, b.fov, mix), tan = Math.tan(fov * Math.PI / 360);
      const referenceAspect = scene.render.width / scene.render.height;
      const depths = scene.meshes.filter(mesh => !mesh.isText && scene.materials[mesh.material]?.texture).map(mesh => {
        const center = new THREE.Vector3().fromArray(mesh.bounds.min).add(new THREE.Vector3().fromArray(mesh.bounds.max)).multiplyScalar(.5).sub(position).applyQuaternion(inverse);
        const depth = -center.z;
        return depth > .1 && Math.abs(center.x) < depth * tan * referenceAspect * 2 && Math.abs(center.y) < depth * tan * 2 ? depth : null;
      }).filter(depth => depth !== null).sort((a, b) => a - b);
      if (!depths.length) throw new Error(`No source depth reference for ${entry.id}`);
      const requestedDistance = (entry.distance ?? depths[Math.floor(depths.length * (entry.depthQuantile ?? .6))]) * (entry.depth ?? 1.08);
      let distance = requestedDistance, paperGuard;
      if (chapterPlan.frontOfBackdrop) {
        const paper = scene.meshes.find(mesh => mesh.name === chapterPlan.frontOfBackdrop);
        if (!paper || scene.materials[paper.material]?.texture) throw new Error('The physical paper guard must name a reviewed untextured source backdrop.');
        const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
        normal[scene.travel.axis === 'X' ? 'x' : 'y'] = 0;
        normal.normalize();
        const bounds = [];
        for (const x of [paper.bounds.min[0], paper.bounds.max[0]]) for (const y of [paper.bounds.min[1], paper.bounds.max[1]]) for (const z of [paper.bounds.min[2], paper.bounds.max[2]]) bounds.push(new THREE.Vector3(x, y, z).dot(normal));
        const nearest = Math.min(...bounds), cameraProjection = position.dot(normal);
        const contentWidthPerDistance = 2 * tan * referenceAspect * entry.width;
        const contentHeightPerDistance = entry.height ? 2 * tan * entry.height : contentWidthPerDistance / asset.contentAspect;
        const halfWidth = contentWidthPerDistance * asset.paddingScaleX / 2, halfHeight = contentHeightPerDistance * asset.paddingScaleY / 2;
        const directions = [];
        for (const x of [-halfWidth, halfWidth]) for (const y of [-halfHeight, halfHeight]) directions.push(new THREE.Vector3((entry.x ?? 0) * 2 * tan * referenceAspect + x, (entry.y ?? -.25) * 2 * tan + y, -1).applyQuaternion(quaternion).dot(normal));
        const clearance = (nearest - cameraProjection) * .04;
        const maximumDistance = (nearest - cameraProjection - clearance) / Math.max(...directions);
        if (!(maximumDistance > 0)) throw new Error(`No safe physical space before the paper backdrop: ${entry.id}`);
        distance = Math.min(distance, maximumDistance);
        paperGuard = { backdrop: paper.name, requestedDistance, maximumDistance, appliedDistance: distance, clearance, policy: 'All padded plane corners remain physically before the source paper; anchor projection and natural image aspect retained.' };
      }
      let support;
      if (entry.supportLayerId) {
        const base = applied.find(layer => layer.id === entry.supportLayerId && layer.chapter === chapter);
        if (!base || Math.abs(base.placement.progress - progress) > 1e-7) throw new Error(`A prop must share its support's reviewed anchor: ${entry.id}`);
        distance = base.placement.distance * .998;
        if (paperGuard && distance > paperGuard.maximumDistance) throw new Error(`The prop support would cross the paper backdrop: ${entry.id}`);
        support = { layerId: base.id, distance: base.placement.distance, separationRatio: .002, policy: 'Keep independent cards almost coplanar so lateral viewing preserves the painted foot-to-ground contact.' };
      }
      if (paperGuard) paperGuard.appliedDistance = distance;
      const viewHeight = 2 * distance * tan, viewWidth = viewHeight * referenceAspect;
      // Sizes refer to the painted content, not the extra transparent production gutter.
      const contentWidth = entry.width * viewWidth;
      const contentHeight = entry.height ? entry.height * viewHeight : contentWidth / asset.contentAspect;
      const center = new THREE.Vector3((entry.x ?? 0) * viewWidth, (entry.y ?? -.25) * viewHeight, -distance).applyQuaternion(quaternion).add(position);
      const matrix = new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(contentWidth * asset.paddingScaleX, contentHeight * asset.paddingScaleY, 1)).toArray();
      if (!entry.narrative || !entry.role || !entry.regions?.length) throw new Error(`Missing narrative or reviewed region mapping: ${entry.id}`);
      const layer = { id: entry.id, name: entry.name, role: entry.role, narrative: entry.narrative,
        asset: asset.web.url, productionPng: asset.production.path, matrix, opacity: entry.opacity ?? 1,
        anchorFrame: THREE.MathUtils.lerp(a.frame, b.frame, mix), blankDesign: { assetId: entry.assetId, regions: entry.regions, categories: entry.categories, progress, gap: entry.gap, stop: entry.stop } };
      if (config.addedLayers.some(other => other.id === layer.id || other.name === layer.name)) throw new Error(`Duplicate added layer: ${layer.id}`);
      config.addedLayers.push(layer);
      applied.push({ chapter, ...layer, placement: { progress, distance, referenceAspect, viewWidth, viewHeight, contentWidth, contentHeight, contentAspect: asset.contentAspect, authoredAspect: contentWidth / contentHeight, paperGuard, support } });
    }
  }
  manifest.stage = 'four-scroll-designed-narrative-connections';
  manifest.blankDesign = { baseline: basePath, baselineSha256: sha(baselineBytes), appliedChapters: selected, plan: 'reports/blank-design/layout-plan.json' };
  const output = JSON.stringify(manifest, null, 2) + '\n';
  const report = { schemaVersion: 1, canonicalSha256: sha(output), appliedChapters: selected, addedLayerCount: applied.length, layers: applied, note: 'Applied world-space layers. Visual and Blender acceptance are separate gates.' };
  await mkdir(path.join(root, 'reports/blank-design'), { recursive: true });
  await writeFile(path.join(root, 'public/assets/reconstruction/manifest.json'), output);
  await writeFile(path.join(root, 'reports/blank-design/applied-layers.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ sha256: report.canonicalSha256, chapters: selected, layers: applied.length }));
} finally { await vite.close(); }

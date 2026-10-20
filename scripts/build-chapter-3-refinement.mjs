/** Rebuild the third-scroll refinement from its own frozen prior delivery. */
import * as THREE from 'three';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = 'reports/chapter-3-refinement';
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const baselineBytes = await readFile(path.join(root, folder, 'before/manifest.json'));
if (sha(baselineBytes) !== 'dec52de0566ca29fcae9a767cec8f7970bd3dc98a226ac8a6ea54ebf654d8fa8') throw new Error('The third-scroll frozen baseline changed.');
const result = JSON.parse(baselineBytes), baseline = JSON.parse(baselineBytes);
const plan = await read(`${folder}/layout-plan.json`);
if (!plan.reviewed || !await read(`${folder}/audit-visual.json`)) throw new Error('Complete the third-scroll audit before applying this plan.');
const config = result.chapters['3'];
const retired = new Set(plan.retireSourceMeshNames);
config.hiddenMeshNames = [...new Set([...config.hiddenMeshNames, ...retired])];
const raw = await read('public/assets/chapter-3/scene.json');
config.hiddenBlenderTextNames = raw.meshes.filter(mesh => mesh.isText).map(mesh => mesh.name);
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', plugins: [{ name: 'refinement-ssr-only', configResolved(config) { config.optimizeDeps.noDiscovery = true; config.optimizeDeps.include = []; config.optimizeDeps.entries = []; } }] });
const applied = { baselineSha256: sha(baselineBytes), layoutAdjustments: [], textLayers: [], assetReplacements: [] };
try {
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const source = prepareScene(raw, 3);
  const viewpoint = progress => {
    let index = source.cameras.findIndex(camera => camera.progress >= progress);
    if (index < 0) index = source.cameras.length - 1;
    const a = source.cameras[Math.max(0, index - 1)], b = source.cameras[index];
    const mix = a === b ? 0 : THREE.MathUtils.clamp((progress - a.progress) / (b.progress - a.progress), 0, 1);
    const position = new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), mix);
    const quaternion = new THREE.Quaternion().fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), mix);
    return { position, quaternion, frame: THREE.MathUtils.lerp(a.frame, b.frame, mix), tan: Math.tan(THREE.MathUtils.lerp(a.fov, b.fov, mix) * Math.PI / 360) };
  };
  const textProgress = entry => entry.kind === 'stop' ? source.stops[entry.index - 1].progress : (source.stops[entry.index - 1].progress + source.stops[entry.index].progress) / 2;
  const sceneDepth = (view, names) => {
    const inverse = view.quaternion.clone().invert();
    const depths = raw.meshes.filter(mesh => names.includes(mesh.name)).map(mesh => new THREE.Vector3().fromArray(mesh.bounds.min).add(new THREE.Vector3().fromArray(mesh.bounds.max)).multiplyScalar(.5).sub(view.position).applyQuaternion(inverse)).map(point => -point.z).filter(depth => depth > 1).sort((a, b) => a - b);
    if (!depths.length) throw new Error('Missing depth for a composition group.');
    return depths[Math.floor(depths.length / 2)];
  };
  config.layoutAdjustments = [];
  const hidden = new Set(config.hiddenMeshNames);
  for (const group of plan.compositionGroups) {
    const prefix = `SC${String(group.stop).padStart(2, '0')}_`;
    const names = raw.meshes.filter(mesh => mesh.name.startsWith(prefix) && !mesh.isText && raw.materials[mesh.material]?.texture && !hidden.has(mesh.name)).map(mesh => mesh.name);
    for (const name of group.extraMeshNames ?? []) if (!hidden.has(name) && !names.includes(name)) names.push(name);
    if (!names.length || names.some(name => !raw.meshes.some(mesh => mesh.name === name))) throw new Error(`Unknown composition group ${group.stop}`);
    const view = viewpoint(source.stops[group.stop - 1].progress);
    const distance = sceneDepth(view, names), height = 2 * distance * view.tan;
    const pivot = new THREE.Vector3((group.pivotX ?? 0) * height * plan.designAspect, (group.pivotY ?? -.46) * height, -distance).applyQuaternion(view.quaternion).add(view.position);
    const rotation = new THREE.Matrix4().makeRotationFromQuaternion(view.quaternion);
    const cameraScale = rotation.clone().multiply(new THREE.Matrix4().makeScale(group.scale, group.scale, 1)).multiply(rotation.clone().invert());
    const delta = new THREE.Matrix4().makeTranslation(...pivot.toArray()).multiply(cameraScale).multiply(new THREE.Matrix4().makeTranslation(...pivot.clone().negate().toArray()));
    const extraMove = new THREE.Vector3((group.x ?? 0) * height * plan.designAspect, (group.y ?? 0) * height, 0).applyQuaternion(view.quaternion);
    delta.premultiply(new THREE.Matrix4().makeTranslation(...extraMove.toArray()));
    const entry = { id: `c3-layout-stop-${group.stop}`, meshNames: names, worldMatrix: delta.toArray(), role: '主体叙事层', narrative: group.narrative };
    config.layoutAdjustments.push(entry);
    applied.layoutAdjustments.push({ ...entry, stop: group.stop, progress: source.stops[group.stop - 1].progress, scale: group.scale, anchorFrame: view.frame, depth: distance, policy: 'Derived carrier geometry only; original object matrices, cameras and animation retained.' });
  }
  for (const detail of plan.detailAdjustments ?? []) {
    const progress = source.stops[detail.stop - 1].progress, view = viewpoint(progress);
    const height = 2 * sceneDepth(view, detail.meshNames) * view.tan;
    const movement = new THREE.Vector3((detail.x ?? 0) * height * plan.designAspect, (detail.y ?? 0) * height, 0).applyQuaternion(view.quaternion);
    const entry = { id: detail.id, meshNames: detail.meshNames, worldMatrix: new THREE.Matrix4().makeTranslation(...movement.toArray()).toArray(), role: '中景承接层', narrative: detail.narrative };
    config.layoutAdjustments.push(entry);
    applied.layoutAdjustments.push({ ...entry, stop: detail.stop, progress, anchorFrame: view.frame, policy: 'Small derived seam registration after the shared composition transform; source matrix retained.' });
  }
  for (const adjustment of plan.addedLayerAdjustments ?? []) {
    const layer = config.addedLayers.find(layer => layer.id === adjustment.id);
    if (!layer) throw new Error(`Added layer missing: ${adjustment.id}`);
    const view = viewpoint(layer.blankDesign?.progress ?? adjustment.progress);
    const matrix = new THREE.Matrix4().fromArray(layer.matrix);
    const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    const distance = -position.clone().sub(view.position).applyQuaternion(view.quaternion.clone().invert()).z;
    const height = 2 * distance * view.tan;
    position.add(new THREE.Vector3((adjustment.x ?? 0) * height * plan.designAspect, (adjustment.y ?? 0) * height, 0).applyQuaternion(view.quaternion));
    const factor = adjustment.scale ?? 1;
    if (adjustment.pivot) position.add(new THREE.Vector3(adjustment.pivot[0] * scale.x * (1 - factor), adjustment.pivot[1] * scale.y * (1 - factor), 0).applyQuaternion(quaternion));
    scale.x *= factor; scale.y *= factor;
    layer.matrix = new THREE.Matrix4().compose(position, quaternion, scale).toArray();
  }
  config.textLayers = [];
  for (const entry of plan.textGroups) {
    const progress = textProgress(entry), view = viewpoint(progress);
    // A stable angular-size plane; DOM lettering remains independent and editable.
    const distance = entry.distance ?? 45, height = 2 * distance * view.tan;
    const position = new THREE.Vector3((entry.x - .5) * height * plan.designAspect, (.5 - entry.y) * height, -distance).applyQuaternion(view.quaternion).add(view.position);
    const worldHeight = entry.height * height, worldWidth = worldHeight * plan.typography.domWidth / plan.typography.domHeight;
    const text = { id: entry.id, name: entry.title, title: entry.title, lines: entry.lines,
      matrix: new THREE.Matrix4().compose(position, view.quaternion, new THREE.Vector3(worldWidth, worldHeight, 1)).toArray(),
      ...plan.typography, narrative: entry.narrative, range: entry.range, anchorProgress: progress, layout: 'vertical', fade: .008,
      ...(entry.seal ? { seal: entry.seal } : {}) };
    config.textLayers.push(text);
    applied.textLayers.push({ ...text, kind: entry.kind, index: entry.index, anchorFrame: view.frame });
  }
  for (const entry of plan.assetReplacements ?? []) {
    const prepared = await read(`${folder}/prepared-assets.json`), asset = prepared.entries[entry.assetId];
    if (!asset) throw new Error(`Missing refined asset ${entry.assetId}`);
    for (const field of ['raw', 'production', 'web']) if (sha(await readFile(path.join(root, asset[field].path))) !== asset[field].sha256) throw new Error(`Asset changed: ${asset[field].path}`);
    const mesh = raw.meshes.find(mesh => mesh.name === entry.meshName);
    if (!mesh) throw new Error(`Refined source object missing: ${entry.meshName}`);
    const sourceTexture = raw.materials[mesh.material].texture;
    const image = raw.images.find(image => image.src === sourceTexture);
    if (!image) throw new Error(`Refined source image missing: ${entry.meshName}`);
    const replacement = { id: `c3-refine-${entry.assetId}`, sourceTexture, sourceName: image.sourceName,
      meshNames: [entry.meshName], asset: asset.web.url, productionPng: asset.production.path,
      contentAspect: asset.contentAspect, sourceAspect: entry.sourceAspect,
      paddingScale: asset.paddingScaleY, paddingScaleX: asset.paddingScaleX, paddingScaleY: asset.paddingScaleY,
      uvInsetRect: asset.uvInsetRect, geometryPolicy: 'full-uv-affine', role: entry.role, narrative: entry.narrative, treatment: '定向补绘截口' };
    config.geometryRepairs = (config.geometryRepairs ?? []).filter(repair => !repair.meshNames.includes(entry.meshName));
    config.replacements = config.replacements.filter(repair => !repair.meshNames?.includes(entry.meshName));
    config.replacements.push(replacement); applied.assetReplacements.push(replacement);
  }
  // A retired tall background should not keep an active motion binding.
  for (const name of plan.retireSourceMeshNames) if (!raw.meshes.some(mesh => mesh.name === name)) throw new Error(`Unknown retirement ${name}`);
  for (const chapter of ['1', '2', '4']) if (JSON.stringify(result.chapters[chapter]) !== JSON.stringify(baseline.chapters[chapter])) throw new Error(`Unrelated chapter ${chapter} changed.`);
  result.stage = 'chapter-3-designed-negative-space-and-vertical-calligraphy';
  result.chapter3Refinement = { baseline: `${folder}/before/manifest.json`, baselineSha256: sha(baselineBytes), plan: `${folder}/layout-plan.json` };
  const bytes = JSON.stringify(result, null, 2) + '\n';
  applied.canonicalSha256 = sha(bytes);
  await mkdir(path.join(root, folder), { recursive: true });
  await writeFile(path.join(root, folder, 'applied-layout.json'), JSON.stringify(applied, null, 2) + '\n');
  await writeFile(path.join(root, 'public/assets/reconstruction/manifest.json'), bytes);
  console.log(JSON.stringify({ sha256: applied.canonicalSha256, groups: config.layoutAdjustments.length, captions: config.textLayers.length, repairedImages: applied.assetReplacements.length, otherChaptersUnchanged: true }));
} finally { await vite.close(); }

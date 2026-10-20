/** Build one reviewed revision from prepared assets; leave every original manifest untouched. */
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const inventory = await readJSON('reports/reconstruction/layers-inventory.json');
const prepared = (await readJSON('reports/reconstruction/prepared-assets.json')).entries;
const petalAtlas = await readJSON('reports/reconstruction/petal-atlas.json');
const source = await readJSON('public/assets/chapter-1/scene.json');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

try {
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const scene = prepareScene(source, 1);
  const textures = inventory.textures.filter(texture => texture.chapter === 1);
  const byLabel = label => textures.find(texture => texture.label === label);
  const replacements = [21, 38, 47, 85, 52, 59, 67].map(number => {
    const texture = byLabel(`C1-T${String(number).padStart(3, '0')}`);
    const asset = prepared[`c1-t${String(number).padStart(3, '0')}`];
    if (!asset) throw new Error(`Prepared replacement is missing: ${texture.label}`);
    return {
      id: asset.id, sourceTextureId: texture.id,
      sourceTexture: texture.textureUrl.replace('assets/chapter-1/', ''), sourceName: texture.sourceName,
      asset: asset.web.url, productionPng: asset.production.path,
      contentAspect: asset.contentAspect,
      sourceAspect: texture.machineEvidence.alpha.width / texture.machineEvidence.alpha.height,
      paddingScale: asset.paddingScaleY, paddingScaleX: asset.paddingScaleX, paddingScaleY: asset.paddingScaleY,
      role: number === 52 ? '后景连续层' : '主体叙事层', narrative: texture.narrativeMatch.basis,
      treatment: [21, 38, 47, 85].includes(number) ? '重生成' : '修复', geometryPolicy: 'full-uv-affine',
      sourceMeshNames: texture.meshIds.map(id => inventory.meshes.find(mesh => mesh.id === id).name),
    };
  });
  const repairWidths = {
    3: [0.07, 0.035, 0, 0.065], 20: [0.025, 0.025, 0.09, 0.04],
    50: [0.02, 0.02, 0, 0.085], 55: [0.02, 0.07, 0, 0.08],
    59: [0.035, 0.035, 0, 0.10], 65: [0.02, 0.02, 0, 0.10],
    67: [0.025, 0.025, 0, 0.085], 74: [0.025, 0.025, 0, 0.14],
    75: [0.03, 0.035, 0.08, 0.08],
  };
  const edgeRepairs = Object.entries(repairWidths).map(([number, widths]) => {
    const texture = byLabel(`C1-T${String(number).padStart(3, '0')}`);
    return { id: `${texture.id}-ink-edge`, sourceTextureId: texture.id,
      meshNames: texture.meshIds.map(id => inventory.meshes.find(mesh => mesh.id === id).name),
      fades: Object.fromEntries(['left', 'right', 'top', 'bottom'].map((edge, i) => [edge, widths[i]])),
      role: texture.type, narrative: texture.narrativeMatch.basis };
  });
  const cameraAt = progress => {
    const i = scene.cameras.findIndex(camera => camera.progress >= progress);
    const a = scene.cameras[Math.max(0, i - 1)], b = scene.cameras[Math.max(0, i)];
    const mix = a === b ? 0 : (progress - a.progress) / (b.progress - a.progress);
    return { position: new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), mix),
      quaternion: new THREE.Quaternion().fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), mix),
      fov: THREE.MathUtils.lerp(a.fov, b.fov, mix), frame: THREE.MathUtils.lerp(a.frame, b.frame, mix) };
  };
  const referenceAspect = scene.render.width / scene.render.height;
  const view = (progress, depthFactor = 1) => {
    const camera = cameraAt(progress);
    const inverse = camera.quaternion.clone().invert();
    const tan = Math.tan(camera.fov * Math.PI / 360);
    const depths = scene.meshes.filter(mesh => !mesh.isText && scene.materials[mesh.material]?.texture).map(mesh => {
      const center = new THREE.Vector3().fromArray(mesh.bounds.min).add(new THREE.Vector3().fromArray(mesh.bounds.max)).multiplyScalar(.5).sub(camera.position).applyQuaternion(inverse);
      const depth = -center.z;
      return depth > .1 && Math.abs(center.x) < depth * tan * referenceAspect * 1.4 && Math.abs(center.y) < depth * tan * 1.6 ? depth : null;
    }).filter(depth => depth !== null).sort((a, b) => a - b);
    const distance = (depths[Math.floor(depths.length * .45)] ?? 35) * depthFactor;
    const height = 2 * distance * tan;
    return { ...camera, distance, height, width: height * referenceAspect };
  };
  const planeAt = (progress, { x = 0, y = 0, width, height, depth = 1 }) => {
    const camera = view(progress, depth);
    const position = new THREE.Vector3(x * camera.width, y * camera.height, -camera.distance).applyQuaternion(camera.quaternion).add(camera.position);
    return new THREE.Matrix4().compose(position, camera.quaternion, new THREE.Vector3(width * camera.width, height * camera.height, 1)).toArray();
  };
  const addedLayers = [];
  for (let index = 0; index < scene.stops.length - 1; index++) {
    const progress = (scene.stops[index].progress + scene.stops[index + 1].progress) / 2;
    const suffix = String(index + 1).padStart(2, '0');
    const mist = prepared['ink-mist-bridge'], ridge = prepared['distant-ridge-bridge'];
    if (!mist || !ridge) throw new Error('The shared painted bridge assets have not been prepared.');
    addedLayers.push({ id: `r1-mist-${suffix}`, name: `R1_Mist_Bridge_${suffix}`, role: '连接过渡层',
      narrative: `连接“${scene.stops[index].name}”与“${scene.stops[index + 1].name}”，局部地面气口与笔墨承接`,
      asset: mist.web.url, productionPng: mist.production.path,
      matrix: planeAt(progress, { x: 0, y: -.34, width: .66, height: .18, depth: .9 }),
      opacity: .18, motionName: 'slowCloud', anchorFrame: cameraAt(progress).frame });
    addedLayers.push({ id: `r1-ridge-${suffix}`, name: `R1_Distant_Ridge_${suffix}`, role: '后景连续层',
      narrative: '淡墨远山贯通相邻分镜，避免场景块孤立，留白保持低对比',
      asset: ridge.web.url, productionPng: ridge.production.path,
      matrix: planeAt(progress, { x: 0, y: .26, width: .82, height: .21, depth: 1.22 }),
      opacity: .16, anchorFrame: cameraAt(progress).frame });
  }
  for (let index = 0; index < scene.stops.length; index++) {
    const progress = scene.stops[index].progress;
    for (let petal = 0; petal < 2; petal++) {
      const region = petalAtlas.regions[(index + petal) % petalAtlas.regions.length];
      const height = .035 + petal * .008;
      const suffix = `${String(index + 1).padStart(2, '0')}_${petal + 1}`;
      addedLayers.push({ id: `r1-petal-${suffix}`, name: `R1_Petal_${suffix}`, role: '动效层',
        narrative: '少量独立花瓣沿画心空隙低频飘落；不带动建筑、人物或群像',
        asset: petalAtlas.sourceAsset, productionPng: petalAtlas.sourceFile,
        matrix: planeAt(progress, { x: petal ? .30 : -.32, y: petal ? .13 : .26, width: height * region.aspect / referenceAspect, height, depth: .73 }),
        uvRect: region.uvRect, opacity: .46, motionName: 'fallingPetal', anchorFrame: cameraAt(progress).frame });
    }
  }
  const oldText = byLabel('C1-T092');
  const oldMesh = source.meshes.find(mesh => oldText.meshIds.includes(inventory.meshes.find(row => row.name === mesh.name && row.chapter === 1)?.id));
  if (!oldMesh) throw new Error('The original low-resolution title layer is missing.');
  const center = new THREE.Vector3().fromArray(oldMesh.bounds.min).add(new THREE.Vector3().fromArray(oldMesh.bounds.max)).multiplyScalar(.5);
  const camera = cameraAt(scene.stops[13].progress);
  const width = 6.4, height = 2.5;
  const textLayers = [{ id: 'r1-readable-title', name: 'R1_Readable_Title', title: '牡丹登高位',
    lines: ['苑囿初栽，花入神都。', '华贵与傲骨，留在一朵牡丹的记忆之中。'],
    matrix: new THREE.Matrix4().compose(center, camera.quaternion, new THREE.Vector3(width, height, 1)).toArray(),
    domWidth: 640, domHeight: 250, color: '#73533d', narrative: '以真实文字承接原低分辨率题签的文化地位主题', range: [.875, 1] }];
  const chapter = { replacements, edgeRepairs,
    backgroundMeshNames: ['长卷_连续绢本地形', '长卷_统一留白天幕'],
    hiddenMeshNames: [oldMesh.name, '07_2-山水人群.001', '14_背景01_女帝身后背景_补全.001', '14_背景02_右上与右下书页后背景_组合.001'],
    textLayers, addedLayers };
  const target = path.join(root, 'public/assets/reconstruction/manifest.json');
  const previous = await readJSON('public/assets/reconstruction/manifest.json');
  const output = { ...previous, schemaVersion: 1, stage: 'first-scroll-pilot-review', activeChapters: [1],
    invariant: 'Original scenes, images, world transforms and camera routes are preserved; this revision is applied to derived objects only.',
    chapters: { ...previous.chapters, '1': chapter } };
  await writeFile(target, JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ chapter: 1, replacements: replacements.length, edgeRepairs: edgeRepairs.length, retiredLowResolutionText: 1, textLayers: textLayers.length, addedLayers: addedLayers.length, originalAssetsModified: false }));
} finally { await vite.close(); }

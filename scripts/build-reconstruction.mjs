/** Assemble reviewed revisions without changing source scenes or the verified pilot archive. */
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJSON = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const inventory = await readJSON('reports/reconstruction/layers-inventory.json');
const prepared = (await readJSON('reports/reconstruction/prepared-assets.json')).entries;
const plan = await readJSON('reports/reconstruction/extended-layer-plan.json');
const riverLayout = await readJSON('reports/reconstruction/chapter-2-river-layout.json');
const pilotPath = 'reports/reconstruction/pilot/manifest.json';
const pilot = await readJSON(pilotPath);
const petalAtlas = await readJSON('reports/reconstruction/petal-atlas.json');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });

function replacement(texture, asset, chapter) {
  if (!asset) throw new Error(`Reviewed asset not prepared: ${texture.label}`);
  const { paddingPx: padding, production: image } = asset;
  const preserve = asset.id === 'c4-t007';
  return {
    id: asset.id, sourceTextureId: texture.id,
    sourceTexture: texture.textureUrl.replace(`assets/chapter-${chapter}/`, ''), sourceName: texture.sourceName,
    asset: asset.web.url, productionPng: asset.production.path,
    contentAspect: asset.contentAspect,
    sourceAspect: texture.machineEvidence.alpha.width / texture.machineEvidence.alpha.height,
    paddingScale: asset.paddingScaleY, paddingScaleX: asset.paddingScaleX, paddingScaleY: asset.paddingScaleY,
    uvInsetRect: [padding.left / image.width, padding.bottom / image.height, 1 - padding.right / image.width, 1 - padding.top / image.height],
    geometryPolicy: preserve ? 'preserve-region' : 'full-uv-affine',
    role: texture.type, narrative: texture.narrativeMatch.basis, treatment: texture.treatment,
    sourceMeshNames: texture.meshIds.map(id => inventory.meshes.find(mesh => mesh.id === id).name),
    ...(asset.id === 'c2-t002' ? riverLayout.replacement : {}),
  };
}

function addBridges(scene, chapter) {
  const cameraAt = progress => {
    let next = scene.cameras.findIndex(camera => camera.progress >= progress);
    if (next < 0) next = scene.cameras.length - 1;
    const a = scene.cameras[Math.max(0, next - 1)], b = scene.cameras[next];
    const mix = a === b ? 0 : THREE.MathUtils.clamp((progress - a.progress) / (b.progress - a.progress), 0, 1);
    return { position: new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), mix),
      quaternion: new THREE.Quaternion().fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), mix),
      fov: THREE.MathUtils.lerp(a.fov, b.fov, mix), frame: THREE.MathUtils.lerp(a.frame, b.frame, mix) };
  };
  const referenceAspect = scene.render.width / scene.render.height;
  const view = (progress, depthFactor) => {
    const camera = cameraAt(progress), inverse = camera.quaternion.clone().invert();
    const tan = Math.tan(camera.fov * Math.PI / 360);
    const depths = scene.meshes.filter(mesh => !mesh.isText && scene.materials[mesh.material]?.texture).map(mesh => {
      const center = new THREE.Vector3().fromArray(mesh.bounds.min).add(new THREE.Vector3().fromArray(mesh.bounds.max)).multiplyScalar(.5).sub(camera.position).applyQuaternion(inverse);
      const depth = -center.z;
      return depth > .1 && Math.abs(center.x) < depth * tan * referenceAspect * 1.4 && Math.abs(center.y) < depth * tan * 1.6 ? depth : null;
    }).filter(depth => depth !== null).sort((a, b) => a - b);
    if (!depths.length) throw new Error(`No scene depth reference near chapter ${chapter}, progress ${progress}`);
    const distance = depths[Math.floor(depths.length * .45)] * depthFactor;
    const height = 2 * distance * tan;
    return { ...camera, distance, height, width: height * referenceAspect };
  };
  const planeAt = (progress, { x = 0, y = 0, width, height, depth = 1 }) => {
    const camera = view(progress, depth);
    const position = new THREE.Vector3(x * camera.width, y * camera.height, -camera.distance).applyQuaternion(camera.quaternion).add(camera.position);
    return new THREE.Matrix4().compose(position, camera.quaternion, new THREE.Vector3(width * camera.width, height * camera.height, 1)).toArray();
  };
  const added = [], prefix = `R${chapter}`;
  const mist = prepared['ink-mist-bridge'], ridge = prepared['distant-ridge-bridge'];
  if (!mist || !ridge) throw new Error('Shared painted bridge assets are missing.');
  for (let index = 0; index < scene.stops.length - 1; index++) {
    const progress = (scene.stops[index].progress + scene.stops[index + 1].progress) / 2;
    const suffix = String(index + 1).padStart(2, '0');
    added.push({ id: `r${chapter}-mist-${suffix}`, name: `${prefix}_Mist_Bridge_${suffix}`, role: '连接过渡层',
      narrative: `连接“${scene.stops[index].name}”与“${scene.stops[index + 1].name}”，留白中的薄墨气口`,
      asset: mist.web.url, productionPng: mist.production.path,
      matrix: planeAt(progress, { x: 0, y: -.25, width: .64, height: .16, depth: .8 }),
      opacity: chapter === 4 ? .16 : .18, motionName: 'slowCloud', anchorFrame: cameraAt(progress).frame });
    added.push({ id: `r${chapter}-ridge-${suffix}`, name: `${prefix}_Distant_Ridge_${suffix}`, role: '后景连续层',
      narrative: '低对比淡墨远景承接相邻画境，保留题字与人物周围留白',
      asset: ridge.web.url, productionPng: ridge.production.path,
      matrix: planeAt(progress, { x: 0, y: .26, width: .82, height: .21, depth: 1.22 }),
      opacity: .14, anchorFrame: cameraAt(progress).frame });
  }
  for (let index = 0; index < scene.stops.length; index++) for (let petal = 0; petal < 2; petal++) {
    const progress = scene.stops[index].progress, region = petalAtlas.regions[(index + petal) % petalAtlas.regions.length];
    const height = .032 + petal * .007, suffix = `${String(index + 1).padStart(2, '0')}_${petal + 1}`;
    added.push({ id: `r${chapter}-petal-${suffix}`, name: `${prefix}_Petal_${suffix}`, role: '动效层',
      narrative: chapter === 4 ? '盛段少量独立落瓣，繁华落幕后由网页包络逐渐减疏、减速' : '不带动人物与建筑的少量独立落瓣，承接春风或吉庆氛围',
      asset: petalAtlas.sourceAsset, productionPng: petalAtlas.sourceFile,
      matrix: planeAt(progress, { x: petal ? .30 : -.32, y: petal ? .13 : .26, width: height * region.aspect / referenceAspect, height, depth: .73 }),
      uvRect: region.uvRect, opacity: chapter === 3 ? .39 : .46, motionName: 'fallingPetal', anchorFrame: cameraAt(progress).frame });
  }
  return added;
}

try {
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const chapters = { '1': pilot.chapters['1'] };
  for (const chapter of [2, 3, 4]) {
    const source = await readJSON(`public/assets/chapter-${chapter}/scene.json`);
    const scene = prepareScene(source, chapter), config = plan.chapters[String(chapter)];
    const textures = inventory.textures.filter(texture => texture.chapter === chapter);
    const wanted = new Set([
      ...textures.filter(texture => texture.treatment === '重生成').map(texture => texture.id),
      ...plan.pixelRepairs.filter(repair => repair.chapter === chapter).map(repair => repair.sourceTextureId),
    ]);
    const replacements = textures.filter(texture => wanted.has(texture.id)).map(texture => replacement(texture, prepared[texture.label.toLowerCase()], chapter));
    const edgeRepairs = [...config.edgeRepairs, ...(chapter === 2 ? riverLayout.edgeRepairs ?? [] : [])];
    for (const item of replacements.filter(item => item.geometryPolicy === 'preserve-region')) {
      const [u0, v0, u1, v1] = item.uvInsetRect;
      for (const name of item.sourceMeshNames) {
        const mesh = source.meshes.find(mesh => mesh.name === name);
        const us = mesh.uvs.filter((_, index) => index % 2 === 0), vs = mesh.uvs.filter((_, index) => index % 2 === 1);
        edgeRepairs.push({ id: `${item.id}-${name}-region-edge`, meshNames: [name], role: item.role, narrative: '保留原功能摘取，只融合真实内部边界，不将完整河景或栏架复制铺满。',
          uvRect: [u0 + Math.min(...us) * (u1 - u0), v0 + Math.min(...vs) * (v1 - v0), u0 + Math.max(...us) * (u1 - u0), v0 + Math.max(...vs) * (v1 - v0)],
          fades: { left: .035, right: .035, top: .025, bottom: .055 } });
      }
    }
    chapters[String(chapter)] = { replacements, geometryRepairs: config.geometryRepairs, edgeRepairs,
      backgroundMeshNames: config.backgroundMeshNames, hiddenMeshNames: [...config.hiddenMeshNames, ...(chapter === 2 ? riverLayout.hiddenMeshNames : [])],
      textLayers: config.textLayers, addedLayers: addBridges(scene, chapter) };
  }
  const output = { schemaVersion: 1, stage: 'four-scroll-reconstruction-review', activeChapters: [1, 2, 3, 4],
    invariant: 'Original scenes, images, world transforms and camera routes are preserved; reviewed revisions apply to derived objects only.',
    verifiedPilot: { path: pilotPath, sha256: createHash('sha256').update(await readFile(path.join(root, pilotPath))).digest('hex') }, chapters };
  await writeFile(path.join(root, 'public/assets/reconstruction/manifest.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(Object.entries(chapters).map(([chapter, config]) => ({ chapter: Number(chapter), replacements: config.replacements.length, geometryRepairs: config.geometryRepairs?.length ?? 0, edgeRepairs: config.edgeRepairs.length, hidden: config.hiddenMeshNames.length, textLayers: config.textLayers.length, added: config.addedLayers.length }))));
} finally { await vite.close(); }

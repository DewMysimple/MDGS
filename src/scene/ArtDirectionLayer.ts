import * as THREE from 'three';
import type { SceneManifest } from '../types';
import type { ArtTextLayer } from './CalligraphyLayer';

export interface ArtSceneObject {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  url?: string;
  animation?: { progress: number; matrix: number[] }[];
}

export interface ArtDirectionSummary { replacements: number; geometryRepairs: number; edgeRepairs: number; addedLayers: number; textLayers: ArtTextLayer[] }
type Role = '主体叙事层' | '前景遮挡层' | '中景承接层' | '后景连续层' | '留白层' | '连接过渡层' | '动效层' | '装饰层';
interface Replacement {
  id: string; sourceTexture: string; sourceName: string; asset: string;
  contentAspect: number; sourceAspect: number; paddingScale: number;
  paddingScaleX?: number; paddingScaleY?: number;
  geometryPolicy?: 'full-uv-affine' | 'preserve-region' | 'explicit-corners';
  geometryCorners?: number[][];
  uvInsetRect?: [number, number, number, number];
  meshNames?: string[];
  role: Role; narrative: string;
}
interface EdgeRepair {
  id: string; meshNames: string[]; fades: { left: number; right: number; top: number; bottom: number };
  uvRect?: [number, number, number, number];
  role: Role; narrative: string;
}
interface GeometryRepair { id: string; meshNames: string[]; role: Role; narrative: string; geometryPolicy: 'full-uv-affine' }
interface AddedLayer {
  id: string; name: string; role: Role; narrative: string; asset: string;
  matrix: number[]; opacity: number; motionName?: string;
  uvRect?: [number, number, number, number];
}
interface LayoutAdjustment { id: string; meshNames: string[]; worldMatrix: number[]; role: Role; narrative: string }
interface RevisionChapter { replacements: Replacement[]; geometryRepairs?: GeometryRepair[]; edgeRepairs: EdgeRepair[]; addedLayers: AddedLayer[]; hiddenMeshNames?: string[]; backgroundMeshNames?: string[]; textLayers?: ArtTextLayer[]; layoutAdjustments?: LayoutAdjustment[] }
interface RevisionManifest { schemaVersion: number; activeChapters: number[]; chapters: Record<string, RevisionChapter> }

export function planeFromCorners(corners: number[][] | undefined): THREE.BufferGeometry {
  if (!corners || corners.length !== 4 || corners.some(corner => corner.length !== 3 || !corner.every(Number.isFinite))) throw new Error('整理后的水岸载体缺少有效四角。');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const a = new THREE.Vector3().fromArray(corners[0]), u = new THREE.Vector3().fromArray(corners[1]).sub(a), v = new THREE.Vector3().fromArray(corners[3]).sub(a);
  if (new THREE.Vector3().crossVectors(u, v).length() < 1e-8 || new THREE.Vector3().fromArray(corners[2]).distanceTo(a.clone().add(u).add(v)) > Math.max(u.length(), v.length()) * .001) throw new Error('整理后的水岸四角不是完整平行平面。');
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

function uvAxes(geometry: THREE.BufferGeometry): [number, number] {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  if (!position || !uv || position.count !== uv.count) throw new Error('修订图层缺少可对应的顶点和UV。');
  const means = [0, 0, 0, 0, 0];
  for (let i = 0; i < position.count; i++) {
    means[0] += position.getX(i); means[1] += position.getY(i); means[2] += position.getZ(i);
    means[3] += uv.getX(i); means[4] += uv.getY(i);
  }
  for (let i = 0; i < means.length; i++) means[i] /= position.count;
  const covariance = Array.from({ length: 2 }, () => [0, 0, 0]);
  const variance = [0, 0, 0, 0, 0];
  for (let i = 0; i < position.count; i++) {
    const values = [position.getX(i), position.getY(i), position.getZ(i), uv.getX(i), uv.getY(i)];
    for (let axis = 0; axis < 5; axis++) variance[axis] += (values[axis] - means[axis]) ** 2;
    for (let axis = 0; axis < 3; axis++) {
      covariance[0][axis] += (values[axis] - means[axis]) * (values[3] - means[3]);
      covariance[1][axis] += (values[axis] - means[axis]) * (values[4] - means[4]);
    }
  }
  let best: [number, number] = [0, 1], score = -1;
  for (let horizontal = 0; horizontal < 3; horizontal++) for (let vertical = 0; vertical < 3; vertical++) {
    if (horizontal === vertical) continue;
    const rank = Math.abs(covariance[0][horizontal]) / Math.sqrt(Math.max(1e-12, variance[horizontal] * variance[3]))
      + Math.abs(covariance[1][vertical]) / Math.sqrt(Math.max(1e-12, variance[vertical] * variance[4]));
    if (rank > score) { score = rank; best = [horizontal, vertical]; }
  }
  return best;
}

/** Recover the whole image plane from its authored UV mapping, including formerly cut-out regions. */
export function completeUvPlane(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const positions = source.getAttribute('position'), uv = source.getAttribute('uv');
  if (!positions || !uv || positions.count !== uv.count || positions.count < 3) throw new Error('补全图层缺少有效UV映射。');
  let meanU = 0, meanV = 0;
  const mean = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    meanU += uv.getX(i); meanV += uv.getY(i);
    mean.add(new THREE.Vector3().fromBufferAttribute(positions, i));
  }
  meanU /= positions.count; meanV /= positions.count; mean.divideScalar(positions.count);
  let uu = 0, vv = 0, uvSum = 0;
  const pu = new THREE.Vector3(), pv = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const u = uv.getX(i) - meanU, v = uv.getY(i) - meanV;
    const delta = new THREE.Vector3().fromBufferAttribute(positions, i).sub(mean);
    uu += u * u; vv += v * v; uvSum += u * v;
    pu.addScaledVector(delta, u); pv.addScaledVector(delta, v);
  }
  const determinant = uu * vv - uvSum * uvSum;
  if (Math.abs(determinant) < 1e-12) throw new Error('补全图层UV退化，无法恢复完整平面。');
  const alongU = pu.clone().multiplyScalar(vv).addScaledVector(pv, -uvSum).divideScalar(determinant);
  const alongV = pv.clone().multiplyScalar(uu).addScaledVector(pu, -uvSum).divideScalar(determinant);
  const at = (u: number, v: number) => mean.clone().addScaledVector(alongU, u - meanU).addScaledVector(alongV, v - meanV);
  const span = Math.max(alongU.length(), alongV.length());
  const normal = new THREE.Vector3().crossVectors(alongU, alongV).normalize();
  let maxInPlaneResidual = 0, maxNormalResidual = 0;
  for (let i = 0; i < positions.count; i++) {
    const residual = at(uv.getX(i), uv.getY(i)).sub(new THREE.Vector3().fromBufferAttribute(positions, i));
    const normalDistance = residual.dot(normal);
    maxNormalResidual = Math.max(maxNormalResidual, Math.abs(normalDistance));
    maxInPlaneResidual = Math.max(maxInPlaneResidual, residual.addScaledVector(normal, -normalDistance).length());
  }
  // Source image carriers have slight normal relief; this local repair deliberately flattens it.
  if (maxInPlaneResidual > span * .001 + 1e-6 || maxNormalResidual > span * .02 + 1e-6) throw new Error('补全图层UV不匹配或曲面起伏过大，需要人工整理。');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([[0, 0], [1, 0], [1, 1], [0, 1]].flatMap(([u, v]) => at(u, v).toArray()), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.userData.uvReconstruction = { maxInPlaneResidual, maxNormalResidual, span, policy: 'full-uv-affine-with-bounded-normal-relief' };
  geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}

/** Add a transparent production gutter without shrinking or distorting the painted subject. */
export function expandForReplacement(geometry: THREE.BufferGeometry, replacement: Pick<Replacement, 'paddingScale' | 'contentAspect' | 'sourceAspect' | 'paddingScaleX' | 'paddingScaleY'>) {
  const [horizontal, vertical] = uvAxes(geometry);
  geometry.computeBoundingBox();
  const center = geometry.boundingBox!.getCenter(new THREE.Vector3()).toArray();
  const position = geometry.getAttribute('position');
  const scale = [1, 1, 1];
  scale[horizontal] = (replacement.paddingScaleX ?? replacement.paddingScale) * replacement.contentAspect / replacement.sourceAspect;
  scale[vertical] = replacement.paddingScaleY ?? replacement.paddingScale;
  for (let i = 0; i < position.count; i++) {
    const values = [position.getX(i), position.getY(i), position.getZ(i)];
    for (let axis = 0; axis < 3; axis++) values[axis] = center[axis] + (values[axis] - center[axis]) * scale[axis];
    position.setXYZ(i, values[0], values[1], values[2]);
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { horizontal, vertical, scale };
}

/** Target only the audited UV boundary; preserve the painted interior and real architectural edges. */
export function applyInkEdge(material: THREE.MeshBasicMaterial, fades: EdgeRepair['fades'], uvRect: [number, number, number, number] = [0, 0, 1, 1]) {
  const widths = new THREE.Vector4(fades.left, fades.right, fades.top, fades.bottom);
  const domain = new THREE.Vector4(...uvRect);
  material.transparent = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.artEdgeWidths = { value: widths };
    shader.uniforms.artEdgeDomain = { value: domain };
    shader.vertexShader = 'varying vec2 vArtUv;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvArtUv = uv;');
    shader.fragmentShader = `varying vec2 vArtUv;
uniform vec4 artEdgeWidths;
uniform vec4 artEdgeDomain;
float artEdge(float coordinate, float width, float grain) {
  return width > 0.00001 ? smoothstep(0.0, width, coordinate + grain * min(width * 0.16, 0.008)) : 1.0;
}
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
vec2 artUv = (vArtUv - artEdgeDomain.xy) / max(artEdgeDomain.zw - artEdgeDomain.xy, vec2(0.000001));
float artGrain = sin(artUv.x * 137.0 + sin(artUv.y * 71.0)) * sin(artUv.y * 113.0);
diffuseColor.a *= artEdge(artUv.x, artEdgeWidths.x, artGrain)
  * artEdge(1.0 - artUv.x, artEdgeWidths.y, artGrain)
  * artEdge(1.0 - artUv.y, artEdgeWidths.z, artGrain)
  * artEdge(artUv.y, artEdgeWidths.w, artGrain);
`);
  };
  material.customProgramCacheKey = () => `ink-edge:${widths.toArray().join(',')}:${uvRect.join(',')}`;
  material.needsUpdate = true;
}

/** Apply a small reviewed revision, retaining original manifests and the renderer's texture lifecycle. */
export async function applyArtDirection(chapterId: number, manifest: SceneManifest, objects: ArtSceneObject[], scene: THREE.Scene, signal: AbortSignal): Promise<ArtDirectionSummary> {
  const summary: ArtDirectionSummary = { replacements: 0, geometryRepairs: 0, edgeRepairs: 0, addedLayers: 0, textLayers: [] };
  const response = await fetch(`${import.meta.env.BASE_URL}assets/reconstruction/manifest.json`, { signal });
  if (!response.ok) throw new Error(`图层修订清单读取失败（${response.status}），可重试展卷。`);
  const revisions: RevisionManifest = await response.json();
  if (revisions.schemaVersion !== 1) throw new Error('图层修订清单版本不兼容。');
  if (!revisions.activeChapters.includes(chapterId)) return summary;
  const chapter = revisions.chapters[String(chapterId)];
  if (!chapter) throw new Error(`第${chapterId}卷缺少图层修订配置。`);
  summary.textLayers = chapter.textLayers ?? [];
  for (const name of chapter.backgroundMeshNames ?? []) {
    const object = objects.find(object => object.mesh.name === name);
    if (!object || object.url) throw new Error(`纸底基底未找到或不是纯色底层：${name}`);
    // The silk support is a background, not a depth mask that cuts painted hems or roots.
    object.material.depthWrite = false;
    object.mesh.userData.artPaperBackground = true;
  }
  for (const name of chapter.hiddenMeshNames ?? []) {
    const object = objects.find(object => object.mesh.name === name);
    if (!object) throw new Error(`退役图层未找到原对象：${name}`);
    object.url = undefined;
    object.mesh.visible = false;
    object.mesh.userData.artHidden = true;
  }
  for (const replacement of chapter.replacements) {
    const sourceMaterials = new Set(manifest.materials.filter(material => material.texture === replacement.sourceTexture).map(material => material.id));
    const names = new Set(manifest.meshes.filter(mesh => sourceMaterials.has(mesh.material)).map(mesh => mesh.name));
    if (replacement.meshNames) for (const name of names) if (!replacement.meshNames.includes(name)) names.delete(name);
    const matched = objects.filter(object => names.has(object.mesh.name));
    if (!matched.length) throw new Error(`补全图层未找到原对象：${replacement.id}`);
    for (const object of matched) {
      // Retirement takes precedence over a replacement kept for provenance.
      // Reassigning its URL would let the streaming callback show it again.
      if (!object.mesh.userData.artHidden) object.url = `${import.meta.env.BASE_URL}${replacement.asset}`;
      const preserve = replacement.geometryPolicy === 'preserve-region';
      const explicit = replacement.geometryPolicy === 'explicit-corners';
      const geometry = explicit ? planeFromCorners(replacement.geometryCorners) : preserve ? object.mesh.geometry.clone() : completeUvPlane(object.mesh.geometry);
      if (preserve) {
        const [u0, v0, u1, v1] = replacement.uvInsetRect ?? [0, 0, 1, 1];
        const uv = geometry.getAttribute('uv');
        for (let index = 0; index < uv.count; index++) uv.setXY(index, u0 + uv.getX(index) * (u1 - u0), v0 + uv.getY(index) * (v1 - v0));
      } else expandForReplacement(geometry, explicit ? { ...replacement, sourceAspect: replacement.contentAspect } : replacement);
      object.mesh.geometry.dispose(); object.mesh.geometry = geometry;
      Object.assign(object.mesh.userData, { artLayerId: replacement.id, role: replacement.role, narrative: replacement.narrative, replacement: true });
      summary.replacements++;
    }
  }
  for (const repair of chapter.geometryRepairs ?? []) for (const name of repair.meshNames) {
    const object = objects.find(object => object.mesh.name === name);
    if (!object) throw new Error(`完整图层载体未找到原对象：${name}`);
    const geometry = completeUvPlane(object.mesh.geometry);
    object.mesh.geometry.dispose(); object.mesh.geometry = geometry;
    Object.assign(object.mesh.userData, { artLayerId: repair.id, role: repair.role, narrative: repair.narrative, geometryRepaired: true });
    summary.geometryRepairs++;
  }
  // A reviewed layout delta moves only the derived painting carrier. Keep the
  // source object's world matrix, hierarchy and original animation samples.
  for (const adjustment of chapter.layoutAdjustments ?? []) {
    if (adjustment.worldMatrix.length !== 16 || !adjustment.worldMatrix.every(Number.isFinite)) throw new Error(`构图调整矩阵无效：${adjustment.id}`);
    const worldDelta = new THREE.Matrix4().fromArray(adjustment.worldMatrix);
    if (Math.abs(worldDelta.determinant()) < 1e-10) throw new Error(`构图调整不可逆：${adjustment.id}`);
    for (const name of adjustment.meshNames) {
      const object = objects.find(item => item.mesh.name === name);
      if (!object) throw new Error(`构图调整未找到原对象：${name}`);
      const localDelta = object.mesh.matrixWorld.clone().invert().multiply(worldDelta).multiply(object.mesh.matrixWorld);
      const geometry = object.mesh.geometry.clone().applyMatrix4(localDelta);
      object.mesh.geometry.dispose(); object.mesh.geometry = geometry;
      Object.assign(object.mesh.userData, { layoutAdjustmentId: adjustment.id, narrative: adjustment.narrative });
    }
  }
  for (const repair of chapter.edgeRepairs) for (const name of repair.meshNames) {
    const object = objects.find(object => object.mesh.name === name);
    if (!object) throw new Error(`修边图层未找到原对象：${name}`);
    applyInkEdge(object.material, repair.fades, repair.uvRect);
    Object.assign(object.mesh.userData, { artLayerId: repair.id, role: repair.role, narrative: repair.narrative, edgeRepaired: true });
    summary.edgeRepairs++;
  }
  for (const layer of chapter.addedLayers) {
    if (layer.matrix.length !== 16 || layer.matrix.some(value => !Number.isFinite(value))) throw new Error(`新增图层世界矩阵无效：${layer.id}`);
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: layer.opacity, transparent: true, alphaTest: 0.003, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const geometry = new THREE.PlaneGeometry(1, 1);
    if (layer.uvRect) {
      const [u0, v0, u1, v1] = layer.uvRect;
      const uv = geometry.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = layer.name;
    mesh.matrix.fromArray(layer.matrix); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
    mesh.visible = false;
    Object.assign(mesh.userData, { artLayerId: layer.id, role: layer.role, narrative: layer.narrative, motionName: layer.motionName, artPlane: 'XY' });
    scene.add(mesh);
    objects.push({ mesh, material, url: `${import.meta.env.BASE_URL}${layer.asset}` });
    summary.addedLayers++;
  }
  return summary;
}

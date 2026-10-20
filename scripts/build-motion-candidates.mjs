import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createServer } from 'vite';

const inventory = JSON.parse(await readFile(new URL('../reports/reconstruction/layers-inventory.json', import.meta.url), 'utf8'));
const review = JSON.parse(await readFile(new URL('../reports/reconstruction/visual-review.json', import.meta.url), 'utf8')).entries;
const inventoryByName = new Map(inventory.meshes.map(mesh => [`${mesh.chapter}:${mesh.name}`, mesh]));
const selections = {
  2: [
    { name: '2-6 前景 牡丹花枝', role: 'flowerBranch', kind: 'sway', pivotUV: [0.5, 0], amplitudeDegrees: 0.25, narrative: '春日静赏与花入民间的温润春风；仅独立花枝，人物与石台不动' },
  ],
  3: [
    { name: '04_中部织锦飘带', role: 'ribbon', kind: 'sway', pivotUV: [0.12, 0.5], amplitudeDegrees: 0.12, narrative: '锦绣纹样的独立连接带，完整端部保留' },
    { name: '04_中部织锦飘带.001', role: 'ribbon', kind: 'sway', pivotUV: [0.12, 0.5], amplitudeDegrees: 0.12, narrative: '同一独立锦带的复用实例，错相而非同步摇摆' },
    { name: 'SC05_01_两盏花灯', role: 'lampPair', kind: 'sway', pivotUV: [0.5, 1], amplitudeDegrees: 0.12, conditional: '灯彩与建筑/人物已分离，但同图含两盏灯；优先按两灯UV区拆成两个上端支点，再各自微摆；不整片大幅转动', narrative: '年节祈福的牡丹灯彩' },
    { name: 'SC05_通道左上花灯', role: 'lampPair', kind: 'sway', pivotUV: [0.5, 1], amplitudeDegrees: 0.12, conditional: '同图两灯，应复用UV分片并保留完整流苏；不新增纹理重复下载', narrative: '节庆转场的独立灯彩' },
    { name: 'SC06_16_红色灯笼', role: 'singleLamp', kind: 'sway', pivotUV: [0.5, 1], amplitudeDegrees: 0.25, narrative: '完整单灯，灯罩/顶钩/流苏独立于人物与器物，是首选轻摆对象' },
    { name: 'SC06_通道左上花灯', role: 'singleLamp', kind: 'sway', pivotUV: [0.5, 1], amplitudeDegrees: 0.22, narrative: '复用同一完整单灯的通道实例，不带动室内陈设' },
    { name: 'SC05_通道右下花枝', role: 'flowerBranch', kind: 'sway', pivotUV: [0.5, 0], amplitudeDegrees: 0.12, narrative: '祈福灯彩段的独立牡丹遮挡，枝根挂点和安全边待实景检查' },
    { name: 'SC06_通道右下花枝', role: 'flowerBranch', kind: 'sway', pivotUV: [0.5, 0], amplitudeDegrees: 0.12, narrative: '生活器用段的独立牡丹前景；花瓶、铜镜、首饰仍静止' },
    ...['左侧横向', '上左卷曲', '上右卷曲', '左下延展', '右下延展'].map((suffix, index) => ({ name: `SC09_${String(index + 7).padStart(2, '0')}_飘带_${suffix}`, role: 'ribbon', kind: 'sway', pivotUV: [0.5, 0.8], amplitudeDegrees: 0.12, narrative: '卷尾独立浅绢连接带，保持疏朗吉祥意象；每景最多少数可见带微动' })),
    ...Array.from({ length: 8 }, (_, index) => ({ name: `过渡${String(index + 1).padStart(2, '0')}_淡云水线1`, role: 'cloudLine', kind: 'opacityPulse', opacityAmplitude: 0.025, narrative: '既有淡云水脉连接，保留原曲线几何，仅低频浅透明度呼吸' })),
    ...Array.from({ length: 8 }, (_, index) => ({ name: `TR${String(index + 1).padStart(2, '0')}_水波0`, role: 'waterLine', kind: 'opacityPulse', opacityAmplitude: 0.025, narrative: '既有水波细线，每个连接段只选一根参与呼吸，不整片水面/树木位移' })),
  ],
  4: [
    { name: '07_红青飘带组合', role: 'ribbon', kind: 'sway', pivotUV: [0.15, 0.5], amplitudeDegrees: 0.15, narrative: '独立红青锦带，前半盛美、后半逐渐变缓' },
    { name: '4-3 · 06 · 近景花枝', role: 'flowerBranch', kind: 'sway', pivotUV: [0.5, 0], amplitudeDegrees: 0.18, narrative: '沉香亭赏花题诗的牡丹花枝，建筑/人物稳定' },
    { name: '4-9 · 08 · 残花枝', role: 'witheredBranch', kind: 'sway', pivotUV: [0.5, 0], amplitudeDegrees: 0.06, narrative: '卷尾残花，极缓微摆或静止；严禁继续生成丰盛花瓣' },
    ...Array.from({ length: 8 }, (_, index) => ({ name: `过渡${index + 1} · 云气1`, role: 'cloud', kind: 'drift', pivotUV: [0.5, 0.5], driftWidthRatio: 0.003, opacityAmplitude: 0.02, narrative: '完整独立绢白云气连接层；第5景起随盛衰包络连续降速降密度' })),
  ],
};
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { prepareScene } = await server.ssrLoadModule('/src/scene/prepareScene.ts');
  const output = {
    schemaVersion: 1, stage: 'read-only-candidates-after-first-scroll-audit', runtimeEnabled: false,
    constraints: [
      'Only a future candidate list. motionProfiles and activeChapters were not edited; chapters 2–4 remain static until the first-scroll pilot is shown and verified.',
      'Image bases come from local positions/UV, not world matrices. YZ and oblique UV bases need explicit engine support before activation; the current XY/XZ-only runtime cannot be reused blindly.',
      'Baked characters, palace groups, phoenix patterns, ceramic vessels, mirrors, desks and jewellery remain static.',
      'Tube CURVE UV is not a painted image plane. Cloud/water curves below are opacity-only candidates, never a moving carpet or a displaced ground.',
    ],
    chapters: [],
  };
  for (const chapterId of [2, 3, 4]) {
    const raw = await readFile(new URL(`../public/assets/chapter-${chapterId}/scene.json`, import.meta.url));
    const source = JSON.parse(raw);
    const scene = prepareScene(source, chapterId);
    const chapter = {
      chapterId, sceneSha256: createHash('sha256').update(raw).digest('hex'), travel: source.travel,
      readingStops: scene.stops, candidates: [],
      newIndependentLayersNeeded: chapterId === 2
        ? ['暂无独立云/柳/纸页/帷幔；按审校后的共享薄雾/单瓣与必要独立枝层补足，不摆动整幅雅集/园林图']
        : chapterId === 3 ? ['可复用少量独立薄雾/单瓣；花灯以单灯或UV分片为先，器物陈设保持静止']
          : ['已有独立绢白云气；可复用单瓣图集，后半按真实节点逐步减少，不新增爆发粒子'],
    };
    for (const selection of selections[chapterId]) {
      const mesh = source.meshes.find(mesh => mesh.name === selection.name);
      if (!mesh) throw new Error(`Missing candidate ${chapterId}/${selection.name}`);
      const recorded = inventoryByName.get(`${chapterId}:${selection.name}`);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
      if (mesh.uvs.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const size = geometry.boundingBox.getSize(new THREE.Vector3()).toArray();
      const fit = mesh.type === 'CURVE' ? { plane: 'CURVE_3D', basis: null, basisMethod: 'positions span and CURVE source type; UV wraps tube circumference, not the image vertical', dominantExtentPlane: 'YZ' } : fitUv(mesh.positions, mesh.uvs);
      const material = source.materials[mesh.material];
      const visual = recorded?.textureId ? review[recorded.textureId] : null;
      const visible = projectedReferences(mesh, geometry, scene);
      const supported = fit.plane === 'XY' || fit.plane === 'XZ';
      chapter.candidates.push({
        meshName: mesh.name, meshId: recorded?.id, textureId: recorded?.textureId,
        texturePath: recorded?.texturePath, visualTreatment: visual?.treatment ?? 'structuralGeometryPreserved',
        visualEvidence: visual?.visualReview ?? '原几何/材质审查；此项为曲线结构，非独立图片视觉审校',
        sourceType: mesh.type, role: selection.role, action: selection.kind,
        narrative: selection.narrative, conditional: selection.conditional ?? null,
        localGeometry: { vertexCount: mesh.positions.length / 3, uvCount: mesh.uvs.length / 2, spansXYZ: size, ...fit },
        suggestedLimits: { pivotUV: selection.pivotUV, angleDegrees: selection.amplitudeDegrees, widthDriftRatio: selection.driftWidthRatio, opacityAmplitude: selection.opacityAmplitude, periodSeconds: chapterId === 2 ? [20, 30] : chapterId === 3 ? [20, 34] : [26, 40] },
        runtimeReadyAfterPilot: supported && !selection.conditional,
        engineWorkBeforeActivation: mesh.type === 'CURVE' ? ['新增opacityPulse动作，仅改变已选细线透明度；材质需transparent:true/depthWrite:false；保持几何矩阵静止'] : supported ? [] : fit.plane === 'YZ' ? ['显式支持本地YZ：水平Y、竖直Z、法线X；沿有符号UV方向计算支点与增量，不能把Z旋转或X漂移复制过来'] : ['支持明确UV基向量（含斜置局部平面），绕归一化u×v法线旋转；支点用UV映射，不能用XY/XZ枚举近似'],
        projectedReferences: visible,
        reviewLimits: '几何与候选动作已定位；实际纹理载入、遮挡与图层叠加仍要网页实测。No profiles or runtime activation changed.',
      });
    }
    if (chapterId === 4) {
      const at = index => scene.stops[index].progress;
      chapter.shengShuaiEnvelope = {
        startStopIndex: 4, startName: scene.stops[4].name, startProgress: at(4),
        beforeStart: { clockSpeed: 1, petalDensity: 1, cloudDensity: 1 },
        interpolation: 'monotone smoothstep between actual normalized reading-stop coordinates; preserve each layer phase by integrating dt*clockSpeed instead of multiplying accumulated time by a changing speed',
        points: [
          { progress: at(4), stop: scene.stops[4].name, clockSpeed: 1, petalDensity: 1, cloudDensity: 1 },
          { progress: at(5), stop: scene.stops[5].name, clockSpeed: .70, petalDensity: .62, cloudDensity: .72 },
          { progress: at(6), stop: scene.stops[6].name, clockSpeed: .52, petalDensity: .38, cloudDensity: .52 },
          { progress: at(7), stop: scene.stops[7].name, clockSpeed: .40, petalDensity: .18, cloudDensity: .34 },
          { progress: at(8), stop: scene.stops[8].name, clockSpeed: .32, petalDensity: .08, cloudDensity: .22 },
          { progress: 1, stop: '卷尾', clockSpeed: .30, petalDensity: .06, cloudDensity: .20 },
        ],
        constraints: ['第5景之前维持盛美，之后才连续减速；避免硬切/灰屏', '只给单瓣/云气施密度与速度包络，主体与原相机不改', '降低密度时以透明包络平滑收束，并保留确定性粒子种子；不在分镜边界突然重生整组粒子', '卷尾水纹与留白为主，残花枝允许静止'],
      };
      const points = chapter.shengShuaiEnvelope.points;
      if (1 - points.at(-2).progress < 0.0001) {
        points.at(-2).progress = 1;
        points.pop();
        chapter.shengShuaiEnvelope.terminalNormalization = '第9阅读节点已接近1（浮点重映射误差）；合并到progress=1，避免最后1e-7区间形成额外速度/密度变化。';
      }
    }
    output.chapters.push(chapter);
  }
  await writeFile(new URL('../reports/reconstruction/motion-candidates-chapters-2-4.json', import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
  console.log(output.chapters.map(chapter => `chapter ${chapter.chapterId}: ${chapter.candidates.length} read-only candidates`).join('\n'));
} finally { await server.close(); }

function fitUv(positions, uvs) {
  const count = positions.length / 3;
  if (uvs.length !== count * 2) return { plane: 'UNRESOLVED', basis: null, basisMethod: 'no matching image UV' };
  const mean = new THREE.Vector3(), pu = new THREE.Vector3(), pv = new THREE.Vector3();
  let meanU = 0, meanV = 0;
  for (let i = 0; i < count; i++) { mean.add(new THREE.Vector3().fromArray(positions, i * 3)); meanU += uvs[i * 2]; meanV += uvs[i * 2 + 1]; }
  mean.divideScalar(count); meanU /= count; meanV /= count;
  let uu = 0, vv = 0, uv = 0;
  for (let i = 0; i < count; i++) {
    const u = uvs[i * 2] - meanU, v = uvs[i * 2 + 1] - meanV;
    const p = new THREE.Vector3().fromArray(positions, i * 3).sub(mean);
    uu += u*u; vv += v*v; uv += u*v; pu.addScaledVector(p,u); pv.addScaledVector(p,v);
  }
  const determinant = uu*vv-uv*uv;
  if (Math.abs(determinant)<1e-12) return { plane: 'UNRESOLVED', basis: null, basisMethod: 'degenerate image UV' };
  const alongU = pu.clone().multiplyScalar(vv).addScaledVector(pv,-uv).divideScalar(determinant);
  const alongV = pv.clone().multiplyScalar(uu).addScaledVector(pu,-uv).divideScalar(determinant);
  const normal = new THREE.Vector3().crossVectors(alongU,alongV).normalize();
  const axes = [alongU.clone().normalize(),alongV.clone().normalize()];
  const dominant = axes.map(axis => axis.toArray().map(Math.abs).indexOf(Math.max(...axis.toArray().map(Math.abs))));
  const aligned = axes.every((axis,i) => Math.abs(axis.toArray()[dominant[i]])>.9999);
  const plane = aligned && dominant[0]!==dominant[1] ? dominant.map(axis=>'XYZ'[axis]).join('') : 'UV-basis';
  let maxNormalResidual=0, maxInPlaneResidual=0;
  for(let i=0;i<count;i++) {
    const predicted=mean.clone().addScaledVector(alongU,uvs[i*2]-meanU).addScaledVector(alongV,uvs[i*2+1]-meanV);
    const residual=predicted.sub(new THREE.Vector3().fromArray(positions,i*3));const nd=residual.dot(normal);
    maxNormalResidual=Math.max(maxNormalResidual,Math.abs(nd));maxInPlaneResidual=Math.max(maxInPlaneResidual,residual.addScaledVector(normal,-nd).length());
  }
  return {plane,basis:{ originAtUvZero: mean.clone().addScaledVector(alongU,-meanU).addScaledVector(alongV,-meanV).toArray(), alongU:alongU.toArray(),alongV:alongV.toArray(), normal:normal.toArray(), maxNormalResidual,maxInPlaneResidual },basisMethod:'least-squares local position = origin + U*alongU + V*alongV, checked against all actual geometry vertices'};
}

function projectedReferences(sourceMesh,geometry,manifest) {
  const mesh=new THREE.Mesh(geometry);mesh.matrix.fromArray(sourceMesh.matrix);mesh.matrixAutoUpdate=false;mesh.updateMatrixWorld(true);
  const references=[];
  const points=manifest.stops.flatMap((stop,index)=>[{name:stop.name,progress:stop.progress,kind:'reading-stop'},...(index<manifest.stops.length-1?[{name:`${stop.name} → ${manifest.stops[index+1].name}`,progress:(stop.progress+manifest.stops[index+1].progress)/2,kind:'transition-midpoint'}]:[])]);
  for(const aspect of [16/9,3])for(const point of points) {
    let index=manifest.cameras.findIndex(sample=>sample.progress>=point.progress);if(index<0)index=manifest.cameras.length-1;
    const a=manifest.cameras[Math.max(0,index-1)],b=manifest.cameras[index],mix=THREE.MathUtils.clamp((point.progress-a.progress)/(b.progress-a.progress||1),0,1);
    const camera=new THREE.PerspectiveCamera(THREE.MathUtils.lerp(a.fov,b.fov,mix),aspect,manifest.camera.near||.01,manifest.camera.far||5000);
    camera.position.fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position),mix);camera.quaternion.fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(),mix);camera.updateMatrixWorld(true);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    if(frustum.intersectsObject(mesh))references.push({...point,aspect});
  }
  return {visibleAt:references,method:'CPU frustum sphere test at real normalized camera stops/midpoints for 16:9 and 3:1 painting aspects; ignores occlusion, alpha and streaming',bindingCaution:references.length?'Not a claim that texture pixels are unoccluded in every listed view':'No hit in these sampled views; investigate backup/off-route instances before binding rather than assuming runtime visibility'};
}

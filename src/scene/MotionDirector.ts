import * as THREE from 'three';
import type { StoryStop } from '../types';
import { getMotionProfile, type ChapterMotionProfile, type LayerMotionBinding } from '../data/motionProfiles';

export interface MotionObject { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }
export interface UvMotionBasis {
  origin: THREE.Vector3; alongU: THREE.Vector3; alongV: THREE.Vector3; normal: THREE.Vector3;
  plane: string; maxNormalResidual: number; maxInPlaneResidual: number;
}
export interface MotionEnvelope {
  clockSpeed: number; petalDensity: number; cloudDensity: number;
  legacyMotionSlots: number; maxBindings: number; phase: 'calm' | 'flourishing' | 'declining' | 'afterglow';
}
interface ResolvedNarrative {
  start: number; tail: number;
  points: { progress: number; clockSpeed: number; petalDensity: number; cloudDensity: number }[];
}
interface BoundMotion extends MotionObject {
  config: LayerMotionBinding; base: THREE.Matrix4; opacity: number;
  transparent: boolean; depthWrite: boolean; pivot: THREE.Vector3;
  basis?: UvMotionBasis; active: boolean;
}

/** Fit signed image coordinates in local geometry; world orientation never guesses the plane. */
export function deriveUvBasis(geometry: THREE.BufferGeometry, domain: 'image' | 'current' = 'image'): UvMotionBasis {
  const position = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  if (!position || !uv || position.count !== uv.count || position.count < 3) throw new Error('独立动效图层缺少有效UV。');
  let minU = 0, minV = 0, scaleU = 1, scaleV = 1;
  if (domain === 'current') {
    const us = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
    const vs = Array.from({ length: uv.count }, (_, i) => uv.getY(i));
    minU = Math.min(...us); minV = Math.min(...vs);
    scaleU = Math.max(...us) - minU; scaleV = Math.max(...vs) - minV;
  }
  if (scaleU < 1e-8 || scaleV < 1e-8) throw new Error('动效图集的UV区域退化。');
  const mean = new THREE.Vector3(), pu = new THREE.Vector3(), pv = new THREE.Vector3();
  let meanU = 0, meanV = 0;
  for (let i = 0; i < position.count; i++) {
    mean.add(new THREE.Vector3().fromBufferAttribute(position, i));
    meanU += (uv.getX(i) - minU) / scaleU; meanV += (uv.getY(i) - minV) / scaleV;
  }
  mean.divideScalar(position.count); meanU /= position.count; meanV /= position.count;
  let uu = 0, vv = 0, uvSum = 0;
  for (let i = 0; i < position.count; i++) {
    const u = (uv.getX(i) - minU) / scaleU - meanU, v = (uv.getY(i) - minV) / scaleV - meanV;
    const delta = new THREE.Vector3().fromBufferAttribute(position, i).sub(mean);
    uu += u*u; vv += v*v; uvSum += u*v; pu.addScaledVector(delta,u); pv.addScaledVector(delta,v);
  }
  const determinant = uu*vv - uvSum*uvSum;
  if (Math.abs(determinant) < 1e-12) throw new Error('独立动效图层UV退化。');
  const alongU = pu.clone().multiplyScalar(vv).addScaledVector(pv,-uvSum).divideScalar(determinant);
  const alongV = pv.clone().multiplyScalar(uu).addScaledVector(pu,-uvSum).divideScalar(determinant);
  const normal = new THREE.Vector3().crossVectors(alongU,alongV);
  if (alongU.lengthSq() < 1e-12 || alongV.lengthSq() < 1e-12 || normal.lengthSq() < 1e-12) throw new Error('独立动效图层的局部平面退化。');
  normal.normalize();
  const origin = mean.clone().addScaledVector(alongU,-meanU).addScaledVector(alongV,-meanV);
  const axes = [alongU.clone().normalize(),alongV.clone().normalize()];
  const dominant = axes.map(axis => axis.toArray().map(Math.abs).indexOf(Math.max(...axis.toArray().map(Math.abs))));
  const aligned = axes.every((axis,index) => Math.abs(axis.toArray()[dominant[index]]) > .9999);
  const plane = aligned && dominant[0] !== dominant[1] ? dominant.map(axis => 'XYZ'[axis]).join('') : 'UV';
  let maxNormalResidual = 0, maxInPlaneResidual = 0;
  for (let i = 0; i < position.count; i++) {
    const residual = origin.clone().addScaledVector(alongU,(uv.getX(i)-minU)/scaleU)
      .addScaledVector(alongV,(uv.getY(i)-minV)/scaleV).sub(new THREE.Vector3().fromBufferAttribute(position,i));
    const nd = residual.dot(normal);
    maxNormalResidual = Math.max(maxNormalResidual,Math.abs(nd));
    maxInPlaneResidual = Math.max(maxInPlaneResidual,residual.addScaledVector(normal,-nd).length());
  }
  return { origin, alongU, alongV, normal, plane, maxNormalResidual, maxInPlaneResidual };
}

function resolveNarrative(profile: ChapterMotionProfile, stops: StoryStop[]): ResolvedNarrative | undefined {
  const config = profile.narrativeEnvelope;
  if (!config) return;
  if (!stops[config.startStop] || !stops[config.tailStop]) throw new Error('盛衰动效缺少真实阅读节点。');
  const points = config.points.map(point => {
    if (!stops[point.stop]) throw new Error('盛衰动效节点不存在。');
    return { ...point, progress: stops[point.stop].progress };
  });
  if (points.at(-1)!.progress > .9999) points.at(-1)!.progress = 1;
  else points.push({ ...points.at(-1)!, progress: 1 });
  return { start: stops[config.startStop].progress, tail: stops[config.tailStop].progress, points };
}

function envelopeAt(profile: ChapterMotionProfile, narrative: ResolvedNarrative | undefined, progress: number): MotionEnvelope {
  const baseline: MotionEnvelope = { clockSpeed: 1, petalDensity: 1, cloudDensity: 1, legacyMotionSlots: 3, maxBindings: profile.maxVisibleBindings, phase: narrative ? 'flourishing' : 'calm' };
  if (!narrative || progress <= narrative.start) return baseline;
  let a = narrative.points[0], b = narrative.points.at(-1)!;
  for (let i = 1; i < narrative.points.length; i++) {
    if (progress <= narrative.points[i].progress) { a = narrative.points[i-1]; b = narrative.points[i]; break; }
  }
  const mix = THREE.MathUtils.smoothstep(progress,a.progress,b.progress);
  const tailMix = THREE.MathUtils.smoothstep(progress,narrative.start,narrative.tail);
  return {
    clockSpeed: THREE.MathUtils.lerp(a.clockSpeed,b.clockSpeed,mix),
    petalDensity: THREE.MathUtils.lerp(a.petalDensity,b.petalDensity,mix),
    cloudDensity: THREE.MathUtils.lerp(a.cloudDensity,b.cloudDensity,mix),
    legacyMotionSlots: 3 - 2*tailMix,
    maxBindings: progress >= narrative.tail ? Math.min(3,profile.maxVisibleBindings) : profile.maxVisibleBindings,
    phase: progress >= narrative.tail ? 'afterglow' : 'declining',
  };
}

export function evaluateMotionEnvelope(profile: ChapterMotionProfile, stops: StoryStop[], progress: number) {
  return envelopeAt(profile,resolveNarrative(profile,stops),THREE.MathUtils.clamp(progress,0,1));
}

/** One independent clock and incremental matrix base for all four authored scrolls. */
export class MotionDirector {
  readonly profile: ChapterMotionProfile;
  private narrative?: ResolvedNarrative;
  private progress = 0;
  private envelope: MotionEnvelope;
  private bindings: BoundMotion[] = [];
  private byMesh = new Map<THREE.Mesh,BoundMotion>();
  private elapsed = 0;
  private activeCount = 0;
  private activeGroups = { petal: 0, bridge: 0, legacy: 0 };
  private activeNames: string[] = [];
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private delta = new THREE.Matrix4();
  private rotation = new THREE.Matrix4();
  private flutter = new THREE.Matrix4();
  private flutterAxis = new THREE.Vector3();
  private unpivot = new THREE.Matrix4();
  private center = new THREE.Vector3();
  private offset = new THREE.Vector3();

  constructor(chapterId: number, objects: MotionObject[], stops: StoryStop[] = [], profile?: ChapterMotionProfile) {
    this.profile = profile ?? getMotionProfile(chapterId);
    this.narrative = resolveNarrative(this.profile,stops);
    this.envelope = envelopeAt(this.profile,this.narrative,0);
    if (!this.profile.enabled) return;
    const byName = new Map(objects.map(object => [object.mesh.name,object]));
    for (const config of this.profile.bindings) {
      const object = byName.get(config.meshName);
      if (!object || object.mesh.userData.artHidden) continue;
      const basis = config.kind === 'opacityPulse' ? undefined : deriveUvBasis(object.mesh.geometry,config.uvDomain);
      if (basis && config.plane !== 'UV' && config.plane !== basis.plane) throw new Error('动效图层局部UV平面不匹配：'+config.meshName);
      const pivotUV = config.pivot ?? [.5,.5];
      const pivot = basis ? basis.origin.clone().addScaledVector(basis.alongU,pivotUV[0]).addScaledVector(basis.alongV,pivotUV[1]) : new THREE.Vector3();
      const binding: BoundMotion = { ...object,config,basis,pivot,base:object.mesh.matrix.clone(),opacity:object.material.opacity,transparent:object.material.transparent,depthWrite:object.material.depthWrite,active:false };
      this.bindings.push(binding); this.byMesh.set(object.mesh,binding);
    }
  }

  setBaseMatrix(mesh: THREE.Mesh, matrix: THREE.Matrix4) { this.byMesh.get(mesh)?.base.copy(matrix); }

  advance(deltaSeconds: number, progress = this.progress) {
    this.progress = progress;
    this.envelope = envelopeAt(this.profile,this.narrative,progress);
    // Integrating the speed preserves phase when a user seeks across the decline.
    if (this.profile.enabled) this.elapsed += Math.max(0,Math.min(deltaSeconds,.05))*this.envelope.clockSpeed;
  }

  update(camera: THREE.Camera, enabled: boolean, progress = this.progress) {
    this.progress = progress;
    this.envelope = envelopeAt(this.profile,this.narrative,progress);
    this.projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    this.activeCount = 0; this.activeGroups = { petal:0,bridge:0,legacy:0 }; this.activeNames = [];
    const candidates: { binding:BoundMotion; distance:number }[] = [];
    for (const binding of this.bindings) {
      const { mesh,material,base,config } = binding;
      binding.active = false;
      mesh.matrix.copy(base); mesh.updateMatrixWorld(true);
      // Narrative cloud sparsity belongs to the reading position, so pausing or
      // reduced-motion never flashes the quiet tail back into a dense cloud layer.
      material.opacity = config.kind === 'fall' ? 0 : binding.opacity*(config.atmosphere === 'cloud' ? this.envelope.cloudDensity : 1);
      if (!enabled || !mesh.visible || mesh.userData.sourceVisible === false || !this.frustum.intersectsObject(mesh)) continue;
      this.center.setFromMatrixPosition(base);
      candidates.push({ binding,distance:this.center.distanceToSquared(camera.position) });
    }
    candidates.sort((a,b) => (a.binding.config.priority??3)-(b.binding.config.priority??3) || a.distance-b.distance);
    const ranks = { petal:0,bridge:0,legacy:0 };
    for (const { binding } of candidates) {
      const { mesh,material,base,config,basis,pivot } = binding;
      const group = config.group??'legacy';
      if (this.activeCount >= this.envelope.maxBindings) break;
      if (this.activeGroups[group] >= (this.profile.maxVisiblePerGroup?.[group]??this.profile.maxVisibleBindings)) continue;
      const rank = ranks[group]++;
      const motionWeight = group === 'petal'
        ? THREE.MathUtils.clamp(this.envelope.petalDensity*(this.profile.maxVisiblePerGroup?.petal??2)-rank,0,1)
        : group === 'legacy' && this.narrative ? THREE.MathUtils.clamp(this.envelope.legacyMotionSlots-rank,0,1) : 1;
      if (motionWeight < 1e-5) continue;
      const phase = this.elapsed/config.periodSeconds*Math.PI*2+config.phase;
      const wave = Math.sin(phase), cycle = ((phase/(Math.PI*2))%1+1)%1;
      if (config.kind === 'opacityPulse') {
        this.materialMode(binding,true);
        material.opacity *= 1-(config.opacityAmplitude??.02)*(.5+.5*wave)*motionWeight;
      } else if (basis) {
        const horizontal = ((config.xRatio??0)*wave+(config.kind==='fall'?(config.windRatio??0)*(cycle-.5):0))*motionWeight;
        const verticalRatio = config.plane === 'XY' ? config.yRatio??0 : config.zRatio??0;
        const vertical = verticalRatio*(config.kind === 'fall'?.5-cycle:Math.sin(phase*.71+.6))*motionWeight;
        this.offset.copy(basis.alongU).multiplyScalar(horizontal).addScaledVector(basis.alongV,vertical);
        const angle = THREE.MathUtils.degToRad((config.restAngleDegrees??0)+(config.angleDegrees??0)*wave*motionWeight);
        this.delta.makeTranslation(pivot.x+this.offset.x,pivot.y+this.offset.y,pivot.z+this.offset.z);
        this.rotation.makeRotationAxis(basis.normal,angle);
        if(config.tiltDegrees) this.rotation.multiply(this.flutter.makeRotationAxis(this.flutterAxis.copy(basis.alongU).normalize(),THREE.MathUtils.degToRad(config.tiltDegrees)*Math.sin(phase*.63+.9)*motionWeight));
        if(config.twistDegrees) this.rotation.multiply(this.flutter.makeRotationAxis(this.flutterAxis.copy(basis.alongV).normalize(),THREE.MathUtils.degToRad(config.twistDegrees)*Math.sin(phase*.47+1.7)*motionWeight));
        this.unpivot.makeTranslation(-pivot.x,-pivot.y,-pivot.z);
        this.delta.multiply(this.rotation).multiply(this.unpivot);
        mesh.matrix.copy(base).multiply(this.delta); mesh.updateMatrixWorld(true);
        const opacityEnvelope = config.kind === 'fall' ? fallingPetalEnvelope(cycle)*motionWeight : 1;
        material.opacity = THREE.MathUtils.clamp(binding.opacity*opacityEnvelope*(config.atmosphere==='cloud'?this.envelope.cloudDensity:1)*(1+(config.opacityAmplitude??0)*wave*motionWeight),0,1);
      }
      binding.active=true; this.activeCount++; this.activeGroups[group]++; this.activeNames.push(mesh.name);
    }
    for (const binding of this.bindings) if (binding.config.kind === 'opacityPulse' && !binding.active) this.materialMode(binding,false);
  }

  private materialMode(binding:BoundMotion, pulse:boolean) {
    const transparent = pulse ? true : binding.transparent, depthWrite = pulse ? false : binding.depthWrite;
    if (binding.material.transparent!==transparent || binding.material.depthWrite!==depthWrite) {
      binding.material.transparent=transparent; binding.material.depthWrite=depthWrite; binding.material.needsUpdate=true;
    }
  }

  getDiagnostics() {
    return { elapsedSeconds:this.elapsed,bindings:this.bindings.length,activeBindings:this.activeCount,activeGroups:this.activeGroups,activeNames:this.activeNames,supported:this.profile.enabled,...this.envelope };
  }

  dispose() {
    for (const binding of this.bindings) {
      binding.mesh.matrix.copy(binding.base); binding.mesh.updateMatrixWorld(true); binding.material.opacity=binding.opacity; this.materialMode(binding,false);
    }
    this.bindings=[]; this.byMesh.clear(); this.activeCount=0; this.activeGroups={petal:0,bridge:0,legacy:0}; this.activeNames=[];
  }
}

export function fallingPetalEnvelope(cycle:number) {
  return THREE.MathUtils.smoothstep(cycle,0,.15)*(1-THREE.MathUtils.smoothstep(cycle,.76,1));
}


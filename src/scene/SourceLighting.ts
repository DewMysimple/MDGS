import * as THREE from 'three';
import type { SceneManifest } from '../types';
import type { SourceLighting, SourceMaterialLibrary } from './SourceMaterial';
import { renderQualityProfile, type RenderQuality } from './renderQuality';

export interface NativeLamp {
  name: string; type: 'SUN' | 'AREA' | 'POINT' | 'SPOT'; color: number[]; energy: number;
  position: number[]; direction: number[]; axisX: number[]; axisY: number[];
  size?: number; size_y?: number; shape?: string; diffuse_factor?: number; specular_factor?: number;
  angle?: number; normalize?: boolean; use_shadow?: boolean;
}
export interface SourceRenderSettings {
  version: number; sourceRevision: string; sourceSha256: string; unitScaleMeters: number;
  filmTransparent: boolean;
  colorManagement: { viewTransform: string; look: string; exposure: number; gamma: number };
  world: { color: number[]; strength: number };
  lights: NativeLamp[];
  engine?: string;
  compositor?: { nodes: { name: string; type: string; inputs: Record<string, unknown>;
    inputSockets?: { index: number; name: string; value: unknown }[]; blend_type?: string }[]; links: string[][] } | null;
}

export interface SourceLightingState extends SourceLighting {
  readonly shadowSubpixelBits: number | null;
  setRenderQuality(quality: RenderQuality): void;
  requiredShadowCasters(scene: THREE.Scene, viewCamera: THREE.PerspectiveCamera, focusDistance: number): ReadonlySet<THREE.Mesh>;
  prepareShadows(renderer: THREE.WebGLRenderer, scene: THREE.Scene, materials: SourceMaterialLibrary,
    viewCamera: THREE.PerspectiveCamera, focusDistance: number): void;
  dispose(): void;
}

interface LampShadow {
  prefix: string; lamp: NativeLamp; target: THREE.WebGLRenderTarget;
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  matrix: THREE.Matrix4; frustum: THREE.Vector2; parameters: THREE.Vector4;
  casters: Set<THREE.Mesh>; vertices: WeakMap<THREE.Mesh, ShadowGeometry>;
}

interface ShadowGeometry {
  geometry: THREE.BufferGeometry; positionVersion: number; indexVersion: number;
  matrix: THREE.Matrix4; morph: number[]; points: THREE.Vector3[]; bounds: THREE.Box3;
}

function createLampShadow(lamp: NativeLamp, prefix: string): LampShadow {
  const size = renderQualityProfile('720p').shadowMapSize;
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  target.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  target.depthTexture.minFilter = target.depthTexture.magFilter = THREE.NearestFilter;
  target.texture.generateMipmaps = false;
  const camera = lamp.type === 'SUN' ? new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 1000)
    : new THREE.PerspectiveCamera(175, 1, .01, 1000);
  return { prefix, lamp, target, camera, matrix: new THREE.Matrix4(),
    frustum: new THREE.Vector2(), parameters: new THREE.Vector4(), casters: new Set(), vertices: new WeakMap() };
}

/** Authored visibility is separate from texture residency's mesh.visible. */
function isSourceCaster(object: THREE.Object3D): object is THREE.Mesh {
  if (!(object instanceof THREE.Mesh)) return false;
  for (let parent: THREE.Object3D | null = object; parent; parent = parent.parent) {
    if (parent.userData.sourceVisible === false || parent.userData.artHidden) return false;
  }
  return true;
}

function shadowGeometry(shadow: LampShadow, mesh: THREE.Mesh, lightView: THREE.Matrix4): ShadowGeometry {
  const geometry = mesh.geometry, position = geometry.getAttribute('position');
  const positionVersion = 'version' in position ? position.version : position.data.version;
  const indexVersion = geometry.index?.version ?? 0, morph = mesh.morphTargetInfluences ?? [];
  const cached = shadow.vertices.get(mesh);
  if (cached && cached.geometry === geometry && cached.positionVersion === positionVersion && cached.indexVersion === indexVersion
    && cached.matrix.equals(mesh.matrixWorld) && cached.morph.length === morph.length && cached.morph.every((value, i) => value === morph[i])) return cached;
  const transform = new THREE.Matrix4().multiplyMatrices(lightView, mesh.matrixWorld);
  const points: THREE.Vector3[] = [], bounds = new THREE.Box3();
  for (let index = 0; index < position.count; index++) {
    const point = mesh.getVertexPosition(index, new THREE.Vector3()).applyMatrix4(transform);
    points.push(point); bounds.expandByPoint(point);
  }
  const result = { geometry, positionVersion, indexVersion, matrix: mesh.matrixWorld.clone(), morph: [...morph], points, bounds };
  shadow.vertices.set(mesh, result);
  return result;
}

/** Clip actual triangles to the light's receiver volume. A long paper sheet's
 * remote end must not expand depth just because its whole AABB intersects it. */
function shadowDepthRange(mesh: THREE.Mesh, geometry: ShadowGeometry, planes: THREE.Plane[]) {
  const { bounds, points } = geometry;
  let inside = true;
  for (const plane of planes) {
    const n = plane.normal;
    const maximum = plane.constant + n.x * (n.x >= 0 ? bounds.max.x : bounds.min.x)
      + n.y * (n.y >= 0 ? bounds.max.y : bounds.min.y) + n.z * (n.z >= 0 ? bounds.max.z : bounds.min.z);
    if (maximum < 0) return undefined;
    const minimum = plane.constant + n.x * (n.x >= 0 ? bounds.min.x : bounds.max.x)
      + n.y * (n.y >= 0 ? bounds.min.y : bounds.max.y) + n.z * (n.z >= 0 ? bounds.min.z : bounds.max.z);
    inside &&= minimum >= 0;
  }
  if (inside) return [bounds.min.z, bounds.max.z] as const;
  let minimum = Infinity, maximum = -Infinity;
  const indices = mesh.geometry.index, count = indices?.count ?? points.length;
  for (let index = 0; index + 2 < count; index += 3) {
    let polygon = [0, 1, 2].map(offset => points[indices ? indices.getX(index + offset) : index + offset]);
    for (const plane of planes) {
      const clipped: THREE.Vector3[] = [];
      for (let current = 0; current < polygon.length; current++) {
        const a = polygon[current], b = polygon[(current + 1) % polygon.length];
        const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (db >= 0)) clipped.push(a.clone().lerp(b, da / (da - db)));
      }
      polygon = clipped;
      if (!polygon.length) break;
    }
    for (const point of polygon) { minimum = Math.min(minimum, point.z); maximum = Math.max(maximum, point.z); }
  }
  return Number.isFinite(minimum) ? [minimum, maximum] as const : undefined;
}

function fitLampShadow(shadow: LampShadow, scene: THREE.Scene, viewCamera: THREE.PerspectiveCamera, focusDistance: number) {
  const { camera, lamp } = shadow;
  const direction = new THREE.Vector3().fromArray(lamp.direction).normalize();
  const viewPosition = new THREE.Vector3().setFromMatrixPosition(viewCamera.matrixWorld);
  const viewDirection = viewCamera.getWorldDirection(new THREE.Vector3());
  const near = Math.max(viewCamera.near, .001), far = Math.min(viewCamera.far, Math.max(near * 2, focusDistance * 2));
  const corners: THREE.Vector3[] = [];
  for (const depth of [near, far]) for (const x of [-1, 1]) for (const y of [-1, 1]) {
    const ray = new THREE.Vector3(x, y, .5).unproject(viewCamera).sub(viewPosition).normalize();
    corners.push(ray.multiplyScalar(depth / Math.max(1e-5, ray.dot(viewDirection))).add(viewPosition));
  }
  const sphere = new THREE.Box3().setFromPoints(corners).getBoundingSphere(new THREE.Sphere());
  camera.up.fromArray(lamp.axisY).normalize();
  if (lamp.type === 'SUN') camera.position.set(0, 0, 0);
  else camera.position.fromArray(lamp.position);
  camera.lookAt(camera.position.clone().add(direction)); camera.updateMatrixWorld(true);
  const projected = corners.map(point => point.clone().applyMatrix4(camera.matrixWorldInverse));
  const bounds = new THREE.Box3().setFromPoints(projected);
  const lightView = camera.matrixWorldInverse.clone(), planes: THREE.Plane[] = [];
  let extent = 0;
  if (camera instanceof THREE.OrthographicCamera) {
    const padding = sphere.radius * Math.tan((lamp.angle ?? 0) * .5);
    // Quantized scale and an origin snapped in the light's fixed world basis
    // keep moving-camera samples on the same shadow texels.
    extent = 2 ** Math.ceil(Math.log2(Math.max(1, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y) + padding * 2));
    const texel = extent / shadow.target.width;
    const centreX = Math.round((bounds.min.x + bounds.max.x) * .5 / texel) * texel;
    const centreY = Math.round((bounds.min.y + bounds.max.y) * .5 / texel) * texel;
    const left = centreX - extent * .5, right = centreX + extent * .5;
    const bottom = centreY - extent * .5, top = centreY + extent * .5;
    planes.push(new THREE.Plane(new THREE.Vector3(1, 0, 0), -left), new THREE.Plane(new THREE.Vector3(-1, 0, 0), right),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -bottom), new THREE.Plane(new THREE.Vector3(0, -1, 0), top));
    camera.position.set(0, 0, 0)
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), centreX)
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), centreY);
    camera.left = camera.bottom = -extent * .5; camera.right = camera.top = extent * .5;
  } else {
    let tangent = 0;
    for (const point of projected) if (point.z < -.001) tangent = Math.max(tangent, Math.abs(point.x / point.z), Math.abs(point.y / point.z));
    camera.fov = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(tangent * 1.05)), 1, 179);
    const slope = Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
    planes.push(new THREE.Plane(new THREE.Vector3(1, 0, -slope), 0), new THREE.Plane(new THREE.Vector3(-1, 0, -slope), 0),
      new THREE.Plane(new THREE.Vector3(0, 1, -slope), 0), new THREE.Plane(new THREE.Vector3(0, -1, -slope), 0),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), -.001));
    camera.aspect = 1;
  }
  planes.push(new THREE.Plane(new THREE.Vector3(0, 0, 1), -bounds.min.z));
  shadow.casters.clear();
  let casterMinimum = Infinity, casterMaximum = -Infinity;
  scene.traverse(object => {
    if (!isSourceCaster(object)) return;
    const range = shadowDepthRange(object, shadowGeometry(shadow, object, lightView), planes);
    if (!range) return;
    shadow.casters.add(object);
    casterMinimum = Math.min(casterMinimum, range[0]); casterMaximum = Math.max(casterMaximum, range[1]);
  });
  if (camera instanceof THREE.OrthographicCamera) {
    // Keep the depth encoding stable too. Remote triangles excluded above
    // cannot consume precision or change it as their textures enter the cache.
    const quantum = extent / 4;
    const minimum = Math.floor(Math.min(bounds.min.z, casterMinimum) / quantum) * quantum;
    const maximum = Math.ceil(Math.max(bounds.max.z, casterMaximum) / quantum) * quantum;
    camera.position.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2), maximum + .001);
    camera.near = .001; camera.far = Math.max(1, maximum - minimum + .001);
    shadow.frustum.set(extent, extent);
    shadow.parameters.set(camera.near, camera.far, Math.tan((lamp.angle ?? 0) * .5), 1);
  } else {
    camera.near = Math.max(.001, -(Number.isFinite(casterMaximum) ? casterMaximum : bounds.max.z) - .01);
    camera.far = Math.max(camera.near + 1, -(Number.isFinite(casterMinimum) ? casterMinimum : bounds.min.z) + .01);
    const diameter = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
    shadow.frustum.set(diameter, diameter);
    shadow.parameters.set(camera.near, camera.far, .5 * Math.max(lamp.size ?? 0, lamp.shape === 'RECTANGLE' || lamp.shape === 'ELLIPSE' ? lamp.size_y ?? 0 : lamp.size ?? 0), 0);
  }
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  shadow.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
}

let integratedGgx: THREE.DataTexture | undefined;

/** Integrate the Smith-GGX hemispherical BRDF, rather than fit a display color. */
function ggxIntegral() {
  if (integratedGgx) return integratedGgx;
  const size = 64, samples = 256;
  const data = new Uint16Array(size * size * 2);
  const radicalInverse = (value: number) => {
    let result = 0, fraction = .5;
    while (value) { result += (value & 1) * fraction; value >>>= 1; fraction *= .5; }
    return result;
  };
  const smith = (cosine: number, alpha2: number) => 2 * cosine / (cosine + Math.sqrt(alpha2 + (1 - alpha2) * cosine * cosine));
  for (let y = 0; y < size; y++) {
    const roughness = y / (size - 1), alpha2 = Math.max(1e-6, roughness ** 4);
    for (let x = 0; x < size; x++) {
      const nv = Math.max(1e-4, x / (size - 1)), vx = Math.sqrt(1 - nv * nv);
      let a = 0, b = 0;
      for (let sample = 0; sample < samples; sample++) {
        const u = (sample + .5) / samples, phi = 2 * Math.PI * radicalInverse(sample);
        const nh = Math.sqrt((1 - u) / (1 + (alpha2 - 1) * u));
        const hx = Math.sqrt(Math.max(0, 1 - nh * nh)) * Math.cos(phi);
        const vh = Math.max(0, vx * hx + nv * nh), nl = 2 * vh * nh - nv;
        if (nl <= 0) continue;
        const visibility = smith(nv, alpha2) * smith(nl, alpha2) * vh / Math.max(1e-8, nv * nh);
        const fresnel = (1 - vh) ** 5;
        a += (1 - fresnel) * visibility; b += fresnel * visibility;
      }
      data[(y * size + x) * 2] = THREE.DataUtils.toHalfFloat(a / samples);
      data[(y * size + x) * 2 + 1] = THREE.DataUtils.toHalfFloat(b / samples);
    }
  }
  integratedGgx = new THREE.DataTexture(data, size, size, THREE.RGFormat, THREE.HalfFloatType);
  integratedGgx.colorSpace = THREE.NoColorSpace;
  integratedGgx.minFilter = integratedGgx.magFilter = THREE.LinearFilter;
  integratedGgx.wrapS = integratedGgx.wrapT = THREE.ClampToEdgeWrapping;
  integratedGgx.generateMipmaps = false; integratedGgx.needsUpdate = true;
  return integratedGgx;
}

export async function loadSourceRenderSettings(base: string, manifest: SceneManifest, signal: AbortSignal) {
  const response = await fetch(`${base}${manifest.sourceRenderSettings ?? 'render-settings.json'}`, { signal });
  if (!response.ok) throw new Error(`画卷光影读取失败（${response.status}）`);
  const settings = await response.json() as SourceRenderSettings;
  if (settings.version !== 1 || settings.sourceSha256 !== manifest.sourceSha256 || settings.sourceRevision !== manifest.sourceRevision) throw new Error('画卷与光影来源不一致。');
  if (settings.colorManagement.viewTransform !== 'Standard' || settings.colorManagement.look !== 'None') throw new Error('此源画卷的色彩变换尚未接入。');
  return settings;
}

/** Source energy stays in scene units; image emission is evaluated separately by its node graph. */
export function createSourceLighting(settings: SourceRenderSettings): SourceLightingState {
  const vectors = (v: number[]) => new THREE.Vector3().fromArray(v);
  let profile = renderQualityProfile('720p');
  const uniforms: Record<string, THREE.IUniform> = {
    sourceWorldRadiance: { value: vectors(settings.world.color).multiplyScalar(settings.world.strength) },
    sourceGgxIntegral: { value: ggxIntegral() },
    sourceShadowsEnabled: { value: 0 },
    sourceShadowRasterHalfStep: { value: 0 },
    sourceShadowMapSize: { value: profile.shadowMapSize },
    sourceShadowSampleCount: { value: profile.shadowSamples },
    sourceSunSampleCount: { value: profile.sunSamples },
    sourceAreaSampleCount: { value: profile.areaSamples },
    sourceAreaColumns: { value: profile.areaSamples / 4 },
  };
  const shadows: LampShadow[] = [];
  const declarations: string[] = [], contributions: string[] = [];
  for (const [i, lamp] of settings.lights.entries()) {
    const prefix = `nativeLamp${i}`;
    const color = new THREE.Vector3().fromArray(lamp.color).multiplyScalar(lamp.energy);
    uniforms[`${prefix}Color`] = { value: color };
    uniforms[`${prefix}Factors`] = { value: new THREE.Vector2(lamp.diffuse_factor ?? 1, lamp.specular_factor ?? 1) };
    declarations.push(`uniform vec3 ${prefix}Color;uniform vec2 ${prefix}Factors;`);
    let visibility = '1.0';
    if (lamp.use_shadow && (lamp.type === 'SUN' || lamp.type === 'AREA')) {
      const shadow = createLampShadow(lamp, prefix); shadows.push(shadow);
      uniforms[`${prefix}Shadow`] = { value: null };
      uniforms[`${prefix}ShadowMatrix`] = { value: shadow.matrix };
      uniforms[`${prefix}ShadowFrustum`] = { value: shadow.frustum };
      uniforms[`${prefix}ShadowParameters`] = { value: shadow.parameters };
      declarations.push(`uniform sampler2D ${prefix}Shadow;uniform mat4 ${prefix}ShadowMatrix;uniform vec2 ${prefix}ShadowFrustum;uniform vec4 ${prefix}ShadowParameters;`);
      visibility = `sourceShadowVisibility(${prefix}Shadow,${prefix}ShadowMatrix,${prefix}ShadowFrustum,${prefix}ShadowParameters)`;
    }
    if (lamp.type === 'SUN') {
      uniforms[`${prefix}Direction`] = { value: vectors(lamp.direction).negate().normalize() };
      declarations.push(`uniform vec3 ${prefix}Direction;`);
      uniforms[`${prefix}X`] = { value: vectors(lamp.axisX).normalize() };
      uniforms[`${prefix}Y`] = { value: vectors(lamp.axisY).normalize() };
      const radius = THREE.MathUtils.clamp(Math.tan((lamp.angle ?? 0) * .5), .001, 20);
      uniforms[`${prefix}CosRadius`] = { value: 1 / Math.sqrt(1 + radius * radius) };
      declarations.push(`uniform vec3 ${prefix}X,${prefix}Y;uniform float ${prefix}CosRadius;`);
      contributions.push(`{float visibility=${visibility};for(int sampleIndex=0;sampleIndex<16;sampleIndex++){
        if(sampleIndex>=sourceSunSampleCount)break;
        float cosine=mix(1.0,${prefix}CosRadius,(float(sampleIndex)+.5)/float(sourceSunSampleCount));
        float radius=sqrt(max(0.0,1.0-cosine*cosine));
        float angle=float(sampleIndex)*2.399963229728653;
        vec3 L=normalize(cosine*${prefix}Direction+radius*(cos(angle)*${prefix}X+sin(angle)*${prefix}Y));
        sourceIncident(N,V,L,${prefix}Color*(2.0*visibility/(float(sourceSunSampleCount)*(1.0+${prefix}CosRadius))),${prefix}Factors,roughness,F0,evaluateSpecular,diffuseRadiance,specularRadiance);
      }}`);
    } else if (lamp.type === 'AREA') {
      uniforms[`${prefix}Position`] = { value: vectors(lamp.position) };
      uniforms[`${prefix}Direction`] = { value: vectors(lamp.direction).normalize() };
      uniforms[`${prefix}X`] = { value: vectors(lamp.axisX).multiplyScalar(lamp.size ?? 1) };
      const circular = lamp.shape === 'DISK' || lamp.shape === 'ELLIPSE';
      const height = lamp.shape === 'RECTANGLE' || lamp.shape === 'ELLIPSE' ? lamp.size_y ?? lamp.size ?? 1 : lamp.size ?? 1;
      uniforms[`${prefix}Y`] = { value: vectors(lamp.axisY).multiplyScalar(height) };
      declarations.push(`uniform vec3 ${prefix}Position,${prefix}Direction,${prefix}X,${prefix}Y;`);
      // Uniform emitter samples preserve native DISK/ELLIPSE/rectangle size and
      // one-sided emission. normalize=true expresses total power in watts.
      const emitterArea = (lamp.size ?? 1) * height * (circular ? Math.PI / 4 : 1);
      const normalization = lamp.normalize === false ? emitterArea : 1;
      contributions.push(`{float visibility=${visibility};for(int sampleIndex=0;sampleIndex<32;sampleIndex++){
        if(sampleIndex>=sourceAreaSampleCount)break;
        ${circular
          ? 'float radius=.5*sqrt((float(sampleIndex)+.5)/float(sourceAreaSampleCount));float angle=float(sampleIndex)*2.399963229728653;vec2 emitterPoint=radius*vec2(cos(angle),sin(angle));'
          : 'int x=sampleIndex-sourceAreaColumns*(sampleIndex/sourceAreaColumns);int y=sampleIndex/sourceAreaColumns;vec2 emitterPoint=vec2((float(x)+.5)/float(sourceAreaColumns)-.5,(float(y)+.5)/4.0-.5);'}
        vec3 lightPosition=${prefix}Position+${prefix}X*emitterPoint.x+${prefix}Y*emitterPoint.y;
        vec3 delta=lightPosition-vSourceWorldPosition;float distance2=max(dot(delta,delta),1e-8);vec3 L=delta*inversesqrt(distance2);
        vec3 incident=${prefix}Color*(visibility*${normalization.toPrecision(12)})*max(dot(${prefix}Direction,-L),0.0)/(float(sourceAreaSampleCount)*SOURCE_LIGHT_PI*distance2);
        sourceIncident(N,V,L,incident,${prefix}Factors,roughness,F0,evaluateSpecular,diffuseRadiance,specularRadiance);
      }}`);
    } else if (lamp.type === 'POINT') {
      uniforms[`${prefix}Position`] = { value: vectors(lamp.position) };
      declarations.push(`uniform vec3 ${prefix}Position;`);
      contributions.push(`{vec3 delta=${prefix}Position-vSourceWorldPosition;float distance2=max(dot(delta,delta),1e-8);
        sourceIncident(N,V,normalize(delta),${prefix}Color/(4.0*SOURCE_LIGHT_PI*distance2),${prefix}Factors,roughness,F0,evaluateSpecular,diffuseRadiance,specularRadiance);}`);
    } else throw new Error(`源灯类型尚未接入：${lamp.type}`);
  }
  const requiredCasters = new Set<THREE.Mesh>();
  let rasterContext: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  let rasterBits: number | null = null;
  const collectCasters = (scene: THREE.Scene, viewCamera: THREE.PerspectiveCamera, focusDistance: number) => {
    requiredCasters.clear();
    scene.updateMatrixWorld(true);
    for (const shadow of shadows) {
      fitLampShadow(shadow, scene, viewCamera, focusDistance);
      for (const mesh of shadow.casters) requiredCasters.add(mesh);
    }
    return requiredCasters;
  };
  return { uniforms, requiredShadowCasters: collectCasters, get shadowSubpixelBits() { return rasterBits; },
    setRenderQuality(quality) {
      profile = renderQualityProfile(quality);
      uniforms.sourceShadowMapSize.value = profile.shadowMapSize;
      uniforms.sourceShadowSampleCount.value = profile.shadowSamples;
      uniforms.sourceSunSampleCount.value = profile.sunSamples;
      uniforms.sourceAreaSampleCount.value = profile.areaSamples;
      uniforms.sourceAreaColumns.value = profile.areaSamples / 4;
      if (rasterBits !== null) uniforms.sourceShadowRasterHalfStep.value = .5 / (profile.shadowMapSize * 2 ** rasterBits);
      for (const shadow of shadows) if (shadow.target.width !== profile.shadowMapSize) shadow.target.setSize(profile.shadowMapSize, profile.shadowMapSize);
    },
    prepareShadows(renderer, scene, materials, viewCamera, focusDistance) {
      if (!shadows.length) return;
      const gl = renderer.getContext();
      if (gl !== rasterContext) {
        const bits: unknown = gl.getParameter(gl.SUBPIXEL_BITS);
        if (typeof bits !== 'number' || !Number.isFinite(bits) || bits < 0) throw new Error('阴影栅格精度读取失败。');
        rasterContext = gl; rasterBits = bits;
        uniforms.sourceShadowRasterHalfStep.value = .5 / (profile.shadowMapSize * 2 ** bits);
      }
      collectCasters(scene, viewCamera, focusDistance);
      const visibility = new Map<THREE.Mesh, boolean>();
      scene.traverse(object => { if (object instanceof THREE.Mesh) visibility.set(object, object.visible); });
      const target = renderer.getRenderTarget(), viewport = renderer.getViewport(new THREE.Vector4());
      const scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest();
      const clearColor = renderer.getClearColor(new THREE.Color()).clone(), clearAlpha = renderer.getClearAlpha();
      const background = scene.background, autoClear = renderer.autoClear;
      uniforms.sourceShadowsEnabled.value = 0;
      for (const shadow of shadows) uniforms[`${shadow.prefix}Shadow`].value = null;
      try {
        materials.setPass('depth'); scene.background = null; renderer.autoClear = true;
        renderer.setScissorTest(false); renderer.setClearColor(0, 0); scene.updateMatrixWorld(true);
        for (const shadow of shadows) {
          for (const [mesh, visible] of visibility) mesh.visible = visible && shadow.casters.has(mesh);
          renderer.setRenderTarget(shadow.target);
          renderer.clear(true, true, false); renderer.render(scene, shadow.camera);
        }
      } finally {
        for (const [mesh, visible] of visibility) mesh.visible = visible;
        materials.setPass('color'); scene.background = background; renderer.autoClear = autoClear;
        renderer.setRenderTarget(target); renderer.setClearColor(clearColor, clearAlpha);
        renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        for (const shadow of shadows) uniforms[`${shadow.prefix}Shadow`].value = shadow.target.depthTexture;
        uniforms.sourceShadowsEnabled.value = 1;
      }
    },
    dispose() { requiredCasters.clear(); for (const shadow of shadows) { shadow.casters.clear(); shadow.target.depthTexture?.dispose(); shadow.target.dispose(); } },
    fragment: `
    const float SOURCE_LIGHT_PI=3.141592653589793;
    uniform vec3 sourceWorldRadiance;uniform sampler2D sourceGgxIntegral;uniform float sourceShadowsEnabled,sourceShadowRasterHalfStep;
    uniform float sourceShadowMapSize;
    uniform int sourceShadowSampleCount,sourceSunSampleCount,sourceAreaSampleCount,sourceAreaColumns;
    ${declarations.join('\n')}
    float sourceShadowDistance(float depth,vec4 parameters){
      return parameters.w>.5?mix(parameters.x,parameters.y,depth):parameters.x*parameters.y/max(1e-6,parameters.y-depth*(parameters.y-parameters.x));
    }
    float sourceShadowVisibility(sampler2D map,mat4 projection,vec2 frustum,vec4 parameters){
      if(sourceShadowsEnabled<.5||sourceRenderPass>1.5)return 1.0;
      vec4 clip=projection*vec4(vSourceWorldPosition,1.0);vec3 p=clip.xyz/clip.w*.5+.5;
      // Transform the receiver's screen derivatives into light-UV depth slopes.
      // PCF samples on a sloped sheet must compare its depth at each sampled
      // texel centre, rather than the centre fragment's depth. Otherwise the
      // same sheet incorrectly shadows itself across most of the filter disk.
      // World derivatives are evaluated before the material's peel discard.
      // Transform them analytically instead of differentiating a depth near 1
      // after divergent fragment termination and subtracting rounded values.
      vec4 clipDx=projection*vec4(sourceWorldDx,0.0),clipDy=projection*vec4(sourceWorldDy,0.0);
      vec3 dx=.5*(clipDx.xyz-(clip.xyz/clip.w)*clipDx.w)/clip.w;
      vec3 dy=.5*(clipDy.xyz-(clip.xyz/clip.w)*clipDy.w)/clip.w;
      float determinant=dx.x*dy.y-dx.y*dy.x;
      vec2 depthGradient=abs(determinant)>1e-16
        ?vec2(dx.z*dy.y-dx.y*dy.z,dx.x*dy.z-dx.z*dy.x)/determinant:vec2(0.0);
      if(p.x<=0.0||p.y<=0.0||p.x>=1.0||p.y>=1.0||p.z<=0.0||p.z>=1.0)return 1.0;
      float mapSize=sourceShadowMapSize;
      // Vertices are snapped to the GPU's SUBPIXEL_BITS grid before raster
      // interpolation. Correcting with the ideal receiver plane leaves a
      // slope-dependent residual even with a perfect DEPTH_COMPONENT24 map.
      // Barycentric weights sum to one, so half a raster grid step per axis
      // bounds that residual. Add only two depth quanta for depth rounding.
      float depthBias=2.0/16777215.0+dot(abs(depthGradient),vec2(sourceShadowRasterHalfStep));
      vec2 centreUv=(clamp(floor(p.xy*mapSize),vec2(0.0),vec2(mapSize-1.0))+.5)/mapSize;
      float centreDepth=texture2D(map,centreUv).r-dot(depthGradient,centreUv-p.xy);
      float receiver=sourceShadowDistance(p.z,parameters),blocker=sourceShadowDistance(centreDepth,parameters);
      float separation=max(0.0,receiver-blocker);
      float penumbra=parameters.z*separation/(parameters.w>.5?1.0:max(1e-5,blocker));
      vec2 filterRadius=max(vec2(.75/mapSize),vec2(penumbra)/max(vec2(1e-5),frustum*(parameters.w>.5?1.0:receiver)));
      float visibility=0.0;
      for(int sampleIndex=0;sampleIndex<16;sampleIndex++){
        if(sampleIndex>=sourceShadowSampleCount)break;
        float radius=sqrt((float(sampleIndex)+.5)/float(sourceShadowSampleCount)),angle=float(sampleIndex)*2.399963229728653;
        vec2 uv=p.xy+filterRadius*radius*vec2(cos(angle),sin(angle));
        vec2 texelUv=(clamp(floor(uv*mapSize),vec2(0.0),vec2(mapSize-1.0))+.5)/mapSize;
        float depth=texture2D(map,texelUv).r;
        float receiverDepth=p.z+dot(depthGradient,texelUv-p.xy);
        visibility+=receiverDepth-depthBias<=depth?1.0:0.0;
      }
      return visibility/float(sourceShadowSampleCount);
    }
    float sourceSmithG1(float nx,float alpha2){
      return 2.0*nx/max(1e-8,nx+sqrt(alpha2+(1.0-alpha2)*nx*nx));
    }
    vec3 sourceFresnel(vec3 F0,float vh){return F0+(vec3(1.0)-F0)*pow(1.0-clamp(vh,0.0,1.0),5.0);}
    void sourceIncident(vec3 N,vec3 V,vec3 L,vec3 incident,vec2 factors,float roughness,vec3 F0,bool evaluateSpecular,inout vec3 diffuseRadiance,inout vec3 specularRadiance){
      float nl=max(0.0,dot(N,L));
      diffuseRadiance+=incident*(nl/SOURCE_LIGHT_PI)*factors.x;
      if(evaluateSpecular&&nl>0.0){
        float nv=max(1e-5,dot(N,V));vec3 H=normalize(V+L);
        float nh=max(0.0,dot(N,H)),vh=max(0.0,dot(V,H));
        float alpha2=max(1e-6,pow(clamp(roughness,0.0,1.0),4.0));
        float denominator=1.0+(alpha2-1.0)*nh*nh;
        float distribution=alpha2/(SOURCE_LIGHT_PI*denominator*denominator);
        float visibility=sourceSmithG1(nv,alpha2)*sourceSmithG1(nl,alpha2)/(4.0*nv);
        specularRadiance+=incident*sourceFresnel(F0,vh)*distribution*visibility*factors.y;
      }
    }
    void sourceDirectLighting(vec3 N,vec3 V,float roughness,vec3 F0,bool evaluateSpecular,out vec3 diffuseRadiance,out vec3 specularRadiance){
      diffuseRadiance=vec3(0.0);specularRadiance=vec3(0.0);
      if(sourceRenderPass>1.5)return;
      ${contributions.join('\n')}
    }
    vec3 sourceLighting(vec3 worldNormal){
      if(sourceRenderPass>1.5)return vec3(0.0);
      vec3 diffuseRadiance,specularRadiance;
      sourceDirectLighting(normalize(worldNormal),normalize(cameraPosition-vSourceWorldPosition),1.0,vec3(0.0),false,diffuseRadiance,specularRadiance);
      return sourceWorldRadiance+diffuseRadiance;
    }
    vec3 sourceDiffuse(vec3 base,float roughness,vec3 worldNormal){
      // EEVEE 5.2 uses Lambert for Diffuse BSDF; its roughness input is Cycles-only.
      return base*sourceLighting(worldNormal);
    }
    vec3 sourcePrincipled(vec3 base,float roughness,float metallic,float ior,float specularIorLevel,vec3 specularTint,vec3 worldNormal){
      if(sourceRenderPass>1.5)return vec3(0.0);
      vec3 N=normalize(worldNormal),V=normalize(cameraPosition-vSourceWorldPosition);
      float eta=max(ior,1e-5);float f0=pow((eta-1.0)/(eta+1.0),2.0)*2.0*max(specularIorLevel,0.0);
      vec3 F0=mix(clamp(vec3(f0)*max(specularTint,vec3(0.0)),0.0,1.0),clamp(base,0.0,1.0),clamp(metallic,0.0,1.0));
      vec2 integral=texture2D(sourceGgxIntegral,vec2(.5/64.0)+(63.0/64.0)*vec2(max(0.0,dot(N,V)),clamp(roughness,0.0,1.0))).rg;
      vec3 single=F0*integral.x+vec3(integral.y);float missing=max(0.0,1.0-integral.x-integral.y);
      vec3 averageFresnel=F0+(vec3(1.0)-F0)/21.0;
      vec3 multiple=single*averageFresnel/max(vec3(1e-5),vec3(1.0)-missing*averageFresnel);
      vec3 reflectance=clamp(single+multiple*missing,0.0,1.0);
      vec3 diffuseRadiance,specularRadiance;
      sourceDirectLighting(N,V,roughness,F0,true,diffuseRadiance,specularRadiance);
      vec3 diffuseColor=base*(1.0-clamp(metallic,0.0,1.0))*(1.0-max(reflectance.r,max(reflectance.g,reflectance.b)));
      return diffuseColor*(sourceWorldRadiance+diffuseRadiance)+sourceWorldRadiance*reflectance+specularRadiance;
    }` };
}

import * as THREE from 'three';
import type { SceneManifest } from '../types';
import type { SourceLighting, SourceMaterialLibrary } from './SourceMaterial';

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
  prepareShadows(renderer: THREE.WebGLRenderer, scene: THREE.Scene, materials: SourceMaterialLibrary,
    viewCamera: THREE.PerspectiveCamera, focusDistance: number): void;
  dispose(): void;
}

interface LampShadow {
  prefix: string; lamp: NativeLamp; target: THREE.WebGLRenderTarget;
  camera: THREE.OrthographicCamera | THREE.PerspectiveCamera;
  matrix: THREE.Matrix4; frustum: THREE.Vector2; parameters: THREE.Vector4;
}

function createLampShadow(lamp: NativeLamp, prefix: string): LampShadow {
  const size = 2048;
  const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  target.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
  target.depthTexture.minFilter = target.depthTexture.magFilter = THREE.NearestFilter;
  target.texture.generateMipmaps = false;
  const camera = lamp.type === 'SUN' ? new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 1000)
    : new THREE.PerspectiveCamera(175, 1, .01, 1000);
  return { prefix, lamp, target, camera, matrix: new THREE.Matrix4(),
    frustum: new THREE.Vector2(), parameters: new THREE.Vector4() };
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
  const region = new THREE.Box3().setFromPoints(corners), sphere = region.getBoundingSphere(new THREE.Sphere());
  camera.up.fromArray(lamp.axisY).normalize();
  if (lamp.type === 'SUN') camera.position.copy(sphere.center).addScaledVector(direction, -Math.max(1, sphere.radius * 2));
  else camera.position.fromArray(lamp.position);
  camera.lookAt(camera.position.clone().add(direction)); camera.updateMatrixWorld(true);
  const projected = corners.map(point => point.clone().applyMatrix4(camera.matrixWorldInverse));
  const bounds = new THREE.Box3().setFromPoints(projected);
  const casters = new THREE.Box3();
  scene.traverseVisible(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const box = new THREE.Box3().setFromObject(object, false);
    if (box.isEmpty()) return;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      casters.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse));
    }
  });
  if (!casters.isEmpty()) { bounds.min.z = Math.min(bounds.min.z, casters.min.z); bounds.max.z = Math.max(bounds.max.z, casters.max.z); }
  if (camera instanceof THREE.OrthographicCamera) {
    const padding = sphere.radius * Math.tan((lamp.angle ?? 0) * .5);
    camera.left = bounds.min.x - padding; camera.right = bounds.max.x + padding;
    camera.bottom = bounds.min.y - padding; camera.top = bounds.max.y + padding;
    const shift = Math.max(0, bounds.max.z + .01);
    camera.position.addScaledVector(direction, -shift); camera.updateMatrixWorld(true);
    camera.near = .001; camera.far = Math.max(1, -bounds.min.z + shift + .01);
    shadow.frustum.set(camera.right - camera.left, camera.top - camera.bottom);
    shadow.parameters.set(camera.near, camera.far, Math.tan((lamp.angle ?? 0) * .5), 1);
  } else {
    let tangent = 0;
    for (const point of projected) if (point.z < -.001) tangent = Math.max(tangent, Math.abs(point.x / point.z), Math.abs(point.y / point.z));
    camera.fov = THREE.MathUtils.clamp(2 * THREE.MathUtils.radToDeg(Math.atan(tangent * 1.05)), 1, 179);
    // A perspective map needs its near plane close to actual receivers/casters.
    // An arbitrary .001 near plane wastes almost all fixed-point precision for
    // sheets tens of scene units from an AREA light.
    camera.near = Math.max(.001, -bounds.max.z - .01);
    camera.far = Math.max(camera.near + 1, -bounds.min.z + .01); camera.aspect = 1;
    const diameter = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * .5));
    shadow.frustum.set(diameter, diameter);
    shadow.parameters.set(camera.near, camera.far, .5 * Math.max(lamp.size ?? 0, lamp.shape === 'RECTANGLE' || lamp.shape === 'ELLIPSE' ? lamp.size_y ?? 0 : lamp.size ?? 0), 0);
  }
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
  const uniforms: Record<string, THREE.IUniform> = {
    sourceWorldRadiance: { value: vectors(settings.world.color).multiplyScalar(settings.world.strength) },
    sourceGgxIntegral: { value: ggxIntegral() },
    sourceShadowsEnabled: { value: 0 },
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
        float cosine=mix(1.0,${prefix}CosRadius,(float(sampleIndex)+.5)/16.0);
        float radius=sqrt(max(0.0,1.0-cosine*cosine));
        float angle=float(sampleIndex)*2.399963229728653;
        vec3 L=normalize(cosine*${prefix}Direction+radius*(cos(angle)*${prefix}X+sin(angle)*${prefix}Y));
        sourceIncident(N,V,L,${prefix}Color*(2.0*visibility/(16.0*(1.0+${prefix}CosRadius))),${prefix}Factors,roughness,F0,evaluateSpecular,diffuseRadiance,specularRadiance);
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
        ${circular
          ? 'float radius=.5*sqrt((float(sampleIndex)+.5)/32.0);float angle=float(sampleIndex)*2.399963229728653;vec2 emitterPoint=radius*vec2(cos(angle),sin(angle));'
          : 'int x=sampleIndex-8*(sampleIndex/8);int y=sampleIndex/8;vec2 emitterPoint=vec2((float(x)+.5)/8.0-.5,(float(y)+.5)/4.0-.5);'}
        vec3 lightPosition=${prefix}Position+${prefix}X*emitterPoint.x+${prefix}Y*emitterPoint.y;
        vec3 delta=lightPosition-vSourceWorldPosition;float distance2=max(dot(delta,delta),1e-8);vec3 L=delta*inversesqrt(distance2);
        vec3 incident=${prefix}Color*(visibility*${normalization.toPrecision(12)})*max(dot(${prefix}Direction,-L),0.0)/(32.0*SOURCE_LIGHT_PI*distance2);
        sourceIncident(N,V,L,incident,${prefix}Factors,roughness,F0,evaluateSpecular,diffuseRadiance,specularRadiance);
      }}`);
    } else if (lamp.type === 'POINT') {
      uniforms[`${prefix}Position`] = { value: vectors(lamp.position) };
      declarations.push(`uniform vec3 ${prefix}Position;`);
      contributions.push(`{vec3 delta=${prefix}Position-vSourceWorldPosition;float distance2=max(dot(delta,delta),1e-8);
        sourceIncident(N,V,normalize(delta),${prefix}Color/(4.0*SOURCE_LIGHT_PI*distance2),${prefix}Factors,roughness,F0,evaluateSpecular,diffuseRadiance,specularRadiance);}`);
    } else throw new Error(`源灯类型尚未接入：${lamp.type}`);
  }
  return { uniforms,
    prepareShadows(renderer, scene, materials, viewCamera, focusDistance) {
      if (!shadows.length) return;
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
          fitLampShadow(shadow, scene, viewCamera, focusDistance);
          renderer.setRenderTarget(shadow.target);
          renderer.clear(true, true, false); renderer.render(scene, shadow.camera);
        }
      } finally {
        materials.setPass('color'); scene.background = background; renderer.autoClear = autoClear;
        renderer.setRenderTarget(target); renderer.setClearColor(clearColor, clearAlpha);
        renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        for (const shadow of shadows) uniforms[`${shadow.prefix}Shadow`].value = shadow.target.depthTexture;
        uniforms.sourceShadowsEnabled.value = 1;
      }
    },
    dispose() { for (const shadow of shadows) { shadow.target.depthTexture?.dispose(); shadow.target.dispose(); } },
    fragment: `
    const float SOURCE_LIGHT_PI=3.141592653589793;
    uniform vec3 sourceWorldRadiance;uniform sampler2D sourceGgxIntegral;uniform float sourceShadowsEnabled;
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
      vec3 dx=dFdx(p),dy=dFdy(p);
      float determinant=dx.x*dy.y-dx.y*dy.x;
      vec2 depthGradient=abs(determinant)>1e-16
        ?vec2(dx.z*dy.y-dx.y*dy.z,dx.x*dy.z-dx.z*dy.x)/determinant:vec2(0.0);
      if(p.x<=0.0||p.y<=0.0||p.x>=1.0||p.y>=1.0||p.z<=0.0||p.z>=1.0)return 1.0;
      const float mapSize=2048.0;
      // WebGL's UnsignedInt depth attachment uses DEPTH_COMPONENT24. Keep a
      // two-quantum rounding allowance in that normalized encoding; world-space
      // precision follows the actual near/far range above for both projections.
      const float depthBias=2.0/16777215.0;
      vec2 centreUv=(clamp(floor(p.xy*mapSize),vec2(0.0),vec2(mapSize-1.0))+.5)/mapSize;
      float centreDepth=texture2D(map,centreUv).r-dot(depthGradient,centreUv-p.xy);
      float receiver=sourceShadowDistance(p.z,parameters),blocker=sourceShadowDistance(centreDepth,parameters);
      float separation=max(0.0,receiver-blocker);
      float penumbra=parameters.z*separation/(parameters.w>.5?1.0:max(1e-5,blocker));
      vec2 filterRadius=max(vec2(.75/2048.0),vec2(penumbra)/max(vec2(1e-5),frustum*(parameters.w>.5?1.0:receiver)));
      float visibility=0.0;
      for(int sampleIndex=0;sampleIndex<16;sampleIndex++){
        float radius=sqrt((float(sampleIndex)+.5)/16.0),angle=float(sampleIndex)*2.399963229728653;
        vec2 uv=p.xy+filterRadius*radius*vec2(cos(angle),sin(angle));
        vec2 texelUv=(clamp(floor(uv*mapSize),vec2(0.0),vec2(mapSize-1.0))+.5)/mapSize;
        float depth=texture2D(map,texelUv).r;
        float receiverDepth=p.z+dot(depthGradient,texelUv-p.xy);
        visibility+=receiverDepth-depthBias<=depth?1.0:0.0;
      }
      return visibility/16.0;
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

import * as THREE from 'three';
import type { SceneManifest } from '../types';
import { SOURCE_NOISE_3D } from './SourceNoise3D';
import { decodeTextureImage } from './texturePreparation';

/** Native shader fields contain linear half floats, never display encoded PNGs. */
interface NativeField {
  uniform: string; url: string; encoding: 'image' | 'gzip-float16-le';
  width?: number; height?: number; channels?: number; colorSpace?: string;
  extension?: 'CLIP' | 'EXTEND' | 'REPEAT' | 'MIRROR';
}
interface Sample { frame: number; value: number | number[] }
interface SourceTrack { id?: string; samples: Sample[]; sourceTree?: string; sourcePath?: string }
interface Program {
  materialName: string; objectName: string; body: string; opaque?: boolean;
  surfaceRenderMethod: 'DITHERED' | 'BLENDED';
  uvMapping: { mode: 'authored' | 'local-axes' | 'local-strip'; axes?: number[]; min?: number[] | number; size?: number[] | number;
    axis?: number; crossAxes?: number[]; sections?: { point: number[]; distance: number }[]; length?: number };
  uniforms: Record<string, { kind: string; track?: string; coordinateObject?: string }>;
  fields: NativeField[];
}
interface NativeMaterialData {
  version: number; sourceRevision: string; sourceSha256: string; frameRange: [number, number];
  programs: Record<string, Program>; tracks: Record<string, SourceTrack>;
  coordinateTracks: Record<string, SourceTrack>;
}
export interface SourceFieldBinding { url: string; prepare?(texture: THREE.Texture): THREE.Texture | undefined; assign(texture: THREE.Texture | null): void }
export interface SourceLighting {
  /** Defines sourceLighting, sourceDiffuse and sourcePrincipled source closures. */
  fragment: string;
  uniforms?: Record<string, THREE.IUniform>;
}

const FUNCTIONS = `
float sourceDivide(float a,float b){return b==0.0?0.0:a/b;}
float sourceSmooth(float t){return t*t*(3.0-2.0*t);}
float sourceSmoother(float t){return t*t*t*(t*(t*6.0-15.0)+10.0);}
float sourceImageCoverage(vec2 uv){return float(all(greaterThanEqual(uv,vec2(0.0)))&&all(lessThanEqual(uv,vec2(1.0))));}
vec3 sourceBump(vec3 N,float height,float heightDx,float heightDy,float strength,float distance,float filterWidth){
  vec3 dx=dFdx(vSourceWorldPosition),dy=dFdy(vSourceWorldPosition);
  vec3 rx=cross(dy,N),ry=cross(N,dx);
  float determinant=dot(dx,rx);
  if(abs(determinant)<1e-12)return N;
  vec3 gradient=sign(determinant)*((heightDx-height)*rx+(heightDy-height)*ry)*distance;
  vec3 bumped=normalize(max(filterWidth,1e-8)*abs(determinant)*N-gradient);
  return normalize(mix(N,bumped,clamp(strength,0.0,1.0)));
}
`;

function sampleAt(track: SourceTrack, frame: number): number | number[] {
  const samples = track.samples;
  if (!samples.length) throw new Error('源材质参数轨为空。');
  if (frame <= samples[0].frame) return samples[0].value;
  if (frame >= samples.at(-1)!.frame) return samples.at(-1)!.value;
  let low = 0, high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].frame <= frame) low = middle; else high = middle;
  }
  const a = samples[low], b = samples[high], t = (frame - a.frame) / (b.frame - a.frame);
  if (typeof a.value === 'number' && typeof b.value === 'number') return THREE.MathUtils.lerp(a.value, b.value, t);
  if (Array.isArray(a.value) && Array.isArray(b.value)) return a.value.map((x, i) => THREE.MathUtils.lerp(x, (b.value as number[])[i], t));
  throw new Error('源材质参数轨类型不一致。');
}

/** Keeps source textures, procedural fields and source time under one owner. */
export class SourceMaterialLibrary {
  private bindings: { program: Program; uniforms: Record<string, THREE.IUniform>; material: THREE.MeshBasicMaterial }[] = [];
  private textureDefinitions = new Map<string, NativeField>();
  private imageSamplers = new Set<THREE.Texture>();
  private lighting: SourceLighting = { fragment: `
    vec3 sourceLighting(vec3 N){return vec3(0.0);}
    vec3 sourceDiffuse(vec3 base,float roughness,vec3 N){return vec3(0.0);}
    vec3 sourcePrincipled(vec3 base,float roughness,float metallic,float ior,float specular,vec3 tint,vec3 N){return vec3(0.0);}
  ` };
  private pass = { value: 0 };
  private imageLodBias = { value: 0 };
  private peelUniforms: Record<string, THREE.IUniform> = {
    sourcePeelPrevious: { value: null }, sourcePeelNext: { value: null },
    sourcePeelPresent: { value: new THREE.Vector2() }, sourcePeelSize: { value: new THREE.Vector2(1, 1) },
  };
  private disposed = false;
  private progress = 0;

  constructor(private base: string, _manifest: SceneManifest, private data: NativeMaterialData) {
    for (const program of Object.values(data.programs)) for (const field of program.fields) {
      this.textureDefinitions.set(this.absolute(field.url), field);
    }
  }

  private absolute(url: string) { return new URL(url, new URL(this.base, document.baseURI)).href; }

  configureLighting(lighting: SourceLighting) {
    this.lighting = lighting;
    for (const binding of this.bindings) binding.material.needsUpdate = true;
  }

  setImageLodBias(value: number) {
    if (!Number.isFinite(value)) throw new Error('源图像LOD偏移须为有限数。');
    this.imageLodBias.value = value;
  }

  /** Slice depths are hardware depth textures in the same camera/viewport. */
  setPeelDepths(previous: THREE.Texture | null, next: THREE.Texture | null, width: number, height: number) {
    if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('源深度分层尺寸无效。');
    this.peelUniforms.sourcePeelPrevious.value = previous;
    this.peelUniforms.sourcePeelNext.value = next;
    (this.peelUniforms.sourcePeelPresent.value as THREE.Vector2).set(previous ? 1 : 0, next ? 1 : 0);
    (this.peelUniforms.sourcePeelSize.value as THREE.Vector2).set(width, height);
  }

  setPass(pass: 'color' | 'glow' | 'depth' | 'dithered' | 'blended') {
    this.pass.value = pass === 'glow' ? 1 : pass === 'depth' ? 2 : pass === 'dithered' ? -1 : pass === 'blended' ? -2 : 0;
    const depth = pass === 'depth', dithered = pass === 'dithered', blended = pass === 'blended';
    for (const binding of this.bindings) {
      binding.material.visible = dithered ? binding.program.surfaceRenderMethod === 'DITHERED'
        : blended ? binding.program.surfaceRenderMethod === 'BLENDED' : true;
      const writesDepth=depth||dithered||(!blended&&!!binding.program.opaque);
      if (binding.material.transparent === writesDepth || binding.material.depthWrite !== writesDepth) {
        binding.material.transparent = !writesDepth;
        binding.material.depthWrite = writesDepth;
        binding.material.needsUpdate = true;
      }
    }
  }

  create(materialId: number, meshName: string, geometry: THREE.BufferGeometry) {
    const program = this.data.programs[`${materialId}:${meshName}`];
    if (!program) throw new Error(`源材质程序缺失：${meshName}`);
    const positions = geometry.getAttribute('position');
    const oldUv = geometry.getAttribute('uv');
    const materialUv = new Float32Array(positions.count * 2);
    const mapping = program.uvMapping;
    for (let i = 0; i < positions.count; i++) for (let axis = 0; axis < 2; axis++) {
      if (mapping.mode === 'local-axes') {
        materialUv[i * 2 + axis] = (positions.getComponent(i, mapping.axes![axis]) - (mapping.min as number[])[axis]) / (mapping.size as number[])[axis];
      } else if (mapping.mode === 'local-strip') {
        const point = mapping.crossAxes!.map(a => positions.getComponent(i, a));
        const section = mapping.sections!.reduce((best, item) => Math.hypot(...item.point.map((x, a) => x - point[a])) < Math.hypot(...best.point.map((x, a) => x - point[a])) ? item : best);
        materialUv[i * 2 + axis] = axis === 0
          ? (positions.getComponent(i, mapping.axis!) - (mapping.min as number)) / (mapping.size as number)
          : section.distance / mapping.length!;
      } else {
        if (!oldUv) throw new Error(`原材质缺少UV：${meshName}`);
        materialUv[i * 2 + axis] = oldUv.getComponent(i, axis);
      }
    }
    geometry.setAttribute('sourceMaterialUv', new THREE.BufferAttribute(materialUv, 2));
    const uniforms: Record<string, THREE.IUniform> = { sourceRenderPass: this.pass, sourceImageLodBias: this.imageLodBias,
      sourceNormalMatrix: { value: new THREE.Matrix3() }, ...this.peelUniforms };
    const declarations: string[] = [];
    for (const [name, definition] of Object.entries(program.uniforms)) {
      declarations.push(`uniform ${definition.kind} ${name};`);
      uniforms[name] = { value: definition.kind === 'mat4' ? new THREE.Matrix4() : definition.kind === 'vec3' ? new THREE.Vector3() : definition.kind === 'vec4' ? new THREE.Vector4() : 0 };
    }
    const fields: SourceFieldBinding[] = program.fields.map(field => {
      declarations.push(`uniform sampler2D ${field.uniform};`);
      uniforms[field.uniform] = { value: null };
      let sampler: THREE.Texture | undefined;
      let preparedImage: THREE.Texture | null = null;
      const prepare = (texture: THREE.Texture | null) => {
        if (texture === preparedImage) return sampler;
        if (sampler) { this.imageSamplers.delete(sampler); sampler.dispose(); sampler = undefined; }
        preparedImage = texture;
        if (texture && field.encoding === 'image') {
          // One source image can be used by both CLIP and REPEAT nodes. Keep
          // each node's sampler state without mutating the shared URL cache.
          sampler = texture.clone();
          sampler.wrapS = sampler.wrapT = field.extension === 'REPEAT' ? THREE.RepeatWrapping
            : field.extension === 'MIRROR' ? THREE.MirroredRepeatWrapping : THREE.ClampToEdgeWrapping;
          sampler.colorSpace = field.colorSpace === 'Non-Color' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
          sampler.needsUpdate = true; this.imageSamplers.add(sampler);
        }
        return sampler;
      };
      return { url: this.absolute(field.url), prepare, assign: texture => {
        uniforms[field.uniform].value = prepare(texture) ?? texture;
      } };
    });
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: !program.opaque,
      depthWrite: !!program.opaque, side: THREE.DoubleSide, alphaTest: 0, toneMapped: false });
    material.name = program.materialName;
    material.userData.sourceRenderMethod = program.surfaceRenderMethod;
    const header = `varying vec2 vSourceUv;varying vec3 vSourcePosition;varying vec3 vSourceWorldPosition;varying vec3 vSourceNormal;\n`;
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms, this.lighting.uniforms ?? {});
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\nattribute vec2 sourceMaterialUv;uniform mat3 sourceNormalMatrix;${header}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\nvec3 sourceObjectNormal=normal;\n#ifdef USE_MORPHNORMALS\nsourceObjectNormal*=morphTargetBaseInfluence;\nfor(int sourceMorph=0;sourceMorph<MORPHTARGETS_COUNT;sourceMorph++){sourceObjectNormal+=getMorph(gl_VertexID,sourceMorph,1).xyz*morphTargetInfluences[sourceMorph];}\n#endif\nvSourceUv=sourceMaterialUv;vSourcePosition=transformed;vSourceWorldPosition=(modelMatrix*vec4(transformed,1.0)).xyz;vSourceNormal=normalize(sourceNormalMatrix*sourceObjectNormal);`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${header}\nuniform float sourceRenderPass;uniform float sourceImageLodBias;\nuniform sampler2D sourcePeelPrevious,sourcePeelNext;uniform vec2 sourcePeelPresent,sourcePeelSize;\n${declarations.join('\n')}\n${SOURCE_NOISE_3D}\n${FUNCTIONS}\n${this.lighting.fragment}`)
        .replace('#include <map_fragment>', `
          if(sourceRenderPass<-.5){
            vec2 sourcePeelUv=gl_FragCoord.xy/sourcePeelSize;
            float previousDepth=sourcePeelPresent.x>.5?texture2D(sourcePeelPrevious,sourcePeelUv).r:0.0;
            if(gl_FragCoord.z<=previousDepth)discard;
            if(sourceRenderPass< -1.5){
              float nextDepth=sourcePeelPresent.y>.5?texture2D(sourcePeelNext,sourcePeelUv).r:1.0;
              if(gl_FragCoord.z>=nextDepth)discard;
            }
          }
          ${program.body}
          if(sourceRenderPass<-.5&&sourceSurface.a<=1e-6)discard;
          if(sourceRenderPass<-.5&&sourceRenderPass> -1.5){
            gl_FragColor=vec4(sourceSurface.rgb/sourceSurface.a,clamp(sourceSurface.a,0.0,1.0));return;
          }
          if(sourceRenderPass>1.5){if(sourceSurface.a<.5)discard;float z=-(viewMatrix*vec4(vSourceWorldPosition,1.0)).z;gl_FragColor=vec4(vec3(z),1.0);return;}
          else if(sourceRenderPass>.5){diffuseColor=vec4(sourceGlow,clamp(sourceSurface.a,0.0,1.0));}
          else{diffuseColor=vec4(sourceSurface.a>1e-8?sourceSurface.rgb/sourceSurface.a:vec3(0.0),clamp(sourceSurface.a,0.0,1.0));}`);
    };
    // Identical source programs can share linked GPU code while retaining each
    // material's own uniforms and textures. Geometry/UV data remain per object.
    material.customProgramCacheKey = () => `native-source:${program.body}\n${declarations.join('\n')}\n${this.lighting.fragment}`;
    material.onBeforeRender = (_renderer, _scene, _camera, _geometry, object) => {
      (uniforms.sourceNormalMatrix.value as THREE.Matrix3).getNormalMatrix(object.matrixWorld);
    };
    this.bindings.push({ program, uniforms, material });
    this.update(this.progress);
    return { material, fields };
  }

  update(sourceProgress: number) {
    if (this.disposed) return;
    this.progress = THREE.MathUtils.clamp(sourceProgress, 0, 1);
    const frame = THREE.MathUtils.lerp(this.data.frameRange[0], this.data.frameRange[1], this.progress);
    for (const { program, uniforms } of this.bindings) for (const [name, definition] of Object.entries(program.uniforms)) {
      const track = definition.track ? this.data.tracks[definition.track] : this.data.coordinateTracks[definition.coordinateObject!];
      if (!track) throw new Error(`源材质参数轨缺失：${program.materialName}/${name}`);
      const value = sampleAt(track, frame), uniform = uniforms[name];
      if (typeof value === 'number') uniform.value = value;
      else if (definition.kind === 'mat4') (uniform.value as THREE.Matrix4).fromArray(value);
      else if (definition.kind === 'vec3') (uniform.value as THREE.Vector3).fromArray(value);
      else if (definition.kind === 'vec4') (uniform.value as THREE.Vector4).fromArray(value);
      else throw new Error(`源材质参数类型不受支持：${definition.kind}`);
    }
  }

  async loadTexture(url: string, signal?: AbortSignal): Promise<THREE.Texture> {
    const definition = this.textureDefinitions.get(url);
    if (!definition) throw new Error('未知的源材质贴图。');
    if (definition.encoding === 'image') {
      const texture = await decodeTextureImage(await new THREE.TextureLoader().loadAsync(url), signal);
      if (signal?.aborted || this.disposed) { texture.dispose(); throw new DOMException('Aborted', 'AbortError'); }
      texture.colorSpace = definition.colorSpace === 'Non-Color' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      return texture;
    }
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`源材质场读取失败（${response.status}）`);
    let data = await response.arrayBuffer();
    // Some hosts serve *.gz with Content-Encoding:gzip, which Fetch has already
    // decoded. Others serve the file as an ordinary binary asset.
    const prefix = new Uint8Array(data, 0, Math.min(2, data.byteLength));
    if (prefix[0] === 0x1f && prefix[1] === 0x8b) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
      data = await new Response(stream).arrayBuffer();
    }
    const count = definition.width! * definition.height! * definition.channels!;
    if (data.byteLength !== count * 2) throw new Error('源材质场尺寸不一致。');
    if (signal?.aborted || this.disposed) throw new DOMException('Aborted', 'AbortError');
    const format = definition.channels === 1 ? THREE.RedFormat : THREE.RGBFormat;
    const texture = new THREE.DataTexture(new Uint16Array(data), definition.width!, definition.height!, format, THREE.HalfFloatType);
    texture.internalFormat = definition.channels === 1 ? 'R16F' : 'RGB16F';
    texture.unpackAlignment = 1;
    texture.colorSpace = THREE.NoColorSpace; texture.flipY = false;
    texture.minFilter = THREE.LinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false; texture.needsUpdate = true;
    return texture;
  }

  dispose() {
    this.disposed = true;
    for (const sampler of this.imageSamplers) sampler.dispose();
    this.imageSamplers.clear(); this.bindings = []; this.textureDefinitions.clear();
  }
}

export async function loadSourceMaterialLibrary(base: string, manifest: SceneManifest, signal?: AbortSignal) {
  if (manifest.sourceRevision !== 'peony-2.0-2026-10-23') return undefined;
  const response = await fetch(`${base}source-materials.json`, { signal });
  if (!response.ok) throw new Error(`源材质清单读取失败（${response.status}）`);
  const data = await response.json() as NativeMaterialData;
  if (data.version !== 1 || data.sourceRevision !== manifest.sourceRevision || data.sourceSha256 !== manifest.sourceSha256) {
    throw new Error('画卷与源材质版本不一致。');
  }
  return new SourceMaterialLibrary(base, manifest, data);
}

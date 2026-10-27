import * as THREE from 'three';
import type { CameraSample, SceneManifest } from '../types';
import type { SourceMaterialLibrary } from './SourceMaterial';
import type { SourceRenderSettings } from './SourceLighting';
import { sourceTargetSize, type SourceViewport } from './sourceViewport';
import { renderQualityProfile, type RenderQuality } from './renderQuality';

interface ScreenBounds { left: number; right: number; bottom: number; top: number }

/** A rectangle overlap count is an upper bound on per-pixel sheet depth.
 * It only removes empty peel iterations, never a source layer or alpha. */
function maximumOverlap(rectangles: ScreenBounds[]) {
  let maximum = 0;
  const xs = rectangles.flatMap(rectangle => [rectangle.left, rectangle.right]);
  for (const x of xs) {
    const events = rectangles.filter(rectangle => rectangle.left <= x && rectangle.right >= x)
      .flatMap(rectangle => [{ y: rectangle.bottom, delta: 1 }, { y: rectangle.top, delta: -1 }])
      .sort((a, b) => a.y - b.y || b.delta - a.delta);
    let count = 0;
    for (const event of events) { count += event.delta; maximum = Math.max(maximum, count); }
  }
  return maximum;
}

interface NativeGlareFrame {
  frame: number; url: string | null; width: number; height: number; channels: number;
  encoding: 'gzip-float16-le'; zero?: boolean;
}
interface NativePostSettings extends SourceRenderSettings {
  nativeGlareFrames?: NativeGlareFrame[];
  nativeGlareIncludesMixFactor?: boolean;
  nativeGlareSourceSha256?: string;
  sampling?: { filterSize: number; eevee: { taa_render_samples: number }; filmReconstruction: { sigmaPerFilterRadius: number; textureLodFootprintScale: number } };
}

/** Composites scene-linear source glare over the interactive, rendered geometry. */
export class SourcePostProcessing {
  private frames: NativeGlareFrame[];
  private definitions = new Map<string, NativeGlareFrame>();
  private textures = new Map<string, THREE.Texture>();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private color: THREE.WebGLRenderTarget;
  private accumulation: THREE.WebGLRenderTarget;
  private slices: THREE.WebGLRenderTarget[];
  private blended: THREE.WebGLRenderTarget;
  private depth: THREE.WebGLRenderTarget;
  private material: THREE.ShaderMaterial;
  private accumulationMaterial: THREE.ShaderMaterial;
  private accumulationScene = new THREE.Scene();
  private sliceFrustum = new THREE.Frustum();
  private sliceProjection = new THREE.Matrix4();
  private geometry = new THREE.PlaneGeometry(2, 2);
  private sourceFrame = 0;
  private dofEnabled = false;
  private disposed = false;
  private quality: RenderQuality = '720p';
  private lastLayerCount = 0;
  private lastMeshCount = 0;
  private lastTargetSize = { width: 1, height: 1 };
  private projectedBounds = new WeakMap<THREE.Mesh, { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4; morph: number[];
    positionVersion: number; morphVersions: number[]; bounds: THREE.Box3 }>();
  private accumulationUniforms: Record<string, THREE.IUniform> = {
    previousColor: { value: null }, blendedColor: { value: null }, ditheredColor: { value: null },
    hasPrevious: { value: false }, hasDithered: { value: false }, hasBlended: { value: false }, finish: { value: false },
    backgroundColor: { value: new THREE.Vector3() }, backgroundAlpha: { value: 1 },
  };
  private uniforms: Record<string, THREE.IUniform> = {
    sceneColor: { value: null }, sceneDepth: { value: null },
    glareA: { value: null }, glareB: { value: null },
    glarePresent: { value: new THREE.Vector2() }, glareMix: { value: 0 },
    pixelSize: { value: new THREE.Vector2(1, 1) },
    focusMeters: { value: 1 }, lensMeters: { value: .05 }, apertureMeters: { value: .001 },
    sensorMeters: { value: .036 }, unitMeters: { value: 1 },
    apertureBlades: { value: 0 }, apertureRotation: { value: 0 }, apertureRatio: { value: 1 },
    useDof: { value: false },
    filmPixelSize: { value: new THREE.Vector2(1, 1) },
    filmRadius: { value: 0 }, filmSigma: { value: .284 },
    filmSamplesPerAxis: { value: 2 }, dofSampleCount: { value: 8 },
  };

  constructor(private base: string, private settings: NativePostSettings) {
    this.frames = [...settings.nativeGlareFrames ?? []].sort((a, b) => a.frame - b.frame);
    if (settings.compositor?.nodes.some(node => node.type === 'GLARE') && !this.frames.length) throw new Error('画卷原生光晕尚未导出。');
    if (this.frames.length && (!settings.nativeGlareIncludesMixFactor || settings.nativeGlareSourceSha256 !== settings.sourceSha256)) {
      throw new Error('画卷后期与源文件不一致。');
    }
    for (const frame of this.frames) if (!frame.zero && frame.url) this.definitions.set(this.absolute(frame.url), frame);
    // Subpixel shading is evaluated on a denser grid, before source film
    // reconstruction. Resolving MSAA first would apply two unrelated kernels.
    this.color = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.accumulation = this.color.clone();
    this.blended = this.color.clone();
    this.slices = [0, 1].map(() => {
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
      target.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
      target.depthTexture.minFilter = target.depthTexture.magFilter = THREE.NearestFilter;
      target.texture.colorSpace = THREE.LinearSRGBColorSpace;
      return target;
    });
    this.depth = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
    this.color.texture.colorSpace = this.depth.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.uniforms.sceneColor.value = this.color.texture;
    this.uniforms.sceneDepth.value = this.depth.texture;
    if (settings.sampling) {
      this.uniforms.filmRadius.value = settings.sampling.eevee.taa_render_samples > 1 ? settings.sampling.filterSize : 0;
      this.uniforms.filmSigma.value = settings.sampling.filmReconstruction.sigmaPerFilterRadius;
    }
    (this.accumulationUniforms.backgroundColor.value as THREE.Vector3).fromArray(settings.world.color).multiplyScalar(settings.world.strength);
    this.accumulationUniforms.backgroundAlpha.value = settings.filmTransparent ? 0 : 1;
    this.accumulationMaterial = new THREE.ShaderMaterial({
      uniforms: this.accumulationUniforms, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D previousColor,blendedColor,ditheredColor;
        uniform bool hasPrevious,hasDithered,hasBlended,finish;
        uniform vec3 backgroundColor;uniform float backgroundAlpha;
        void main(){
          vec4 accumulated=hasPrevious?texture2D(previousColor,vUv):vec4(0.0);
          // Normal alpha blending into an empty target stores premultiplied RGB.
          vec4 interval=hasBlended?texture2D(blendedColor,vUv):vec4(0.0);
          vec4 layer=hasDithered?texture2D(ditheredColor,vUv):vec4(0.0);
          vec4 section=interval+(1.0-interval.a)*vec4(layer.rgb*layer.a,layer.a);
          accumulated+=(1.0-accumulated.a)*section;
          if(finish)accumulated+=(1.0-accumulated.a)*vec4(backgroundColor*backgroundAlpha,backgroundAlpha);
          gl_FragColor=accumulated;
        }
      `,
    });
    this.accumulationScene.add(new THREE.Mesh(this.geometry, this.accumulationMaterial));
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, depthWrite: false, depthTest: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D sceneColor,sceneDepth,glareA,glareB;
        uniform vec2 glarePresent,pixelSize,filmPixelSize;
        uniform float filmRadius,filmSigma;
        uniform int filmSamplesPerAxis,dofSampleCount;
        uniform float glareMix,focusMeters,lensMeters,apertureMeters,sensorMeters,unitMeters;
        uniform float apertureBlades,apertureRotation,apertureRatio;
        uniform bool useDof;
        float circleRadius(float depth){
          float z=max(depth*unitMeters,lensMeters+1e-6);
          return apertureMeters*lensMeters*abs(z-focusMeters)/max(z*(focusMeters-lensMeters),1e-8)/sensorMeters*.5;
        }
        void main(){
          vec4 color=texture2D(sceneColor,vUv);
          if(filmRadius>0.0){
            vec4 filtered=vec4(0.0);float weightSum=0.0;
            for(int y=0;y<6;y++)for(int x=0;x<6;x++){
              if(y>=filmSamplesPerAxis||x>=filmSamplesPerAxis)continue;
              vec2 offset=(vec2(float(x),float(y))-(float(filmSamplesPerAxis)-1.0)*.5)*.5;
              float weight=exp(-.5*dot(offset,offset)/(filmSigma*filmSigma*filmRadius*filmRadius));
              filtered+=texture2D(sceneColor,clamp(vUv+offset*filmPixelSize,pixelSize*.5,vec2(1.0)-pixelSize*.5))*weight;
              weightSum+=weight;
            }
            color=filtered/weightSum;
          }
          if(useDof){
            float z=texture2D(sceneDepth,vUv).r;
            float radius=circleRadius(z);
            // Native EEVEE also resolves subpixel circles through its antialiasing.
            // A separate gather starts only once the diameter exceeds one pixel.
            if(z>0.0 && radius/filmPixelSize.x>.5){
              vec4 sum=color;float weight=1.0;
              for(int i=0;i<32;i++){
                if(i>=dofSampleCount)break;
                float angle=float(i)*2.399963229728653+apertureRotation;
                float ring=sqrt((float(i)+.5)/float(dofSampleCount));
                if(apertureBlades>=3.0){
                  float sector=6.28318530718/apertureBlades;
                  ring*=cos(sector*.5)/cos(mod(angle-apertureRotation+sector*.5,sector)-sector*.5);
                }
                vec2 offset=vec2(cos(angle)/max(apertureRatio,1e-4),sin(angle)*pixelSize.y/pixelSize.x)*radius*ring;
                vec2 uv=clamp(vUv+offset,pixelSize*.5,vec2(1.0)-pixelSize*.5);
                float sampleDepth=texture2D(sceneDepth,uv).r;
                float sampleRadius=circleRadius(sampleDepth);
                float accepted=sampleDepth>0.0 && (sampleDepth>=z || sampleRadius>=length(offset))?1.0:0.0;
                sum+=texture2D(sceneColor,uv)*accepted;weight+=accepted;
              }
              color=sum/weight;
            }
          }
          vec3 a=glarePresent.x>.5?texture2D(glareA,vUv).rgb:vec3(0.0);
          vec3 b=glarePresent.y>.5?texture2D(glareB,vUv).rgb:vec3(0.0);
          gl_FragColor=vec4(color.rgb+mix(a,b,glareMix),color.a);
          #include <colorspace_fragment>
        }
      `,
    });
    this.scene.add(new THREE.Mesh(this.geometry, this.material));
  }

  setRenderQuality(quality: RenderQuality) {
    this.quality = quality;
    const profile = renderQualityProfile(quality);
    this.uniforms.filmSamplesPerAxis.value = profile.filmSamplesPerAxis;
    this.uniforms.dofSampleCount.value = profile.dofSamples;
  }

  getDiagnostics() {
    return { ...this.lastTargetSize, peelLayers: this.lastLayerCount, ditheredMeshes: this.lastMeshCount };
  }

  private screenBounds(mesh: THREE.Mesh, width: number, height: number): ScreenBounds {
    const geometry = mesh.geometry, position = geometry.getAttribute('position');
    const positionVersion = 'version' in position ? position.version : position.data.version;
    const morph = mesh.morphTargetInfluences ?? [], attributes = geometry.morphAttributes.position ?? [];
    const morphVersions = attributes.map(attribute => 'version' in attribute ? attribute.version : attribute.data.version);
    let cached = this.projectedBounds.get(mesh);
    if (!cached || cached.geometry !== geometry || !cached.matrix.equals(mesh.matrixWorld) || cached.positionVersion !== positionVersion
      || cached.morph.length !== morph.length || !cached.morph.every((value, i) => value === morph[i])
      || cached.morphVersions.length !== morphVersions.length || !cached.morphVersions.every((value, i) => value === morphVersions[i])) {
      const bounds = new THREE.Box3(), vertex = new THREE.Vector3();
      for (let index = 0; index < position.count; index++) bounds.expandByPoint(mesh.getVertexPosition(index, vertex).applyMatrix4(mesh.matrixWorld));
      cached = { geometry, matrix: mesh.matrixWorld.clone(), morph: [...morph], positionVersion, morphVersions, bounds };
      this.projectedBounds.set(mesh, cached);
    }
    const rectangle = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
    const { min, max } = cached.bounds;
    for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
      const point = new THREE.Vector4(x, y, z, 1).applyMatrix4(this.sliceProjection);
      // A box crossing the eye/near plane has an unbounded perspective hull.
      // Treat it as covering the whole image instead of clipping its source.
      if (![point.x, point.y, point.z, point.w].every(Number.isFinite) || point.w <= 1e-8 || point.z < -point.w) {
        return { left: -1, right: 1, bottom: -1, top: 1 };
      }
      rectangle.left = Math.min(rectangle.left, point.x / point.w); rectangle.right = Math.max(rectangle.right, point.x / point.w);
      rectangle.bottom = Math.min(rectangle.bottom, point.y / point.w); rectangle.top = Math.max(rectangle.top, point.y / point.w);
    }
    // Expand by a whole target pixel so raster edge coverage is conservative.
    return { left: Math.max(-1, rectangle.left - 2 / width), right: Math.min(1, rectangle.right + 2 / width),
      bottom: Math.max(-1, rectangle.bottom - 2 / height), top: Math.min(1, rectangle.top + 2 / height) };
  }

  private absolute(url: string) { return new URL(url, new URL(this.base, document.baseURI)).href; }

  private bracket() {
    if (!this.frames.length || this.sourceFrame < this.frames[0].frame || this.sourceFrame > this.frames.at(-1)!.frame) return undefined;
    let low = 0, high = this.frames.length - 1;
    while (high - low > 1) {
      const mid = (low + high) >> 1;
      if (this.frames[mid].frame <= this.sourceFrame) low = mid; else high = mid;
    }
    const a = this.frames[low], b = this.frames[high];
    return { a, b, t: a === b ? 0 : THREE.MathUtils.clamp((this.sourceFrame - a.frame) / (b.frame - a.frame), 0, 1) };
  }

  update(manifest: SceneManifest, a: CameraSample, b: CameraSample, t: number, progress: number) {
    this.sourceFrame = THREE.MathUtils.lerp(manifest.frameRange[0], manifest.frameRange[1], progress);
    const da = a.dof, db = b.dof;
    this.dofEnabled = !!da?.enabled && !!db?.enabled;
    this.uniforms.useDof.value = this.dofEnabled;
    if (da && db) {
      this.uniforms.focusMeters.value = THREE.MathUtils.lerp(da.focusDistance, db.focusDistance, t) * this.settings.unitScaleMeters;
      const lens = THREE.MathUtils.lerp(a.lens, b.lens, t) * .001;
      this.uniforms.lensMeters.value = lens;
      this.uniforms.apertureMeters.value = lens / Math.max(.1, THREE.MathUtils.lerp(da.fstop, db.fstop, t));
      this.uniforms.apertureBlades.value = da.blades;
      this.uniforms.apertureRotation.value = THREE.MathUtils.lerp(da.rotation, db.rotation, t);
      this.uniforms.apertureRatio.value = THREE.MathUtils.lerp(da.ratio, db.ratio, t);
      this.uniforms.sensorMeters.value = manifest.camera.sensorWidth * .001;
      this.uniforms.unitMeters.value = this.settings.unitScaleMeters;
    }
    const bracket = this.bracket();
    const texture = (frame?: NativeGlareFrame) => frame?.url && !frame.zero ? this.textures.get(this.absolute(frame.url)) ?? null : null;
    const ta = texture(bracket?.a), tb = texture(bracket?.b);
    this.uniforms.glareA.value = ta; this.uniforms.glareB.value = tb;
    (this.uniforms.glarePresent.value as THREE.Vector2).set(ta ? 1 : 0, tb ? 1 : 0);
    this.uniforms.glareMix.value = bracket?.t ?? 0;
  }

  requiredUrls() {
    const bracket = this.bracket();
    if (!bracket) return [];
    return [...new Set([bracket.a, bracket.b].filter(frame => !frame.zero && frame.url).map(frame => this.absolute(frame.url!)))];
  }

  prefetchUrls() {
    const first = this.frames.find(frame => !frame.zero && frame.url)?.frame;
    if (first === undefined || this.sourceFrame < first - 60) return [];
    const from = Math.max(this.sourceFrame, first);
    const required = new Set(this.requiredUrls());
    return this.frames.filter(frame => frame.frame >= from && frame.frame <= from + 6 && !frame.zero && frame.url)
      .map(frame => this.absolute(frame.url!)).filter(url => !required.has(url));
  }

  hasUrl(url: string) { return this.definitions.has(url); }

  assign(url: string, texture: THREE.Texture | null) {
    if (texture) this.textures.set(url, texture); else this.textures.delete(url);
    const bracket = this.bracket();
    for (const [index, frame] of [bracket?.a, bracket?.b].entries()) {
      if (frame?.url && this.absolute(frame.url) === url) {
        this.uniforms[index === 0 ? 'glareA' : 'glareB'].value = texture;
        (this.uniforms.glarePresent.value as THREE.Vector2).setComponent(index, texture ? 1 : 0);
      }
    }
  }

  async loadTexture(url: string, signal: AbortSignal) {
    const field = this.definitions.get(url);
    if (!field) throw new Error('未知画卷后期场。');
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`画卷后期读取失败（${response.status}）`);
    let data = await response.arrayBuffer();
    const prefix = new Uint8Array(data, 0, Math.min(2, data.byteLength));
    if (prefix[0] === 0x1f && prefix[1] === 0x8b) data = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if (data.byteLength !== field.width * field.height * field.channels * 2) throw new Error('画卷后期场尺寸不一致。');
    if (signal.aborted || this.disposed) throw new DOMException('Aborted', 'AbortError');
    const format = field.channels === 4 ? THREE.RGBAFormat : THREE.RGBFormat;
    const texture = new THREE.DataTexture(new Uint16Array(data), field.width, field.height, format, THREE.HalfFloatType);
    texture.internalFormat = field.channels === 4 ? 'RGBA16F' : 'RGB16F';
    texture.colorSpace = THREE.NoColorSpace; texture.flipY = false; texture.unpackAlignment = 1;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false; texture.needsUpdate = true;
    return texture;
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, library: SourceMaterialLibrary,
    view: SourceViewport, width: number, height: number) {
    const ratio = renderer.getPixelRatio();
    const { width: w, height: h, scale } = sourceTargetSize(view.width, view.height, ratio, this.quality);
    this.lastTargetSize = { width: w, height: h };
    const depthWidth = this.dofEnabled ? w : 1, depthHeight = this.dofEnabled ? h : 1;
    if (this.depth.width !== depthWidth || this.depth.height !== depthHeight) this.depth.setSize(depthWidth, depthHeight);
    (this.uniforms.pixelSize.value as THREE.Vector2).set(1 / w, 1 / h);
    (this.uniforms.filmPixelSize.value as THREE.Vector2).set(1 / Math.max(1, view.width * ratio), 1 / Math.max(1, view.height * ratio));
    library.setImageLodBias(Math.log2(scale * (this.settings.sampling?.filmReconstruction.textureLodFootprintScale ?? 1)));
    const background = scene.background, autoClear = renderer.autoClear;
    const clearColor = renderer.getClearColor(new THREE.Color()).clone(), clearAlpha = renderer.getClearAlpha();
    this.sliceProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.sliceFrustum.setFromProjectionMatrix(this.sliceProjection);
    const rectangles: ScreenBounds[] = [];
    let hasBlended = false;
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !object.visible || Array.isArray(object.material) || !this.sliceFrustum.intersectsObject(object)) return;
      if (object.material.userData.sourceRenderMethod === 'DITHERED') rectangles.push(this.screenBounds(object, w, h));
      else if (object.material.userData.sourceRenderMethod === 'BLENDED') hasBlended = true;
    });
    const layerCount = maximumOverlap(rectangles);
    this.lastLayerCount = layerCount; this.lastMeshCount = rectangles.length;
    const resizeTarget = (target: THREE.WebGLRenderTarget, needed: boolean) => {
      const tw = needed ? w : 1, th = needed ? h : 1;
      if (target.width !== tw || target.height !== th) target.setSize(tw, th);
    };
    resizeTarget(this.color, true); resizeTarget(this.accumulation, layerCount > 0);
    resizeTarget(this.blended, hasBlended);
    for (const target of this.slices) resizeTarget(target, layerCount > 0);
    let previousDepth: THREE.Texture | null = null;
    let previousColor: THREE.Texture | null = null;
    try {
      renderer.setScissorTest(false); renderer.autoClear = true; renderer.setClearColor(0, 0); scene.background = null;
      // Source DITHERED sheets participate in per-fragment depth. Integrate
      // their exact alpha analytically, with the native BLENDED origin order
      // retained inside each depth interval. No alpha cut or noise is invented.
      for (let layerIndex = 0; layerIndex <= layerCount; layerIndex++) {
        const tail = layerIndex === layerCount;
        const slice = this.slices[layerIndex % 2];
        if (!tail) {
          library.setPeelDepths(previousDepth, null, w, h); library.setPass('dithered');
          renderer.setRenderTarget(slice); renderer.render(scene, camera);
        }
        if (hasBlended) {
          library.setPeelDepths(previousDepth, tail ? null : slice.depthTexture, w, h); library.setPass('blended');
          renderer.setRenderTarget(this.blended); renderer.render(scene, camera);
        }
        const destination = layerIndex % 2 === 0 ? this.color : this.accumulation;
        this.accumulationUniforms.previousColor.value = previousColor;
        this.accumulationUniforms.blendedColor.value = this.blended.texture;
        this.accumulationUniforms.ditheredColor.value = tail ? null : slice.texture;
        this.accumulationUniforms.hasPrevious.value = !!previousColor;
        this.accumulationUniforms.hasDithered.value = !tail;
        this.accumulationUniforms.hasBlended.value = hasBlended;
        this.accumulationUniforms.finish.value = tail;
        renderer.setRenderTarget(destination); renderer.render(this.accumulationScene, this.camera);
        previousColor = destination.texture;
        if (!tail) previousDepth = slice.depthTexture;
      }
      this.uniforms.sceneColor.value = previousColor;
      if (this.dofEnabled) {
        scene.background = new THREE.Color(0, 0, 0);
        library.setPass('depth'); renderer.setRenderTarget(this.depth); renderer.render(scene, camera);
      }
      scene.background = background; renderer.setClearColor(clearColor, clearAlpha);
      renderer.setRenderTarget(null); renderer.setViewport(0, 0, width, height); renderer.clear();
      renderer.setViewport(view.x, view.y, view.width, view.height);
      renderer.setScissor(view.x, view.y, view.width, view.height); renderer.setScissorTest(true);
      renderer.render(this.scene, this.camera);
    } finally {
      library.setPass('color'); library.setPeelDepths(null, null, w, h);
      scene.background = background; renderer.autoClear = autoClear;
      renderer.setRenderTarget(null); renderer.setClearColor(clearColor, clearAlpha); renderer.setScissorTest(false);
    }
  }

  dispose() {
    this.disposed = true;
    this.color.dispose(); this.accumulation.dispose(); this.blended.dispose(); this.depth.dispose();
    for (const slice of this.slices) { slice.depthTexture?.dispose(); slice.dispose(); }
    this.accumulationMaterial.dispose(); this.accumulationScene.clear();
    this.material.dispose(); this.geometry.dispose();
    this.textures.clear(); this.definitions.clear(); this.scene.clear();
  }
}

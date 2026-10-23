import * as THREE from 'three';
import { ShaderWarmup } from './ShaderWarmup';
import type { SceneManifest } from '../types';
import { prepareScene } from './prepareScene';
import { CalligraphyLayer } from './CalligraphyLayer';
import { MotionDirector } from './MotionDirector';
import { getMotionProfile } from '../data/motionProfiles';
import { applyArtDirection } from './ArtDirectionLayer';
import { StableLayerSorting } from './StableLayerSorting';
import { activeSourceEdition, chapterAssetBase } from '../data/sourceEdition';
import { createNewScrollAtmosphere } from './NewScrollAtmosphere';
import { findNarrativeSpace, isCompactNarrativeViewport, narrativeSampleSize, type NarrativeSpace } from './NarrativeSpace';
import { sourceVerticalFov, sourceViewportLayout, type SourceViewport } from './sourceViewport';
import { loadSourceMaterialLibrary, type SourceMaterialLibrary, type SourceFieldBinding } from './SourceMaterial';
import { createSourceLighting, loadSourceRenderSettings, type SourceRenderSettings, type SourceLightingState } from './SourceLighting';
import { SourcePostProcessing } from './SourcePostProcessing';
import { ArtworkProjector } from './artworkProjection';
import type { ArtworkAnchorSpec, ProjectedArtAnchor } from '../data/artEncounters';
import { createArtworkSnapshot, type ArtworkSnapshot } from './artworkSnapshot';
import { decodeTextureImage } from './texturePreparation';

interface TextureEntry { texture?: THREE.Texture; loading: boolean; lastSeen: number; bytes: number }
interface TextureUpload { url: string; texture: THREE.Texture; entry: TextureEntry; variants: THREE.Texture[] }
interface SnapshotRequest {
  resolve: (snapshot: ArtworkSnapshot) => void;
  reject: (reason: Error) => void;
  timer: number;
  encoding: boolean;
}
interface SceneObject {
  mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; url?: string;
  animation?: { progress: number; matrix: number[] }[];
  visibility?: { progress: number; visible: boolean }[];
  morphWeights?: { frame: number; progress: number; weights: number[] }[];
  fields?: SourceFieldBinding[];
}
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export interface SceneMotionState { enabled: boolean; reducedMotion: boolean; supported: boolean }
export interface SceneRecoveryState { kind: 'none' | 'textures' | 'context-lost'; canRetry: boolean; failedTextures: number }
export interface ScenePreparationState {
  stage: 'manifest' | 'textures' | 'first-frame' | 'ready' | 'error';
  loaded: number; total: number; message: string;
}

/** Reconstructs the actual Blender image planes in their untouched world coordinates. */
export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 5000);
  private manifest?: SceneManifest;
  private objects: SceneObject[] = [];
  private textures = new Map<string, TextureEntry>();
  private textureUploads: TextureUpload[] = [];
  private loader = new THREE.TextureLoader();
  private frame = 0;
  private disposed = false;
  private progress = 0;
  private width = 1;
  private height = 1;
  private dirty = true;
  private ready = false;
  private firstFrameReady = false;
  private preparationActive = true;
  private preparationSignature = '';
  private loaded = false;
  private errorUrls = new Set<string>();
  private textureErrors = new Map<string, string>();
  private shaderErrors: string[] = [];
  private pending = new Set<string>();
  private queue: string[] = [];
  private lastTextureCheck = 0;
  private textureRefreshPending = false;
  private currentVisible = new Set<string>();
  private prefetched = new Set<string>();
  private preloadCamera = new THREE.PerspectiveCamera();
  private frustum = new THREE.Frustum();
  private projection = new THREE.Matrix4();
  private q1 = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private m1 = new THREE.Matrix4();
  private m2 = new THREE.Matrix4();
  private p1 = new THREE.Vector3();
  private p2 = new THREE.Vector3();
  private s1 = new THREE.Vector3();
  private s2 = new THREE.Vector3();
  private chapterId = 0;
  private compactReserve = 0;
  private readingLayoutRoot: HTMLElement | null;
  private motionRequested = true;
  private lastMotionEnabled = false;
  private motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
  private motionListeners = new Set<(state: SceneMotionState) => void>();
  private motionDirector?: MotionDirector;
  private layerSorting?: StableLayerSorting;
  private artCounts = { replacements: 0, geometryRepairs: 0, edgeRepairs: 0, addedLayers: 0, textLayers: 0 };
  private previousFrameTime = 0;
  private lastAmbientFrame = 0;
  private renderCount = 0;
  private rafTicks = 0;
  private lastDiagnosticsTime = 0;
  private contextLost = false;
  private contextRestoreCount = 0;
  private contextRetryRequested = false;
  private contextExtension: WEBGL_lose_context | null = null;
  private recoveryTimer = 0;
  private pointer = new THREE.Vector2();
  private pointerTarget = new THREE.Vector2();
  private abort = new AbortController();
  private calligraphy: CalligraphyLayer;
  private narrativeSpace?: NarrativeSpace;
  private narrativeBucket = '';
  private narrativeTarget?: THREE.WebGLRenderTarget;
  private narrativePixels = new Uint8Array(0);
  private narrativePending = false;
  private narrativeGeneration = 0;
  private narrativePlaybackActive = false;
  private narrativeTimer = 0;
  private narrativeReads = 0;
  private lastViewChange = 0;
  private lastNarrativeReadProgress = 0;
  private sourceProgress = 0;
  private appliedSourceProgress = -1;
  private travelDirection = 1;
  private shaderFailed = false;
  private sourceViewport: SourceViewport = { x: 0, y: 0, width: 1, height: 1, aspect: 1 };
  private sourceMaterials?: SourceMaterialLibrary;
  private sourceFieldUrls = new Set<string>();
  private sourceRenderSettings?: SourceRenderSettings;
  private sourceLighting?: SourceLightingState;
  private sourceFocusDistance = 10;
  private sourcePost?: SourcePostProcessing;
  private artworkProjector = new ArtworkProjector();
  private artworkAnchors: readonly ArtworkAnchorSpec[] = [];
  private snapshotRequests = new Set<SnapshotRequest>();
  private shaderWarmup?: ShaderWarmup;
  private preparationCancelled = false;

  private get sourceFaithful() { return this.manifest?.sourceRevision === activeSourceEdition; }

  constructor(private host: HTMLElement, private status: (message: string | null) => void,
    private preparation?: (state: ScenePreparationState) => void,
    private onNarrativeSpace?: (placement: NarrativeSpace) => void,
    private onArtworkAnchors?: (anchors: ProjectedArtAnchor[]) => void) {
    this.readingLayoutRoot = host.closest<HTMLElement>('.app-shell');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      this.shaderErrors.push([gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertex), gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'));
      this.shaderFailed = true;
      this.shaderWarmup?.cancel('shader-error');
      this.rejectArtworkSnapshots(new Error('画境暂未绘成，无法留存当前画心。'));
      cancelAnimationFrame(this.frame); this.frame = 0;
      this.ready = false; this.firstFrameReady = false;
      this.status('画面暂时中断，请重新展卷');
      this.reportPreparation('error', 0, this.currentVisible.size, '画境未能绘就，请重新展卷。');
      this.updateDiagnostics();
    };
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf8f5ed, 0);
    this.renderer.sortObjects = true;
    // Every source pose and independent motion explicitly updates its world
    // matrix. Avoid recursively revisiting all static sheets on every draw.
    this.scene.matrixWorldAutoUpdate = false;
    this.renderer.domElement.setAttribute('aria-label', '原始 Blender 分层国画场景');
    this.host.appendChild(this.renderer.domElement);
    this.contextExtension = this.renderer.getContext().getExtension('WEBGL_lose_context');
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.motionMedia.addEventListener('change', this.onMotionPreference);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.calligraphy = new CalligraphyLayer(this.host);
    this.requestFrame();
  }

  async load(chapterId: number): Promise<SceneManifest> {
    this.chapterId = chapterId;
    this.emitMotionState();
    this.status('正在展卷');
    this.reportPreparation('manifest', 0, 0, '正在铺陈千年风华……');
    const base = chapterAssetBase(chapterId);
    const response = await fetch(`${base}scene.json`, { signal: this.abort.signal });
    if (!response.ok) throw new Error(`第${chapterId}卷资源读取失败（${response.status}）`);
    const manifest = prepareScene(await response.json(), chapterId);
    if (this.disposed) throw new DOMException('Aborted', 'AbortError');
    this.manifest = manifest;
    const [sourceMaterials, renderSettings] = await Promise.all([
      loadSourceMaterialLibrary(base, manifest, this.abort.signal),
      this.sourceFaithful ? loadSourceRenderSettings(base, manifest, this.abort.signal) : undefined,
    ]);
    if (this.disposed) { sourceMaterials?.dispose(); throw new DOMException('Aborted', 'AbortError'); }
    this.sourceMaterials = sourceMaterials;
    this.sourceRenderSettings = renderSettings;
    if (this.sourceFaithful) this.renderer.setTransparentSort((a, b) => {
      if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
      if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
      const view = this.camera.matrixWorldInverse.elements;
      const originZ = (object: THREE.Object3D) => {
        const matrix = object.matrixWorld.elements;
        return view[2] * matrix[12] + view[6] * matrix[13] + view[10] * matrix[14] + view[14];
      };
      return originZ(a.object) - originZ(b.object) || a.id - b.id;
    });
    if (renderSettings) {
      this.sourceLighting = createSourceLighting(renderSettings);
      this.sourceMaterials!.configureLighting(this.sourceLighting);
      this.sourcePost = new SourcePostProcessing(base, renderSettings);
      if (!renderSettings.filmTransparent) {
        const color = renderSettings.world.color;
        const strength = renderSettings.world.strength;
        this.scene.background = new THREE.Color().setRGB(color[0] * strength, color[1] * strength, color[2] * strength, THREE.LinearSRGBColorSpace);
      }
    }
    if (this.disposed) { this.sourceMaterials?.dispose(); throw new DOMException('Aborted', 'AbortError'); }
    for (const source of manifest.meshes) {
      // Long Blender FONT captions belong to the reading drawer. Painted lettering stays intact.
      if (source.isText) continue;
      const definition = manifest.materials[source.material];
      if (!definition || !source.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
      if (source.normals?.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(source.normals, 3));
      if (source.uvs.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(source.uvs, 2));
      if (source.indices?.length) geometry.setIndex(source.indices);
      if (source.morphTargets?.length) {
        geometry.morphTargetsRelative = source.morphTargetsRelative ?? true;
        geometry.morphAttributes.position = source.morphTargets.map(target => {
          const attribute = new THREE.Float32BufferAttribute(target.positions, 3);
          attribute.name = target.name;
          return attribute;
        });
        if (source.normals?.length && source.morphTargets.every(target => target.normals?.length === source.normals!.length)) {
          geometry.morphAttributes.normal = source.morphTargets.map(target => new THREE.Float32BufferAttribute(target.normals!, 3));
        }
      }
      geometry.computeBoundingSphere();
      const color = new THREE.Color().setRGB(definition.color[0] ?? 1, definition.color[1] ?? 1, definition.color[2] ?? 1, THREE.LinearSRGBColorSpace);
      const nativeMaterial = this.sourceMaterials?.create(source.material, source.name, geometry);
      const material = nativeMaterial?.material ?? new THREE.MeshBasicMaterial({
        color, opacity: definition.opacity ?? 1,
        transparent: definition.transparent || !!definition.texture,
        alphaTest: definition.alphaTest ?? 0.012,
        side: THREE.DoubleSide,
        depthWrite: definition.texture ? false : definition.depthWrite,
        toneMapped: false,
      });
      for (const field of nativeMaterial?.fields ?? []) this.sourceFieldUrls.add(field.url);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = source.name;
      mesh.matrix.fromArray(source.matrix);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrixWorld(true);
      mesh.visible = !definition.texture;
      this.scene.add(mesh);
      this.objects.push({ mesh, material, url: definition.texture ? new URL(`${base}${definition.texture}`, document.baseURI).href : undefined, animation: manifest.animations?.[source.name], visibility: manifest.visibility?.[source.name], morphWeights: source.morphWeights, fields: nativeMaterial?.fields });
    }
    // Source manifests stay untouched. Replacements and new world-space bridges share
    // this same streaming queue and disposal lifecycle, never a second texture loader.
    const art = manifest.sourceRevision
      ? { replacements: 0, geometryRepairs: 0, edgeRepairs: 0, addedLayers: 0, textLayers: [] }
      : await applyArtDirection(chapterId, manifest, this.objects, this.scene, this.abort.signal);
    if (this.disposed) throw new DOMException('Aborted', 'AbortError');
    // The revised edition has different object identities and local UV planes.
    // Only reviewed independent layers use its profile; its small world-space
    // petals enter the same texture queue and disposal lifecycle as source art.
    const atmosphere = manifest.sourceRevision === 'peony-2026-10-21'
      ? createNewScrollAtmosphere(manifest, chapterId) : undefined;
    for (const object of atmosphere?.objects ?? []) {
      this.scene.add(object.mesh);
      this.objects.push(object);
    }
    // The first scroll is an overlapping sheet composition. Camera-yaw sorting
    // flips almost coplanar palace/figure sheets while their source poses stand
    // still. Use a source-derived stable viewing axis for this composition.
    if (chapterId === 1 && !this.sourceFaithful) {
      this.layerSorting = new StableLayerSorting(manifest, this.objects.map(object => object.mesh));
      this.renderer.setTransparentSort(this.layerSorting.compare);
    }
    if (!this.sourceFaithful) this.motionDirector = new MotionDirector(chapterId, this.objects, manifest.stops, atmosphere?.profile);
    this.artCounts = { replacements: art.replacements, geometryRepairs: art.geometryRepairs, edgeRepairs: art.edgeRepairs, addedLayers: art.addedLayers + (atmosphere?.objects.length ?? 0), textLayers: art.textLayers.length };
    this.loaded = true;
    if (this.sourceFaithful && this.sourceMaterials) {
      this.shaderWarmup = new ShaderWarmup(this.renderer, this.scene, this.camera, () => { this.dirty = true; this.requestFrame(); });
      if (this.preparationCancelled) this.shaderWarmup.cancel('owner-return');
    }
    this.dirty = true;
    if (!manifest.sourceRevision) this.calligraphy.load(chapterId, manifest, art.textLayers);
    this.updateReadingMinimum();
    this.updateCamera();
    this.updateTextures();
    this.emitMotionState();
    this.requestFrame();
    return manifest;
  }

  /** Request a fresh completed GPU frame. An idle WebGL drawing buffer may
   * already be cleared; copying happens inside render(), never in this call. */
  captureArtworkSnapshot(): Promise<ArtworkSnapshot> {
    if (this.disposed || this.contextLost || this.shaderFailed || !this.manifest || !this.loaded || !this.firstFrameReady)
      return Promise.reject(new Error('当前画境尚未齐备，暂不能留存画心。'));
    return new Promise((resolve, reject) => {
      const request: SnapshotRequest = { resolve, reject, encoding: false, timer: 0 };
      request.timer = window.setTimeout(() => {
        if (this.snapshotRequests.delete(request)) reject(new Error('画心留存较久，请直接返回序厅。'));
      }, 1500);
      this.snapshotRequests.add(request);
      this.dirty = true;
      this.requestFrame();
    });
  }

  /** Autoplay has a stable authored clock; it must not wait for manual-input
   * quiet time on every frame. Sampling stays bucketed and single-inflight. */
  setNarrativePlaybackActive(active: boolean) {
    if (this.narrativePlaybackActive === active) return;
    this.narrativePlaybackActive = active;
    if (active) { this.dirty = true; this.requestFrame(); }
  }

  private rejectArtworkSnapshots(reason: Error) {
    for (const request of this.snapshotRequests) {
      window.clearTimeout(request.timer); request.reject(reason);
    }
    this.snapshotRequests.clear();
  }

  private copyPendingArtworkSnapshots() {
    const requests = [...this.snapshotRequests].filter(request => !request.encoding);
    if (!requests.length || !this.manifest || !this.ready || !this.firstFrameReady
      || [...this.currentVisible].some(url => !this.textures.get(url)?.texture)) return;
    const view = this.sourceViewport, canvas = this.renderer.domElement;
    if (!(view.width > 1 && view.height > 1)) return;
    const sx = canvas.width / this.width, sy = canvas.height / this.height;
    // Small integer source ratios preserve 16:9 and 7:5 exactly after capping.
    let unitWidth = 0, unitHeight = 0;
    for (let denominator = 1; denominator <= 1000; denominator++) {
      const numerator = Math.round(view.aspect * denominator);
      if (Math.abs(numerator / denominator - view.aspect) < 1e-8) { unitWidth = numerator; unitHeight = denominator; break; }
    }
    const limit = Math.max(1, Math.min(1920, Math.floor(view.width * sx)));
    const units = unitWidth ? Math.floor(limit / unitWidth) : 0;
    const width = units > 0 ? unitWidth * units : limit;
    const height = units > 0 ? unitHeight * units : Math.max(1, Math.round(width / view.aspect));
    const copy = document.createElement('canvas'); copy.width = width; copy.height = height;
    const context = copy.getContext('2d');
    if (!context) { this.rejectArtworkSnapshots(new Error('当前浏览器暂不能留存画心。')); return; }
    const metadata = { chapterId: this.chapterId, sourceRevision: this.manifest.sourceRevision ?? '',
      progress: this.progress, sourceFrame: this.manifest.frameRange[0] + this.progress * (this.manifest.frameRange[1] - this.manifest.frameRange[0]), width, height };
    requests.forEach(request => { request.encoding = true; });
    try {
      // Same JavaScript task as the successful final GPU composite; no DOM ink,
      // source seek, lighting change or persistent drawing buffer is involved.
      context.drawImage(canvas, view.x * sx, view.y * sy, view.width * sx, view.height * sy, 0, 0, width, height);
      copy.toBlob(blob => {
        for (const request of requests) {
          if (!this.snapshotRequests.delete(request)) continue;
          window.clearTimeout(request.timer);
          if (!blob || this.disposed || this.contextLost || this.shaderFailed) request.reject(new Error('当前画心未能留存，请直接返回序厅。'));
          else {
            try { request.resolve(createArtworkSnapshot(blob, metadata)); }
            catch { request.reject(new Error('画心留存资源暂不可用，请直接返回序厅。')); }
          }
        }
        copy.width = copy.height = 1;
      }, 'image/png');
    } catch {
      this.rejectArtworkSnapshots(new Error('当前画心未能留存，请直接返回序厅。'));
      copy.width = copy.height = 1;
    }
  }

  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    if (this.preparationActive && (width !== this.width || height !== this.height)) this.firstFrameReady = false;
    this.width = width; this.height = height;
    this.lastViewChange = performance.now();
    this.updateReadingMinimum();
    this.renderer.setSize(width, height);
    this.calligraphy.resize(width, height);
    this.camera.aspect = width / height;
    this.dirty = true;
    this.requestFrame();
  }

  private updateReadingMinimum() {
    const minimum = this.calligraphy.getMinimumReadingHeight();
    if (minimum > 0) {
      const value = `${Math.ceil(minimum)}px`;
      if (this.readingLayoutRoot?.style.getPropertyValue('--reading-min-paint-height') !== value) this.readingLayoutRoot?.style.setProperty('--reading-min-paint-height', value);
    } else this.readingLayoutRoot?.style.removeProperty('--reading-min-paint-height');
  }

  setArtworkAnchors(anchors: readonly ArtworkAnchorSpec[]) {
    this.artworkAnchors = anchors;
    if (!anchors.length) this.onArtworkAnchors?.([]);
    else { this.dirty = true; this.requestFrame(); }
  }

  setProgress(progress: number) {
    if (this.progress === progress) return;
    this.travelDirection = progress > this.progress ? 1 : -1;
    this.lastViewChange = performance.now();
    if (this.preparationActive) this.firstFrameReady = false;
    this.progress = clamp(progress); this.dirty = true; this.requestFrame();
  }
  setPointer(x: number, y: number) { this.pointerTarget.set(x, y); this.requestFrame(); }

  /** Keep the outer ceremony tied to the current viewport until interaction opens. */
  setPreparationActive(active: boolean) { this.preparationActive = active; }

  /** Leaving the owner is final for this renderer lifetime. Late textures or
   * restored GL resources must not start a first draw behind the closing paper. */
  cancelPreparation(): void {
    if (this.preparationCancelled) return;
    this.preparationCancelled = true;
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.shaderWarmup?.cancel('owner-return');
    for (const upload of this.textureUploads) { upload.texture.dispose(); upload.entry.loading = false; }
    this.textureUploads = [];
    this.updateDiagnostics();
  }

  setMotionEnabled(enabled: boolean) {
    this.motionRequested = enabled;
    this.onMotionPreference();
  }

  getMotionState(): SceneMotionState {
    const supported = !this.sourceFaithful && (this.motionDirector?.profile ?? getMotionProfile(this.chapterId)).enabled;
    const reducedMotion = this.motionMedia.matches;
    return { enabled: supported && this.loaded && this.motionRequested && !reducedMotion && !this.contextLost && !this.shaderFailed && !this.disposed && !document.hidden, reducedMotion, supported };
  }

  subscribeMotionState(callback: (state: SceneMotionState) => void) {
    this.motionListeners.add(callback);
    callback(this.getMotionState());
    return () => { this.motionListeners.delete(callback); };
  }

  getRecoveryState(): SceneRecoveryState {
    return {
      kind: this.contextLost ? 'context-lost' : this.errorUrls.size ? 'textures' : 'none',
      canRetry: !this.disposed && !!this.manifest && (this.contextLost || this.errorUrls.size > 0),
      failedTextures: this.errorUrls.size,
    };
  }

  /** Explicit finite UI retries only; errors never requeue themselves on every frame. */
  retryFailedAssets(): boolean {
    if (this.disposed || this.shaderFailed || !this.manifest || !this.loaded) return false;
    if (this.contextLost) {
      if (!this.contextExtension || this.contextRetryRequested) return false;
      try {
        this.contextRetryRequested = true;
        this.contextExtension.restoreContext();
        this.status('正在恢复画卷');
        window.clearTimeout(this.recoveryTimer);
        this.recoveryTimer = window.setTimeout(() => {
          if (!this.disposed && this.contextLost) this.status('画面暂时中断，请重试恢复');
        }, 2500);
        return true;
      } catch { return false; }
    }
    if (!this.errorUrls.size) return false;
    this.errorUrls.clear();
    this.textureErrors.clear();
    this.ready = false;
    this.status('正在恢复画卷');
    this.updateTextures();
    this.dirty = true;
    this.requestFrame();
    return true;
  }

  private emitMotionState() {
    const state = this.getMotionState();
    for (const callback of this.motionListeners) callback(state);
    this.updateDiagnostics();
  }

  private onMotionPreference = () => {
    this.previousFrameTime = 0;
    if (!this.motionRequested || this.motionMedia.matches) { this.pointer.set(0, 0); this.pointerTarget.set(0, 0); }
    if (!this.getMotionState().enabled) this.motionDirector?.update(this.camera, false, this.progress);
    this.dirty = true;
    this.emitMotionState();
    this.requestFrame();
  };

  private onVisibility = () => {
    this.previousFrameTime = 0;
    if (document.hidden) {
      cancelAnimationFrame(this.frame); this.frame = 0;
      this.motionDirector?.update(this.camera, false, this.progress);
    }
    else { this.dirty = true; this.requestFrame(); }
    this.emitMotionState();
  };

  private onContextLost = (event: Event) => {
    if (this.disposed) return;
    event.preventDefault();
    this.contextLost = true;
    this.shaderWarmup?.loseContext();
    this.rejectArtworkSnapshots(new Error('画境暂时中断，无法留存当前画心。'));
    // Fence results from the lost GPU belong to a different resource lifetime.
    // Detach their buffer so a late completion cannot write into a new sample.
    this.narrativeGeneration++;
    this.narrativePending = false;
    this.narrativeBucket = '';
    this.narrativeTarget?.dispose(); this.narrativeTarget = undefined;
    this.narrativePixels = new Uint8Array(0);
    window.clearTimeout(this.narrativeTimer); this.narrativeTimer = 0;
    if (this.preparationActive) this.firstFrameReady = false;
    this.contextRetryRequested = false;
    this.previousFrameTime = 0;
    this.motionDirector?.update(this.camera, false, this.progress);
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.status('画面暂时中断，请恢复画卷');
    this.reportPreparation('error', 0, this.currentVisible.size, '画境暂时中断，请重试唤醒。');
    this.emitMotionState();
  };

  private onContextRestored = () => {
    if (this.disposed) return;
    this.contextLost = false;
    this.shaderWarmup?.restoreContext();
    this.contextRetryRequested = false;
    this.contextRestoreCount++;
    this.shaderErrors = [];
    window.clearTimeout(this.recoveryTimer);
    // Three rebuilds GL state after loss. Its default restored viewport follows
    // the integer drawing buffer, while setSize used the fractional responsive
    // host size. Reapply that same viewport and clear state before repainting.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf8f5ed, 0);
    this.renderer.setViewport(0, 0, this.width, this.height);
    // Three.js restores its renderer state; mark retained CPU-backed resources for upload.
    // A pending resource may have uploaded only some sampler variants before
    // the loss. That completed prefix belonged to the old GPU lifetime too.
    for (const upload of this.textureUploads) {
      upload.variants = this.textureVariants(upload.url, upload.texture);
      for (const texture of upload.variants) texture.needsUpdate = true;
    }
    for (const [url, entry] of this.textures) if (entry.texture) {
      const texture = entry.texture;
      texture.needsUpdate = true;
      entry.texture = undefined; entry.loading = true;
      this.assignTexture(url, null);
      this.textureUploads.push({ url, entry, texture, variants: this.textureVariants(url, texture) });
    }
    for (const object of this.objects) object.material.needsUpdate = true;
    this.previousFrameTime = 0;
    this.dirty = true;
    this.status('正在恢复画卷');
    this.updateTextures();
    this.emitMotionState();
    this.requestFrame();
  };

  private requestFrame() {
    if (!this.frame && !this.disposed && !this.contextLost && !this.shaderFailed && !this.preparationCancelled && !document.hidden) this.frame = requestAnimationFrame(this.render);
  }

  private bracket<T extends { progress: number }>(samples: T[], progress = this.progress) {
    let low = 0, high = samples.length - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (samples[middle].progress <= progress) low = middle; else high = middle;
    }
    const a = samples[low], b = samples[high];
    const t = a === b ? 0 : clamp((progress - a.progress) / Math.max(0.00001, b.progress - a.progress));
    return { a, b, t };
  }

  private updateCamera() {
    if (!this.manifest?.cameras.length) return;
    const { a, b, t } = this.bracket(this.manifest.cameras);
    const sourceProgress = THREE.MathUtils.lerp(a.sourceProgress ?? a.progress, b.sourceProgress ?? b.progress, t);
    this.sourceProgress = sourceProgress;
    this.sourceMaterials?.update(sourceProgress);
    this.sourcePost?.update(this.manifest, a, b, t, sourceProgress);
    this.sourceFocusDistance = THREE.MathUtils.lerp(a.dof?.focusDistance ?? 10, b.dof?.focusDistance ?? 10, t);
    this.camera.position.fromArray(a.position).lerp(this.p2.fromArray(b.position), t);
    this.camera.quaternion.fromArray(a.quaternion).normalize().slerp(this.q2.fromArray(b.quaternion).normalize(), t);
    const fov = Math.max(5, Math.min(115, THREE.MathUtils.lerp(a.fov, b.fov, t)));
    this.camera.near = this.manifest.camera.near || 0.01;
    this.camera.far = this.manifest.camera.far || 5000;
    if (this.sourceFaithful) {
      const layout = sourceViewportLayout(this.width, this.height, this.manifest.render);
      this.sourceViewport = layout.viewport;
      this.camera.fov = sourceVerticalFov(fov, layout.verticalFovScale);
    } else {
      this.sourceViewport = { x: 0, y: 0, width: this.width, height: this.height, aspect: this.width / this.height };
      this.camera.fov = fov;
    }
    this.camera.aspect = this.sourceViewport.aspect;
    // The source already contains depth. A small lateral displacement makes it perceptible without rotating the view.
    if (!this.sourceFaithful && this.motionRequested && !this.motionMedia.matches) {
      const amplitude = Math.min(0.07, Math.abs(this.manifest.travel.range[1] - this.manifest.travel.range[0]) * 0.0002);
      this.p1.set(this.pointer.x * amplitude, this.pointer.y * amplitude * 0.4, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this.p1);
    }
    // Short vertical captions need real paper space in a narrow window. Fit the
    // same source view uniformly into the lower part of the painting instead
    // of letting minimum-size lettering cover faces and embroidered patterns.
    const compact = this.sourceFaithful ? undefined : this.calligraphy.getCompactLayout(this.width, this.height);
    this.compactReserve = compact?.reserveFraction ?? 0;
    if (compact) {
      const scale = 1 - compact.reserveFraction;
      this.camera.setViewOffset(this.width * scale, this.height * scale,
        (scale - 1) * this.width / 2, (scale - 1) * this.height, this.width, this.height);
    } else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    // Pointer parallax, texture arrivals and ambient frames do not advance the
    // authored timeline. Keep their source matrices and visibility unchanged.
    const sourceChanged = this.appliedSourceProgress !== sourceProgress;
    this.appliedSourceProgress = sourceProgress;
    for (const object of this.objects) {
      const visibility = object.visibility;
      let sourceVisible = sourceChanged ? true : object.mesh.userData.sourceVisible !== false;
      if (sourceChanged && visibility?.length) {
        sourceVisible = visibility[0].visible;
        for (const key of visibility) { if (key.progress > sourceProgress + 1e-7) break; sourceVisible = key.visible; }
      }
      object.mesh.userData.sourceVisible = sourceVisible;
      object.mesh.visible = sourceVisible && !object.mesh.userData.artHidden && this.objectTexturesReady(object);
      if (sourceChanged && object.morphWeights?.length && object.mesh.morphTargetInfluences) {
        const { a: weightA, b: weightB, t: weightMix } = this.bracket(object.morphWeights, sourceProgress);
        for (let i = 0; i < object.mesh.morphTargetInfluences.length; i++) {
          object.mesh.morphTargetInfluences[i] = THREE.MathUtils.lerp(weightA.weights[i] ?? 0, weightB.weights[i] ?? 0, weightMix);
        }
      }
      if (!sourceChanged || !object.animation?.length) continue;
      const { a: key1, b: key2, t: mix } = this.bracket(object.animation, sourceProgress);
      this.m1.fromArray(key1.matrix).decompose(this.p1, this.q1, this.s1);
      this.m2.fromArray(key2.matrix).decompose(this.p2, this.q2, this.s2);
      object.mesh.matrix.compose(this.p1.lerp(this.p2, mix), this.q1.slerp(this.q2, mix), this.s1.lerp(this.s2, mix));
      this.motionDirector?.setBaseMatrix(object.mesh, object.mesh.matrix);
      object.mesh.updateMatrixWorld(true);
      this.layerSorting?.updateBase(object.mesh, object.mesh.matrixWorld);
    }
  }

  private updateTextures() {
    if (this.disposed || this.contextLost || this.shaderFailed || this.preparationCancelled) return;
    // Enlarge the frustum to prefetch neighbouring planes before they enter the painting.
    const preloadCamera = this.preloadCamera.copy(this.camera);
    preloadCamera.fov = Math.min(125, this.camera.fov * 1.35);
    preloadCamera.aspect *= 1.45;
    preloadCamera.updateProjectionMatrix();
    this.projection.multiplyMatrices(preloadCamera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const now = performance.now();
    this.currentVisible.clear();
    this.prefetched.clear();
    for (const object of this.objects) {
      const urls = this.objectTextureUrls(object);
      if (!urls.length) continue;
      const sourceVisible = object.mesh.userData.sourceVisible !== false;
      // Source-hidden sheets previously started loading only after their first
      // visible frame. Warm a short authored interval without displaying them
      // early or making future resources part of the entry readiness gate.
      const nextSource = clamp(this.sourceProgress + this.travelDirection * .012);
      let upcoming = false;
      if (!sourceVisible && object.visibility?.length) {
        for (const key of object.visibility) { if (key.progress > nextSource) break; upcoming = key.visible; }
        upcoming ||= object.visibility.some(key => key.visible && key.progress >= Math.min(this.sourceProgress, nextSource) && key.progress <= Math.max(this.sourceProgress, nextSource));
      }
      if ((sourceVisible && this.frustum.intersectsObject(object.mesh)) || upcoming) {
        for (const url of urls) {
          if (sourceVisible) this.currentVisible.add(url);
          else this.prefetched.add(url);
          const entry = this.textures.get(url);
          if (entry) entry.lastSeen = now;
          else if (!this.pending.has(url) && !this.errorUrls.has(url)) {
            this.pending.add(url); this.queue.push(url);
          }
        }
      }
    }
    for (const url of this.sourcePost?.requiredUrls() ?? []) {
      this.currentVisible.add(url);
      const entry = this.textures.get(url);
      if (entry) entry.lastSeen = now;
      else if (!this.pending.has(url) && !this.errorUrls.has(url)) { this.pending.add(url); this.queue.push(url); }
    }
    for (const url of this.sourcePost?.prefetchUrls() ?? []) {
      this.prefetched.add(url);
      const entry = this.textures.get(url);
      if (entry) entry.lastSeen = now;
      else if (!this.pending.has(url) && !this.errorUrls.has(url)) { this.pending.add(url); this.queue.push(url); }
    }
    this.pumpQueue();
    let totalBytes = [...this.textures.values()].reduce((sum, value) => sum + value.bytes, 0);
    // Visible source layers can already exceed the soft total budget. Keep a
    // separate bounded look-behind so reversing a drag does not immediately
    // decode and upload the sheets that just left the camera again.
    const oldTextures = [...this.textures.entries()].filter(([url, entry]) => !this.currentVisible.has(url) && !this.prefetched.has(url) && !entry.loading).sort((a, b) => b[1].lastSeen - a[1].lastSeen);
    let recentImageBytes = 0, recentPostBytes = 0;
    for (const [url, entry] of oldTextures) {
      const post = !!this.sourcePost?.hasUrl(url);
      const retained = post ? recentPostBytes : recentImageBytes;
      const allowance = (post ? 24 : 96) * 1024 * 1024;
      if (now - entry.lastSeen < 5000 && retained + entry.bytes <= allowance) {
        if (post) recentPostBytes += entry.bytes; else recentImageBytes += entry.bytes;
        continue;
      }
      if (totalBytes < 160 * 1024 * 1024 && now - entry.lastSeen < 12000) continue;
      entry.texture?.dispose();
      totalBytes -= entry.bytes;
      this.textures.delete(url);
      this.assignTexture(url, null);
    }
    const waiting = [...this.currentVisible].filter(url => !this.textures.get(url)?.texture && !this.errorUrls.has(url)).length;
    const failed = [...this.currentVisible].filter(url => this.errorUrls.has(url)).length;
    const loaded = this.currentVisible.size - waiting - failed;
    if (!this.firstFrameReady) {
      if (failed) this.reportPreparation('error', loaded, this.currentVisible.size, '部分画境未能绘就，请重试。');
      else if (waiting) this.reportPreparation('textures', loaded, this.currentVisible.size, '正在唤醒花影……');
      else if (this.width > 1 && this.height > 1) this.reportPreparation('first-frame', loaded, this.currentVisible.size, '山河已绘，正在点亮画境……');
    }
    this.ready = !waiting;
    if (!waiting) this.status(failed ? '部分画面资源未能加载，可重试补全' : null);
    this.updateDiagnostics();
  }

  private objectTextureUrls(object: SceneObject): string[] {
    return [...new Set([...(object.url ? [object.url] : []), ...(object.fields?.map(field => field.url) ?? [])])];
  }

  private objectTexturesReady(object: SceneObject) {
    return this.objectTextureUrls(object).every(url => !!this.textures.get(url)?.texture);
  }

  private assignTexture(url: string, texture: THREE.Texture | null) {
    if (this.sourcePost?.hasUrl(url)) this.sourcePost.assign(url, texture);
    for (const object of this.objects) {
      if (object.url === url) { object.material.map = texture; object.material.needsUpdate = true; }
      for (const field of object.fields ?? []) if (field.url === url) field.assign(texture);
      if (object.url === url || object.fields?.some(field => field.url === url)) {
        object.mesh.visible = object.mesh.userData.sourceVisible !== false && !object.mesh.userData.artHidden && this.objectTexturesReady(object);
      }
    }
  }

  private reportPreparation(stage: ScenePreparationState['stage'], loaded: number, total: number, message: string) {
    if (this.disposed) return;
    const signature = `${stage}:${loaded}:${total}:${message}`;
    if (signature === this.preparationSignature) return;
    this.preparationSignature = signature;
    this.preparation?.({ stage, loaded, total, message });
  }

  private pumpQueue() {
    if (this.disposed || this.contextLost || this.shaderFailed || this.preparationCancelled) return;
    let loadingCount = [...this.textures.values()].filter(entry => entry.loading).length;
    let speculativeLoading = [...this.textures.entries()].filter(([url, entry]) => entry.loading && !this.currentVisible.has(url)).length;
    // Newly exposed sheets take priority over speculative upcoming resources.
    this.queue.sort((a, b) => Number(this.currentVisible.has(b)) - Number(this.currentVisible.has(a)));
    while (this.queue.length && loadingCount < 4) {
      // Keep three download slots available for currently exposed artwork.
      if (!this.currentVisible.has(this.queue[0]) && this.prefetched.has(this.queue[0]) && speculativeLoading >= 1) break;
      const url = this.queue.shift()!;
      this.pending.delete(url);
      if (!this.currentVisible.has(url) && !this.prefetched.has(url)) continue;
      const entry: TextureEntry = { loading: true, lastSeen: performance.now(), bytes: 0 };
      this.textures.set(url, entry);
      loadingCount++;
      if (!this.currentVisible.has(url)) speculativeLoading++;
      const load = this.sourcePost?.hasUrl(url) ? this.sourcePost.loadTexture(url, this.abort.signal)
        : this.sourceFieldUrls.has(url) && this.sourceMaterials
        ? this.sourceMaterials.loadTexture(url, this.abort.signal)
        : this.loader.loadAsync(url).then(texture => decodeTextureImage(texture, this.abort.signal));
      load.then(texture => {
        if (this.disposed || this.shaderFailed || this.preparationCancelled) { texture.dispose(); entry.loading = false; return; }
        if (!(texture instanceof THREE.DataTexture)) {
          if (!this.sourceFieldUrls.has(url)) texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
          texture.generateMipmaps = true;
          texture.minFilter = THREE.LinearMipmapLinearFilter;
        }
        const pixels = texture.image as { width: number; height: number; data?: ArrayBufferView };
        entry.bytes = pixels.data?.byteLength ?? pixels.width * pixels.height * 4 * 1.333;
        // A ready image can still trigger synchronous decode/upload at its
        // first draw. Prepare only one texture per animation turn, and expose
        // it to the original material only after its GPU upload has completed.
        this.textureUploads.push({ url, texture, entry, variants: this.textureVariants(url, texture) });
        this.requestFrame();
      }).catch((error: unknown) => {
        if (this.disposed || this.shaderFailed || this.preparationCancelled) { entry.loading = false; return; }
        this.errorUrls.add(url);
        this.textureErrors.set(url, error instanceof Error ? error.message : String(error));
        this.textures.delete(url);
        this.pumpQueue();
        this.updateTextures();
        if (!this.contextLost && this.currentVisible.has(url)) this.status('部分画面资源未能加载，可重试补全');
      });
    }
  }

  private textureVariants(url: string, texture: THREE.Texture) {
    // Image nodes retain their authored CLIP/REPEAT/MIRROR sampler states.
    // Preparing the shared URL alone does not prepare those GPU variants.
    const variants = [texture];
    for (const object of this.objects) for (const field of object.fields ?? []) if (field.url === url) {
      const sampler = field.prepare?.(texture);
      if (sampler && !variants.includes(sampler)) variants.push(sampler);
    }
    return variants;
  }

  private prepareNextTexture() {
    this.textureUploads.sort((a, b) => Number(this.currentVisible.has(b.url)) - Number(this.currentVisible.has(a.url)));
    const upload = this.textureUploads[0];
    if (!upload) return;
    const { url, texture, entry } = upload;
    try {
      this.renderer.initTexture(upload.variants[0]);
      if (this.contextLost) return;
      upload.variants.shift();
      if (upload.variants.length) { this.requestFrame(); return; }
      this.textureUploads.shift();
      entry.texture = texture; entry.loading = false;
      this.assignTexture(url, texture);
      this.dirty = true;
    } catch (error) {
      this.textureUploads.shift();
      texture.dispose(); entry.loading = false;
      this.errorUrls.add(url);
      this.textureErrors.set(url, error instanceof Error ? error.message : String(error));
      this.textures.delete(url);
    }
    this.updateTextures();
    if (this.textureUploads.length) this.requestFrame();
  }

  private render = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.contextLost || this.shaderFailed || this.preparationCancelled || document.hidden) return;
    this.prepareNextTexture();
    if (this.contextLost || this.shaderFailed || this.preparationCancelled) return;
    this.rafTicks++;
    const motion = this.getMotionState().enabled;
    // A media query can change before its asynchronous change event arrives.
    // Always paint one final baseline before an effective motion state stops RAF.
    if (motion !== this.lastMotionEnabled) {
      this.lastMotionEnabled = motion;
      this.dirty = true;
      this.previousFrameTime = 0;
      if (!motion) { this.pointer.set(0, 0); this.pointerTarget.set(0, 0); }
      this.emitMotionState();
    }
    const dt = this.previousFrameTime ? Math.min((now - this.previousFrameTime) / 1000, 0.05) : 0;
    this.previousFrameTime = now;
    if (motion) this.motionDirector?.advance(dt, this.progress);
    const pointerMoving = !this.sourceFaithful && this.pointer.distanceToSquared(this.pointerTarget) > 0.0001 && this.motionRequested && !this.motionMedia.matches;
    if (pointerMoving) { this.pointer.lerp(this.pointerTarget, 0.06); this.dirty = true; }
    const ambientVisible = (this.motionDirector?.getDiagnostics().activeBindings ?? 0) > 0;
    const ambientFps = this.motionDirector?.profile.ambientFps ?? getMotionProfile(this.chapterId).ambientFps;
    const ambientDue = motion && ambientVisible && now - this.lastAmbientFrame >= 1000 / ambientFps - 1;
    if ((this.dirty || ambientDue) && this.manifest && this.loaded) {
      if (this.dirty) { this.updateCamera(); this.textureRefreshPending = true; }
      // During preparation, determine readiness for the actual responsive camera,
      // then upload/draw its textures before allowing the outer ceremony to reveal it.
      if (!this.firstFrameReady || this.snapshotRequests.size) this.updateTextures();
      this.shaderWarmup?.enqueue(this.objects);
      if (this.preparationActive && !this.firstFrameReady && this.shaderWarmup
        && !this.shaderWarmup.initialReady(this.objects, object => this.objectTexturesReady(object))) {
        this.updateDiagnostics();
        return;
      }
      this.motionDirector?.update(this.camera, motion, this.progress);
      if (this.sourceMaterials) this.sourceLighting?.prepareShadows(this.renderer, this.scene, this.sourceMaterials, this.camera, this.sourceFocusDistance);
      if (this.sourcePost && this.sourceMaterials) {
        this.sourcePost.render(this.renderer, this.scene, this.camera, this.sourceMaterials, this.sourceViewport, this.width, this.height);
      } else {
      if (this.sourceFaithful) {
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, this.width, this.height);
        this.renderer.clear();
        const view = this.sourceViewport;
        this.renderer.setViewport(view.x, view.y, view.width, view.height);
        this.renderer.setScissor(view.x, view.y, view.width, view.height);
        this.renderer.setScissorTest(true);
      }
      this.renderer.render(this.scene, this.camera);
      this.renderer.setScissorTest(false);
      }
      if (this.shaderFailed) return;
      this.copyPendingArtworkSnapshots();
      this.updateNarrativeSpace(now);
      this.calligraphy.render(this.camera, this.progress);
      if (this.artworkAnchors.length && this.onArtworkAnchors) {
        this.onArtworkAnchors(this.artworkProjector.project(this.scene, this.camera, this.sourceViewport, this.width, this.height, this.artworkAnchors));
      }
      this.dirty = false;
      this.lastAmbientFrame = now;
      this.renderCount++;
      if (!this.shaderErrors.length && !this.firstFrameReady && this.ready && this.width > 1 && this.height > 1
        && ![...this.currentVisible].some(url => !this.textures.get(url)?.texture)) {
        this.firstFrameReady = true;
        this.reportPreparation('ready', this.currentVisible.size, this.currentVisible.size, '长卷已备，邀君共赏。');
      }
    }
    if (this.textureRefreshPending && this.manifest && this.loaded && now - this.lastTextureCheck > 100) {
      this.updateTextures();
      this.lastTextureCheck = now;
      this.textureRefreshPending = false;
    }
    const visibleMotion = motion && (this.motionDirector?.getDiagnostics().activeBindings ?? 0) > 0;
    // A narrow view can contain no authored independent motion at all. Keep that
    // painting quiet until resize, seek or a completed texture requests a new frame.
    if (!visibleMotion) this.previousFrameTime = 0;
    const snapshotWaiting = [...this.snapshotRequests].some(request => !request.encoding);
    if (snapshotWaiting && this.ready && this.firstFrameReady) this.dirty = true;
    if (!this.shaderErrors.length && this.loaded && (visibleMotion || this.textureRefreshPending || this.dirty || pointerMoving)) this.requestFrame();
    this.updateDiagnostics(!!this.frame);
  };

  private updateNarrativeSpace(now: number) {
    if (!this.manifest?.sourceRevision || !this.onNarrativeSpace || !this.ready || this.narrativePending || this.progress >= .982) return;
    const bucket = `${this.width}:${this.height}:${Math.floor(this.progress * 24)}`;
    if (bucket === this.narrativeBucket) return;
    window.clearTimeout(this.narrativeTimer);
    this.narrativeTimer = 0;
    // Placement should not chase each wheel/drag frame. A single timer asks for
    // one final sample even when the painting has no ambient animation or RAF.
    const delay = this.preparationActive || this.narrativePlaybackActive ? 0 : Math.max(0, 180 - (now - this.lastViewChange));
    if (delay) {
      this.narrativeTimer = window.setTimeout(() => {
        this.narrativeTimer = 0;
        if (this.disposed || document.hidden) return;
        this.dirty = true;
        this.requestFrame();
      }, delay);
      return;
    }
    const { width, height } = narrativeSampleSize(this.width, this.height);
    if (!this.narrativeTarget) {
      this.narrativeTarget = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true, stencilBuffer: false });
      this.narrativeTarget.texture.colorSpace = THREE.SRGBColorSpace;
    }
    else if (this.narrativeTarget.width !== width || this.narrativeTarget.height !== height) this.narrativeTarget.setSize(width, height);
    if (this.narrativePixels.length !== width * height * 4) this.narrativePixels = new Uint8Array(width * height * 4);
    const previousTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.narrativeTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    this.narrativePending = true;
    this.narrativeBucket = bucket;
    this.narrativeReads++;
    this.lastNarrativeReadProgress = this.progress;
    const generation = this.narrativeGeneration, pixels = this.narrativePixels, sampledProgress = this.progress;
    const sampledWidth = this.width, sampledHeight = this.height;
    // WebGL2's fence-backed read avoids synchronously draining the display's
    // GPU command queue. The thumbnail and its CPU buffer remain bounded.
    this.renderer.readRenderTargetPixelsAsync(this.narrativeTarget, 0, 0, width, height, pixels).then(() => {
      if (this.disposed || this.contextLost || generation !== this.narrativeGeneration) return;
      const currentBucket = `${this.width}:${this.height}:${Math.floor(this.progress * 24)}`;
      if (currentBucket !== bucket) { this.narrativeBucket = ''; return; }
      this.narrativeSpace = findNarrativeSpace(pixels, width, height, this.narrativeSpace, isCompactNarrativeViewport(this.width, this.height));
      this.onNarrativeSpace?.({ ...this.narrativeSpace, sampledProgress, sampledWidth, sampledHeight });
    }).catch(() => {
      // Placement is optional. A lost context must not turn it into a failed
      // painting or an unbounded readback retry loop.
      if (!this.contextLost && generation === this.narrativeGeneration) this.narrativeBucket = bucket;
    }).finally(() => {
      if (generation !== this.narrativeGeneration) return;
      this.narrativePending = false;
      if (`${this.width}:${this.height}:${Math.floor(this.progress * 24)}` !== bucket) this.narrativeBucket = '';
      if (!this.disposed && !this.contextLost && this.narrativeBucket === '') { this.dirty = true; this.requestFrame(); }
      if (!this.disposed) this.updateDiagnostics();
    });
  }

  /** Read-only canvas data is intentionally absent from the product interface. */
  private updateDiagnostics(throttled = false) {
    const now = performance.now();
    if (throttled && now - this.lastDiagnosticsTime < 100) return;
    this.lastDiagnosticsTime = now;
    const canvas = this.renderer.domElement;
    const motion = this.motionDirector?.getDiagnostics();
    const atmosphere = this.objects.filter(object => object.mesh.userData.editionAtmosphere);
    const activeNames = new Set(motion?.activeNames ?? []);
    const textureEntries = [...this.textures.values()];
    Object.assign(canvas.dataset, {
      chapter: String(this.chapterId), progress: this.progress.toFixed(6),
      motionEnabled: String(this.getMotionState().enabled), motionRequested: String(this.motionRequested),
      motionSupported: String(this.getMotionState().supported), motionAmbientFps: String(this.motionDirector?.profile.ambientFps ?? 0),
      reducedMotion: String(this.motionMedia.matches), motionTime: (motion?.elapsedSeconds ?? 0).toFixed(6),
      motionBindings: String(motion?.bindings ?? 0), activeMotionLayers: String(motion?.activeBindings ?? 0),
      activePetals: String(motion?.activeGroups.petal ?? 0), activeBridges: String(motion?.activeGroups.bridge ?? 0), activeMotionNames: JSON.stringify(motion?.activeNames ?? []),
      motionClockSpeed: (motion?.clockSpeed ?? 1).toFixed(6), petalDensity: (motion?.petalDensity ?? 1).toFixed(6), cloudDensity: (motion?.cloudDensity ?? 1).toFixed(6), narrativePhase: motion?.phase ?? 'calm', effectiveMotionBudget: String(motion?.maxBindings ?? 0),
      artReplacements: String(this.artCounts.replacements), artGeometryRepairs: String(this.artCounts.geometryRepairs), artEdgeRepairs: String(this.artCounts.edgeRepairs), artAddedLayers: String(this.artCounts.addedLayers), artTextLayers: String(this.artCounts.textLayers),
      editionAtmosphereLayers: String(atmosphere.length), editionAtmosphereActive: String(atmosphere.filter(object => activeNames.has(object.mesh.name)).length),
      editionAtmosphereOpacityMax: Math.max(0, ...atmosphere.map(object => object.material.opacity)).toFixed(6),
      sourceHiddenVisibleLayers: String(this.objects.filter(object => object.mesh.userData.sourceVisible === false && object.mesh.visible).length),
      sourceRevision: this.manifest?.sourceRevision ?? '',
      sourceFrame: this.manifest ? String(this.manifest.frameRange[0] + this.progress * (this.manifest.frameRange[1] - this.manifest.frameRange[0])) : '',
      sourceViewport: JSON.stringify(this.sourceViewport),
      sourceMorphObjects: String(this.objects.filter(object => object.morphWeights?.length).length),
      sourceMaterialsReady: String(!!this.sourceMaterials),
      sourceMaterialFields: String(this.sourceFieldUrls.size),
      sourcePostTextures: String(this.sourcePost?.requiredUrls().length ?? 0),
      shaderErrors: JSON.stringify(this.shaderErrors),
      textureErrors: JSON.stringify(Object.fromEntries(this.textureErrors)),
      compactReadingReserve: String(this.compactReserve),
      renderCount: String(this.renderCount), rafTicks: String(this.rafTicks), rafRunning: String(!!this.frame),
      firstFrameReady: String(this.firstFrameReady),
      contextLost: String(this.contextLost), contextRestores: String(this.contextRestoreCount),
      textureUploads: String(this.textureUploads.length),
      textureCount: String(textureEntries.filter(entry => !!entry.texture).length),
      textureBytes: String(Math.round(textureEntries.reduce((sum, entry) => sum + entry.bytes, 0))),
      textureFailed: String(this.errorUrls.size), loadingTextures: String(textureEntries.filter(entry => entry.loading).length),
      visibleTextures: String(this.currentVisible.size), queuedTextures: String(this.queue.length),
      prefetchedTextures: String(this.prefetched.size),
      narrativeReads: String(this.narrativeReads), narrativeReadPending: String(this.narrativePending),
      narrativeSamplePixels: String(this.narrativePixels.length / 4), narrativeReadProgress: String(this.lastNarrativeReadProgress),
      drawCalls: String(this.renderer.info.render.calls), geometries: String(this.renderer.info.memory.geometries),
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.shaderWarmup?.dispose();
    this.rejectArtworkSnapshots(new DOMException('画境已离开。', 'AbortError'));
    this.narrativeGeneration++;
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.clearTimeout(this.recoveryTimer);
    window.clearTimeout(this.narrativeTimer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.motionMedia.removeEventListener('change', this.onMotionPreference);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.motionListeners.clear();
    this.motionDirector?.dispose();
    this.sourceMaterials?.dispose();
    this.sourceLighting?.dispose();
    this.sourcePost?.dispose();
    this.readingLayoutRoot?.style.removeProperty('--reading-min-paint-height');
    for (const { mesh, material } of this.objects) { mesh.geometry.dispose(); material.dispose(); }
    for (const entry of this.textures.values()) entry.texture?.dispose();
    for (const upload of this.textureUploads) upload.texture.dispose();
    this.textureUploads = [];
    this.calligraphy.dispose();
    this.narrativeTarget?.dispose();
    this.textures.clear();
    this.pending.clear(); this.queue = []; this.currentVisible.clear();
    this.sourceFieldUrls.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

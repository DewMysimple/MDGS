import * as THREE from 'three';
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

interface TextureEntry { texture?: THREE.Texture; loading: boolean; lastSeen: number; bytes: number }
interface SceneObject { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; url?: string; animation?: { progress: number; matrix: number[] }[]; visibility?: { progress: number; visible: boolean }[] }
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
  private narrativeTimer = 0;
  private narrativeReads = 0;
  private lastViewChange = 0;
  private lastNarrativeReadProgress = 0;
  private sourceProgress = 0;
  private appliedSourceProgress = -1;
  private travelDirection = 1;
  private shaderFailed = false;

  constructor(private host: HTMLElement, private status: (message: string | null) => void,
    private preparation?: (state: ScenePreparationState) => void,
    private onNarrativeSpace?: (placement: NarrativeSpace) => void) {
    this.readingLayoutRoot = host.closest<HTMLElement>('.app-shell');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = () => {
      this.shaderFailed = true;
      this.ready = false;
      this.firstFrameReady = false;
      cancelAnimationFrame(this.frame); this.frame = 0;
      this.status('画面暂时中断，请恢复画卷');
      this.reportPreparation('error', 0, this.currentVisible.size, '画材暂未显现，请重新展卷。');
    };
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
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
    for (const source of manifest.meshes) {
      // Long Blender FONT captions belong to the reading drawer. Painted lettering stays intact.
      if (source.isText) continue;
      const definition = manifest.materials[source.material];
      if (!definition || !source.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(source.positions, 3));
      if (source.uvs.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(source.uvs, 2));
      if (source.indices?.length) geometry.setIndex(source.indices);
      geometry.computeBoundingSphere();
      const color = new THREE.Color().setRGB(definition.color[0] ?? 1, definition.color[1] ?? 1, definition.color[2] ?? 1, THREE.LinearSRGBColorSpace);
      const material = new THREE.MeshBasicMaterial({
        color, opacity: definition.opacity ?? 1,
        transparent: definition.transparent || !!definition.texture,
        alphaTest: definition.alphaTest ?? 0.012,
        side: THREE.DoubleSide,
        depthWrite: definition.texture ? false : definition.depthWrite,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = source.name;
      mesh.matrix.fromArray(source.matrix);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrixWorld(true);
      mesh.visible = !definition.texture;
      this.scene.add(mesh);
      this.objects.push({ mesh, material, url: definition.texture ? `${base}${definition.texture}` : undefined, animation: manifest.animations?.[source.name], visibility: manifest.visibility?.[source.name] });
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
    const atmosphere = manifest.sourceRevision === activeSourceEdition
      ? createNewScrollAtmosphere(manifest, chapterId) : undefined;
    for (const object of atmosphere?.objects ?? []) {
      this.scene.add(object.mesh);
      this.objects.push(object);
    }
    // The first scroll is an overlapping sheet composition. Camera-yaw sorting
    // flips almost coplanar palace/figure sheets while their source poses stand
    // still. Use a source-derived stable viewing axis for this composition.
    if (chapterId === 1) {
      this.layerSorting = new StableLayerSorting(manifest, this.objects.map(object => object.mesh));
      this.renderer.setTransparentSort(this.layerSorting.compare);
    }
    this.motionDirector = new MotionDirector(chapterId, this.objects, manifest.stops, atmosphere?.profile);
    this.artCounts = { replacements: art.replacements, geometryRepairs: art.geometryRepairs, edgeRepairs: art.edgeRepairs, addedLayers: art.addedLayers + (atmosphere?.objects.length ?? 0), textLayers: art.textLayers.length };
    this.loaded = true;
    this.dirty = true;
    if (!manifest.sourceRevision) this.calligraphy.load(chapterId, manifest, art.textLayers);
    this.updateReadingMinimum();
    this.updateCamera();
    this.updateTextures();
    this.emitMotionState();
    this.requestFrame();
    return manifest;
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

  setMotionEnabled(enabled: boolean) {
    this.motionRequested = enabled;
    this.onMotionPreference();
  }

  getMotionState(): SceneMotionState {
    const supported = (this.motionDirector?.profile ?? getMotionProfile(this.chapterId)).enabled;
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
    this.contextRetryRequested = false;
    this.contextRestoreCount++;
    window.clearTimeout(this.recoveryTimer);
    // Three rebuilds GL state after loss. Its default restored viewport follows
    // the integer drawing buffer, while setSize used the fractional responsive
    // host size. Reapply that same viewport and clear state before repainting.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf8f5ed, 0);
    this.renderer.setViewport(0, 0, this.width, this.height);
    // Three.js restores its renderer state; mark retained CPU-backed resources for upload.
    for (const entry of this.textures.values()) if (entry.texture) entry.texture.needsUpdate = true;
    for (const object of this.objects) object.material.needsUpdate = true;
    this.previousFrameTime = 0;
    this.dirty = true;
    this.status('正在恢复画卷');
    this.updateTextures();
    this.emitMotionState();
    this.requestFrame();
  };

  private requestFrame() {
    if (!this.frame && !this.disposed && !this.contextLost && !this.shaderFailed && !document.hidden) this.frame = requestAnimationFrame(this.render);
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
    this.camera.position.fromArray(a.position).lerp(this.p2.fromArray(b.position), t);
    this.camera.quaternion.fromArray(a.quaternion).normalize().slerp(this.q2.fromArray(b.quaternion).normalize(), t);
    const fov = THREE.MathUtils.lerp(a.fov, b.fov, t);
    this.camera.fov = Math.max(5, Math.min(115, fov));
    this.camera.near = this.manifest.camera.near || 0.01;
    this.camera.far = this.manifest.camera.far || 5000;
    this.camera.aspect = this.width / this.height;
    // The source already contains depth. A small lateral displacement makes it perceptible without rotating the view.
    if (this.motionRequested && !this.motionMedia.matches) {
      const amplitude = Math.min(0.07, Math.abs(this.manifest.travel.range[1] - this.manifest.travel.range[0]) * 0.0002);
      this.p1.set(this.pointer.x * amplitude, this.pointer.y * amplitude * 0.4, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this.p1);
    }
    // Short vertical captions need real paper space in a narrow window. Fit the
    // same source view uniformly into the lower part of the painting instead
    // of letting minimum-size lettering cover faces and embroidered patterns.
    const compact = this.calligraphy.getCompactLayout(this.width, this.height);
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
      object.mesh.visible = sourceVisible && !object.mesh.userData.artHidden && (!object.url || !!this.textures.get(object.url)?.texture);
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
    if (this.disposed || this.contextLost || this.shaderFailed) return;
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
      if (!object.url) continue;
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
        if (sourceVisible) this.currentVisible.add(object.url);
        else this.prefetched.add(object.url);
        const entry = this.textures.get(object.url);
        if (entry) entry.lastSeen = now;
        else if (!this.pending.has(object.url) && !this.errorUrls.has(object.url)) {
          this.pending.add(object.url); this.queue.push(object.url);
        }
      }
    }
    this.pumpQueue();
    let totalBytes = [...this.textures.values()].reduce((sum, value) => sum + value.bytes, 0);
    const oldTextures = [...this.textures.entries()].filter(([url, entry]) => !this.currentVisible.has(url) && !this.prefetched.has(url) && !entry.loading).sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    for (const [url, entry] of oldTextures) {
      if (totalBytes < 160 * 1024 * 1024 && now - entry.lastSeen < 12000) break;
      entry.texture?.dispose();
      totalBytes -= entry.bytes;
      this.textures.delete(url);
      for (const object of this.objects) if (object.url === url) { object.material.map = null; object.material.needsUpdate = true; object.mesh.visible = false; }
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

  private reportPreparation(stage: ScenePreparationState['stage'], loaded: number, total: number, message: string) {
    if (this.disposed) return;
    const signature = `${stage}:${loaded}:${total}:${message}`;
    if (signature === this.preparationSignature) return;
    this.preparationSignature = signature;
    this.preparation?.({ stage, loaded, total, message });
  }

  private pumpQueue() {
    if (this.disposed || this.contextLost || this.shaderFailed) return;
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
      this.loader.load(url, texture => {
        if (this.disposed || this.shaderFailed) { texture.dispose(); entry.loading = false; return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        entry.texture = texture; entry.loading = false;
        entry.bytes = texture.image.width * texture.image.height * 4 * 1.333;
        for (const object of this.objects) if (object.url === url) {
          object.material.map = texture;
          object.material.needsUpdate = true;
          object.mesh.visible = object.mesh.userData.sourceVisible !== false && !object.mesh.userData.artHidden;
        }
        this.dirty = true;
        this.requestFrame();
        this.pumpQueue();
        this.updateTextures();
      }, undefined, () => {
        if (this.disposed || this.shaderFailed) { entry.loading = false; return; }
        this.errorUrls.add(url);
        this.textures.delete(url);
        this.pumpQueue();
        this.updateTextures();
        if (!this.contextLost && this.currentVisible.has(url)) this.status('部分画面资源未能加载，可重试补全');
      });
    }
  }

  private render = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.contextLost || this.shaderFailed || document.hidden) return;
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
    const pointerMoving = this.pointer.distanceToSquared(this.pointerTarget) > 0.0001 && this.motionRequested && !this.motionMedia.matches;
    if (pointerMoving) { this.pointer.lerp(this.pointerTarget, 0.06); this.dirty = true; }
    const ambientVisible = (this.motionDirector?.getDiagnostics().activeBindings ?? 0) > 0;
    const ambientFps = this.motionDirector?.profile.ambientFps ?? getMotionProfile(this.chapterId).ambientFps;
    const ambientDue = motion && ambientVisible && now - this.lastAmbientFrame >= 1000 / ambientFps - 1;
    if ((this.dirty || ambientDue) && this.manifest && this.loaded) {
      if (this.dirty) { this.updateCamera(); this.textureRefreshPending = true; }
      // During preparation, determine readiness for the actual responsive camera,
      // then upload/draw its textures before allowing the outer ceremony to reveal it.
      if (!this.firstFrameReady) this.updateTextures();
      this.motionDirector?.update(this.camera, motion, this.progress);
      this.renderer.render(this.scene, this.camera);
      if (this.shaderFailed) return;
      this.updateNarrativeSpace(now);
      this.calligraphy.render(this.camera, this.progress);
      this.dirty = false;
      this.lastAmbientFrame = now;
      this.renderCount++;
      if (!this.firstFrameReady && this.ready && this.width > 1 && this.height > 1
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
    if (this.loaded && (visibleMotion || this.textureRefreshPending || this.dirty || pointerMoving)) this.requestFrame();
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
    const delay = this.preparationActive ? 0 : Math.max(0, 180 - (now - this.lastViewChange));
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
    const generation = this.narrativeGeneration, pixels = this.narrativePixels;
    // WebGL2's fence-backed read avoids synchronously draining the display's
    // GPU command queue. The thumbnail and its CPU buffer remain bounded.
    this.renderer.readRenderTargetPixelsAsync(this.narrativeTarget, 0, 0, width, height, pixels).then(() => {
      if (this.disposed || this.contextLost || generation !== this.narrativeGeneration) return;
      const currentBucket = `${this.width}:${this.height}:${Math.floor(this.progress * 24)}`;
      if (currentBucket !== bucket) { this.narrativeBucket = ''; return; }
      this.narrativeSpace = findNarrativeSpace(pixels, width, height, this.narrativeSpace, isCompactNarrativeViewport(this.width, this.height));
      this.onNarrativeSpace?.(this.narrativeSpace);
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
      compactReadingReserve: String(this.compactReserve),
      renderCount: String(this.renderCount), rafTicks: String(this.rafTicks), rafRunning: String(!!this.frame),
      firstFrameReady: String(this.firstFrameReady),
      contextLost: String(this.contextLost), contextRestores: String(this.contextRestoreCount),
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
    this.readingLayoutRoot?.style.removeProperty('--reading-min-paint-height');
    for (const { mesh, material } of this.objects) { mesh.geometry.dispose(); material.dispose(); }
    for (const entry of this.textures.values()) entry.texture?.dispose();
    this.calligraphy.dispose();
    this.narrativeTarget?.dispose();
    this.textures.clear();
    this.pending.clear(); this.queue = []; this.currentVisible.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

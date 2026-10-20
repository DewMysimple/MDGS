import * as THREE from 'three';
import type { SceneManifest } from '../types';
import { prepareScene } from './prepareScene';
import { CalligraphyLayer } from './CalligraphyLayer';
import { MotionDirector } from './MotionDirector';
import { getMotionProfile } from '../data/motionProfiles';
import { applyArtDirection } from './ArtDirectionLayer';
import { StableLayerSorting } from './StableLayerSorting';

interface TextureEntry { texture?: THREE.Texture; loading: boolean; lastSeen: number; bytes: number }
interface SceneObject { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; url?: string; animation?: { progress: number; matrix: number[] }[] }
const clamp = (v: number) => Math.min(1, Math.max(0, v));

export interface SceneMotionState { enabled: boolean; reducedMotion: boolean; supported: boolean }
export interface SceneRecoveryState { kind: 'none' | 'textures' | 'context-lost'; canRetry: boolean; failedTextures: number }

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
  private loaded = false;
  private errorUrls = new Set<string>();
  private pending = new Set<string>();
  private queue: string[] = [];
  private lastTextureCheck = 0;
  private textureRefreshPending = false;
  private currentVisible = new Set<string>();
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

  constructor(private host: HTMLElement, private status: (message: string | null) => void) {
    this.readingLayoutRoot = host.closest<HTMLElement>('.app-shell');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf8f5ed, 0);
    this.renderer.sortObjects = true;
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
    const base = `${import.meta.env.BASE_URL}assets/chapter-${chapterId}/`;
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
      this.objects.push({ mesh, material, url: definition.texture ? `${base}${definition.texture}` : undefined, animation: manifest.animations?.[source.name] });
    }
    // Source manifests stay untouched. Replacements and new world-space bridges share
    // this same streaming queue and disposal lifecycle, never a second texture loader.
    const art = await applyArtDirection(chapterId, manifest, this.objects, this.scene, this.abort.signal);
    if (this.disposed) throw new DOMException('Aborted', 'AbortError');
    // The first scroll is an overlapping sheet composition. Camera-yaw sorting
    // flips almost coplanar palace/figure sheets while their source poses stand
    // still. Use a source-derived stable viewing axis for this composition.
    if (chapterId === 1) {
      this.layerSorting = new StableLayerSorting(manifest, this.objects.map(object => object.mesh));
      this.renderer.setTransparentSort(this.layerSorting.compare);
    }
    this.motionDirector = new MotionDirector(chapterId, this.objects, manifest.stops);
    this.artCounts = { replacements: art.replacements, geometryRepairs: art.geometryRepairs, edgeRepairs: art.edgeRepairs, addedLayers: art.addedLayers, textLayers: art.textLayers.length };
    this.loaded = true;
    this.dirty = true;
    this.calligraphy.load(chapterId, manifest, art.textLayers);
    this.updateReadingMinimum();
    this.updateCamera();
    this.updateTextures();
    this.emitMotionState();
    this.requestFrame();
    return manifest;
  }

  resize(width: number, height: number) {
    this.width = width; this.height = height;
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

  setProgress(progress: number) { if (this.progress !== progress) { this.progress = clamp(progress); this.dirty = true; this.requestFrame(); } }
  setPointer(x: number, y: number) { this.pointerTarget.set(x, y); this.requestFrame(); }

  setMotionEnabled(enabled: boolean) {
    this.motionRequested = enabled;
    this.onMotionPreference();
  }

  getMotionState(): SceneMotionState {
    const supported = getMotionProfile(this.chapterId).enabled;
    const reducedMotion = this.motionMedia.matches;
    return { enabled: supported && this.loaded && this.motionRequested && !reducedMotion && !this.contextLost && !this.disposed && !document.hidden, reducedMotion, supported };
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
    if (this.disposed || !this.manifest || !this.loaded) return false;
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
    this.dirty = true;
    this.emitMotionState();
    this.requestFrame();
  };

  private onVisibility = () => {
    this.previousFrameTime = 0;
    if (document.hidden) { cancelAnimationFrame(this.frame); this.frame = 0; }
    else { this.dirty = true; this.requestFrame(); }
    this.emitMotionState();
  };

  private onContextLost = (event: Event) => {
    if (this.disposed) return;
    event.preventDefault();
    this.contextLost = true;
    this.contextRetryRequested = false;
    this.previousFrameTime = 0;
    cancelAnimationFrame(this.frame); this.frame = 0;
    this.status('画面暂时中断，请恢复画卷');
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
    if (!this.frame && !this.disposed && !this.contextLost && !document.hidden) this.frame = requestAnimationFrame(this.render);
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
    for (const object of this.objects) {
      if (!object.animation?.length) continue;
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
    if (this.disposed || this.contextLost) return;
    // Enlarge the frustum to prefetch neighbouring planes before they enter the painting.
    const preloadCamera = this.camera.clone();
    preloadCamera.fov = Math.min(125, this.camera.fov * 1.35);
    preloadCamera.aspect *= 1.45;
    preloadCamera.updateProjectionMatrix();
    this.projection.multiplyMatrices(preloadCamera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    const now = performance.now();
    this.currentVisible.clear();
    for (const object of this.objects) {
      if (!object.url) continue;
      if (this.frustum.intersectsObject(object.mesh)) {
        this.currentVisible.add(object.url);
        const entry = this.textures.get(object.url);
        if (entry) entry.lastSeen = now;
        else if (!this.pending.has(object.url) && !this.errorUrls.has(object.url)) {
          this.pending.add(object.url); this.queue.push(object.url);
        }
      }
    }
    this.pumpQueue();
    let totalBytes = [...this.textures.values()].reduce((sum, value) => sum + value.bytes, 0);
    const oldTextures = [...this.textures.entries()].filter(([url, entry]) => !this.currentVisible.has(url) && !entry.loading).sort((a, b) => a[1].lastSeen - b[1].lastSeen);
    for (const [url, entry] of oldTextures) {
      if (totalBytes < 160 * 1024 * 1024 && now - entry.lastSeen < 12000) break;
      entry.texture?.dispose();
      totalBytes -= entry.bytes;
      this.textures.delete(url);
      for (const object of this.objects) if (object.url === url) { object.material.map = null; object.material.needsUpdate = true; object.mesh.visible = false; }
    }
    const waiting = [...this.currentVisible].filter(url => !this.textures.get(url)?.texture && !this.errorUrls.has(url)).length;
    if (!waiting) {
      this.ready = true;
      this.status(this.errorUrls.size ? '部分画面资源未能加载，可重试补全' : null);
    }
    this.updateDiagnostics();
  }

  private pumpQueue() {
    if (this.disposed || this.contextLost) return;
    let loadingCount = [...this.textures.values()].filter(entry => entry.loading).length;
    while (this.queue.length && loadingCount < 4) {
      const url = this.queue.shift()!;
      this.pending.delete(url);
      if (!this.currentVisible.has(url)) continue;
      const entry: TextureEntry = { loading: true, lastSeen: performance.now(), bytes: 0 };
      this.textures.set(url, entry);
      loadingCount++;
      this.loader.load(url, texture => {
        if (this.disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        entry.texture = texture; entry.loading = false;
        entry.bytes = texture.image.width * texture.image.height * 4 * 1.333;
        for (const object of this.objects) if (object.url === url) {
          object.material.map = texture;
          object.material.needsUpdate = true;
          object.mesh.visible = true;
        }
        this.dirty = true;
        this.requestFrame();
        this.pumpQueue();
        this.updateTextures();
      }, undefined, () => {
        if (this.disposed) return;
        this.errorUrls.add(url);
        this.textures.delete(url);
        this.pumpQueue();
        this.updateTextures();
        if (!this.contextLost) this.status('部分画面资源未能加载，可重试补全');
      });
    }
  }

  private render = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.contextLost || document.hidden) return;
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
    const ambientDue = motion && ambientVisible && now - this.lastAmbientFrame >= 1000 / getMotionProfile(this.chapterId).ambientFps - 1;
    if ((this.dirty || ambientDue) && this.manifest && this.loaded) {
      if (this.dirty) { this.updateCamera(); this.textureRefreshPending = true; }
      this.motionDirector?.update(this.camera, motion, this.progress);
      this.renderer.render(this.scene, this.camera);
      this.calligraphy.render(this.camera, this.progress);
      this.dirty = false;
      this.lastAmbientFrame = now;
      this.renderCount++;
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

  /** Read-only canvas data is intentionally absent from the product interface. */
  private updateDiagnostics(throttled = false) {
    const now = performance.now();
    if (throttled && now - this.lastDiagnosticsTime < 100) return;
    this.lastDiagnosticsTime = now;
    const canvas = this.renderer.domElement;
    const motion = this.motionDirector?.getDiagnostics();
    const textureEntries = [...this.textures.values()];
    Object.assign(canvas.dataset, {
      chapter: String(this.chapterId), progress: this.progress.toFixed(6),
      motionEnabled: String(this.getMotionState().enabled), motionRequested: String(this.motionRequested),
      reducedMotion: String(this.motionMedia.matches), motionTime: (motion?.elapsedSeconds ?? 0).toFixed(6),
      motionBindings: String(motion?.bindings ?? 0), activeMotionLayers: String(motion?.activeBindings ?? 0),
      activePetals: String(motion?.activeGroups.petal ?? 0), activeBridges: String(motion?.activeGroups.bridge ?? 0), activeMotionNames: JSON.stringify(motion?.activeNames ?? []),
      motionClockSpeed: (motion?.clockSpeed ?? 1).toFixed(6), petalDensity: (motion?.petalDensity ?? 1).toFixed(6), cloudDensity: (motion?.cloudDensity ?? 1).toFixed(6), narrativePhase: motion?.phase ?? 'calm', effectiveMotionBudget: String(motion?.maxBindings ?? 0),
      artReplacements: String(this.artCounts.replacements), artGeometryRepairs: String(this.artCounts.geometryRepairs), artEdgeRepairs: String(this.artCounts.edgeRepairs), artAddedLayers: String(this.artCounts.addedLayers), artTextLayers: String(this.artCounts.textLayers),
      compactReadingReserve: String(this.compactReserve),
      renderCount: String(this.renderCount), rafTicks: String(this.rafTicks), rafRunning: String(!!this.frame),
      contextLost: String(this.contextLost), contextRestores: String(this.contextRestoreCount),
      textureCount: String(textureEntries.filter(entry => !!entry.texture).length),
      textureBytes: String(Math.round(textureEntries.reduce((sum, entry) => sum + entry.bytes, 0))),
      textureFailed: String(this.errorUrls.size), loadingTextures: String(textureEntries.filter(entry => entry.loading).length),
      visibleTextures: String(this.currentVisible.size), queuedTextures: String(this.queue.length),
      drawCalls: String(this.renderer.info.render.calls), geometries: String(this.renderer.info.memory.geometries),
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    window.clearTimeout(this.recoveryTimer);
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
    this.textures.clear();
    this.pending.clear(); this.queue = []; this.currentVisible.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

import * as THREE from 'three';
import type { SceneManifest } from '../types';
import { prepareScene } from './prepareScene';
import { CalligraphyLayer } from './CalligraphyLayer';

interface TextureEntry { texture?: THREE.Texture; loading: boolean; lastSeen: number; bytes: number }
interface SceneObject { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; url?: string; animation?: { progress: number; matrix: number[] }[] }
const clamp = (v: number) => Math.min(1, Math.max(0, v));

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
  private motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  private pointer = new THREE.Vector2();
  private pointerTarget = new THREE.Vector2();
  private abort = new AbortController();
  private calligraphy: CalligraphyLayer;

  constructor(private host: HTMLElement, private status: (message: string | null) => void) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf8f5ed, 0);
    this.renderer.sortObjects = true;
    this.renderer.domElement.setAttribute('aria-label', '原始 Blender 分层国画场景');
    this.host.appendChild(this.renderer.domElement);
    this.calligraphy = new CalligraphyLayer(this.host);
    this.frame = requestAnimationFrame(this.render);
  }

  async load(chapterId: number): Promise<SceneManifest> {
    this.status('正在展卷');
    const base = `/assets/chapter-${chapterId}/`;
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
    this.dirty = true;
    this.calligraphy.load(chapterId, manifest);
    this.updateCamera();
    this.updateTextures();
    return manifest;
  }

  resize(width: number, height: number) {
    this.width = width; this.height = height;
    this.renderer.setSize(width, height);
    this.calligraphy.resize(width, height);
    this.camera.aspect = width / height;
    this.dirty = true;
  }

  setProgress(progress: number) { if (this.progress !== progress) { this.progress = clamp(progress); this.dirty = true; } }
  setPointer(x: number, y: number) { this.pointerTarget.set(x, y); }

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
    if (this.motion) {
      const amplitude = Math.min(0.07, Math.abs(this.manifest.travel.range[1] - this.manifest.travel.range[0]) * 0.0002);
      this.p1.set(this.pointer.x * amplitude, this.pointer.y * amplitude * 0.4, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.add(this.p1);
    }
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(true);
    for (const object of this.objects) {
      if (!object.animation?.length) continue;
      const { a: key1, b: key2, t: mix } = this.bracket(object.animation, sourceProgress);
      this.m1.fromArray(key1.matrix).decompose(this.p1, this.q1, this.s1);
      this.m2.fromArray(key2.matrix).decompose(this.p2, this.q2, this.s2);
      object.mesh.matrix.compose(this.p1.lerp(this.p2, mix), this.q1.slerp(this.q2, mix), this.s1.lerp(this.s2, mix));
      object.mesh.updateMatrixWorld(true);
    }
  }

  private updateTextures() {
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
    if (!waiting && !this.ready) { this.ready = true; this.status(null); }
  }

  private pumpQueue() {
    if (this.disposed) return;
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
        this.pumpQueue();
        this.updateTextures();
      }, undefined, () => {
        this.errorUrls.add(url);
        this.textures.delete(url);
        this.pumpQueue();
        this.updateTextures();
        this.status('部分画面资源未能加载，请刷新重试');
      });
    }
  }

  private render = (now: number) => {
    if (this.disposed) return;
    if (this.pointer.distanceToSquared(this.pointerTarget) > 0.0001 && this.motion) { this.pointer.lerp(this.pointerTarget, 0.06); this.dirty = true; }
    if (this.dirty && this.manifest) {
      this.updateCamera();
      this.textureRefreshPending = true;
      this.renderer.render(this.scene, this.camera);
      this.calligraphy.render(this.camera, this.progress);
      this.dirty = false;
    }
    if (this.textureRefreshPending && this.manifest && now - this.lastTextureCheck > 100) {
      this.updateTextures();
      this.lastTextureCheck = now;
      this.textureRefreshPending = false;
    }
    this.frame = requestAnimationFrame(this.render);
  };

  dispose() {
    this.disposed = true;
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    for (const { mesh, material } of this.objects) { mesh.geometry.dispose(); material.dispose(); }
    for (const entry of this.textures.values()) entry.texture?.dispose();
    this.calligraphy.dispose();
    this.textures.clear();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}

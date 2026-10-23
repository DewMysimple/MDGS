import * as THREE from 'three';

/** Links native shader variants without drawing or changing authored artwork. */
export interface WarmObject {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  url?: string;
}
interface Submitted {
  object: WarmObject;
  handles: WebGLProgram[];
}
type Extension = { COMPLETION_STATUS_KHR: number };

export class ShaderWarmup {
  private readonly proxyScene = new THREE.Scene();
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  private readonly featureMap = new THREE.Texture();
  private extension: Extension | null;
  private queue: WarmObject[] = [];
  private submitted: Submitted[] = [];
  private queued = new Set<THREE.Material>();
  private complete = new Set<THREE.Material>();
  private pending = new Set<WebGLProgram>();
  private known = new Set<WebGLProgram>();
  private timer = 0;
  private generation = 0;
  private disposed = false;
  private cancelled = false;
  private abandoned = false;
  private contextLost = false;
  private started = 0;
  private lastPoll = 0;
  private batches = 0;
  private polls = 0;
  private compilationMs = 0;
  private completed = 0;
  private reason = '';

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene,
    private camera: THREE.Camera, private wake: () => void) {
    this.extension = renderer.getContext().getExtension('KHR_parallel_shader_compile');
    this.featureMap.colorSpace = THREE.SRGBColorSpace;
    this.target.texture.colorSpace = THREE.LinearSRGBColorSpace;
    document.addEventListener('visibilitychange', this.visibility);
    this.publish();
  }

  /** Feature-ahead links expected USE_MAP before streaming, using no draw. */
  enqueue(objects: readonly WarmObject[]) {
    if (!this.enabled()) return;
    if (!this.started) this.started = performance.now();
    for (const object of objects) {
      if (this.queued.has(object.material)) continue;
      this.queued.add(object.material);
      this.queue.push(object);
    }
    this.schedule(0);
  }

  /** The actual first frame remains pending until the relevant linked programs
   * are complete. Later autoplay never waits on this helper or changes time. */
  initialReady(objects: readonly WarmObject[], ready: (object: WarmObject) => boolean) {
    if (this.cancelled) return false;
    if (!this.enabled()) return true;
    return objects.every(object => !ready(object) || !object.mesh.visible || this.complete.has(object.material));
  }

  loseContext() {
    this.contextLost = true;
    this.generation++;
    window.clearTimeout(this.timer); this.timer = 0;
    this.queue = []; this.submitted = []; this.pending.clear(); this.known.clear();
    this.queued.clear(); this.complete.clear();
    this.publish();
  }

  restoreContext() {
    this.contextLost = false;
    if (this.cancelled) { this.publish(); return; }
    this.abandoned = false;
    this.reason = '';
    this.started = 0;
    this.extension = this.renderer.getContext().getExtension('KHR_parallel_shader_compile');
    this.publish();
  }

  get isCancelled() { return this.cancelled; }

  private enabled() { return !!this.extension && !this.disposed && !this.cancelled && !this.abandoned && !this.contextLost; }

  cancel(reason = 'cancelled') { this.cancelled = true; this.stop(reason, false); }

  private visibility = () => {
    window.clearTimeout(this.timer); this.timer = 0;
    if (!document.hidden && this.enabled()) this.schedule(0);
    this.publish();
  };

  private schedule(delay: number) {
    if (!this.timer && this.enabled() && !document.hidden && (this.queue.length || this.pending.size || this.submitted.length)) {
      const generation = this.generation;
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        if (generation === this.generation) this.tick();
      }, delay);
    }
  }

  private tick() {
    if (!this.enabled() || document.hidden) return;
    const gl = this.renderer.getContext();
    if (gl.isContextLost()) { this.loseContext(); return; }
    if (this.started && performance.now() - this.started > 30000) { this.stop('timeout'); return; }
    try {
      // COMPLETION_STATUS_KHR is the nonblocking readiness query. Do not use
      // LINK_STATUS/getUniforms/getAttributes/logs to emulate readiness here.
      if (performance.now() - this.lastPoll >= 16) {
        this.lastPoll = performance.now();
        for (const handle of this.pending) {
          this.polls++;
          if (gl.getProgramParameter(handle, this.extension!.COMPLETION_STATUS_KHR)) this.pending.delete(handle);
        }
      }
      this.submitted = this.submitted.filter(item => {
        if (item.handles.some(handle => this.pending.has(handle))) return true;
        this.complete.add(item.object.material); this.completed++; return false;
      });
      // One real material per task; submit opaque and transparent color/depth
      // transparent Back/Front variants without retaining changed state.
      const next = this.queue.shift();
      if (next) this.compile(next);
      this.publish();
      this.wake();
      this.schedule(this.queue.length ? 0 : 16);
    } catch (error) {
      // A preparation exception is not permission to suppress the renderer's
      // real shader error path. Fall back to its unchanged first-use draw.
      this.stop(`exception:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private compile(object: WarmObject) {
    const material = object.material;
    const previous = { transparent: material.transparent, depthWrite: material.depthWrite,
      side: material.side, map: material.map };
    const target = this.renderer.getRenderTarget();
    const face = this.renderer.getActiveCubeFace(), mip = this.renderer.getActiveMipmapLevel();
    const viewport = this.renderer.getViewport(new THREE.Vector4()).clone();
    const scissor = this.renderer.getScissor(new THREE.Vector4()).clone();
    const scissorTest = this.renderer.getScissorTest();
    const proxy = object.mesh.clone(false);
    // clone(false) shares the exact geometry/material and morph shape, but the
    // proxy never enters the real scene and never owns those shared resources.
    this.proxyScene.add(proxy);
    const started = performance.now();
    try {
      if (object.url && !material.map) material.map = this.featureMap;
      material.side = THREE.DoubleSide;
      material.transparent = false; material.depthWrite = true; material.needsUpdate = true;
      // All native shadow/depth/dithered passes render to linear non-XR RTs.
      // A default-framebuffer compile would prepare an unused sRGB variant.
      this.renderer.setRenderTarget(this.target);
      this.renderer.compile(this.proxyScene, this.camera, this.scene);
      material.transparent = true; material.depthWrite = false; material.needsUpdate = true;
      // Three r180 prepareMaterial links BackSide and FrontSide separately.
      // DITHERED source programs can also be transparent in the unchanged
      // NarrativeSpace color pass. Preparing all materials is conservative;
      // the extra native program/memory/link cost must be measured.
      this.renderer.compile(this.proxyScene, this.camera, this.scene);
      // Collect all public info.programs handles, not material.currentProgram:
      // the latter only retains FrontSide and can omit unfinished BackSide.
      for (const program of this.renderer.info.programs ?? []) if (program.program && !this.known.has(program.program as WebGLProgram)) {
        this.known.add(program.program as WebGLProgram); this.pending.add(program.program as WebGLProgram);
      }
      this.submitted.push({ object, handles: [...this.pending] });
      this.batches++;
    } finally {
      material.transparent = previous.transparent; material.depthWrite = previous.depthWrite;
      material.side = previous.side; material.map = previous.map; material.needsUpdate = true;
      this.proxyScene.remove(proxy);
      this.renderer.setRenderTarget(target, face, mip);
      this.renderer.setViewport(viewport); this.renderer.setScissor(scissor); this.renderer.setScissorTest(scissorTest);
      this.compilationMs += performance.now() - started;
    }
  }

  private stop(reason: string, wake = true) {
    this.generation++;
    window.clearTimeout(this.timer); this.timer = 0;
    this.abandoned = true; this.reason = reason;
    this.queue = []; this.submitted = []; this.pending.clear();
    this.publish();
    if (wake && !this.disposed && !this.contextLost) this.wake();
  }

  private publish() {
    Object.assign(this.renderer.domElement.dataset, {
      shaderWarmup: JSON.stringify({ extension: !!this.extension,
        generation: this.generation, queue: this.queue.length, pending: this.pending.size, submitted: this.submitted.length,
        completed: this.completed, batches: this.batches, polls: this.polls,
        compilationMs: this.compilationMs, hidden: document.hidden, contextLost: this.contextLost,
        abandoned: this.abandoned, reason: this.reason, disposed: this.disposed, cancelled: this.cancelled,
        checkShaderErrors: this.renderer.debug.checkShaderErrors }),
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stop('disposed');
    document.removeEventListener('visibilitychange', this.visibility);
    this.proxyScene.clear();
    this.known.clear(); this.queued.clear(); this.complete.clear();
    this.target.dispose(); this.featureMap.dispose();
    // Programs remain owned by WebGLRenderer. No deleteProgram, no own
    // compileAsync timer, and no promise capable of outliving this generation.
  }
}

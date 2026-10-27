import * as THREE from 'three';
import { FramePacer } from './FramePacer';
import { renderPixelRatio, type FrameRateLimit, type RenderQuality } from './renderQuality';

const vertex = `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uMotion;
  void main() {
    vUv = uv;
    vec3 p = position;
    // The painted branch is rooted at its lower-right end. Upper foliage
    // shares a gentle breeze instead of moving every petal independently.
    float tip = pow(clamp(uv.y, 0.0, 1.0), 1.5);
    p.x += sin(uTime * 0.32 + uv.y * 1.5) * tip * 0.006 * uMotion;
    p.y += sin(uTime * 0.23 + uv.x) * tip * 0.003 * uMotion;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragment = `
  uniform sampler2D uPainting;
  uniform float uReveal;
  uniform float uTime;
  uniform vec4 uTouches[8];
  uniform float uAspect;
  varying vec2 vUv;
  float grain(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    vec4 corners = vec4(dot(cell, vec2(17.3, 93.7)), dot(cell + vec2(1.0,0.0), vec2(17.3,93.7)), dot(cell + vec2(0.0,1.0), vec2(17.3,93.7)), dot(cell + vec2(1.0), vec2(17.3,93.7)));
    corners = fract(sin(corners) * 27319.417);
    return mix(mix(corners.x,corners.y,f.x),mix(corners.z,corners.w,f.x),f.y);
  }
  void main() {
    vec4 pigment = texture2D(uPainting, vUv);
    if (pigment.a < 0.001) discard;
    float wash = grain(vUv * 13.0) * 0.58 + grain(vUv * 37.0) * 0.28 + grain(vUv * 93.0) * 0.14;
    float emerging = smoothstep(wash - 0.22, wash + 0.22, uReveal * 1.5 - 0.25);
    float touched = 0.0;
    for (int i = 0; i < 8; i++) {
      vec4 touch = uTouches[i];
      float age = max(0.0, uTime - touch.z);
      vec2 distance = (vUv - touch.xy) * vec2(uAspect, 1.0);
      float spread = 0.047 + min(age, 4.0) * 0.012;
      float wet = exp(-dot(distance, distance) / (spread * spread));
      wet *= exp(-age * 0.48) * touch.w;
      touched = max(touched, wet);
    }
    float density = clamp(touched * (0.82 + wash * 0.18), 0.0, 1.0);
    float grey = dot(pigment.rgb, vec3(0.2126, 0.7152, 0.0722));
    vec3 wetted = mix(vec3(grey), pigment.rgb, 1.15) * 0.94;
    vec3 colour = mix(pigment.rgb, wetted, density * 0.8);
    gl_FragColor = vec4(colour, pigment.a * emerging);
    #include <colorspace_fragment>
  }
`;

/** A small, optional painted surface: the source artwork remains intact.
 * Pointer traces briefly deepen its pigment, like a damp brush on paper. */
export class PeonyBloomSurface {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 10);
  private geometry = new THREE.PlaneGeometry(2, 2, 70, 45);
  private texture?: THREE.Texture;
  private material: THREE.ShaderMaterial;
  private mesh: THREE.Mesh;
  private observer: ResizeObserver;
  private frame = 0;
  private wakeTimer = 0;
  private disposed = false;
  private ready = false;
  private active = true;
  private motion = true;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private clock = 0;
  private lastTime = 0;
  private renderQuality: RenderQuality = '720p';
  private frameRateLimit: FrameRateLimit = 30;
  private pacer = new FramePacer(this.frameRateLimit);
  private reveal = 0;
  private touches = Array.from({ length: 8 }, () => new THREE.Vector4(-10, -10, -100, 0));
  private nextTouch = 0;
  private lastTouch = -1;
  private width = 1;
  private height = 1;
  private artAspect = 1.5;
  private fitX = 1;
  private fitY = 1;
  private renderCount = 0;
  private failed = false;
  private hitMask?: { pixels: Uint8ClampedArray; width: number; height: number };
  private visibility = () => {
    this.lastTime = 0; this.pacer.reset();
    this.cancelScheduled(); this.schedule();
  };
  private preference = () => { this.lastTime = 0; this.pacer.reset(); this.cancelScheduled(); this.reveal = 1; if (this.reduced.matches) this.clearTouches(); this.schedule(); };
  private loss = (event: Event) => { event.preventDefault(); this.failed = true; this.cancelScheduled(); this.onState(false); };

  constructor(private host: HTMLElement, url: string, private onState: (ready: boolean) => void, private onBrush: () => void) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = () => { this.failed = true; this.onState(false); };
    this.camera.position.z = 2;
    this.material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true,
      uniforms: { uPainting: { value: null }, uReveal: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 }, uTouches: { value: this.touches }, uAspect: { value: this.artAspect } } });
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.scene.add(this.mesh);
    const canvas = this.renderer.domElement; canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.role = 'peony-pigment-surface';
    canvas.addEventListener('webglcontextlost', this.loss); canvas.addEventListener('pointermove', this.pointer);
    this.host.appendChild(canvas);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host); this.resize();
    document.addEventListener('visibilitychange', this.visibility); this.reduced.addEventListener('change', this.preference);
    new THREE.TextureLoader().load(url, texture => {
      if (this.disposed) { texture.dispose(); return; }
      this.texture = texture; texture.colorSpace = THREE.SRGBColorSpace;
      this.artAspect = texture.image.width / texture.image.height;
      const mask = document.createElement('canvas'); mask.width = 192; mask.height = Math.max(1, Math.round(192 / this.artAspect));
      const context = mask.getContext('2d', { willReadFrequently: true });
      if (context) {
        context.drawImage(texture.image, 0, 0, mask.width, mask.height);
        this.hitMask = { pixels: context.getImageData(0, 0, mask.width, mask.height).data, width: mask.width, height: mask.height };
      }
      this.material.uniforms.uPainting.value = texture; this.material.uniforms.uAspect.value = this.artAspect;
      this.ready = true; this.reveal = this.reduced.matches || !this.motion ? 1 : 0;
      this.resize(); this.schedule();
    }, undefined, () => { if (!this.disposed) { this.failed = true; this.onState(false); } });
  }

  private resize() {
    this.width = Math.max(1, this.host.clientWidth); this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setDrawingBufferSize(this.width, this.height, renderPixelRatio(this.width, this.height, devicePixelRatio, this.renderQuality));
    this.renderer.domElement.dataset.renderQuality = this.renderQuality;
    const aspect = this.width / this.height;
    this.fitX = Math.min(1, this.artAspect / aspect); this.fitY = Math.min(1, aspect / this.artAspect);
    this.mesh.scale.set(this.fitX, this.fitY, 1); this.schedule();
  }

  private pointer = (event: PointerEvent) => {
    if (!this.active || !this.motion || this.reduced.matches || event.pointerType === 'touch' || this.clock - this.lastTouch < .12) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const u = ((event.clientX - rect.left) / rect.width - .5) / this.fitX + .5;
    const v = (.5 - (event.clientY - rect.top) / rect.height) / this.fitY + .5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    if (this.hitMask) {
      const mask = this.hitMask, x = Math.min(mask.width - 1, Math.floor(u * mask.width));
      const y = Math.min(mask.height - 1, Math.floor((1 - v) * mask.height));
      if (mask.pixels[(y * mask.width + x) * 4 + 3] < 70) return;
    }
    this.touches[this.nextTouch].set(u, v, this.clock, 1); this.nextTouch = (this.nextTouch + 1) % this.touches.length;
    this.lastTouch = this.clock; this.onBrush(); this.schedule();
  };

  flourish() {
    if (!this.ready || this.failed) return;
    if (!this.active || !this.motion || this.reduced.matches || document.hidden) { this.onBrush(); return; }
    this.touches[0].set(.53, .71, this.clock, 1.4); this.touches[1].set(.27, .47, this.clock, 1.2);
    this.onBrush(); this.schedule();
  }

  private clearTouches() {
    this.touches.forEach(touch => touch.set(-10, -10, -100, 0));
    this.nextTouch = 0; this.lastTouch = -1;
  }

  setState(active: boolean, motion: boolean) {
    this.active = active; this.motion = motion; this.lastTime = 0; this.pacer.reset();
    this.cancelScheduled();
    // A transient wash belongs to the current encounter with the flower.
    // Pausing wind or leaving the foyer should not freeze a damp mark there.
    if (!active || !motion || this.reduced.matches) this.clearTouches();
    if (!motion || this.reduced.matches) this.reveal = 1;
    this.schedule();
  }

  setRenderQuality(quality: RenderQuality) {
    if (quality === this.renderQuality) return;
    this.renderQuality = quality;
    if (!this.disposed && !this.failed) this.resize();
  }

  setFrameRateLimit(limit: FrameRateLimit) {
    if (limit === this.frameRateLimit) return;
    this.frameRateLimit = limit; this.pacer.setLimit(limit);
    this.renderer.domElement.dataset.frameRateLimit = String(limit);
    this.schedule();
  }

  private schedule() {
    if (this.disposed || this.failed || this.frame || this.wakeTimer || !this.active || document.hidden) return;
    // Wake close to the ideal deadline, then align with display refresh. This
    // avoids running flower updates at a 144/250Hz monitor's callback rate.
    const delay = this.pacer.timeUntilDue(performance.now()) - 8;
    if (delay > 1) this.wakeTimer = window.setTimeout(() => { this.wakeTimer = 0; this.schedule(); }, delay);
    else this.frame = requestAnimationFrame(this.paint);
  }

  private cancelScheduled() {
    cancelAnimationFrame(this.frame); window.clearTimeout(this.wakeTimer);
    this.frame = 0; this.wakeTimer = 0;
  }

  private paint = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.failed || !this.active || document.hidden || !this.ready) return;
    if (!this.pacer.shouldRender(now)) { this.schedule(); return; }
    const moving = this.motion && !this.reduced.matches;
    if (!moving) { this.clearTouches(); this.reveal = 1; }
    const elapsed = this.lastTime ? Math.max(0, (now - this.lastTime) / 1000) : 0;
    this.lastTime = now;
    if (moving) { this.clock += elapsed; this.reveal = Math.min(1, this.reveal + elapsed / 2.2); }
    this.material.uniforms.uReveal.value = this.reveal;
    this.material.uniforms.uTime.value = this.clock;
    this.material.uniforms.uMotion.value = moving ? 1 : 0;
    try { this.renderer.render(this.scene, this.camera); }
    catch { this.failed = true; this.onState(false); return; }
    if (this.failed) return;
    this.renderCount++;
    if (this.renderCount === 1) this.onState(true);
    const canvas = this.renderer.domElement;
    canvas.dataset.renderCount = String(this.renderCount); canvas.dataset.paintingTime = this.clock.toFixed(3); canvas.dataset.reveal = this.reveal.toFixed(3);
    canvas.dataset.frameRateLimit = String(this.frameRateLimit);
    if (moving) this.schedule();
  };

  dispose() {
    this.disposed = true; this.cancelScheduled(); this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility); this.reduced.removeEventListener('change', this.preference);
    const canvas = this.renderer.domElement; canvas.removeEventListener('webglcontextlost', this.loss); canvas.removeEventListener('pointermove', this.pointer);
    this.texture?.dispose(); this.geometry.dispose(); this.material.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); canvas.remove();
  }
}

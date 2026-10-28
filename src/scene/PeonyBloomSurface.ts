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
    gl_FragColor = vec4(pigment.rgb, pigment.a * emerging);
    #include <colorspace_fragment>
  }
`;

/** An optional painted surface for the foyer's ambient flower animation. */
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
  private width = 1;
  private height = 1;
  private artAspect = 1.5;
  private fitX = 1;
  private fitY = 1;
  private renderCount = 0;
  private failed = false;
  private visibility = () => {
    this.lastTime = 0; this.pacer.reset();
    this.cancelScheduled(); this.schedule();
  };
  private preference = () => { this.lastTime = 0; this.pacer.reset(); this.cancelScheduled(); this.reveal = 1; this.schedule(); };
  private loss = (event: Event) => { event.preventDefault(); this.failed = true; this.cancelScheduled(); this.onState(false); };

  constructor(private host: HTMLElement, url: string, private onState: (ready: boolean) => void) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = () => { this.failed = true; this.onState(false); };
    this.camera.position.z = 2;
    this.material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, transparent: true,
      uniforms: { uPainting: { value: null }, uReveal: { value: 0 }, uTime: { value: 0 }, uMotion: { value: 1 } } });
    this.mesh = new THREE.Mesh(this.geometry, this.material); this.scene.add(this.mesh);
    const canvas = this.renderer.domElement; canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.role = 'peony-pigment-surface';
    canvas.addEventListener('webglcontextlost', this.loss);
    this.host.appendChild(canvas);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(this.host); this.resize();
    document.addEventListener('visibilitychange', this.visibility); this.reduced.addEventListener('change', this.preference);
    new THREE.TextureLoader().load(url, texture => {
      if (this.disposed) { texture.dispose(); return; }
      this.texture = texture; texture.colorSpace = THREE.SRGBColorSpace;
      this.artAspect = texture.image.width / texture.image.height;
      this.material.uniforms.uPainting.value = texture;
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

  setState(active: boolean, motion: boolean) {
    this.active = active; this.motion = motion; this.lastTime = 0; this.pacer.reset();
    this.cancelScheduled();
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
    if (!moving) this.reveal = 1;
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
    const canvas = this.renderer.domElement; canvas.removeEventListener('webglcontextlost', this.loss);
    this.texture?.dispose(); this.geometry.dispose(); this.material.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); canvas.remove();
  }
}

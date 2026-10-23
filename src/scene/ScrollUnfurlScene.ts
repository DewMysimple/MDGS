import * as THREE from 'three';
import { createPaintedScroll } from './scrollGeometry';
import { scrollHandoffFrame, smoothFraction, type ArtworkRect } from './scrollHandoff';

export interface UnfurlFrame {
  phase: string; elapsed: number; open: number; reduced: boolean; projectedArtRect: ArtworkRect | null; returningFromViewer: boolean; presentationReady: boolean;
}
export interface UnfurlSceneOptions {
  painting: string; motionEnabled: boolean; onError: (message: string) => void;
  onFrame?: (frame: UnfurlFrame) => void;
}

/** Only the ceremony's paper and shafts. The authored world is never moved or
 * relit; the final unlit print meets that world's actual native camera gate. */
export class ScrollUnfurlScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, .1, 120);
  private scroll: ReturnType<typeof createPaintedScroll> | null = null;
  private observer: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private lastRender = 0;
  private elapsed = 0;
  private open = 0;
  private returnStartOpen = 1;
  private returningFromViewer = false;
  private phase = 'ARTISTIC_TRANSITION';
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private disposed = false;
  private failed = false;
  private image: HTMLImageElement | null = null;
  private painting: THREE.Texture | null = null;
  private width = 1;
  private height = 1;
  private distance = 16;
  private frames = 0;
  private shadow: THREE.Mesh;
  private projectionPoints = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private startError: (event: Event) => void;
  private visibility = () => {
    this.lastTime = 0; this.lastRender = 0; cancelAnimationFrame(this.frame);
    if (!document.hidden && !this.disposed && !this.failed) this.frame = requestAnimationFrame(this.render);
  };

  constructor(private host: HTMLElement, private options: UnfurlSceneOptions) {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1;
    this.renderer.debug.onShaderError = () => this.fail('展卷材质暂未绘成，请重新展卷。');
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.dataset.role = 'unfurl-scene'; canvas.setAttribute('aria-hidden', 'true');
    this.startError = event => { event.preventDefault(); this.fail('展卷画境暂时中断，请重新展卷。'); };
    canvas.addEventListener('webglcontextlost', this.startError); host.append(canvas);
    this.scene.add(new THREE.HemisphereLight('#fffaf1', '#aeb9ab', 1.05));
    const light = new THREE.DirectionalLight('#fff7e9', 2.15);
    light.position.set(-3, 12, 5); light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = -7; light.shadow.camera.right = 7;
    light.shadow.camera.top = 7; light.shadow.camera.bottom = -7;
    light.shadow.normalBias = .006; light.shadow.bias = -.00005; light.shadow.radius = 4; this.scene.add(light);
    const fill = new THREE.DirectionalLight('#d7e2dc', .32); fill.position.set(5, 1, 6); this.scene.add(fill);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(45, 30), new THREE.ShadowMaterial({ color: '#63553d', opacity: .09 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.receiveShadow = true; this.scene.add(this.shadow);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize(); this.loadPainting(options.painting);
    document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.render);
  }

  private fail(message: string) {
    if (this.disposed || this.failed) return;
    this.failed = true; cancelAnimationFrame(this.frame); this.options.onError(message);
  }

  private loadPainting(src: string) {
    const image = new Image(); this.image = image; image.decoding = 'async'; image.src = src;
    image.decode().then(() => {
      if (this.disposed || this.failed) return;
      const aspect = image.naturalWidth / image.naturalHeight;
      if (!(aspect > 0) || !Number.isFinite(aspect)) throw new Error('Invalid artwork dimensions');
      const width = 9.5, borderX = .12, borderY = .045;
      const height = width / (aspect * (1 - borderY * 2) + borderX * 2);
      const artHeight = height * (1 - borderY * 2), artWidth = artHeight * aspect;
      this.painting = new THREE.Texture(image); this.painting.colorSpace = THREE.SRGBColorSpace;
      this.painting.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy()); this.painting.needsUpdate = true;
      this.scroll = createPaintedScroll({ width, height, artWidth, artHeight, painting: this.painting });
      this.scene.add(this.scroll.group); this.shadow.position.y = -height / 2 - height * .014;
      this.resize();
      const root = this.host.closest<HTMLElement>('.art-loading');
      if (root) {
        root.dataset.paintingReady = 'true'; root.dataset.paintingAspect = aspect.toFixed(6);
        root.dataset.paperAspect = (width / height).toFixed(6);
        root.dataset.artDimensions = JSON.stringify({ width: image.naturalWidth, height: image.naturalHeight });
      }
    }).catch(() => this.fail('卷中画材暂未载入，请重新展卷。'));
  }

  private resize() {
    this.lastRender = 0;
    this.width = Math.max(1, this.host.clientWidth); this.height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(this.width, this.height, false); this.camera.aspect = this.width / this.height;
    const paperWidth = this.scroll?.width ?? 9.5, paperHeight = this.scroll?.height ?? 5.1;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.distance = Math.max(paperWidth / (2 * tan * this.camera.aspect * .76), paperHeight * 1.11 / (2 * tan * .57));
    // The thin printed layer must resolve independently of the paper below it.
    // A 0.1–120 frustum wastes depth precision on a stage whose roll is ~20 away.
    this.camera.near = this.distance / 8; this.camera.far = this.distance * 3;
    this.camera.updateProjectionMatrix();
  }
  setPhase(phase: string) {
    if (phase === this.phase) return;
    if (phase === 'RETURNING_HOME') {
      this.returningFromViewer = this.frames === 0;
      this.returnStartOpen = this.returningFromViewer ? 1 : this.open;
    }
    this.elapsed = 0; this.lastTime = 0; this.lastRender = 0; this.phase = phase;
  }
  setMotionEnabled(_value: boolean) { /* No ambient loop competes with the physical unrolling. */ }

  private artworkRect(): ArtworkRect | null {
    if (!this.scroll) return null;
    const { artWidth, artHeight, height, group } = this.scroll, z = height * (.0012 / 2 + .00006);
    const corners = [[-artWidth / 2, artHeight / 2], [artWidth / 2, artHeight / 2], [artWidth / 2, -artHeight / 2], [-artWidth / 2, -artHeight / 2]];
    group.updateMatrixWorld(true); this.camera.updateMatrixWorld(true);
    this.projectionPoints.forEach((point, index) => point.set(corners[index][0], corners[index][1], z).applyMatrix4(group.matrixWorld).project(this.camera));
    const xs = this.projectionPoints.map(point => (point.x * .5 + .5) * this.width), ys = this.projectionPoints.map(point => (-point.y * .5 + .5) * this.height);
    const bounds = this.host.getBoundingClientRect();
    return { left: bounds.left + Math.min(...xs), top: bounds.top + Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  }

  private updateDiagnostics(open: number, projectedArtRect: ArtworkRect | null) {
    const root = this.host.closest<HTMLElement>('.art-loading'); if (!root) return;
    root.dataset.unfurl = open.toFixed(5); root.dataset.renderCount = String(this.frames);
    if (projectedArtRect) root.dataset.projectedArtRect = JSON.stringify(projectedArtRect);
    if (!this.scroll) return;
    root.dataset.rodSeparation = Number(this.scroll.group.userData.shaftSeparation).toFixed(5);
    root.dataset.paperCurvature = Number(this.scroll.group.userData.curlRadius).toFixed(5);
    root.dataset.paperThickness = Number(this.scroll.group.userData.thickness).toFixed(6);
    root.dataset.paperVertices = String(this.scroll.paperGeometry.attributes.position.count);
    const position = this.scroll.paperGeometry.attributes.position;
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < position.count; i++) { low = Math.min(low, position.getZ(i)); high = Math.max(high, position.getZ(i)); }
    root.dataset.paperZRange = (high - low).toFixed(6);
  }

  private render = (now: number) => {
    if (this.disposed || this.failed || document.hidden) return;
    const interval = this.phase === 'SCROLL_LOADING' && this.open === 1 ? 1000 / 12 : 1000 / 60;
    if (this.lastRender && now - this.lastRender < interval - .2) { this.frame = requestAnimationFrame(this.render); return; }
    this.lastRender = now;
    const elapsed = this.lastTime ? Math.max(0, (now - this.lastTime) / 1000) : 0;
    this.lastTime = now;
    // The native snapshot/cover has to be decoded before exhibition time runs.
    // A slow restored frame never spends its four seconds behind blank paper.
    if (this.scroll) this.elapsed += elapsed;
    let open = 0;
    if (this.phase === 'SCROLL_LOADING') open = smoothFraction((this.elapsed - .22) / 3.28);
    else if (['PAINTING_REVEAL', 'ENTERING_VIEWER'].includes(this.phase)) open = 1;
    else if (this.phase === 'RETURNING_HOME') open = this.returnStartOpen * (1 - smoothFraction((this.elapsed - (this.returningFromViewer ? .31 : 0)) / (this.returningFromViewer ? .58 : .75)));
    this.open = open;
    const handoff = scrollHandoffFrame(this.phase, this.elapsed, this.reduced.matches);
    const tilt = -.045 * (1 - handoff.straighten);
    this.camera.position.set(0, Math.sin(-tilt) * this.distance, Math.cos(tilt) * this.distance);
    this.camera.lookAt(0, 0, 0); this.camera.updateMatrixWorld(true);
    if (this.scroll) {
      this.scroll.setOpen(open); this.scroll.group.rotation.set(tilt, 0, 0); this.scroll.group.position.set(0, 0, 0);
    }
    try { this.renderer.render(this.scene, this.camera); }
    catch { this.fail('展卷画境暂未绘成，请重新展卷。'); return; }
    if (this.failed) return;
    this.frames++;
    const projectedArtRect = open > .9999 ? this.artworkRect() : null;
    this.updateDiagnostics(open, projectedArtRect);
    this.options.onFrame?.({ phase: this.phase, elapsed: this.elapsed, open, reduced: this.reduced.matches, projectedArtRect, returningFromViewer: this.returningFromViewer, presentationReady: !!this.scroll });
    this.frame = requestAnimationFrame(this.render);
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.startError);
    if (this.image) { this.image.onload = null; this.image.onerror = null; }
    this.scroll?.dispose(); this.painting?.dispose(); this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}

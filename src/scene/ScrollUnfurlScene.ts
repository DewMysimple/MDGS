import * as THREE from 'three';
import { createPaintedScroll, createSilkTexture, getScrollPaintingCrop } from './scrollGeometry';
import { studyGarden } from '../data/study';

export interface UnfurlSceneOptions {
  painting: string;
  motionEnabled: boolean;
  onError: (message: string) => void;
}

/** Real-time paper geometry and cylindrical shafts. It shares no rendering or
 * scene assets with the four narrative worlds and releases its own GL context. */
export class ScrollUnfurlScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, .1, 90);
  private paper = createSilkTexture();
  private scroll = createPaintedScroll({ width: 9.5, height: 3.55, paperTexture: this.paper });
  private observer: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private elapsed = 0;
  private ambientElapsed = 0;
  private phase = 'ARTISTIC_TRANSITION';
  private motion: boolean;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private disposed = false;
  private contextLost = false;
  private image: HTMLImageElement | null = null;
  private painting: THREE.Texture | null = null;
  private landscape: THREE.Texture | null = null;
  private mistTexture = (() => {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 64, 4, 128, 64, 124);
    gradient.addColorStop(0, '#f5f0e3a8'); gradient.addColorStop(.48, '#f5f0e36b'); gradient.addColorStop(1, '#f5f0e300');
    ctx.scale(1, .5); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  })();
  private petals: THREE.Mesh[] = [];
  private mist: THREE.Mesh[] = [];
  private contactShadow: THREE.Mesh | null = null;
  private frames = 0;
  private diagnosticRoot: HTMLElement | null;
  private lastDiagnostic = 0;
  private diagnosticUpdates = 0;
  private frameIntervals = new Float32Array(120);
  private intervalSamples = 0;
  private intervalCursor = 0;
  private maxFrameInterval = 0;
  private cpuTime = 0;
  private maxCpuTime = 0;
  private geometryTime = 0;
  private renderTime = 0;
  private startError: (event: Event) => void;
  private motionPreferenceChange = () => { this.lastTime = 0; this.requestFrame(); };
  private visibility = () => {
    this.lastTime = 0;
    cancelAnimationFrame(this.frame); this.frame = 0;
    if (!document.hidden) this.requestFrame();
  };

  private requestFrame() {
    if (!this.frame && !this.disposed && !this.contextLost && !document.hidden) this.frame = requestAnimationFrame(this.render);
  }

  constructor(private host: HTMLElement, private options: UnfurlSceneOptions) {
    this.motion = options.motionEnabled;
    this.diagnosticRoot = host.closest<HTMLElement>('.art-loading');
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    // A soft contact mesh keeps the grounded paper appearance without an
    // extra 1024² shadow render pass while the real chapter prepares behind it.
    this.renderer.shadowMap.enabled = false;
    const canvas = this.renderer.domElement;
    canvas.dataset.role = 'unfurl-scene'; canvas.setAttribute('aria-hidden', 'true');
    this.startError = event => {
      event.preventDefault(); this.contextLost = true; cancelAnimationFrame(this.frame); this.frame = 0;
      options.onError('展卷画境暂时中断，请重新展卷。');
    };
    canvas.addEventListener('webglcontextlost', this.startError);
    host.append(canvas);
    this.scene.fog = new THREE.Fog('#ede8dc', 14, 40);
    this.scene.add(new THREE.HemisphereLight('#fffaf0', '#b2b6a8', 2.1));
    const light = new THREE.DirectionalLight('#fff4dc', 2.2);
    light.position.set(-5, 8, 8); this.scene.add(light);
    const fill = new THREE.DirectionalLight('#c8d4d0', .7); fill.position.set(5, 2, 5); this.scene.add(fill);
    const floorMaterial = new THREE.MeshStandardMaterial({ map: this.paper, color: '#e4dfd1', roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(65, 65), floorMaterial);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.14; this.scene.add(floor);
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.4),
      new THREE.MeshBasicMaterial({ map: this.mistTexture, color: '#6e6655', transparent: true, opacity: .25, depthWrite: false }));
    this.contactShadow.rotation.x = -Math.PI / 2; this.contactShadow.position.set(0, -2.125, .3);
    this.contactShadow.renderOrder = 1; this.scene.add(this.contactShadow);
    this.buildMountains();
    this.loadDistantLandscape();
    this.buildFloralSprays();
    this.scene.add(this.scroll.group);
    this.scroll.group.position.y = .1; this.scroll.group.rotation.x = -.14;
    this.scroll.setOpen(0);
    this.updateDiagnostics(0, 0, true);
    this.loadPainting(options.painting);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize();
    document.addEventListener('visibilitychange', this.visibility);
    this.reduced.addEventListener('change', this.motionPreferenceChange);
    this.requestFrame();
  }

  private buildMountains() {
    const colors = ['#c6d0ca', '#d4d7cc', '#b9c8c0'];
    for (let layer = 0; layer < 3; layer++) {
      const shape = new THREE.Shape(); shape.moveTo(-23, -5);
      for (let i = 0; i <= 38; i++) {
        const x = -23 + i * 1.25;
        const peak = Math.abs(Math.sin(i * .61 + layer * .9)) * 2.1 + Math.sin(i * 1.9) * .38;
        shape.lineTo(x, -1.7 + peak + layer * .25);
      }
      shape.lineTo(25, -5); shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: .2, bevelEnabled: false });
      const mountain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: colors[layer], map: this.paper, roughness: 1, transparent: true, opacity: .44 - layer * .055 }));
      mountain.position.set(0, 1.5 + layer * .25, -6 - layer * 3); this.scene.add(mountain);
      const mist = new THREE.Mesh(new THREE.PlaneGeometry(42, 5), new THREE.MeshBasicMaterial({ map: this.mistTexture, color: '#f3eee3', transparent: true, opacity: .45 - layer * .08, depthWrite: false }));
      mist.position.set(layer % 2 ? 2 : -2, .6, -4 - layer * 2); this.scene.add(mist); this.mist.push(mist);
    }
  }

  private loadDistantLandscape() {
    const image = new Image(); image.decoding = 'async'; image.src = studyGarden;
    image.decode().then(() => {
      if (this.disposed || this.contextLost) return;
      this.landscape = new THREE.Texture(image); this.landscape.colorSpace = THREE.SRGBColorSpace; this.landscape.needsUpdate = true;
      // A distant painted silk screen is part of the volumetric stage. The
      // working scroll, shafts, foreground flora and their shadows are meshes.
      const geometry = new THREE.PlaneGeometry(39, 22, 24, 12);
      const positions = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) positions.setZ(i, -Math.pow(positions.getX(i) / 19, 2) * 1.2);
      geometry.computeVertexNormals();
      const screen = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: this.landscape, roughness: 1, color: '#fff9ed', transparent: true, opacity: .6 }));
      screen.position.set(0, 3, -10); this.scene.add(screen);
      this.renderer.initTexture(this.landscape);
      this.requestFrame();
    }).catch(() => { /* The journey's shared artwork decode reports this error. */ });
  }

  private buildFloralSprays() {
    const petalMaterials = ['#d69d99', '#dfb6ad', '#e5c9bd', '#bc7770'].map(color => new THREE.MeshStandardMaterial({ color, map: this.paper, roughness: 1, side: THREE.DoubleSide }));
    for (let i = 0; i < (innerWidth < 680 ? 5 : 9); i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(.09, 9, 6), petalMaterials[i % 4]);
      petal.scale.set(1, .25, .7); petal.position.set((i * 2.17) % 18 - 9, (i * .91) % 6 - 3, 2 + (i % 3));
      petal.userData.initial = petal.position.clone(); this.scene.add(petal); this.petals.push(petal);
    }
  }

  private loadPainting(src: string) {
    const image = new Image(); this.image = image; image.decoding = 'async'; image.src = src;
    image.decode().then(() => {
      if (this.disposed || this.contextLost) return;
      const canvas = document.createElement('canvas'); canvas.width = 1536;
      canvas.height = Math.round(canvas.width * 3.55 / 9.5);
      const ctx = canvas.getContext('2d')!;
      const volumeMatch = /#chapter-([1-4])$/.exec(src);
      const atlas = src.includes('paintings-atlas');
      const rowHeight = atlas ? image.naturalHeight / 4 : image.naturalHeight;
      const rowTop = atlas ? (Number(volumeMatch?.[1] ?? 1) - 1) * rowHeight : 0;
      const crop = getScrollPaintingCrop(image.naturalWidth, rowHeight, canvas.width, canvas.height);
      ctx.filter = atlas ? 'saturate(.91) brightness(1.025)' : 'none';
      ctx.drawImage(image, crop.x, rowTop + crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
      this.painting = new THREE.CanvasTexture(canvas); this.painting.colorSpace = THREE.SRGBColorSpace;
      this.painting.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.renderer.initTexture(this.painting);
      this.scroll.setPainting(this.painting);
      if (this.diagnosticRoot) {
        this.diagnosticRoot.dataset.paintingReady = 'true';
        this.diagnosticRoot.dataset.paintingFit = 'cover';
        this.diagnosticRoot.dataset.paintingCrop = [crop.x, rowTop + crop.y, crop.width, crop.height].map(value => value.toFixed(3)).join(',');
        this.diagnosticRoot.dataset.paintingCanvas = `${canvas.width},${canvas.height}`;
        this.diagnosticRoot.dataset.paintingCoverage = '1';
      }
      this.requestFrame();
    }).catch(() => { if (!this.disposed) this.options.onError('卷中画材暂未载入，请重新展卷。'); });
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    // The opening scene competes with a decoding/uploading chapter. Cap its
    // fill rate on HiDPI screens rather than rendering ~5M shaded pixels.
    const ratio = Math.min(devicePixelRatio, width < 680 ? 1.3 : 1.5, Math.max(.75, Math.sqrt(2_000_000 / (width * height))));
    if (Math.abs(this.renderer.getPixelRatio() - ratio) > .01) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    const distance = this.camera.aspect < 1 ? 17.3 / this.camera.aspect : 12.8;
    this.camera.position.set(0, 1.5, distance); this.camera.lookAt(0, -.05, 0); this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    // Framing a wide scroll on a phone moves the camera back. Fog is relative
    // to that camera, so it never washes the actual scroll out on narrow views.
    fog.near = distance + 1.2; fog.far = distance + 27.2;
    this.requestFrame();
  }

  setPhase(phase: string) {
    if (phase === this.phase) return;
    this.elapsed = 0;
    this.phase = phase;
    this.scroll.group.position.z = 0;
    this.lastTime = 0; this.requestFrame();
  }
  setMotionEnabled(value: boolean) { this.motion = value; this.requestFrame(); }

  private updateDiagnostics(open: number, now: number, force = false) {
    if (!force && now - this.lastDiagnostic < 200) return;
    this.lastDiagnostic = now;
    const root = this.diagnosticRoot;
    if (!root) return;
    root.dataset.unfurl = open.toFixed(4);
    root.dataset.rodSeparation = Number(this.scroll.group.userData.shaftSeparation).toFixed(4);
    root.dataset.paperCurvature = Number(this.scroll.group.userData.curlRadius).toFixed(4);
    root.dataset.renderCount = String(this.frames);
    root.dataset.paperVertices = String(this.scroll.paperGeometry.attributes.position.count);
    root.dataset.paperZRange = Number(this.scroll.group.userData.paperZRange).toFixed(5);
    root.dataset.geometryUpdates = String(this.scroll.group.userData.geometryUpdates);
    root.dataset.diagnosticUpdates = String(++this.diagnosticUpdates);
    const sorted = Array.from(this.frameIntervals.subarray(0, this.intervalSamples)).sort((a, b) => a - b);
    root.dataset.unfurlFrameP95Ms = (sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] || 0).toFixed(2);
    root.dataset.unfurlMaxFrameMs = this.maxFrameInterval.toFixed(2);
    root.dataset.unfurlCpuMs = this.cpuTime.toFixed(3);
    root.dataset.unfurlMaxCpuMs = this.maxCpuTime.toFixed(3);
    root.dataset.unfurlGeometryMs = this.geometryTime.toFixed(3);
    root.dataset.unfurlRenderMs = this.renderTime.toFixed(3);
    root.dataset.unfurlDrawCalls = String(this.renderer.info.render.calls);
    root.dataset.unfurlShadowMode = 'contact';
    root.dataset.unfurlPixelRatio = this.renderer.getPixelRatio().toFixed(2);
  }

  private render = (now: number) => {
    this.frame = 0;
    if (this.disposed || this.contextLost || document.hidden) return;
    const frameStart = performance.now();
    const elapsed = this.lastTime ? Math.max(0, (now - this.lastTime) / 1000) : 0;
    const dt = Math.min(.08, elapsed);
    this.lastTime = now;
    if (elapsed > 0) {
      const interval = elapsed * 1000;
      this.frameIntervals[this.intervalCursor] = interval;
      this.intervalCursor = (this.intervalCursor + 1) % this.frameIntervals.length;
      this.intervalSamples = Math.min(this.intervalSamples + 1, this.frameIntervals.length);
      this.maxFrameInterval = Math.max(this.maxFrameInterval, interval);
    }
    // Ceremony time follows visible wall time, even when a slow device has a
    // long frame; the smaller step is only for gentle ambient motion.
    this.elapsed += elapsed;
    const ambient = this.motion && !this.reduced.matches;
    if (ambient) this.ambientElapsed += dt;
    let progress = 0;
    if (this.phase === 'SCROLL_LOADING') {
      const raw = THREE.MathUtils.clamp((this.elapsed - .3) / 3.05, 0, 1);
      progress = raw * raw * (3 - 2 * raw);
    } else if (this.phase === 'PAINTING_REVEAL' || this.phase === 'ENTERING_VIEWER') progress = 1;
    else if (this.phase === 'RETURNING_HOME') progress = Math.max(0, 1 - this.elapsed / .8);
    const geometryStart = performance.now();
    this.scroll.setOpen(progress);
    this.geometryTime = performance.now() - geometryStart;
    if (this.contactShadow) this.contactShadow.scale.x = .18 + progress * .82;
    this.scroll.group.position.y = .1 + (ambient ? Math.sin(this.ambientElapsed * .35) * .018 : 0);
    for (let i = 0; i < this.petals.length; i++) {
      const petal = this.petals[i];
      petal.visible = ambient;
      if (!ambient) continue;
      const t = this.ambientElapsed * (.17 + i * .012);
      const initial = petal.userData.initial as THREE.Vector3;
      petal.position.set(initial.x + Math.sin(t + i) * .4, 3 - ((t + i * .81) % 6), initial.z);
      petal.rotation.set(t * .5 + i, t * .7, Math.sin(t + i) * .5);
    }
    for (let i = 0; i < this.mist.length; i++) this.mist[i].position.x = Math.sin(this.ambientElapsed * .04 + i) * .32;
    if (this.phase === 'ENTERING_VIEWER' && !this.reduced.matches) this.scroll.group.position.z = Math.min(4, this.elapsed * 3);
    const renderStart = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.renderTime = performance.now() - renderStart;
    this.frames++;
    this.cpuTime = performance.now() - frameStart;
    this.maxCpuTime = Math.max(this.maxCpuTime, this.cpuTime);
    this.updateDiagnostics(progress, now);
    const changingPaper = this.phase === 'SCROLL_LOADING' && this.elapsed < 3.35
      || this.phase === 'RETURNING_HOME' && this.elapsed < .8
      || this.phase === 'ENTERING_VIEWER' && !this.reduced.matches && this.elapsed < 1.4;
    if (ambient || changingPaper) this.requestFrame();
    else this.lastTime = 0;
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    this.reduced.removeEventListener('change', this.motionPreferenceChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.startError);
    if (this.image) { this.image.onload = null; this.image.onerror = null; }
    this.scroll.group.removeFromParent(); this.scroll.dispose();
    this.painting?.dispose(); this.landscape?.dispose(); this.paper.dispose(); this.mistTexture.dispose();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    });
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}

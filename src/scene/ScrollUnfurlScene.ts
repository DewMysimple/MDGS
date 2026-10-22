import * as THREE from 'three';
import { createPaintedScroll, createSilkTexture } from './scrollGeometry';
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
  private scroll = createPaintedScroll({ width: 9.5, height: 3.55 });
  private observer: ResizeObserver;
  private frame = 0;
  private lastTime = 0;
  private elapsed = 0;
  private ambientElapsed = 0;
  private phase = 'ARTISTIC_TRANSITION';
  private motion: boolean;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private disposed = false;
  private image: HTMLImageElement | null = null;
  private painting: THREE.Texture | null = null;
  private landscape: THREE.Texture | null = null;
  private paper = createSilkTexture();
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
  private frames = 0;
  private startError: (event: Event) => void;
  private visibility = () => {
    this.lastTime = 0;
    cancelAnimationFrame(this.frame);
    if (!document.hidden && !this.disposed) this.frame = requestAnimationFrame(this.render);
  };

  constructor(private host: HTMLElement, private options: UnfurlSceneOptions) {
    this.motion = options.motionEnabled;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 680 ? 1.5 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.13;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = this.renderer.domElement;
    canvas.dataset.role = 'unfurl-scene'; canvas.setAttribute('aria-hidden', 'true');
    this.startError = event => { event.preventDefault(); options.onError('展卷画境暂时中断，请重新展卷。'); };
    canvas.addEventListener('webglcontextlost', this.startError);
    host.append(canvas);
    this.scene.fog = new THREE.Fog('#ede8dc', 14, 40);
    this.scene.add(new THREE.HemisphereLight('#fffaf0', '#b2b6a8', 2.1));
    const light = new THREE.DirectionalLight('#fff4dc', 2.2);
    light.position.set(-5, 8, 8); light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024); light.shadow.camera.left = -9; light.shadow.camera.right = 9;
    light.shadow.camera.top = 7; light.shadow.camera.bottom = -7;
    light.shadow.normalBias = .025; light.shadow.bias = -.0001;
    light.shadow.radius = 5; this.scene.add(light);
    const fill = new THREE.DirectionalLight('#c8d4d0', .7); fill.position.set(5, 2, 5); this.scene.add(fill);
    const floorMaterial = new THREE.MeshStandardMaterial({ map: this.paper, color: '#e4dfd1', roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(65, 65), floorMaterial);
    floor.rotation.x = -Math.PI / 2; floor.position.y = -2.14; floor.receiveShadow = true; this.scene.add(floor);
    this.buildMountains();
    this.loadDistantLandscape();
    this.buildFloralSprays();
    this.scene.add(this.scroll.group);
    this.scroll.group.position.y = .1; this.scroll.group.rotation.x = -.14;
    this.scroll.setOpen(0);
    this.updateDiagnostics(0);
    this.loadPainting(options.painting);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(host);
    this.resize();
    document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.render);
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
      if (this.disposed) return;
      this.landscape = new THREE.Texture(image); this.landscape.colorSpace = THREE.SRGBColorSpace; this.landscape.needsUpdate = true;
      // A distant painted silk screen is part of the volumetric stage. The
      // working scroll, shafts, foreground flora and their shadows are meshes.
      const geometry = new THREE.PlaneGeometry(39, 22, 24, 12);
      const positions = geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) positions.setZ(i, -Math.pow(positions.getX(i) / 19, 2) * 1.2);
      geometry.computeVertexNormals();
      const screen = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: this.landscape, roughness: 1, color: '#fff9ed', transparent: true, opacity: .6 }));
      screen.position.set(0, 3, -10); this.scene.add(screen);
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
      if (this.disposed) return;
      const canvas = document.createElement('canvas'); canvas.width = 1536;
      canvas.height = Math.round(canvas.width * 3.55 / 9.5);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#eee6d5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const volumeMatch = /#chapter-([1-4])$/.exec(src);
      const atlas = src.includes('paintings-atlas');
      const rowHeight = atlas ? image.naturalHeight / 4 : image.naturalHeight;
      const rowTop = atlas ? (Number(volumeMatch?.[1] ?? 1) - 1) * rowHeight : 0;
      const sourceWidth = Math.min(image.naturalWidth, rowHeight * 2.57);
      ctx.globalAlpha = .98; ctx.filter = atlas ? 'saturate(.91) brightness(1.025)' : 'none';
      const fit = Math.min((canvas.width - 80) / sourceWidth, (canvas.height - 72) / rowHeight);
      const paintedWidth = sourceWidth * fit, paintedHeight = rowHeight * fit;
      ctx.drawImage(image, Math.max(0, (image.naturalWidth - sourceWidth) / 2), rowTop, sourceWidth, rowHeight,
        (canvas.width - paintedWidth) / 2, (canvas.height - paintedHeight) / 2, paintedWidth, paintedHeight);
      ctx.globalAlpha = 1; ctx.filter = 'none';
      ctx.strokeStyle = '#9cae9c'; ctx.lineWidth = 9; ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
      ctx.strokeStyle = '#baa272'; ctx.lineWidth = 2; ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
      for (let i = 0; i < 700; i++) {
        ctx.fillStyle = i % 7 ? '#ae9c6314' : '#c3a76888';
        ctx.fillRect((i * 71.33) % canvas.width, (i * 113.19) % canvas.height, i % 4 ? 1 : 2.4, 1.2);
      }
      this.painting = new THREE.CanvasTexture(canvas); this.painting.colorSpace = THREE.SRGBColorSpace;
      this.painting.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      this.scroll.setPainting(this.painting);
      this.host.closest<HTMLElement>('.art-loading')?.setAttribute('data-painting-ready', 'true');
    }).catch(() => { if (!this.disposed) this.options.onError('卷中画材暂未载入，请重新展卷。'); });
  }

  private resize() {
    const width = Math.max(1, this.host.clientWidth), height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height;
    const distance = this.camera.aspect < 1 ? 17.3 / this.camera.aspect : 12.8;
    this.camera.position.set(0, 1.5, distance); this.camera.lookAt(0, -.05, 0); this.camera.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    // Framing a wide scroll on a phone moves the camera back. Fog is relative
    // to that camera, so it never washes the actual scroll out on narrow views.
    fog.near = distance + 1.2; fog.far = distance + 27.2;
  }

  setPhase(phase: string) {
    if (phase === this.phase) return;
    this.elapsed = 0;
    this.phase = phase;
  }
  setMotionEnabled(value: boolean) { this.motion = value; }

  private updateDiagnostics(open: number) {
    const root = this.host.closest<HTMLElement>('.art-loading');
    if (!root) return;
    root.dataset.unfurl = open.toFixed(4);
    root.dataset.rodSeparation = Number(this.scroll.group.userData.shaftSeparation).toFixed(4);
    root.dataset.paperCurvature = Number(this.scroll.group.userData.curlRadius).toFixed(4);
    root.dataset.renderCount = String(this.frames);
    root.dataset.paperVertices = String(this.scroll.paperGeometry.attributes.position.count);
    root.dataset.paperZRange = (() => {
      const z = this.scroll.paperGeometry.attributes.position;
      let low = Infinity, high = -Infinity;
      for (let i = 0; i < z.count; i++) { low = Math.min(low, z.getZ(i)); high = Math.max(high, z.getZ(i)); }
      return (high - low).toFixed(5);
    })();
  }

  private render = (now: number) => {
    if (this.disposed || document.hidden) return;
    const elapsed = this.lastTime ? Math.max(0, (now - this.lastTime) / 1000) : 0;
    const dt = Math.min(.08, elapsed);
    this.lastTime = now;
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
    this.scroll.setOpen(progress);
    this.scroll.group.position.y = .1 + (ambient ? Math.sin(this.ambientElapsed * .35) * .018 : 0);
    this.petals.forEach((petal, i) => {
      petal.visible = ambient;
      if (!ambient) return;
      const t = this.ambientElapsed * (.17 + i * .012);
      const initial = petal.userData.initial as THREE.Vector3;
      petal.position.set(initial.x + Math.sin(t + i) * .4, 3 - ((t + i * .81) % 6), initial.z);
      petal.rotation.set(t * .5 + i, t * .7, Math.sin(t + i) * .5);
    });
    this.mist.forEach((mist, i) => { mist.position.x = Math.sin(this.ambientElapsed * .04 + i) * .32; });
    if (this.phase === 'ENTERING_VIEWER' && !this.reduced.matches) this.scroll.group.position.z = Math.min(4, this.elapsed * 3);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    this.updateDiagnostics(progress);
    this.frame = requestAnimationFrame(this.render);
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.startError);
    if (this.image) { this.image.onload = null; this.image.onerror = null; }
    this.scroll.dispose(); this.painting?.dispose(); this.landscape?.dispose(); this.paper.dispose(); this.mistTexture.dispose();
    this.scene.traverse(object => {
      if (!(object instanceof THREE.Mesh) || object.parent === this.scroll.group) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    });
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}

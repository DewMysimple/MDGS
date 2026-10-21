import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPaintedScroll } from './scrollGeometry';
import { paintedSurface, petalGeometry, softSmokeTexture } from './studyMaterials';
import { gongbiBloomGeometries, leafPigment } from './GongbiBloom';

type Callbacks = { ready: () => void; error: (message: string) => void; select: (id: number) => void; hover: (id: number | null) => void };
type PaintedScroll = ReturnType<typeof createPaintedScroll>;
const base = import.meta.env.BASE_URL;
const clamp = THREE.MathUtils.clamp;

/** All room silhouettes, occluders, paper curls and furniture are world-space solids. */
export class StudyRoomRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, .1, 100);
  private root = new THREE.Group();
  private table = new THREE.Group();
  private scrolls: PaintedScroll[] = [];
  private flowers: THREE.Group[] = [];
  private bloomSites: { parent: THREE.Group; position: THREE.Vector3; scale: number; type: number; tilt: number; turn: number }[] = [];
  private lanterns: THREE.Group[] = [];
  private smoke: THREE.Sprite[] = [];
  private petals: THREE.Mesh[] = [];
  private dust: THREE.Points;
  private textures = new Set<THREE.Texture>();
  private materials = new Set<THREE.Material>();
  private size = { width: 1, height: 1 };
  private pointer = new THREE.Vector2();
  private observed = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private cameraBase = new THREE.Vector3();
  private lookBase = new THREE.Vector3();
  private hoverId: number | null = null;
  private selected = 1;
  private phase = 'HOME';
  private phaseAt = 0;
  private animation = 0;
  private last = 0;
  private time = 0;
  private frameCount = 0;
  private enabled = true;
  private active = true;
  private alive = true;
  private ready = false;
  private compiled = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private resizeObserver: ResizeObserver;
  private scrollTextures: THREE.Texture[] = [];
  private diagnostic: { snapshot: () => unknown };

  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor('#eee7d7');
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = 'study-volume-canvas';
    this.renderer.domElement.setAttribute('aria-label', '实时三维纸绢书房：书案、窗棂、四幅卷轴与牡丹');
    host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color('#eee8d9');
    this.scene.fog = new THREE.Fog('#eee8db', 45, 100);
    this.scene.add(this.root);
    this.scene.add(new THREE.HemisphereLight('#fff9e9', '#c3b49e', 1.5));
    const sun = new THREE.DirectionalLight('#fff6e2', 1.6);
    sun.position.set(-5, 13, -1); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: .5, far: 40 });
    sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -.0007; sun.shadow.normalBias = .025;
    sun.shadow.radius = 4; this.scene.add(sun);
    const front = new THREE.DirectionalLight('#eee6d9', .7); front.position.set(0, 6, 12); this.scene.add(front);
    this.buildRoom(); this.buildDesk(); this.buildObjects(); this.buildFlowers();
    const dustPositions = new Float32Array(42 * 3);
    for (let i = 0; i < 42; i++) { dustPositions[i*3] = Math.sin(i*19.3)*7; dustPositions[i*3+1] = 2+(i*1.37%6); dustPositions[i*3+2] = Math.cos(i*8.7)*5; }
    const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: '#c4af82', size: .025, transparent: true, opacity: .38, depthWrite: false }));
    this.root.add(this.dust);
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    host.addEventListener('pointermove', this.move); host.addEventListener('pointerleave', this.leave); host.addEventListener('click', this.click);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    document.addEventListener('visibilitychange', this.visibility); this.reduced.addEventListener('change', this.motionChange);
    this.diagnostic = { snapshot: () => this.snapshot() };
    (window as unknown as Record<string, unknown>).__MDGS_STUDY__ = this.diagnostic;
    this.resize(); this.start(); void this.loadArt();
  }

  private material(colour: string, map?: THREE.Texture) {
    const material = new THREE.MeshStandardMaterial({ color: colour, map, roughness: .94, metalness: .015 });
    this.materials.add(material); return material;
  }
  private texture(kind: Parameters<typeof paintedSurface>[0], colour: string) {
    const map = paintedSurface(kind, colour); this.textures.add(map); return map;
  }
  private mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, position: number[], parent = this.root) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(position[0],position[1],position[2]);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  private box(name: string, w: number, h: number, d: number, mat: THREE.Material, xyz: number[], parent = this.root) {
    return this.mesh(name, new THREE.BoxGeometry(w,h,d), mat, xyz, parent);
  }
  private cylinder(name: string, r1: number, r2: number, h: number, mat: THREE.Material, xyz: number[], parent = this.root, sides = 20) {
    return this.mesh(name, new THREE.CylinderGeometry(r1,r2,h,sides),mat,xyz,parent);
  }
  private curve(name: string, points: number[][], radius: number, mat: THREE.Material, parent = this.root) {
    return this.mesh(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))), 24, radius, 5, false), mat, [0,0,0], parent);
  }

  private buildRoom() {
    const wood = this.material('#b4a18b', this.texture('wood','#625344'));
    const jade = this.material('#eee9d8', this.texture('brocade','#667b76'));
    const gild = this.material('#b1a078'); const stone = this.material('#faf4e8',this.texture('stone','#b9b6a5'));
    // The room floor stops at the window wall. Extending it behind the window
    // would occlude the lower garden and leave a blank strip above the desk.
    this.box('stone-floor-volume', 32,.16,24,stone,[0,-.13,7]);
    const rug = this.material('#fff1d9',this.texture('rug','#c9b99d'));
    this.box('woven-carpet',15,.035,11,rug,[0,.012,2.5]);
    const seams:THREE.BufferGeometry[]=[];
    for(let x=-12;x<=12;x+=2) for(let z=-5;z<12;z+=2) {
      seams.push(new THREE.BoxGeometry(.012,.004,2).translate(x,.001,z),new THREE.BoxGeometry(2,.004,.012).translate(x+1,.001,z+1));
    }
    const inlays=this.mesh('stone-inlays-volume',mergeGeometries(seams)!,this.material('#a7a28b'),[0,0,0]);inlays.castShadow=false;seams.forEach(g=>g.dispose());
    for (const sign of [-1,1]) {
      this.box('room-side-wall', 1.1,9,.4,jade,[sign*7.6,4.4,-5.5]);
      const windowX=sign<0?-6.9:8.3;
      this.box('carved-window-pier',.3,10,.5,wood,[windowX-1.1,4.9,-5.2]);
      this.box('carved-window-pier',.35,10,.5,wood,[windowX+1.1,4.9,-5.2]);
      this.box('lower-window-panel',2,2.35,.25,jade,[windowX,1.4,-5.2]);
      for(const y of [.35,2.57,9]) this.box('window-rail',2.3,.14,.28,wood,[windowX,y,-5]);
      for(let i=0;i<7;i++) this.box('window-lattice-volume',.058,6.7,.1,wood,[windowX+(i-3)*.3,5.9,-5.1]);
      for(let i=0;i<12;i++) {
        const y=2.9+i*.51; this.box('window-cross-lattice',2,.055,.13,wood,[windowX,y,-5]);
        if(i%2===0) for(let j=0;j<3;j++) this.box('window-square-mullion',.09,.4,.08,gild,[windowX+(j-1)*.6,y+.22,-4.99]);
      }
      for(let i=0;i<3;i++) this.box('panel-gold-inlay',1.7,.025,.03,gild,[windowX,.55+i*.6,-5.04]);
      this.box('ceiling-side-post',.38,9,.55,wood,[sign*8.2,4.5,1]);
      this.box('side-console-top',2.3,.18,1.9,wood,[sign*6.9,3.25,-4.15]);
      for (const a of [-.85,.85]) for(const b of [-.65,.65]) this.box('console-leg',.14,3.1,.14,wood,[sign*6.9+a,1.6,-4.15+b]);
      for(let k=0;k<4;k++) this.box('console-carved-apron',2.1,.12,.08,k%2?gild:wood,[sign*6.9,2.7+k*.1,-3.2]);
    }
    this.box('room-lintel',20,.35,.65,wood,[0,10,-5.1]);
    const horizon=this.mesh('distant-painted-landscape',new THREE.PlaneGeometry(33,17),new THREE.MeshBasicMaterial({color:'#ffffff'}),[0,1,-25]);
    horizon.castShadow=false; horizon.receiveShadow=false;
  }

  private buildDesk() {
    this.root.add(this.table); this.table.name='volumetric-carved-desk';
    const wood = this.material('#c6b49c',this.texture('wood','#665342'));
    const edge=this.material('#8d6c49'); const dark=this.material('#65513d');
    this.box('desk-solid-top',13.5,.27,5.5,wood,[0,2.72,0],this.table);
    this.box('desk-top-gilded-bead',13.6,.065,5.56,edge,[0,2.83,0],this.table);
    this.box('desk-top-inlay',13.3,.06,5.28,wood,[0,2.88,0],this.table);
    this.box('desk-front-carved-apron',13.1,.7,.19,wood,[0,2.2,2.58],this.table);
    for(const z of [-2.61,2.7]) for(const y of [1.92,2.47,2.6]) this.box('desk-moulded-rail',13.1,.065,.1,edge,[0,y,z],this.table);
    for(const x of [-5.8,5.8]) for(const z of [-1.9,1.9]) {
      this.box('desk-leg-square',.43,2.5,.43,wood,[x,1.25,z],this.table);
      this.box('desk-leg-foot',.65,.16,.6,wood,[x,.13,z+.06],this.table);
      this.box('desk-leg-collar',.5,.1,.5,edge,[x,.56,z],this.table);
      this.box('desk-leg-carved-panel',.24,1.15,.025,edge,[x,1.35,z+.23],this.table);
    }
    for(const x of [-5.8,5.8]) this.box('desk-cross-stretcher',.2,.2,4.2,wood,[x,.65,0],this.table);
    for(let i=0;i<6;i++) {
      this.box('desk-carved-peony-panel',2.1,.53,.045,wood,[(i-2.5)*2.17,2.2,2.715],this.table);
      this.box('desk-carved-panel-divider',.035,.57,.07,edge,[(i-2.5)*2.17-1.065,2.2,2.72],this.table);
    }
    const brocade=this.material('#eee8d6',this.texture('brocade','#87968a'));
    this.box('brocade-table-runner',7.8,.022,5.45,brocade,[0,2.926,0],this.table);
    const blank=this.texture('silk','#ecdec3');
    const silkEdge=this.material('#a7b7a0',this.texture('brocade','#b1bca3'));
    for(let i=0;i<4;i++) {
      const scroll=createPaintedScroll({width:6,height:2.7,paperTexture:blank});
      scroll.group.name=`study-scroll-${i+1}`; scroll.group.rotation.set(-Math.PI/2,0,Math.PI/2);
      // The exposed silk wound over each solid axis remains cylindrical and
      // casts its own contact shadow; it is not part of the painted flat sheet.
      for(const name of ['left-shaft','right-shaft']) {
        const shaft=scroll.group.getObjectByName(name) as THREE.Group;
        this.cylinder('home-wound-silk-roll',.175,.175,2.58,this.material('#f3e5ca',blank),[0,0,0],shaft,40);
      }
      for(const side of [-1,1])this.box('scroll-woven-selvedge',6,.085,.016,silkEdge,[0,side*1.31,.026],scroll.group);
      scroll.group.traverse(o=>{o.userData.scrollId=i+1;if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
      this.root.add(scroll.group); this.scrolls.push(scroll);
    }
    // Front edge underlays show the paper's contact with a surface, not a floating rectangle.
    this.box('desk-back-edge',13.3,.06,.06,dark,[0,2.98,-2.57],this.table);
  }

  private buildObjects() {
    const bronze=this.material('#a09068'), silk=this.material('#fff0cf',this.texture('silk','#e6d8ba'));
    const jade=this.material('#e4e9d5',this.texture('brocade','#6e8d85'));
    const wood=this.material('#b4a282',this.texture('wood','#81735c'));
    const lantern=new THREE.Group(); lantern.position.set(-6.9,5.4,-1.3); this.root.add(lantern); this.lanterns.push(lantern);
    this.cylinder('silk-lantern-body',.46,.46,1.7,silk,[0,0,0],lantern,8);
    for(const y of [-.91,.91]) { this.cylinder('lantern-cap',.55,.6,.12,bronze,[0,y,0],lantern,8); this.cylinder('lantern-cap-stem',.13,.12,.2,bronze,[0,y*1.18,0],lantern); }
    for(let i=0;i<8;i++) this.cylinder('lantern-bronze-rib',.012,.012,1.9,bronze,[Math.cos(i*Math.PI/4)*.46,0,Math.sin(i*Math.PI/4)*.46],lantern,6);
    this.cylinder('lantern-stand',.055,.1,4.55,bronze,[-6.9,2.35,-1.3]);
    this.cylinder('lantern-foot',.45,.55,.11,bronze,[-6.9,.075,-1.3]);
    const lampLight=new THREE.PointLight('#f6dfb7',2,4,2); lampLight.position.set(0,0,.4); lantern.add(lampLight);
    // Ceramic bodies are lathed, with rounded rims, painted motifs and visible openings.
    for(const [x,z] of [[6.8,-4.1],[-6.5,-4.15]]) {
      const points=[[0,0],[.3,0],[.36,.08],[.58,.45],[.53,.85],[.25,1.1],[.22,1.35],[.28,1.42]].map(p=>new THREE.Vector2(p[0],p[1]));
      this.mesh('hand-painted-celadon-vase',new THREE.LatheGeometry(points,32),jade,[x,3.35,z]);
      const rim=this.mesh('ceramic-thick-rim',new THREE.TorusGeometry(.265,.035,8,32),bronze,[x,4.77,z]); rim.rotation.x=Math.PI/2;
    }
    const incense=new THREE.Group(); incense.position.set(7.25,3.42,-3.45); this.root.add(incense);
    this.mesh('incense-bowl',new THREE.SphereGeometry(.32,24,16),bronze,[0,.18,0],incense).scale.y=.65;
    this.cylinder('incense-neck',.22,.28,.13,bronze,[0,.38,0],incense);
    this.mesh('incense-lid',new THREE.SphereGeometry(.24,20,12,0,Math.PI*2,0,Math.PI/2),bronze,[0,.45,0],incense);
    this.cylinder('incense-finial',.035,.07,.18,bronze,[0,.72,0],incense);
    for(const side of [-1,1])this.curve('incense-bronze-ear',[[side*.25,.18,0],[side*.43,.25,0],[side*.4,.45,0],[side*.24,.4,0]],.026,bronze,incense);
    for(let i=0;i<3;i++) this.cylinder('incense-foot',.035,.045,.22,bronze,[Math.cos(i*Math.PI*2/3)*.22,-.03,Math.sin(i*Math.PI*2/3)*.22],incense);
    const smokeMap=softSmokeTexture(); this.textures.add(smokeMap);
    for(let i=0;i<14;i++) {
      const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeMap,color:'#eef0e3',transparent:true,opacity:.12,depthWrite:false}));
      this.root.add(sprite); this.smoke.push(sprite);
    }
    for(let i=0;i<7;i++) {
      const x=-7.1+(i%2)*.16,z=-3.4+(i%3)*.2,y=3.42+i*.09;
      this.box('silk-bound-book',1.25,.09,.7,i%2?jade:silk,[x,y,z]); this.box('book-spine',.045,.095,.71,bronze,[x-.63,y,z]);
    }
    const brushPot=this.cylinder('brush-holder',.25,.24,.65,jade,[-5.9,3.27,-.2]);
    for(let i=0;i<5;i++) { const b=this.cylinder('bamboo-brush',.023,.023,1.2,wood,[-5.9+(i-2)*.05,3.85,-.2]); b.rotation.z=(i-2)*.13; const tip=this.cylinder('brush-tip',.004,.04,.27,silk,[-5.9+(i-2)*.12,4.5,-.2]); tip.rotation.z=(i-2)*.13; }
    brushPot.receiveShadow=true;
    const petalGeo=petalGeometry(.16), petalMat=this.material('#d89c96'); petalMat.side=THREE.DoubleSide;
    for(let i=0;i<15;i++) { const p=this.mesh('wind-carried-peony-petal',petalGeo,petalMat,[0,0,0]); p.castShadow=false; this.petals.push(p); }
  }

  private buildFlowers() {
    const stemMat=this.material('#5f6651');
    const pigment=leafPigment();this.textures.add(pigment);
    const leafMat=this.material('#dce2c7',pigment);leafMat.side=THREE.DoubleSide;
    const locations=[[-5.6,1.45,5.2],[-4.75,.72,5.7],[-3.95,.15,6.4],[5.7,1.2,5.1],[4.8,.6,5.8],[3.95,.1,6.4],[-6.5,4.7,-4.15],[6.7,4.7,-4.1]];
    for(let k=0;k<locations.length;k++) {
      const cluster=new THREE.Group();cluster.position.set(...locations[k] as [number,number,number]);cluster.name=k<6?'foreground-peony-plant':'vase-peony-plant';this.root.add(cluster);this.flowers.push(cluster);
      const near=k<6, count=near?5:4, scale=near?1:.47;
      for(let j=0;j<count;j++) {
        const x=Math.sin(j*2.4+k)*.75*scale, y=(.4+j*.44)*scale, z=Math.cos(j*3.4)*.22;
        this.curve('painted-peony-branch',[[0,-1.25,0],[x*.6,y*.5,z],[x,y+.2,z]],.023*scale,stemMat,cluster);
        this.bloomSites.push({parent:cluster,position:new THREE.Vector3(x,y+.25,z),scale:(near?.68:.35)*(1+(j%3)*.16),type:(k+j)%3,tilt:near?-.65:-.28,turn:Math.sin(k+j)*.45});
        for(let l=0;l<5;l++) {const leaf=new THREE.Mesh(petalGeometry(.85*scale),leafMat);leaf.position.set(x*.6,y-.5-l*.13,z-.04);leaf.rotation.set(-.45,Math.sin(l)*.3,l%2?1.2:-1.2);leaf.scale.x=.52;leaf.castShadow=true;cluster.add(leaf);}
      }
      this.batchBotanicalMeshes(cluster);
    }
    const twig=this.material('#77614c');
    for(const sign of [-1,1]) {
      const cluster=new THREE.Group();this.root.add(cluster);
      this.curve('window-blossom-branch',[[sign*6.4,5.6,-4.2],[sign*5.9,6.8,-4.3],[sign*4,7.3,-4.6],[sign*2.8,7.0,-4.8]],.021,twig,cluster);
      this.curve('window-blossom-fork',[[sign*5.8,6.6,-4.3],[sign*4.8,7.75,-4.4],[sign*3.9,8.1,-4.4]],.013,twig,cluster);
      for(let j=0;j<15;j++) {
        const x=sign*(5.9-j*.21), y=6.85+Math.sin(j*.87)*.36+(j%3)*.13;
        this.bloomSites.push({parent:cluster,position:new THREE.Vector3(x,y,-4.35),scale:.1+(j%3)*.025,type:j%3,tilt:-.1,turn:j*.8});
      }
    }
  }

  private batchBotanicalMeshes(group:THREE.Group) {
    group.updateWorldMatrix(true,true);const inverse=group.matrixWorld.clone().invert();
    const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),old:THREE.Mesh[]=[];
    group.traverse(o=>{if(o instanceof THREE.Mesh&&!Array.isArray(o.material)){const list=batches.get(o.material)??[];list.push(o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld)));batches.set(o.material,list);old.push(o);}});
    old.forEach(o=>{o.removeFromParent();o.geometry.dispose();});
    for(const [material,parts] of batches) {
      const geometry=mergeGeometries(parts)!;const mesh=new THREE.Mesh(geometry,material);mesh.name='sculpted-peony-branch-volume';mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
      // Pigment is carried by the cupped surfaces. Avoid expensive triangle
      // edge extraction for every repeated petal cluster at page startup.
      parts.forEach(g=>g.dispose());
    }
  }

  private async loadArt() {
    try {
      const loader=new THREE.TextureLoader();
      const [garden,atlas,brocade,ornament,blooms,carpet]=await Promise.all([
        loader.loadAsync(`${base}ui/study-faithful/garden.webp`),loader.loadAsync(`${base}ui/study-faithful/scroll-paintings.webp`),
        loader.loadAsync(`${base}ui/study-volume/brocade.webp`),loader.loadAsync(`${base}ui/study-faithful/ornament-atlas.webp`),loader.loadAsync(`${base}ui/study-faithful/peony-blooms.webp`),
        loader.loadAsync(`${base}ui/study-faithful/carpet.webp`),
      ]);
      if(!this.alive) {for(const t of [garden,atlas,brocade,ornament,blooms,carpet])t.dispose();return;}
      for(const t of [garden,atlas,brocade,ornament,blooms,carpet]) {t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.textures.add(t);}
      const carpetMesh=this.scene.getObjectByName('woven-carpet') as THREE.Mesh;
      const carpetMaterial=carpetMesh.material as THREE.MeshStandardMaterial;
      carpetMaterial.map=carpet;carpetMaterial.color.set('#ffffff');carpetMaterial.needsUpdate=true;
      const runner=this.scene.getObjectByName('brocade-table-runner') as THREE.Mesh;
      (runner.material as THREE.MeshStandardMaterial).map=brocade;(runner.material as THREE.Material).needsUpdate=true;
      const rows=Array.from({length:4},(_,row)=>{const t=ornament.clone();t.repeat.set(1,.25-2/1254);t.offset.set(0,(3-row)*.25+1/1254);t.needsUpdate=true;this.textures.add(t);return t;});
      const panels=rows.map(map=>{const m=this.material('#ffffff',map);m.bumpMap=map;m.bumpScale=.016;m.emissiveMap=map;m.emissive.set('#ffffff');m.emissiveIntensity=.13;return m;});
      this.scene.traverse(o=>{
        if(!(o instanceof THREE.Mesh))return;
        if(o.name==='desk-carved-peony-panel'||o.name==='lower-window-panel') {
          const old=o.material as THREE.Material, surface=panels[o.name==='desk-carved-peony-panel'?0:2];o.material=[old,old,old,old,surface,old];
        } else if(o.name==='desk-top-inlay') {
          const old=o.material as THREE.Material;o.material=[old,old,panels[1],old,old,old];
        } else if(o.name==='silk-lantern-body'||o.name==='home-wound-silk-roll')o.material=panels[3];
        else if(o.name==='hand-painted-celadon-vase'||o.name==='brush-holder'){(o.material as THREE.MeshStandardMaterial).map=brocade;(o.material as THREE.Material).needsUpdate=true;}
        else if(o.name.startsWith('incense-')&&o.name!=='incense-foot')o.material=panels[0];
      });
      const distant=this.scene.getObjectByName('distant-painted-landscape') as THREE.Mesh;
      (distant.material as THREE.MeshBasicMaterial).map=garden;(distant.material as THREE.Material).needsUpdate=true;
      for(let i=0;i<4;i++) {
        const map=atlas.clone();map.repeat.set(.25-1/2172,1-1/724);map.offset.set(i*.25+.5/2172,.5/724);map.needsUpdate=true;
        const uv=this.scrolls[i].paperGeometry.attributes.uv;
        for(let k=0;k<uv.count;k++){const u=uv.getX(k),v=uv.getY(k);uv.setXY(k,1-v,u);}uv.needsUpdate=true;
        this.scrolls[i].setPainting(map);this.textures.add(map);this.scrollTextures.push(map);
      }
      const corollas=gongbiBloomGeometries(blooms.image as HTMLImageElement);
      const paint=new THREE.MeshStandardMaterial({map:blooms,color:'#fff9ef',roughness:1,metalness:0,alphaTest:.18,side:THREE.DoubleSide,emissive:'#ffffff',emissiveMap:blooms,emissiveIntensity:.18});this.materials.add(paint);
      for(const site of this.bloomSites) {
        const mesh=new THREE.Mesh(corollas[site.type],paint);mesh.name='gongbi-volumetric-peony-corolla';mesh.position.copy(site.position);mesh.scale.setScalar(site.scale);mesh.rotation.set(site.tilt,0,site.turn);mesh.castShadow=true;mesh.receiveShadow=true;site.parent.add(mesh);
      }
      await this.renderer.compileAsync(this.scene,this.camera);
      if(!this.alive)return;
      this.compiled=true;this.render();this.ready=true;this.host.dataset.sceneState='ready';
      const snapshot=this.snapshot();this.host.dataset.geometries=String(snapshot.objects.length);
      this.host.dataset.volumetricObjects=String(snapshot.objects.filter(o=>!['PlaneGeometry','BufferGeometry'].includes(o.geometryType)).length);
      this.callbacks.ready();
    } catch { if(this.alive){this.host.dataset.sceneState='error';this.callbacks.error('书房画材暂未齐备，请重新陈设。');} }
  }

  private resize() {
    const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;
    this.size={width,height}; const mobile=width<720, portrait=width/height<.85;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.35:1.7));this.renderer.setSize(width,height,false);
    this.camera.aspect=width/height;this.camera.fov=portrait?43:35;
    this.cameraBase.set(0,portrait?14.5:9,13.5);this.lookBase.set(0,portrait?3.3:2.75,-.8);
    if(width/height>2) {this.cameraBase.y=9.4;this.cameraBase.z=16.5;this.lookBase.y=3.9;}
    this.table.scale.set(portrait?.57:1,1,portrait?1.4:1.3);this.table.position.z=portrait?0:-.8;
    const garden=this.scene.getObjectByName('distant-painted-landscape')!;
    garden.position.y=portrait?-2.05:1;garden.scale.y=portrait?1.215:1;
    this.flowers.slice(0,6).forEach(f=>{f.userData.originalPosition??=f.position.clone();f.position.copy(f.userData.originalPosition);if(portrait){f.position.x*=.48;f.position.z*=.83;f.position.y*=.65;}});
    this.root.children.forEach(o=>{
      if(/^(room-side-wall|carved-window-pier|lower-window-panel|window-rail|window-lattice-volume|window-cross-lattice|window-square-mullion|panel-gold-inlay)$/.test(o.name)) {
        o.userData.desktopX??=o.position.x;o.position.x=o.userData.desktopX*(portrait?.53:1);o.scale.x=portrait?.65:1;
      }
    });
    this.scrolls.forEach((s,i)=>{
      if(portrait){s.group.scale.set(.45,.83,.83);s.group.position.set(i%2===0?-1.65:1.65,3.0,i<2?-2.25:1.45);}
      else {s.group.scale.setScalar(1);s.group.position.set((i-1.5)*3.18,3.02,-.85);}
    });
    this.camera.position.copy(this.cameraBase);this.camera.lookAt(this.lookBase);this.camera.updateProjectionMatrix();
    this.render();this.start();
  }
  setMotion(enabled: boolean) {this.enabled=enabled;this.pointer.set(0,0);this.observed.set(0,0);this.render();this.start();}
  setPhase(phase: string, chapter: number) {
    const continuedApproach=phase==='ARTISTIC_TRANSITION'&&this.phase==='CAMERA_ENTERING';
    this.phase=phase;this.selected=chapter;if(!continuedApproach)this.phaseAt=performance.now();
    this.active=['HOME','SCROLL_AWAKENING','CAMERA_ENTERING','ARTISTIC_TRANSITION','RETURNING_HOME'].includes(phase);this.start();
  }
  setHover(id: number|null) {this.hoverId=id;this.render();}
  private move=(event:PointerEvent)=>{
    if(this.phase!=='HOME')return;const r=this.host.getBoundingClientRect();
    this.pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const id=this.pickScroll();
    if(this.hoverId!==id){this.hoverId=id;this.callbacks.hover(id);this.host.style.cursor=id?'pointer':'default';}
    this.start();
  };
  private leave=()=>{this.pointer.set(0,0);this.hoverId=null;this.callbacks.hover(null);this.start();};
  private click=(event:MouseEvent)=>{
    if(this.phase!=='HOME'||!this.ready)return;
    const r=this.host.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.camera);
    const id=this.pickScroll();
    if(id)this.callbacks.select(id);
  };
  private pickScroll():number|null {
    const hit=this.raycaster.intersectObjects(this.root.children,true).find(hit=>{
      if(!(hit.object instanceof THREE.Mesh)||hit.object.name==='wind-carried-peony-petal')return false;
      let object:THREE.Object3D|null=hit.object;
      while(object){if(!object.visible)return false;object=object.parent;}
      return true;
    });
    return hit?.object.userData.scrollId??null;
  }
  private contextLost=(event:Event)=>{event.preventDefault();cancelAnimationFrame(this.animation);this.animation=0;this.callbacks.error('书房画面暂时中断，请重新陈设。');};
  private visibility=()=>{this.last=0;if(document.hidden){cancelAnimationFrame(this.animation);this.animation=0;}else this.start();};
  private motionChange=()=>{this.pointer.set(0,0);this.observed.set(0,0);this.start();};
  private start() {if(!this.alive||document.hidden||!this.active||this.animation)return;this.animation=requestAnimationFrame(this.tick);}
  private tick=(now:number)=>{
    this.animation=0;if(!this.alive||document.hidden||!this.active)return;
    const dt=this.last?Math.min(.05,(now-this.last)/1000):.016;this.last=now;
    const moving=this.enabled&&!this.reduced.matches;
    if(moving)this.time+=dt;
    this.observed.lerp(moving?this.pointer:new THREE.Vector2(),1-Math.exp(-dt*3.5));
    this.render();
    if(moving||this.phase!=='HOME'||this.observed.length()>.001)this.start();
  };
  private render() {
    if(!this.compiled)return;
    const moving=this.enabled&&!this.reduced.matches, t=this.time;
    const entering=this.phase==='CAMERA_ENTERING'||this.phase==='ARTISTIC_TRANSITION';
    const focus=entering&&!this.reduced.matches?Math.min(1,(performance.now()-this.phaseAt)/600)*.4:0;
    this.camera.position.copy(this.cameraBase);
    if(moving){this.camera.position.x+=this.observed.x*.32+Math.sin(t*.14)*.035;this.camera.position.y+=this.observed.y*.12+Math.sin(t*.18)*.025;}
    const target=this.lookBase.clone();
    if(focus){this.camera.position.lerp(new THREE.Vector3(this.scrolls[this.selected-1].group.position.x*.85,6,8),focus);target.lerp(this.scrolls[this.selected-1].group.position,focus);}
    this.camera.lookAt(target);this.camera.updateMatrixWorld();
    this.scrolls.forEach((s,i)=>{s.group.position.y=3.02+(this.hoverId===i+1&&this.phase==='HOME'?.045:0)+(this.selected===i+1&&this.phase!=='HOME'?.08:0);});
    this.flowers.forEach((f,i)=>{f.rotation.z=moving?Math.sin(t*.42+i*1.73)*.014:0;});
    this.lanterns.forEach((l,i)=>{l.rotation.z=moving?Math.sin(t*.56+i)*.012:0;const light=l.children.find(c=>c instanceof THREE.PointLight) as THREE.PointLight;light.intensity=1.6+(moving?Math.sin(t*1.3)*.13:0);});
    this.smoke.forEach((s,i)=>{const a=(t*.11+i/14)%1;s.visible=moving;s.position.set(7.25+Math.sin(a*5+t*.23)*a*.3,4.23+a*3.4,-3.45+Math.cos(a*3)*.08);s.scale.setScalar(.3+a*.9);(s.material as THREE.SpriteMaterial).opacity=Math.sin(a*Math.PI)*.11;});
    this.petals.forEach((p,i)=>{p.visible=moving;const a=(t*(.025+(i%3)*.004)+i/15)%1;p.position.set(Math.sin(i*23)*7-a*1.5,9-a*9,Math.cos(i*7)*4+2);p.rotation.set(t*.2+i,t*.3+i,t*.1+i);p.scale.setScalar(.55+(i%4)*.25);});
    this.dust.visible=moving;this.dust.rotation.y=t*.006;
    this.renderer.render(this.scene,this.camera);this.frameCount++;this.layoutLabels();
  }
  private project(v:THREE.Vector3) {const p=v.clone().project(this.camera);return{x:(p.x*.5+.5)*this.size.width,y:(-.5*p.y+.5)*this.size.height};}
  private layoutLabels() {
    this.scrolls.forEach((s,i)=>{
      const isPortrait=this.size.width/this.size.height<.85;
      const p=this.project(new THREE.Vector3(s.group.position.x,s.group.position.y,isPortrait?s.group.position.z+1.35:2.15));if(!isPortrait)p.y-=8;
      const el=this.host.parentElement?.querySelector<HTMLElement>(`.study-scroll-entry[data-entry-id="${i+1}"]`);
      if(el){el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;}
    });
  }
  snapshot() {
    const objects:{name:string;geometryType:string;vertices:number;worldPosition:{x:number;y:number;z:number};screenPosition:{x:number;y:number}}[]=[];
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh){const p=o.getWorldPosition(new THREE.Vector3());objects.push({name:o.name||'painted-peony-surface',geometryType:o.geometry.type,vertices:o.geometry.attributes.position?.count??0,worldPosition:{x:p.x,y:p.y,z:p.z},screenPosition:this.project(p)});}});
    const scrolls=this.scrolls.map((s,i)=>{
      s.group.updateWorldMatrix(true,true);const mesh=s.group.getObjectByName('bending-silk-front') as THREE.Mesh;const p=s.paperGeometry.attributes.position;
      const projectVertex=(index:number)=>this.project(new THREE.Vector3().fromBufferAttribute(p,index).applyMatrix4(mesh.matrixWorld));
      const points=Array.from({length:p.count},(_,index)=>projectVertex(index));
      return{id:i+1,center:this.project(s.group.position),corners:[0,160,p.count-1,p.count-161].map(projectVertex),paperBounds:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))},paperVertices:p.count,rodRadius:s.group.userData.curlRadius,open:s.group.userData.open};
    });
    return {ready:this.ready,camera:{x:this.camera.position.x,y:this.camera.position.y,z:this.camera.position.z},renderCount:this.frameCount,environmentTime:this.time,environmentActive:this.enabled&&!this.reduced.matches&&!document.hidden,dimensions:this.size,objects,scrolls};
  }
  dispose() {
    this.alive=false;cancelAnimationFrame(this.animation);this.resizeObserver.disconnect();
    this.host.removeEventListener('pointermove',this.move);this.host.removeEventListener('pointerleave',this.leave);this.host.removeEventListener('click',this.click);
    document.removeEventListener('visibilitychange',this.visibility);this.reduced.removeEventListener('change',this.motionChange);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
    const g=new Set<THREE.BufferGeometry>(),m=new Set<THREE.Material>();this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){g.add(o.geometry);for(const a of Array.isArray(o.material)?o.material:[o.material])m.add(a);}else if(o instanceof THREE.Sprite)m.add(o.material);});
    this.scene.traverse(o=>{if(o instanceof THREE.LineSegments){g.add(o.geometry);for(const a of Array.isArray(o.material)?o.material:[o.material])m.add(a);}});
    g.forEach(a=>a.dispose());m.forEach(a=>a.dispose());this.materials.forEach(a=>a.dispose());this.textures.forEach(a=>a.dispose());
    this.scrolls.forEach(s=>s.dispose());this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();
    if((window as unknown as Record<string,unknown>).__MDGS_STUDY__===this.diagnostic)delete (window as unknown as Record<string,unknown>).__MDGS_STUDY__;
  }
}

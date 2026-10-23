import * as THREE from 'three';
import { petalGeometry } from './studyMaterials';

type Callbacks = { ready: () => void; error: (message: string) => void; select: (id: number) => void; hover: (id: number | null) => void };
type Pixel = [number, number];
const base = import.meta.env.BASE_URL;
const ART = { width: 1672, height: 941, aspect: 1672 / 941, cameraZ: 18, fov: 35 };
const HALF_HEIGHT = ART.cameraZ * Math.tan(THREE.MathUtils.degToRad(ART.fov / 2));
const HALF_WIDTH = HALF_HEIGHT * ART.aspect;
const PLAQUES = [
  { x: 249, y: 541, width: 77, height: 208 },
  { x: 637, y: 541, width: 77, height: 208 },
  { x: 1007, y: 541, width: 77, height: 208 },
  { x: 1363, y: 541, width: 77, height: 208 },
];
const PAPERS: Pixel[][] = [
  [[.183,.371],[.329,.371],[.276,.589],[.063,.589]],
  [[.355,.371],[.485,.371],[.493,.589],[.299,.589]],
  [[.513,.371],[.643,.371],[.716,.589],[.525,.589]],
  [[.675,.371],[.814,.371],[.953,.589],[.742,.589]],
];
const clamp = THREE.MathUtils.clamp;
const smooth = (a: number, b: number, v: number) => { const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t); };
const ellipse = (u: number,v: number,cx: number,cy: number,rx: number,ry: number) => Math.exp(-2.5*((u-cx)**2/rx**2+(v-cy)**2/ry**2));

/** Cover the viewport without stretching the reference projection. The small
 * overscan also leaves real painted geometry behind the observation parallax. */
export function fitStudyReference(width: number, height: number) {
  const scale=Math.max(width/ART.width,height/ART.height)*1.035;
  const imageWidth=ART.width*scale,imageHeight=ART.height*scale,fit=height/imageHeight;
  return {x:(width-imageWidth)/2,y:(height-imageHeight)/2,width:imageWidth,height:imageHeight,
    fov:THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(THREE.MathUtils.degToRad(ART.fov/2))*fit))};
}

/** Continuous, translucent curling ribbons share one noise field. Unlike a row
 * of round sprites they have no visible repeated bead edges. */
export function createIncenseSmoke() {
  const geometry=new THREE.PlaneGeometry(1,1,8,48);
  geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1.325,0),1.6);
  return [0,1].map(layer=>{
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
      uniforms:{time:{value:0},layer:{value:layer}},vertexShader:`
        uniform float time; uniform float layer; varying vec2 vapour;
        void main(){vapour=uv;float y=uv.y;vec3 p=position;
          float curl=sin(y*8.5-time*.29+layer*1.9)*.075*y+sin(y*17.-time*.17)*.025*y;
          p.x=(uv.x-.5)*(.08+pow(y,1.45)*.7)+curl-y*y*.11;
          p.y=y*2.65;p.z=sin(y*9.-time*.21+layer)*.07*y+layer*.045;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}
      `,fragmentShader:`
        uniform float time;uniform float layer;varying vec2 vapour;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.)),f.x),f.y);}
        void main(){vec2 q=vec2(vapour.x*3.5+layer*1.7,vapour.y*6.-time*.16);
          float billow=noise(q)*.65+noise(q*2.1+3.7)*.35;
          float edge=exp(-pow((vapour.x-.5)*3.8,2.));
          float fade=smoothstep(0.,.035,vapour.y)*pow(1.-vapour.y,1.35);
          float alpha=edge*fade*(.035+.11*billow)*(1.-layer*.24);
          gl_FragColor=vec4(.9,.91,.86,alpha);
          #include <colorspace_fragment>
        }
      `});
    const mesh=new THREE.Mesh(geometry,material);mesh.name='continuous-incense-vapour';mesh.renderOrder=4+layer;
    return mesh;
  });
}

/** Reference-matched camera projection on actual relief and closed solid geometry.
 * UVs come from one neutral camera; moving the viewing camera reveals the depth.
 * There are no separate scene-image cards and no redesigned replacement room. */
export class StudyRoomRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(ART.fov, ART.aspect, .1, 100);
  private projector = new THREE.PerspectiveCamera(ART.fov, ART.aspect, .1, 100);
  private root = new THREE.Group();
  private textures = new Set<THREE.Texture>();
  private materials = new Set<THREE.Material>();
  private scrolls: { group: THREE.Group; paper: THREE.Mesh; material: THREE.ShaderMaterial; corners: Pixel[] }[] = [];
  private smoke: THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>[] = [];
  private petals: THREE.Mesh[] = [];
  private dust: THREE.Points;
  private glow: THREE.Mesh;
  private pointer = new THREE.Vector2();
  private observed = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private size = { width: 1, height: 1 };
  private viewport = { x:0, y:0, width:1, height:1 };
  private animation = 0;
  private last = 0;
  private time = 0;
  private frameCount = 0;
  private lastPaint = 0;
  private lastRenderedMotion = false;
  private dustPositions = new Float32Array();
  private enabled = true;
  private active = true;
  private alive = true;
  private ready = false;
  private compiled = false;
  private failure: string | null = null;
  private shaderErrors: string[] = [];
  private hoverId: number | null = null;
  private selected = 1;
  private phase = 'HOME';
  private phaseAt = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');
  private resizeObserver: ResizeObserver;
  private sourceMaterial: THREE.ShaderMaterial;
  private reliefDepthRange = [0, 0];
  private diagnostic: { snapshot: () => unknown };

  constructor(private host: HTMLElement, private callbacks: Callbacks) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    // Three reports link failures on first use; compileAsync can still resolve.
    // A failed projected program must never unlock the four chapter entries.
    this.renderer.debug.checkShaderErrors=true;
    this.renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{
      this.shaderErrors.push([gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment)].filter(Boolean).join('\n'));
      this.fail('书房画材暂未显现，请重新陈设。');
    };
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.NoToneMapping;
    this.renderer.setClearColor('#eee4cf');
    this.renderer.domElement.className='study-volume-canvas';
    this.renderer.domElement.setAttribute('aria-label','原画投影书房：有纵深的窗景、书案、卷纸与立体轴杆');
    host.append(this.renderer.domElement);
    this.scene.background=new THREE.Color('#eee4cf');
    this.scene.add(this.root);
    this.projector.position.set(0,0,ART.cameraZ);this.projector.lookAt(0,0,0);this.projector.updateMatrixWorld();
    this.camera.position.copy(this.projector.position);this.camera.lookAt(0,0,0);
    this.sourceMaterial=this.projectedMaterial();
    this.buildRelief();this.buildScrolls();this.buildSolids();
    this.smoke=createIncenseSmoke();
    for(const ribbon of this.smoke){ribbon.position.copy(this.at(.943,.292,3.45));this.materials.add(ribbon.material);this.root.add(ribbon);}
    const petal=petalGeometry(.15);
    for(let i=0;i<11;i++){
      const material=new THREE.MeshBasicMaterial({color:'#fff3e6',vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.7,depthWrite:false});this.materials.add(material);
      const mesh=new THREE.Mesh(petal,material);mesh.name='wind-carried-peony-petal';this.root.add(mesh);this.petals.push(mesh);
    }
    const positions=new Float32Array(32*3);
    for(let i=0;i<32;i++){const p=this.at(.24+(i*1.618%1)*.55,.1+(i*.71%1)*.54,3+(i%3));positions.set(p.toArray(),i*3);}
    this.dustPositions=positions.slice();
    const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const dm=new THREE.PointsMaterial({size:.017,color:'#d7b576',transparent:true,opacity:.32,depthWrite:false});this.materials.add(dm);this.dust=new THREE.Points(dg,dm);this.root.add(this.dust);
    const glowMat=new THREE.MeshBasicMaterial({color:'#f3d593',transparent:true,opacity:.035,depthWrite:false,blending:THREE.AdditiveBlending});this.materials.add(glowMat);
    this.glow=new THREE.Mesh(new THREE.SphereGeometry(.55,16,12),glowMat);this.glow.position.copy(this.at(.038,.19,3));this.glow.scale.set(.46,1.8,.14);this.root.add(this.glow);
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);
    host.addEventListener('pointermove',this.move);host.addEventListener('pointerleave',this.leave);host.addEventListener('click',this.click);
    this.renderer.domElement.addEventListener('webglcontextlost',this.contextLost);
    document.addEventListener('visibilitychange',this.visibility);this.reduced.addEventListener('change',this.motionChange);
    this.diagnostic={snapshot:()=>this.snapshot()};(window as unknown as Record<string,unknown>).__MDGS_STUDY__=this.diagnostic;
    this.resize();void this.loadArt();
  }

  private projectedMaterial() {
    const matrix=new THREE.Matrix4().multiplyMatrices(this.projector.projectionMatrix,this.projector.matrixWorldInverse);
    const m=new THREE.ShaderMaterial({uniforms:{reference:{value:null},backing:{value:null},referenceCamera:{value:matrix},warmth:{value:0},airTime:{value:0},airStrength:{value:0}},vertexShader:`
      uniform mat4 referenceCamera;uniform float airTime;uniform float airStrength;varying vec4 referencePosition;
      void main(){vec4 world=modelMatrix*vec4(position,1.);referencePosition=referenceCamera*world;
        vec2 p=referencePosition.xy/referencePosition.w*.5+.5;p.y=1.-p.y;
        // Explicit foreground peony/leaf corners, clear of the desk, people,
        // lettering and architecture. Only their local curved surface flexes.
        float left=(1.-smoothstep(.10,.18,p.x))*smoothstep(.81,.97,p.y);
        float right=smoothstep(.84,.94,p.x)*smoothstep(.82,.97,p.y);
        float leaf=max(left,right)*airStrength;
        world.x+=sin(airTime*.31+p.y*8.+p.x*5.)*.014*leaf;
        world.y+=sin(airTime*.23+p.x*9.)*.011*leaf;
        gl_Position=projectionMatrix*viewMatrix*world;}
    `,fragmentShader:`
      uniform sampler2D reference; uniform sampler2D backing; uniform float warmth; varying vec4 referencePosition;
      float plaqueRepair(vec2 p,float cx){float dx=abs(p.x-cx);return (1.-smoothstep(.025,.029,dx))*smoothstep(.57,.579,p.y)*(1.-smoothstep(.88,.887,p.y));}
      void main(){ vec2 uv=referencePosition.xy/referencePosition.w*.5+.5; if(any(lessThan(uv,vec2(0.)))||any(greaterThan(uv,vec2(1.))))discard; uv=clamp(uv,vec2(.00001),vec2(.99999)); vec4 ink=texture2D(reference,uv);
      vec2 p=vec2(uv.x,1.-uv.y);float repair=max(max(plaqueRepair(p,.1725),plaqueRepair(p,.404)),max(plaqueRepair(p,.6253),plaqueRepair(p,.838)));ink=mix(ink,texture2D(backing,uv),repair);
      ink.rgb=mix(ink.rgb,ink.rgb*vec3(1.08,1.02,.93),warmth); gl_FragColor=ink;
      #include <colorspace_fragment>
      }
    `,side:THREE.DoubleSide});
    this.materials.add(m);return m;
  }
  private depth(u: number,v: number) {
    const roomEdge=(1-smooth(.15,.25,u))+smooth(.84,.94,u);
    let z=-2.2+roomEdge*3.7;
    const desk=smooth(.35,.39,v)*(1-smooth(.75,.79,v));
    z=THREE.MathUtils.lerp(z,1.5+smooth(.35,.67,v)*3.1,desk);
    z+=ellipse(u,v,.07,.78,.22,.25)*3.2+ellipse(u,v,.93,.8,.2,.25)*3.7;
    z+=ellipse(u,v,.04,.21,.045,.16)*1.1+ellipse(u,v,.943,.32,.055,.08)*1.3;
    return z;
  }
  private at(u: number,v: number,z=this.depth(u,v)) {
    const scale=(ART.cameraZ-z)/ART.cameraZ;
    return new THREE.Vector3((u-.5)*HALF_WIDTH*2*scale,(.5-v)*HALF_HEIGHT*2*scale,z);
  }
  private buildRelief() {
    const columns=224,rows=126,positions:number[]=[],uvs:number[]=[],indices:number[]=[];
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
      const u=x/columns,v=y/rows,p=this.at(u,v);positions.push(p.x,p.y,p.z);uvs.push(u,1-v);
    }
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
    g.computeBoundingBox();this.reliefDepthRange=[g.boundingBox!.min.z,g.boundingBox!.max.z];
    const mesh=new THREE.Mesh(g,this.sourceMaterial);mesh.name='continuous-reference-relief-window-desk-foreground';this.root.add(mesh);
  }
  private buildScrolls() {
    PAPERS.forEach((corners,i)=>{
      const positions:number[]=[],uvs:number[]=[],indices:number[]=[],columns=48,rows=20;
      for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
        const s=x/columns,t=y/rows;
        const top=new THREE.Vector2(...corners[0]).lerp(new THREE.Vector2(...corners[1]),s);
        const bottom=new THREE.Vector2(...corners[3]).lerp(new THREE.Vector2(...corners[2]),s);
        const p=top.lerp(bottom,t),z=this.depth(p.x,p.y)+.045+.035*Math.pow(Math.abs(s-.5)*2,5);
        const world=this.at(p.x,p.y,z);positions.push(world.x,world.y,world.z);uvs.push(p.x,1-p.y);
      }
      for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=y*(columns+1)+x,b=a+columns+1;indices.push(a,b,a+1,a+1,b,b+1);}
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();
      const group=new THREE.Group();group.name=`study-scroll-${i+1}`;
      const material=this.sourceMaterial.clone();this.materials.add(material);
      const paper=new THREE.Mesh(g,material);paper.name='bending-silk-front';paper.userData.scrollId=i+1;group.add(paper);
      const back=new THREE.Mesh(g.clone(),this.sourceMaterial);back.name='silk-paper-thickness';back.position.z=-.025;back.userData.scrollId=i+1;group.add(back);
      const frontPairs:Pixel[]=[[.04,.605],[.283,.605],[.292,.605],[.508,.605],[.514,.605],[.731,.605],[.738,.605],[.968,.605]];
      const rearPairs:Pixel[]=[[.18,.369],[.329,.369],[.355,.369],[.485,.369],[.513,.369],[.643,.369],[.674,.369],[.816,.369]];
      for(const [pairs,radius,depth]of [[frontPairs,.13,4.35],[rearPairs,.095,2.35]] as [Pixel[],number,number][]){
        const a=this.at(...pairs[i*2],depth),b=this.at(...pairs[i*2+1],depth),d=b.clone().sub(a);
        const cylinder=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,d.length(),40),material);cylinder.name='projected-solid-silk-axis';cylinder.position.copy(a.clone().add(b).multiplyScalar(.5));cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());cylinder.userData.scrollId=i+1;group.add(cylinder);
      }
      this.root.add(group);this.scrolls.push({group,paper,material,corners});
    });
  }
  private solid(name:string,geometry:THREE.BufferGeometry,u:number,v:number,z:number){const m=new THREE.Mesh(geometry,this.sourceMaterial);m.name=name;m.position.copy(this.at(u,v,z));this.root.add(m);return m;}
  private buildSolids(){
    // Complete backs/sides remain present if a tiny observation angle exposes them.
    const desk=this.solid('solid-carved-desk-apron',new THREE.BoxGeometry(19.5,.62,.9),.5,.692,4.27);desk.scale.x=.75;
    for(const u of [.03,.155,.22,.87,.92,.982])this.solid('solid-window-timber',new THREE.BoxGeometry(.16,7,.23),u,.18,1.45);
    this.solid('solid-lantern-column',new THREE.CylinderGeometry(.3,.32,1.9,16),.038,.19,2.45);
    this.solid('solid-incense-vessel',new THREE.SphereGeometry(.3,28,18),.942,.321,3.1).scale.y=.7;
  }
  private async loadArt(){
    try{
      const loader=new THREE.TextureLoader();
      const [map,backing]=await Promise.all([loader.loadAsync(`${base}ui/study-projection/reference.png`),loader.loadAsync(`${base}ui/study-projection/plaque-backing.webp`)]);
      if(!this.alive){map.dispose();backing.dispose();return;}
      for(const texture of [map,backing]){texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());this.textures.add(texture);}
      this.materials.forEach(m=>{if(m instanceof THREE.ShaderMaterial&&m.uniforms.reference&&m.uniforms.backing){m.uniforms.reference.value=map;m.uniforms.backing.value=backing;}});
      await this.renderer.compileAsync(this.scene,this.camera);if(!this.alive||this.failure)return;
      // The first draw triggers Three's link diagnostics before readiness.
      this.compiled=true;this.render();if(!this.alive||this.failure)return;
      this.ready=true;this.host.dataset.sceneState='ready';this.callbacks.ready();this.start();
    }catch{this.fail('原画绢本暂未齐备，请重新陈设。');}
  }
  private fail(message:string){
    if(!this.alive||this.failure)return;
    this.failure=message;this.ready=false;this.compiled=false;this.active=false;
    cancelAnimationFrame(this.animation);this.animation=0;this.host.dataset.sceneState='error';this.callbacks.error(message);
  }
  private resize(){
    const width=this.host.clientWidth,height=this.host.clientHeight;if(!width||!height)return;this.size={width,height};
    const mobile=height>width;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:1.8));this.renderer.setSize(width,height,false);
    const fit=fitStudyReference(width,height);
    this.camera.aspect=width/height;this.camera.fov=fit.fov;this.camera.clearViewOffset();this.camera.updateProjectionMatrix();
    this.viewport={x:fit.x,y:fit.y,width:fit.width,height:fit.height};
    const imageWidth=fit.width,imageHeight=fit.height;
    const parent=this.host.parentElement;
    if(parent){parent.style.setProperty('--reference-width',`${imageWidth}px`);parent.style.setProperty('--reference-height',`${imageHeight}px`);parent.style.setProperty('--reference-left',`${this.viewport.x}px`);parent.style.setProperty('--reference-top',`${this.viewport.y}px`);parent.dataset.portrait=String(mobile);}
    this.render();this.start();
  }
  setMotion(enabled:boolean){this.enabled=enabled;this.pointer.set(0,0);this.observed.set(0,0);this.render();this.start();}
  setPhase(phase:string,chapter:number){const continued=phase==='ARTISTIC_TRANSITION'&&this.phase==='CAMERA_ENTERING';this.phase=phase;this.selected=chapter;if(!continued)this.phaseAt=performance.now();this.active=['HOME','SCROLL_AWAKENING','CAMERA_ENTERING','ARTISTIC_TRANSITION','RETURNING_HOME'].includes(phase);this.last=0;if(!this.active){cancelAnimationFrame(this.animation);this.animation=0;return;}this.start();}
  setHover(id:number|null){this.hoverId=id;this.render();}
  private move=(event:PointerEvent)=>{if(this.phase!=='HOME')return;const r=this.host.getBoundingClientRect(),hitPointer=new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);this.raycaster.setFromCamera(hitPointer,this.camera);if(this.enabled&&!this.reduced.matches)this.pointer.copy(hitPointer);else this.pointer.set(0,0);const id=this.pickScroll();if(id!==this.hoverId){this.hoverId=id;this.callbacks.hover(id);this.host.style.cursor=id?'pointer':'default';}this.start();};
  private leave=()=>{this.pointer.set(0,0);this.hoverId=null;this.callbacks.hover(null);this.start();};
  private click=(event:MouseEvent)=>{if(this.phase!=='HOME'||!this.ready)return;const r=this.host.getBoundingClientRect();this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.camera);const id=this.pickScroll();if(id)this.callbacks.select(id);};
  private pickScroll(){return this.raycaster.intersectObjects(this.scrolls.map(s=>s.group),true).find(hit=>hit.object.userData.scrollId)?.object.userData.scrollId??null;}
  private contextLost=(event:Event)=>{event.preventDefault();this.fail('原画书房暂时中断，请重新陈设。');};
  private visibility=()=>{this.last=0;if(document.hidden){cancelAnimationFrame(this.animation);this.animation=0;}else this.start();};
  private motionChange=()=>{this.pointer.set(0,0);this.observed.set(0,0);this.render();this.start();};
  private start(){if(!this.alive||!this.compiled||this.failure||document.hidden||!this.active||this.animation)return;this.animation=requestAnimationFrame(this.tick);}
  private tick=(now:number)=>{
    this.animation=0;if(!this.alive||!this.compiled||this.failure||document.hidden||!this.active)return;
    const dt=this.last?Math.min(.05,(now-this.last)/1000):.016;this.last=now;
    const moving=this.enabled&&!this.reduced.matches,changed=moving!==this.lastRenderedMotion;
    if(moving)this.time+=dt;
    const observing=moving&&this.observed.distanceToSquared(this.pointer)>.00001;
    if(moving)this.observed.lerp(this.pointer,1-Math.exp(-dt*3.3));else this.observed.set(0,0);
    // A media query may update before its change event. Paint the neutral pose
    // once even inside the 30 Hz interval, before stopping the final RAF.
    if(changed||observing||this.phase!=='HOME'||now-this.lastPaint>=1000/30-1){this.render();this.lastPaint=now;}
    if(moving||this.phase!=='HOME'||this.observed.length()>.001)this.start();
  };
  private render(){
    if(!this.compiled||!this.active||document.hidden||this.failure)return;const moving=this.enabled&&!this.reduced.matches,t=this.time;
    this.camera.position.set(0,0,ART.cameraZ);const look=new THREE.Vector3();
    if(moving){this.camera.position.x=this.observed.x*.11+Math.sin(t*.13)*.018;this.camera.position.y=this.observed.y*.065+Math.sin(t*.17)*.012;}
    if((this.phase==='CAMERA_ENTERING'||this.phase==='ARTISTIC_TRANSITION')&&!this.reduced.matches){const a=smooth(0,650,performance.now()-this.phaseAt),corners=PAPERS[this.selected-1];const target=this.at((corners[0][0]+corners[2][0])*.5,(corners[0][1]+corners[2][1])*.5,3);this.camera.position.lerp(target.clone().add(new THREE.Vector3(0,0,10)),a*.5);look.lerp(target,a*.48);}
    this.camera.lookAt(look);this.camera.updateMatrixWorld();
    this.materials.forEach(material=>{if(material instanceof THREE.ShaderMaterial&&material.uniforms.airTime){material.uniforms.airTime.value=t;material.uniforms.airStrength.value=moving?1:0;}});
    this.scrolls.forEach((s,i)=>{s.material.uniforms.warmth.value=this.selected===i+1&&this.phase!=='HOME'?.65:this.hoverId===i+1?.35:0;});
    this.smoke.forEach(s=>{s.visible=moving;s.material.uniforms.time.value=t;});
    this.petals.forEach((p,i)=>{p.visible=moving;const a=(t/(36+i%5*4.7)+i*.618)%1;
      const edge=i%2?.7+(i*.137%1)*.24:.055+(i*.173%1)*.22;
      const u=edge-a*.055+Math.sin(t*.17+i*1.7)*.009,v=-.055+a*1.17,z=2+(i%3)*1.3;
      p.position.copy(this.at(u,v,z));p.rotation.set(Math.sin(t*.16+i)*.48,t*(.055+i%3*.011)+i,Math.sin(t*.12+i*1.83)*.6+i);
      p.scale.setScalar(.65+(i%3)*.27);(p.material as THREE.MeshBasicMaterial).opacity=Math.sin(a*Math.PI)*(.36+i%3*.14);
    });
    this.dust.visible=moving;
    if(moving){const position=this.dust.geometry.attributes.position;for(let i=0;i<position.count;i++)position.setXYZ(i,this.dustPositions[i*3]+Math.sin(t*.12+i*2.4)*.055,this.dustPositions[i*3+1]+Math.sin(t*.09+i)*.04,this.dustPositions[i*3+2]+Math.sin(t*.11+i*.8)*.025);position.needsUpdate=true;}
    this.glow.visible=moving;(this.glow.material as THREE.MeshBasicMaterial).opacity=.025+(moving?Math.sin(t*.32)*.004:0);
    this.renderer.render(this.scene,this.camera);if(this.failure)return;this.lastRenderedMotion=moving;this.frameCount++;this.layoutLabels();
  }
  private project(v:THREE.Vector3){const p=v.clone().project(this.camera);return{x:(p.x*.5+.5)*this.size.width,y:(-.5*p.y+.5)*this.size.height};}
  private layoutLabels(){
    const mobile=this.size.height>this.size.width;
    PLAQUES.forEach((p,i)=>{const el=this.host.parentElement?.querySelector<HTMLElement>(`.study-scroll-entry[data-entry-id="${i+1}"]`);if(!el)return;
      if(mobile){
        el.style.removeProperty('left');el.style.removeProperty('top');
        const width=clamp(this.size.width*.16,55,68),scale=width/p.width;
        el.style.setProperty('--plaque-width',`${width}px`);el.style.setProperty('--plaque-height',`${p.height*scale}px`);el.style.setProperty('--plaque-art-width',`${ART.width*scale}px`);el.style.setProperty('--plaque-art-height',`${ART.height*scale}px`);el.style.setProperty('--plaque-bg-x',`${-p.x*scale}px`);el.style.setProperty('--plaque-bg-y',`${-p.y*scale}px`);return;
      }
      const anchor=this.project(this.at((p.x+p.width/2)/ART.width,p.y/ART.height,4.7));
      const plaqueWidth=clamp(p.width/ART.width*this.viewport.width,44,100),scale=plaqueWidth/p.width,plaqueHeight=p.height*scale;
      el.style.left=`${clamp(anchor.x,plaqueWidth/2+9,this.size.width-plaqueWidth/2-9)}px`;el.style.top=`${clamp(anchor.y,50,Math.max(50,this.size.height-plaqueHeight-10))}px`;el.style.setProperty('--plaque-width',`${plaqueWidth}px`);el.style.setProperty('--plaque-height',`${plaqueHeight}px`);
      el.style.setProperty('--plaque-art-width',`${ART.width*scale}px`);el.style.setProperty('--plaque-art-height',`${ART.height*scale}px`);
      el.style.setProperty('--plaque-bg-x',`${-p.x*scale}px`);el.style.setProperty('--plaque-bg-y',`${-p.y*scale}px`);
    });
  }
  snapshot(){
    const objects:{name:string;geometryType:string;vertices:number;worldPosition:{x:number;y:number;z:number};screenPosition:{x:number;y:number}}[]=[];
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh){const p=o.getWorldPosition(new THREE.Vector3());objects.push({name:o.name,geometryType:o.geometry.type,vertices:o.geometry.attributes.position?.count??0,worldPosition:{x:p.x,y:p.y,z:p.z},screenPosition:this.project(p)});}});
    const scrolls=this.scrolls.map((s,i)=>{const p=s.paper.geometry.attributes.position,points=Array.from({length:p.count},(_,j)=>this.project(new THREE.Vector3().fromBufferAttribute(p,j)));return{id:i+1,center:points[Math.floor(points.length/2)],corners:[0,48,p.count-1,p.count-49].map(j=>points[j]),paperBounds:{left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))},paperVertices:p.count,rodRadius:.13,open:1};});
    return{ready:this.ready,compiled:this.compiled,failure:this.failure,shaderErrors:[...this.shaderErrors],projectionMethod:'reference-camera-relief-and-closed-solids',referenceFit:'cover',referenceSource:`${base}ui/study-projection/reference.png`,depthRange:this.reliefDepthRange,camera:{x:this.camera.position.x,y:this.camera.position.y,z:this.camera.position.z},renderCount:this.frameCount,environmentTime:this.time,environmentActive:this.active&&this.enabled&&!this.reduced.matches&&!document.hidden&&!this.failure,ambientFps:30,smokeMode:'continuous-billow-ribbons',smokeLayers:this.smoke.length,dimensions:this.size,referenceViewport:this.viewport,objects,scrolls};
  }
  dispose(){
    this.alive=false;cancelAnimationFrame(this.animation);this.resizeObserver.disconnect();this.host.removeEventListener('pointermove',this.move);this.host.removeEventListener('pointerleave',this.leave);this.host.removeEventListener('click',this.click);document.removeEventListener('visibilitychange',this.visibility);this.reduced.removeEventListener('change',this.motionChange);this.renderer.domElement.removeEventListener('webglcontextlost',this.contextLost);
    const geometries=new Set<THREE.BufferGeometry>();this.scene.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points)geometries.add(o.geometry);if(o instanceof THREE.Sprite)this.materials.add(o.material);});geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();if((window as unknown as Record<string,unknown>).__MDGS_STUDY__===this.diagnostic)delete(window as unknown as Record<string,unknown>).__MDGS_STUDY__;
  }
}

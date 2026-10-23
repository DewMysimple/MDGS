const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ts=require('typescript'),THREE=require('three');
const source=fs.readFileSync(path.join(__dirname,'ShaderWarmup.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function fixture({extension=true,failCompile=false}={}){
 let now=100,nextTimer=0,lost=false;const timers=new Map(),listeners=new Map(),observers=[];
 const doc={hidden:false,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
 const win={setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,at:now+delay});return id;},clearTimeout:id=>timers.delete(id)};
 class Observer{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.off=true;}}
 const phaseRoot={dataset:{journeyPhase:'SCROLL_LOADING'}},calls=[],canvas={dataset:{}};
 const gl={getExtension:()=>extension?{COMPLETION_STATUS_KHR:123}:null,isContextLost:()=>lost,getProgramParameter:handle=>handle.ready};
 const state={target:null,viewport:new THREE.Vector4(10,20,800,600),scissor:new THREE.Vector4(5,6,700,500),test:true};
 const renderer={domElement:canvas,info:{programs:[]},debug:{checkShaderErrors:true},getContext:()=>gl,getRenderTarget:()=>state.target,
  getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getViewport:out=>out.copy(state.viewport),getScissor:out=>out.copy(state.scissor),getScissorTest:()=>state.test,
  setRenderTarget:t=>{state.target=t;},setViewport:v=>state.viewport.copy(v),setScissor:v=>state.scissor.copy(v),setScissorTest:v=>{state.test=v;},
  compile:scene=>{const mesh=scene.children[0],m=mesh.material;calls.push({transparent:m.transparent,depthWrite:m.depthWrite,side:m.side,map:m.map,geometry:mesh.geometry,visible:m.visible,mesh});
   if(failCompile)throw new Error('controlled compile exception');
   for(let i=0;i<(m.transparent?2:1);i++)renderer.info.programs.push({program:{ready:false,id:renderer.info.programs.length}});
  }};
 const exports={};new Function('require','exports','location','document','MutationObserver','window','performance',compiled)(require,exports,{search:''},doc,Observer,win,{now:()=>now});
 let wakes=0;const helper=new exports.ShaderWarmup(renderer,new THREE.Scene(),new THREE.PerspectiveCamera(),()=>wakes++,phaseRoot);
 function flush(){assert(timers.size,'Expected a pending helper timer');const[id,timer]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=Math.max(now+1,timer.at);timer.fn();}
 return{helper,renderer,calls,state,timers,listeners,observers,phaseRoot,doc,flush,wakes:()=>wakes,advance:ms=>{now+=ms;},lose:()=>{lost=true;},restore:()=>{lost=false;}};
}
function art(){const geometry=new THREE.PlaneGeometry(),material=new THREE.MeshBasicMaterial({transparent:false,side:THREE.DoubleSide,depthWrite:true});material.visible=false;const mesh=new THREE.Mesh(geometry,material);mesh.visible=true;return{mesh,material,url:'https://example.test/untouched.png'};}
const checks=[];
{
 const f=fixture(),object=art(),saved={map:object.material.map,side:object.material.side,transparent:object.material.transparent,depthWrite:object.material.depthWrite,visible:object.material.visible};
 f.helper.enqueue([object],()=>true);assert.equal(f.helper.initialReady([object],()=>true),false);f.flush();
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].transparent,false);assert.equal(f.calls[1].transparent,true);assert(f.calls.every(c=>c.map&&c.map!==saved.map));assert(f.calls.every(c=>c.geometry===object.mesh.geometry));assert(f.calls.every(c=>c.visible===saved.visible));
 for(const[key,value]of Object.entries(saved))assert.equal(object.material[key],value,`State restored: ${key}`);
 assert.deepEqual(f.state.viewport.toArray(),[10,20,800,600]);assert.deepEqual(f.state.scissor.toArray(),[5,6,700,500]);assert.equal(f.state.target,null);assert.equal(f.state.test,true);
 // Back and Front completion are independent. Finishing only Front is not enough.
 const handles=f.renderer.info.programs.map(p=>p.program);handles[0].ready=true;handles[2].ready=true;f.advance(20);f.flush();assert.equal(f.helper.initialReady([object],()=>true),false);
 handles[1].ready=true;f.advance(20);f.flush();assert.equal(f.helper.initialReady([object],()=>true),true);assert.equal(f.timers.size,0);assert.equal(f.renderer.debug.checkShaderErrors,true);
 f.helper.dispose();assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);assert(f.observers.every(o=>o.off));checks.push('three native variants, all-handle completion, exact state restoration, debug retained, disposal');
}
{
 const f=fixture(),object=art();f.helper.enqueue([object],()=>true);f.flush();f.doc.hidden=true;f.listeners.get('visibilitychange')();assert.equal(f.timers.size,0);
 f.doc.hidden=false;f.listeners.get('visibilitychange')();assert(f.timers.size>0);f.helper.loseContext();assert.equal(f.timers.size,0);
 f.helper.restoreContext();f.helper.enqueue([object],()=>true);assert(f.timers.size>0);f.phaseRoot.dataset.journeyPhase='RETURNING_HOME';f.observers[0].fn();assert.equal(f.timers.size,0);assert.equal(f.helper.initialReady([object],()=>true),true);f.helper.dispose();checks.push('hidden pause, restore reschedule, lost-generation invalidation, return cancellation');
}
{
 const f=fixture({extension:false}),object=art();f.helper.enqueue([object],()=>true);assert.equal(f.timers.size,0);assert.equal(f.helper.initialReady([object],()=>true),true);f.helper.dispose();checks.push('KHR absent uses original first-use path');
}
{
 const f=fixture({failCompile:true}),object=art();f.helper.enqueue([object],()=>true);f.flush();assert.equal(f.timers.size,0);assert.equal(object.material.map,null);assert.equal(object.material.transparent,false);assert.equal(f.helper.initialReady([object],()=>true),true);assert(JSON.parse(f.renderer.domElement.dataset.shaderWarmup).reason.startsWith('exception:'));f.helper.dispose();checks.push('compile exception restores material/target and returns original shader validation');
}
{
 const f=fixture(),object=art();f.helper.enqueue([object],()=>true);f.flush();f.advance(30001);f.flush();assert.equal(f.timers.size,0);assert.equal(f.helper.initialReady([object],()=>true),true);assert.equal(JSON.parse(f.renderer.domElement.dataset.shaderWarmup).reason,'timeout');f.helper.dispose();checks.push('bounded pending completion timeout releases initial barrier');
}
const report={status:'passed',verifiedAt:new Date().toISOString(),scope:'Pure JS fake renderer/GL lifecycle safety only; no GPU, shader-key, performance or pixel-fidelity claim.',helperSha256:crypto.createHash('sha256').update(source).digest('hex'),driverSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),checks};
fs.writeFileSync(path.join(__dirname,'helper-safety.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,checks:checks.length}));

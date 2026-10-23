/** CPU cover/layout acceptance; real pixels and GLSL remain browser checks. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import ts from 'typescript';
import * as THREE from 'three';
const root=fileURLToPath(new URL('../',import.meta.url));
const reportDirectory=path.join(root,'reports/peony-2.0');await mkdir(reportDirectory,{recursive:true});
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const url=text=>`data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const threeUrl=pathToFileURL(path.join(root,'node_modules/three/build/three.module.js')).href;
const replaceThree=text=>text.replace(/from (['"])three\1/g,`from "${threeUrl}"`);
const editionUrl=url(compile(await readFile(path.join(root,'src/data/sourceEdition.ts'),'utf8')).replaceAll('import.meta.env.BASE_URL','"./"'));
const {activeSourceEdition}=await import(editionUrl);
assert.equal(activeSourceEdition,'peony-2.0-2026-10-22','This acceptance report must describe the active 2.0 edition.');
const materialUrl=url(replaceThree(compile(await readFile(path.join(root,'src/scene/studyMaterials.ts'),'utf8'))));
const rendererUrl=url(replaceThree(compile(await readFile(path.join(root,'src/scene/StudyRoomRenderer.ts'),'utf8'))).replace(/from (['"])\.\/studyMaterials\1/,`from "${materialUrl}"`).replaceAll('import.meta.env.BASE_URL','"./"'));
const {fitStudyReference,createIncenseSmoke,StudyRoomRenderer}=await import(rendererUrl);
const cases=[];
for(const [width,height] of [[1672,941],[1440,900],[1920,1080],[2560,720],[620,360],[800,300],[375,800],[390,844],[820,1180],[1024,1366]]){
  const fit=fitStudyReference(width,height);
  assert(fit.x<0&&fit.y<0&&fit.x+fit.width>width&&fit.y+fit.height>height,'Reference must bleed beyond every viewport edge.');
  assert(Math.abs(fit.width/fit.height-1672/941)<1e-10,'Cover must preserve reference proportions.');
  const fixture=Object.create(StudyRoomRenderer.prototype);
  fixture.size={width,height};fixture.viewport=fit;
  fixture.camera=new THREE.PerspectiveCamera(fit.fov,width/height,.1,100);
  fixture.camera.position.set(0,0,18);fixture.camera.lookAt(0,0,0);fixture.camera.updateMatrixWorld(true);
  const entries=Array.from({length:4},()=>({style:{setProperty(key,value){this[key]=value;},removeProperty(key){delete this[key];}}}));
  fixture.host={parentElement:{querySelector(selector){return entries[Number(/data-entry-id="(\d)"/.exec(selector)[1])-1];}}};
  fixture.layoutLabels();
  const labels=entries.map((entry,index)=>{
    const w=parseFloat(entry.style['--plaque-width']),h=parseFloat(entry.style['--plaque-height']);assert(w>=44&&h>=44);
    if(height>width)return{id:index+1,width:w,height:h,portraitGrid:true};
    const x=parseFloat(entry.style.left),y=parseFloat(entry.style.top);
    assert(x-w/2>=0&&x+w/2<=width&&y>=0&&y+h<=height,`Entry ${index+1} outside ${width}x${height}`);
    return{id:index+1,left:x-w/2,right:x+w/2,top:y,bottom:y+h,width:w,height:h};
  });
  if(height<=width)for(let i=0;i<labels.length-1;i++)assert(labels[i].right<labels[i+1].left,'Adjacent entry controls must not overlap.');
  for(const direction of [-1,0,1]){
    fixture.camera.position.set(direction*.128,direction*.077,18);fixture.camera.lookAt(0,0,0);fixture.camera.updateMatrixWorld(true);
    const edge=[];for(let i=0;i<=64;i++)for(const [u,v] of [[i/64,0],[i/64,1],[0,i/64],[1,i/64]])edge.push(fixture.project(fixture.at(u,v)));
    assert(Math.min(...edge.map(p=>p.x))<0&&Math.max(...edge.map(p=>p.x))>width);
    assert(Math.min(...edge.map(p=>p.y))<0&&Math.max(...edge.map(p=>p.y))>height);
  }
  cases.push({width,height,fit,labels,passed:true});
}
const smoke=createIncenseSmoke();assert.equal(smoke.length,2);
assert(smoke.every(mesh=>mesh.isMesh&&!mesh.isSprite&&mesh.geometry.attributes.position.count>400&&mesh.material.transparent&&!mesh.material.depthWrite));
assert(smoke.every(mesh=>mesh.material.vertexShader.includes('time*.29')&&mesh.material.fragmentShader.includes('noise(q)')));
for(const geometry of new Set(smoke.map(mesh=>mesh.geometry)))geometry.dispose();smoke.forEach(mesh=>mesh.material.dispose());
const css=await readFile(path.join(root,'src/styles/volume-study.css'),'utf8');assert(css.includes('@media(orientation:portrait)')&&css.includes('[data-paused=true]'));
// Run the actual home lifecycle against an inert GPU/host. No shader execution
// is claimed, but these are the real off/reduce/hidden/phase clock methods.
const gpu=url(`export * from ${JSON.stringify(threeUrl)};
import {Texture} from ${JSON.stringify(threeUrl)};
export class TextureLoader{async loadAsync(){return new Texture({width:1672,height:941});}}
export class WebGLRenderer{debug={};capabilities={getMaxAnisotropy(){return 1;}};domElement={dataset:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}};setClearColor(){}setPixelRatio(){}setSize(){}render(){}dispose(){}forceContextLoss(){}async compileAsync(){}}
`);
const lifecycleModule=url(compile(await readFile(path.join(root,'src/scene/StudyRoomRenderer.ts'),'utf8')).replace(/from (['"])three\1/,`from "${gpu}"`).replace(/from (['"])\.\/studyMaterials\1/,`from "${materialUrl}"`).replaceAll('import.meta.env.BASE_URL','"./"'));
const {StudyRoomRenderer:Room}=await import(lifecycleModule);
const frames=new Map();let frame=0;
globalThis.window={};globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
globalThis.devicePixelRatio=1;globalThis.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=callback=>{frames.set(++frame,callback);return frame;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
const style={setProperty(){},removeProperty(){}};
const entries=Array.from({length:4},()=>({style:{...style}}));
const host={clientWidth:1440,clientHeight:900,style:{},dataset:{},getBoundingClientRect(){return{left:0,top:0,width:1440,height:900};},append(){},addEventListener(){},removeEventListener(){},parentElement:{style:{...style},dataset:{},querySelector(selector){return entries[Number(/data-entry-id="(\d)"/.exec(selector)[1])-1];}}};
let ready,failed;const loaded=new Promise((resolve,reject)=>{ready=resolve;failed=reject;});
const room=new Room(host,{ready,error:failed,select(){},hover(){}});await loaded;
const tick=now=>{const id=room.animation,callback=frames.get(id);frames.delete(id);if(callback)callback(now);};
tick(1000);tick(1035);assert(room.time>0&&room.snapshot().environmentActive);
assert.notDeepEqual(room.snapshot().camera,{x:0,y:0,z:18},'Active breathing must produce a non-neutral camera before the stop regression.');
// Chromium can expose the new matches value one RAF before dispatching change.
// Stop inside the 30 Hz interval, without a pointer delta or a change callback:
// the last scheduled RAF must still paint a neutral pose before going idle.
const beforeSilentReduce=room.frameCount,stoppedAt=room.time;
room.reduced.matches=true;tick(1040);
assert.equal(room.frameCount,beforeSilentReduce+1,'The motion-state edge must bypass the ambient paint throttle.');
assert.deepEqual(room.snapshot().camera,{x:0,y:0,z:18});assert.equal(room.time,stoppedAt);assert.equal(frames.size,0);
const silentReducedCamera=room.snapshot().camera;
room.move({clientX:1200,clientY:130});tick(1045);
assert.deepEqual(room.snapshot().camera,silentReducedCamera);assert.equal(room.pointer.lengthSq(),0);assert.equal(room.observed.lengthSq(),0);assert.equal(frames.size,0);
room.reduced.matches=false;room.motionChange();tick(1050);
room.setMotion(false);tick(1070);const off=room.time;tick(2000);
assert.equal(room.time,off);assert.equal(frames.size,0);assert(room.smoke.every(mesh=>!mesh.visible));assert.equal(room.sourceMaterial.uniforms.airStrength.value,0);
const offCamera=room.snapshot().camera;room.move({clientX:1200,clientY:130});tick(2050);room.setHover(2);
assert.deepEqual(room.snapshot().camera,offCamera);assert.equal(room.pointer.lengthSq(),0);assert.equal(room.observed.lengthSq(),0);assert.equal(room.time,off);assert.equal(frames.size,0);
room.setMotion(true);room.reduced.matches=true;room.motionChange();tick(2100);const reduced=room.time,reducedCamera=room.snapshot().camera;tick(2200);
room.move({clientX:100,clientY:130});tick(2250);room.setHover(1);
assert.deepEqual(room.snapshot().camera,reducedCamera);assert.equal(room.pointer.lengthSq(),0);assert.equal(room.observed.lengthSq(),0);assert.equal(room.time,reduced);assert.equal(frames.size,0);
room.reduced.matches=false;room.motionChange();tick(2300);document.hidden=true;room.visibility();const hidden=room.time;room.tick(5000);assert.equal(room.time,hidden);assert.equal(frames.size,0);
document.hidden=false;room.visibility();tick(5100);assert(room.time-hidden<.02,'Restoring a page must not catch up its hidden time.');
room.setPhase('SCROLL_LOADING',1);const inactive=room.time,count=room.frameCount;room.tick(6000);assert.equal(room.time,inactive);assert.equal(room.frameCount,count);assert.equal(room.snapshot().environmentActive,false);assert.equal(frames.size,0);
room.dispose();assert.equal(frames.size,0);
const report={status:'pass',testedAt:new Date().toISOString(),sourceRevision:activeSourceEdition,scope:'CPU cover projection, distinct accessible entry geometry, continuous smoke structure and real home lifecycle with inert GPU/DOM. No browser pixel/shader/FPS claim.',cases,smoke:{mode:'continuous-billow-ribbons',layers:2,passed:true},lifecycle:{off:true,reduced:true,mediaChangeBeforeEventNeutralPaint:true,pointerAndHoverDoNotMoveQuietCamera:true,hidden:true,inactivePhase:true,dispose:true,passed:true}};
await writeFile(path.join(reportDirectory,'validation-home-layout.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:'pass',viewports:cases.length,observationCoverageChecks:cases.length*3,smokeLayers:2,lifecycle:true}));

/** Current edition browser acceptance, against actual production WebGL pixels.
 * One browser/page owns the GPU. Native fidelity is checked separately. */
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {preview} from 'vite';
const root=fileURLToPath(new URL('../',import.meta.url));
const output=path.join(root,'reports/new-scrolls');
const shots=path.join(root,'tmp/new-scrolls/runtime');
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const report={status:'running',startedAt:new Date().toISOString(),scope:'Actual revised four-world WebGL, all authored reading nodes at desktop and phone sizes, paper narration bounds/fades, local Kai font, small motion controls, exact final hold/stamp, decoded looping audio and playback lifecycle.',checks:[],nodes:[],errors:[],expectedErrors:[]};
let browser,server,page;
await mkdir(output,{recursive:true});await mkdir(shots,{recursive:true});
const save=()=>writeFile(path.join(output,'validation-runtime-new.json'),JSON.stringify(report,null,2)+'\n');
await save();
report.buildHtmlSha256=createHash('sha256').update(await readFile(path.join(root,'dist/index.html'))).digest('hex');
const narrativeSource=JSON.parse(await readFile(path.join(root,'reports/new-scrolls/narrative-source.json'),'utf8')).paragraphs.filter(text=>!text.startsWith('画卷'));
const phase=()=>page.locator('[data-journey-phase]').getAttribute('data-journey-phase');
const waitViewer=()=>page.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',null,{timeout:90000});
const data=()=>page.locator('.painting canvas').evaluate(canvas=>({...canvas.dataset}));
async function seek(value){
 await page.locator('input[aria-label="画卷游观进度"]').fill(String(value));
 await page.waitForFunction(value=>Math.abs(Number(document.querySelector('.painting canvas')?.dataset.progress)-value)<.00001&&document.querySelector('.painting canvas')?.dataset.loadingTextures==='0',value,{timeout:90000});
 await page.waitForTimeout(800);
}
async function shot(name,permanent=false){await page.screenshot({path:path.join(permanent?output:shots,name+'.png')});}
try{
 const external=process.env.MDGS_PREVIEW_URL;
 if(!external)server=await preview({root,preview:{host:'127.0.0.1',port:0},logLevel:'error'});
 const url=external||server.resolvedUrls.local[0];report.url=url;
 browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
 page=await browser.newPage({viewport:{width:1672,height:941}});
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
 await page.addInitScript(()=>{
  localStorage.setItem('guose-fanghua:painting-motion','on');
  window.__audioAudit={contexts:[],sources:[],gains:[]};
  const Original=window.AudioContext;
  window.AudioContext=class extends Original{constructor(...args){super(...args);window.__audioAudit.contexts.push(this);}
   createBufferSource(){const node=super.createBufferSource();window.__audioAudit.sources.push(node);return node;}
   createGain(){const node=super.createGain();window.__audioAudit.gains.push(node);return node;}};
 });
 await page.goto(url+'#chapter-1');
 for(const id of[1,2,3,4]){
  if(id>1)await page.locator('.chapter-link').nth(id-1).click();
  await waitViewer();
  const manifest=JSON.parse(await readFile(path.join(root,`public/assets/new-scrolls/chapter-${id}/scene.json`),'utf8'));
  assert.equal(manifest.sourceRevision,'peony-2026-10-21');
  const first=await data();assert.equal(first.chapter,String(id));assert.equal(first.artReplacements,'0');assert.equal(first.artTextLayers,'0');assert.equal(first.sourceHiddenVisibleLayers,'0');
  assert.equal(Number(first.editionAtmosphereLayers),[30,14,18,18][id-1]);
  assert.equal(await page.locator('.viewer-work-title').innerText().then(text=>text.includes(['神都花事','花入万家','锦绣花意','国色倾城'][id-1])),true);
  assert((await page.locator('.art-loading').count())===0);
  for(const [name,width,height]of[['desktop',1672,941],['mobile',390,844]]){
   await page.setViewportSize({width,height});await seek(0);
   const bounds=await page.locator('.painting').boundingBox();
   const header=await page.locator('.site-header').boundingBox(),tools=await page.locator('.scroll-controls').boundingBox();
   assert(header.y+header.height<=bounds.y+1&&tools.y+tools.height<=bounds.y+1,'Title and controls stay above the painting.');
   assert(bounds.width/width>.9&&bounds.height/height>(name==='desktop'?.7:.6),'Painting must fill the available page.');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const stops=await page.locator('.timeline-stop').evaluateAll(buttons=>buttons.map(button=>({name:button.title,progress:parseFloat(button.style.left)/100})));
   for(let index=0;index<stops.length;index++){
    const value=Math.min(.978,Math.max(0,Math.round(stops[index].progress*1000)/1000));
    await seek(value);
    const result=await page.evaluate(()=>{
     const canvas=document.querySelector('.painting canvas'),paper=canvas.getBoundingClientRect(),passage=document.querySelector('.narrative-passage.is-visible'),ink=passage?.querySelector('.narrative-ink'),p=passage?.querySelector('p');
     const r=ink?.getBoundingClientRect(),t=p?.getBoundingClientRect();
     return{data:{...canvas.dataset},cue:document.querySelector('.narrative-calligraphy')?.dataset,ink:r?.toJSON(),text:t?.toJSON(),paper:paper.toJSON(),opacity:passage?getComputedStyle(passage).opacity:null,font:p?getComputedStyle(p).fontFamily:null,textValue:p?.textContent,overflow:!!p&&(p.scrollWidth>p.clientWidth+3||p.scrollHeight>p.clientHeight+3)};
    });
    assert.equal(result.data.sourceHiddenVisibleLayers,'0');assert.equal(result.data.textureFailed,'0');
    assert(result.ink&&Number(result.opacity)>.95&&result.font.startsWith('"MDGS Kai"'),'Every node has real visible Kai narration.');
    assert(!result.overflow,'Narration text must not overflow its own typesetting box.');
    for(const r of[result.ink,result.text])assert(r.x>=result.paper.x-2&&r.y>=result.paper.y-2&&r.right<=result.paper.right+2&&r.bottom<=result.paper.bottom+2,'Narration must stay inside the actual painting.');
    const filename=`runtime-c${id}-${name}-${String(index+1).padStart(2,'0')}`;
    await shot(filename,index===0);
    report.nodes.push({chapter:id,layout:name,node:index+1,name:stops[index].name,progress:value,quietFraction:Number(result.cue.quietFraction),text:result.textValue,bounds:result.ink,sourceHiddenVisibleLayers:result.data.sourceHiddenVisibleLayers,activeMotionNames:JSON.parse(result.data.activeMotionNames),screenshot:index===0?filename+'.png':'tmp/new-scrolls/runtime/'+filename+'.png'});
   }
   report.checks.push({test:`all-current-reading-nodes-${id}-${name}`,nodes:stops.length,paintingBounds:bounds,passed:true});
   // Visit every displayed passage, not just one point per native scene. This
   // catches late paragraphs collapsed by route remapping or short cue ranges.
   await seek(0);
   const passages=await page.locator('.narrative-passage').evaluateAll(elements=>elements.map(element=>({id:element.dataset.narrativeId,start:Number(element.dataset.rangeStart),end:Number(element.dataset.rangeEnd),text:element.querySelector('p').textContent})));
   const expected=narrativeSource.slice([0,6,12,18][id-1],[6,12,18,25][id-1]).join('');
   assert.equal(passages.map(passage=>passage.text).join(''),expected,'All supplied characters must survive responsive typesetting.');
   for(const passage of passages){
    assert(passage.end>passage.start);
    await seek(Math.round((passage.start+passage.end)/2*1000)/1000);
    const visible=page.locator('.narrative-passage.is-visible');
    assert.equal(await visible.getAttribute('data-narrative-id'),passage.id,'Each actual responsive passage must become selectable.');
    assert.equal(await visible.locator('p').innerText(),passage.text);
    const ink=await visible.locator('.narrative-ink').boundingBox();assert(ink.x>=bounds.x-2&&ink.y>=bounds.y-2&&ink.x+ink.width<=bounds.x+bounds.width+2&&ink.y+ink.height<=bounds.y+bounds.height+2);
   }
   report.checks.push({test:`all-responsive-docx-passages-${id}-${name}`,passages:passages.length,characters:[...expected].length,passed:true});
   console.log(`chapter ${id} ${name}: ${stops.length} nodes, ${passages.length} passages passed`);await save();
   await seek(1);await page.locator('.end-colophon').waitFor();
   assert.equal(await page.locator('.end-colophon h2').innerText(),['神都花事','花入万家','锦绣花意','国色倾城'][id-1]);
   const stamp=await page.locator('.end-seal').evaluate(element=>({animation:getComputedStyle(element).animationName,opacity:getComputedStyle(element).opacity,rect:element.getBoundingClientRect().toJSON()}));
   assert.equal(stamp.animation,'final-impression');
   await page.waitForTimeout(1000);const a=await data();await page.waitForTimeout(600);const b=await data();
   assert.equal(b.progress,'1.000000');assert.equal(a.renderCount,b.renderCount);assert.equal(a.motionTime,b.motionTime);assert.equal(b.editionAtmosphereOpacityMax,'0.000000');assert.equal(b.activeMotionNames,'[]');
   const endBox=await page.locator('.end-colophon').boundingBox();assert(stamp.rect.y>=endBox.y-1&&stamp.rect.bottom<=endBox.y+endBox.height+1,'Stamp must not be clipped by the ending paper.');
   await shot(`runtime-end-c${id}-${name}`,true);report.checks.push({test:`exact-final-frame-and-stamp-${id}-${name}`,progress:b.progress,renderCount:b.renderCount,stamp,passed:true});
  }
  await page.setViewportSize({width:1672,height:941});await seek(.001);await page.waitForTimeout(500);
  const moving=await data();await page.waitForTimeout(750);const after=await data();
  assert(Number(after.motionTime)>Number(moving.motionTime)&&Number(after.activeMotionLayers)>0,'Reviewed small environmental motion must actually advance.');
  assert(Number(after.editionAtmosphereActive)<=2&&after.sourceHiddenVisibleLayers==='0');
  await page.getByRole('button',{name:'画中轻动',exact:true}).click();await page.waitForTimeout(200);const off=await data();await page.waitForTimeout(550);const still=await data();
  assert.equal(off.motionTime,still.motionTime);assert.equal(still.editionAtmosphereOpacityMax,'0.000000');assert.equal(still.activeMotionNames,'[]');
  await page.getByRole('button',{name:'画中轻动',exact:true}).click();
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);const reduced=await data();await page.waitForTimeout(400);const reducedAfter=await data();assert.equal(reduced.motionTime,reducedAfter.motionTime);assert.equal(reducedAfter.activeMotionNames,'[]');await page.emulateMedia({reducedMotion:'no-preference'});
  report.checks.push({test:`actual-motion-off-reduce-${id}`,moving:after.activeMotionNames,passed:true});
 }
 await page.setViewportSize({width:1672,height:941});await seek(.1);
 await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.fonts.check('20px "MDGS Kai"')),true);
 const fonts=await page.locator('button,h1,h2,p,input,small,strong').evaluateAll(elements=>elements.filter(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return r.width>2&&r.height>2&&s.visibility!=='hidden'&&s.display!=='none';}).map(element=>({text:element.textContent?.slice(0,25),font:getComputedStyle(element).fontFamily})).filter(item=>!item.font.startsWith('"MDGS Kai"')));
 assert.deepEqual(fonts,[]);report.checks.push({test:'local-kai-loaded-and-all-visible-html-typography',passed:true});
 // Actual click unlocks the AudioContext and decodes the shipped original MP3.
 await page.getByRole('button',{name:'开启古筝意境配乐',exact:true}).click();await page.locator('[data-audio-state="playing"]').waitFor({timeout:20000});
 const audio=()=>page.evaluate(()=>({state:window.__audioAudit.contexts.at(-1)?.state,time:window.__audioAudit.contexts.at(-1)?.currentTime,duration:window.__audioAudit.sources.at(-1)?.buffer?.duration,channels:window.__audioAudit.sources.at(-1)?.buffer?.numberOfChannels,loop:window.__audioAudit.sources.at(-1)?.loop,gain:window.__audioAudit.gains.at(-1)?.gain.value}));
 const a=await audio();assert(a.duration>75&&a.channels===2&&a.loop&&a.state==='running');await page.waitForTimeout(400);assert((await audio()).time>a.time);
 await page.getByRole('slider',{name:'古筝配乐音量'}).fill('25');await page.waitForTimeout(200);assert(Math.abs((await audio()).gain-.25)<.01);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.locator('[data-audio-state="paused"]').waitFor();const paused=await audio();await page.waitForTimeout(400);assert(Math.abs((await audio()).time-paused.time)<.02);
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.locator('[data-audio-state="playing"]').waitFor();
 await page.getByRole('button',{name:'关闭古筝意境配乐',exact:true}).click();assert.equal((await audio()).state,'closed');
 report.checks.push({test:'actual-mp3-decode-loop-volume-background-pause-dispose',audio:a,passed:true});
 assert.deepEqual(report.errors,[]);report.status='pass';console.log(JSON.stringify({status:report.status,checks:report.checks.length,nodes:report.nodes.length}));
}catch(error){report.status='fail';report.failure={message:error.message,stack:error.stack};if(page){report.lastPage=await page.evaluate(()=>({url:location.href,phase:document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,canvas:{...document.querySelector('.painting canvas')?.dataset}})).catch(()=>null);await shot('runtime-failure',true).catch(()=>{});}throw error;
}finally{await browser?.close();if(server)await server.close();report.completedAt=new Date().toISOString();await save();}

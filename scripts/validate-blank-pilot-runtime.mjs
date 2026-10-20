/** Final C4 pilot runtime acceptance: fixed revision, real draw submission, responsive views and native interaction. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const expected=process.argv.find(x=>x.startsWith('--expected-hash='))?.split('=')[1]||'c7b593102bd8f43fd7438413b34782b64d00788f4e6d87dd3f69682ba6b81a54';
const outputArgument=process.argv.find(x=>x.startsWith('--output='))?.split('=').slice(1).join('=')||'reports/blank-design/pilot-v4';
const output=new URL('../'+outputArgument.replace(/\\/g,'/').replace(/\/?$/,'/'),import.meta.url),canonical=new URL('../public/assets/reconstruction/manifest.json',import.meta.url);
const canonicalText=await readFile(canonical,'utf8'),canonicalHash=createHash('sha256').update(canonicalText).digest('hex');assert.equal(canonicalHash,expected);
const revision=JSON.parse(canonicalText).chapters['4'],newLayers=revision.addedLayers.filter(x=>x.id.startsWith('bd4-'));assert(newLayers.length>0);
const pixelEvidence=JSON.parse(await readFile(new URL(expected.slice(0,8)+'-depth-diagnostic.json',output),'utf8'));
assert.equal(pixelEvidence.canonicalSha256,expected);assert.equal(pixelEvidence.mixedRevision,false);assert.equal(pixelEvidence.samples.length,newLayers.length);assert(pixelEvidence.samples.every(s=>s.textureLoaded&&s.meshVisible&&s.conditions.find(c=>c.label==='original').drawCalls>0&&s.conditions.find(c=>c.label==='original').significantPixels>0),'Each new layer must actually contribute pixels before runtime acceptance begins');
await mkdir(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1',watch:null},logLevel:'error'});let browser,page;
const report={status:'running',canonicalSha256:expected,createdAt:new Date().toISOString(),newLayerCount:newLayers.length,totalAddedLayers:revision.addedLayers.length,pixelEvidence:expected.slice(0,8)+'-depth-diagnostic.json',pixelContributions:pixelEvidence.samples.map(s=>({id:s.id,pixels:s.conditions.find(c=>c.label==='original').significantPixels})),viewports:[],continuous:[],interactions:[],pageErrors:[],failedResources:[]};
const resumeViewport=Number(process.argv.find(x=>x.startsWith('--resume='))?.split('=')[1]||0);
if(resumeViewport){const previous=JSON.parse(await readFile(new URL('validation-runtime-before-wheel-fix.json',output),'utf8'));assert.equal(previous.canonicalSha256,expected);report.viewports=previous.viewports;report.continuous=previous.continuous.filter(x=>x.viewport.width!==resumeViewport);report.interactions=previous.interactions.filter(x=>x.viewport.width!==resumeViewport);report.resumedFrom='validation-runtime-before-wheel-fix.json';report.retainedStableViewEvidence=true;}
const save=()=>writeFile(new URL('validation-runtime.json',output),JSON.stringify(report,null,2)+'\n');
const verifyCanonical=async()=>assert.equal(createHash('sha256').update(await readFile(canonical)).digest('hex'),expected,'The canonical changed during this acceptance; do not mix batches');
try{
 await vite.listen();const origin=new URL(vite.resolvedUrls.local[0]).origin;
 const {prepareScene}=await vite.ssrLoadModule('/src/scene/prepareScene.ts');const source=JSON.parse(await readFile(new URL('../public/assets/chapter-4/scene.json',import.meta.url),'utf8')),manifest=prepareScene(source,4),stops=manifest.stops;
 browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'});page.setDefaultTimeout(45000);
 page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('response',response=>{if(new URL(response.url()).origin===origin&&response.status()>=400&&!response.url().endsWith('/favicon.ico'))report.failedResources.push({url:response.url(),status:response.status()});});
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
 await page.route('**/src/scene/SceneRenderer.ts',async route=>{const response=await route.fetch();const code=await response.text();assert(code.includes('this.renderer.sortObjects = true;'));await route.fulfill({response,body:code.replace('this.renderer.sortObjects = true;','this.renderer.sortObjects = true; window.__pilotRenderer=this;')});});
 await page.goto(vite.resolvedUrls.local[0]);await page.locator('.chapter-link').nth(3).click();
 const ready=async()=>{
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.chapter==='4'&&document.querySelector('.scene-viewport.is-ready')&&document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
  await page.waitForTimeout(120);assert.equal(await page.locator('canvas').getAttribute('data-texture-failed'),'0');
 };
 await ready();
 await page.evaluate(()=>{
  const r=window.__pilotRenderer;window.__pilotFrames=[];window.__pilotDrawn=[];
  for(const o of r.objects)if(o.mesh.name.startsWith('BD4_'))o.mesh.onBeforeRender=()=>window.__pilotDrawn.push(o.mesh.name);
  const native=r.renderer.render.bind(r.renderer);r.renderer.render=(...args)=>{window.__pilotDrawn=[];native(...args);const d=r.motionDirector.getDiagnostics();window.__pilotFrames.push({now:performance.now(),progress:r.progress,newDrawn:[...new Set(window.__pilotDrawn)],motion:r.getMotionState().enabled,active:d.activeBindings,petals:d.activeGroups.petal,phase:d.phase,clockSpeed:d.clockSpeed});};
 });
 const render=async()=>{await page.evaluate(()=>{const r=window.__pilotRenderer;r.dirty=true;r.requestFrame();});await page.waitForTimeout(50);};
 const seek=async progress=>{
  await page.locator('input[type=range]').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},progress);
  await page.waitForFunction(p=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-p)<.0011,progress);await page.waitForTimeout(120);await ready();await render();
 };
 const progress=()=>page.locator('canvas').evaluate(canvas=>Number(canvas.dataset.progress));
 const advance=async previous=>page.waitForFunction(previous=>Number(document.querySelector('canvas')?.dataset.progress)>previous+.002,previous);
 const snap=()=>page.evaluate(()=>{
  const r=window.__pilotRenderer,host=document.querySelector('.scene-viewport'),box=host.getBoundingClientRect();
  return{diagnostics:{...r.renderer.domElement.dataset},frame:window.__pilotFrames.at(-1),canvasCount:document.querySelectorAll('canvas').length,overflow:document.documentElement.scrollWidth>window.innerWidth,host:{width:box.width,height:box.height},calligraphyConfiguration:{restored:r.calligraphy.artText.length,original:r.calligraphy.mounted.length,content:r.calligraphy.artText.map(({config})=>({id:config.id,title:config.title,lines:config.lines}))},openingCaptions:[...document.querySelectorAll('.artwork-calligraphy')].map(el=>({text:el.innerText,hidden:el.getAttribute('aria-hidden'),opacity:getComputedStyle(el).opacity})),artText:[...document.querySelectorAll('.art-text-layer')].map(el=>({id:el.dataset.artTextId,text:el.innerText,hidden:el.getAttribute('aria-hidden'),opacity:getComputedStyle(el).opacity,bodySize:el.dataset.screenBodySize})),range:{value:document.querySelector('input[type=range]').value,text:document.querySelector('input[type=range]').getAttribute('aria-valuetext')}};
 });
 const screenshot=async filename=>{await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(filename,output)),style:'.end-colophon{visibility:hidden!important}'});return filename;};
 const assertSnapshot=s=>{assert.equal(s.canvasCount,1);assert.equal(s.overflow,false);assert.equal(Number(s.diagnostics.artAddedLayers),revision.addedLayers.length);assert.equal(Number(s.diagnostics.artTextLayers),revision.textLayers.length);assert.equal(s.calligraphyConfiguration.restored,revision.textLayers.length);assert.equal(s.diagnostics.textureFailed,'0');assert.deepEqual(s.calligraphyConfiguration.content,revision.textLayers.map(c=>({id:c.id,title:c.title,lines:c.lines})));};
 const targetPoints=[{kind:'first',index:0,progress:stops[0].progress},{kind:'last',index:stops.length-1,progress:stops.at(-1).progress},...stops.slice(0,-1).map((s,index)=>({kind:'gap',index:index+1,progress:(s.progress+stops[index+1].progress)/2}))];
 const viewports=[{width:1920,height:1080},{width:960,height:700},{width:360,height:800}].filter(v=>!resumeViewport||v.width===resumeViewport);
 for(const viewport of viewports){
  await verifyCanonical();await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});await ready();
  if(!report.viewports.some(x=>x.viewport.width===viewport.width)){
  const targets=[...targetPoints];if(viewport.width!==960)for(let index=0;index<stops.length-1;index++)for(const fraction of [.25,.75])targets.push({kind:'quarter-'+Math.round(fraction*100),index:index+1,progress:stops[index].progress+(stops[index+1].progress-stops[index].progress)*fraction});
  const samples=[];
  for(const target of targets){await seek(target.progress);const state=await snap();assertSnapshot(state);const filename=`runtime-${viewport.width}-${target.kind}-${String(target.index).padStart(2,'0')}.png`;samples.push({...target,actualProgress:Number(state.diagnostics.progress),image:await screenshot(filename),...state});}
  report.viewports.push({viewport,sampleCount:samples.length,samples});await save();console.log(`${viewport.width}x${viewport.height}: ${samples.length} stable views, captions and no overflow passed.`);
  }
  // Exercise actual controls at each responsive width.
  await page.emulateMedia({reducedMotion:'reduce'});await seek(.18);await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
  const actions=[];const scene=page.locator('.scene-viewport');await scene.scrollIntoViewIfNeeded();let box=await scene.boundingBox();
  let previous=await progress();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,180);await advance(previous);actions.push('wheel');await page.waitForTimeout(350);
  previous=await progress();await page.mouse.move(box.x+box.width*.72,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.30,box.y+box.height*.5,{steps:10});await page.mouse.up();await advance(previous);actions.push('drag');await page.waitForTimeout(700);
  previous=await progress();await scene.focus();await page.keyboard.press('ArrowRight');await advance(previous);actions.push('keyboard');await page.waitForTimeout(300);
  previous=await progress();await page.getByRole('button',{name:'下一分镜',exact:true}).click();await advance(previous);actions.push('next-scene');await page.waitForTimeout(350);
  await page.getByRole('button',{name:'游观至'+stops[2].name,exact:true}).click();await page.waitForFunction(p=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-p)<.0011,stops[2].progress);actions.push('story-stop');
  previous=await progress();await page.getByRole('button',{name:'自动展卷',exact:true}).click();await advance(previous);await page.getByRole('button',{name:'暂停展卷',exact:true}).click();actions.push('autoplay-pause');
  await page.getByRole('button',{name:'打开文化解读',exact:true}).click();await page.getByRole('dialog').waitFor();assert((await page.getByRole('dialog').innerText()).includes('国色倾城'));await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert(await page.getByRole('button',{name:'打开文化解读',exact:true}).evaluate(el=>el===document.activeElement));actions.push('drawer-escape-focus');
  const motion=page.getByRole('button',{name:'画中轻动',exact:true});
  if(await motion.getAttribute('aria-pressed')==='false')await motion.click();await page.waitForFunction(()=>document.querySelector('.motion-button')?.getAttribute('aria-pressed')==='true');await motion.click();await page.waitForFunction(()=>document.querySelector('.motion-button')?.getAttribute('aria-pressed')==='false');await page.waitForTimeout(200);const offA=await snap();await page.waitForTimeout(220);const offB=await snap();assert.equal(offA.diagnostics.motionTime,offB.diagnostics.motionTime);actions.push('motion-off-freezes-clock');await motion.click();await page.waitForFunction(()=>document.querySelector('.motion-button')?.getAttribute('aria-pressed')==='true');actions.push('motion-on');
  // Tail values are tied to actual source stops. No new ground scenery joins the action budget.
  await page.emulateMedia({reducedMotion:'reduce'});await seek(1);await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(350);const tailA=await snap();await page.waitForTimeout(450);const tailB=await snap();
  for(const state of [tailA,tailB]){assert.equal(state.diagnostics.narrativePhase,'afterglow');assert.equal(state.diagnostics.motionClockSpeed,'0.320000');assert.equal(state.diagnostics.petalDensity,'0.080000');assert.equal(state.diagnostics.cloudDensity,'0.220000');assert(Number(state.diagnostics.activeMotionLayers)<=3);assert(Number(state.diagnostics.activePetals)<=1);assert.equal(state.diagnostics.effectiveMotionBudget,'3');}
  actions.push('afterglow-budget');await screenshot(`runtime-${viewport.width}-afterglow-live.png`);
  await motion.click();await page.waitForFunction(()=>document.querySelector('.motion-button')?.getAttribute('aria-pressed')==='false');
  // A native wheel sequence sweeps the entire original route smoothly in both directions.
  await page.emulateMedia({reducedMotion:'reduce'});await seek(0);await page.emulateMedia({reducedMotion:'no-preference'});await scene.scrollIntoViewIfNeeded();box=await scene.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);
  await page.evaluate(()=>window.__pilotFrames=[]);
  for(let i=0;i<64;i++){await page.mouse.wheel(0,130);await page.waitForTimeout(20);}await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.progress)>.995);await ready();
  const forward=await page.evaluate(()=>window.__pilotFrames);assert(forward.length>30);assert(Math.min(...forward.map(f=>f.progress))<.1);assert(Math.max(...forward.map(f=>f.progress))>.99);
  // Aim at the ending-card heading itself: gestures must pass through its text.
  const cardHeading=await page.locator('.end-colophon h2').boundingBox();assert(cardHeading);await page.mouse.move(cardHeading.x+cardHeading.width*.5,cardHeading.y+cardHeading.height*.5);
  const hit=await page.evaluate(({x,y})=>{const target=document.elementFromPoint(x,y);return{tag:target?.tagName,insidePainting:!!target?.closest('.scene-viewport'),cardPointerEvents:getComputedStyle(document.querySelector('.end-colophon')).pointerEvents};},{x:cardHeading.x+cardHeading.width*.5,y:cardHeading.y+cardHeading.height*.5});assert(hit.insidePainting,'Card text must pass pointer gestures through to the original painting');
  await page.mouse.down();await page.mouse.move(cardHeading.x+cardHeading.width*.5+box.width*.2,cardHeading.y+cardHeading.height*.5,{steps:8});await page.mouse.up();await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.progress)<.99);actions.push('ending-card-text-drag-through');await page.waitForTimeout(600);
  await page.emulateMedia({reducedMotion:'reduce'});await seek(1);await page.emulateMedia({reducedMotion:'no-preference'});await page.mouse.move(cardHeading.x+cardHeading.width*.5,cardHeading.y+cardHeading.height*.5);
  await page.evaluate(()=>window.__pilotFrames=[]);
  for(let i=0;i<64;i++){await page.mouse.wheel(0,-130);await page.waitForTimeout(20);}await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.progress)<.005);await ready();
  const reverse=await page.evaluate(()=>window.__pilotFrames);assert(reverse.length>30);assert(Math.min(...reverse.map(f=>f.progress))<.01);assert(Math.max(...reverse.map(f=>f.progress))>.9);
  const drawn=[...new Set([...forward,...reverse].flatMap(f=>f.newDrawn))];
  report.continuous.push({viewport,input:'native wheel',wheelEventsEachDirection:64,endingCardHit:hit,forwardFrames:forward.length,reverseFrames:reverse.length,newDrawn:drawn,forward,reverse});actions.push('full-route-wheel-forward-reverse');
  await page.locator('input[type=range]').focus();await page.keyboard.press('End');await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.progress)>.995);await page.keyboard.press('Home');await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.progress)<.005);actions.push('range-end-home');
  const final=await snap();assertSnapshot(final);report.interactions.push({viewport,actions,tail:{a:tailA.diagnostics,b:tailB.diagnostics},motionOff:{a:offA.diagnostics,b:offB.diagnostics},final});await save();console.log(`${viewport.width}: core controls, continuous forward/reverse route and tail budget passed.`);
 }
 // Keep both ending actions keyboard-reachable and clickable after gesture passthrough.
 await page.emulateMedia({reducedMotion:'reduce'});await seek(1);
 const replay=page.getByRole('button',{name:'再观此卷',exact:true}),restart=page.getByRole('button',{name:'重游四卷',exact:true});
 await replay.focus();assert(await replay.evaluate(el=>el===document.activeElement));await page.keyboard.press('Tab');assert(await restart.evaluate(el=>el===document.activeElement));
 const endingStyles=await replay.evaluate(el=>({button:getComputedStyle(el).pointerEvents,card:getComputedStyle(el.closest('.end-colophon')).pointerEvents}));assert.deepEqual(endingStyles,{button:'auto',card:'none'});
 await restart.click();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.chapter==='1');await page.locator('.chapter-link').nth(3).click();await ready();await seek(1);await page.getByRole('button',{name:'再观此卷',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.progress)<.001);await ready();
 await page.getByRole('button',{name:'进入全屏',exact:true}).click();await page.waitForFunction(()=>document.fullscreenElement!==null);await page.getByRole('button',{name:'退出全屏',exact:true}).click();await page.waitForFunction(()=>document.fullscreenElement===null);await ready();
 const finalCaptionConfig=await page.evaluate(()=>window.__pilotRenderer.calligraphy.artText.map(({config})=>({id:config.id,title:config.title,lines:config.lines})));assert.deepEqual(finalCaptionConfig,revision.textLayers.map(c=>({id:c.id,title:c.title,lines:c.lines})));
 report.endingCardRegression={passed:true,textGesturesPassThrough:true,buttonStyles:endingStyles,bothButtonsKeyboardReachable:true,bothButtonsClicked:true,fullscreenEnterExit:true,captionContentsUnchanged:true,captionContent:finalCaptionConfig,source:'src/styles/reading-panel.css',sourceSha256:createHash('sha256').update(await readFile(new URL('../src/styles/reading-panel.css',import.meta.url))).digest('hex')};
 await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL('runtime-360-after-wheel-fix.png',output))});
 await verifyCanonical();assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.failedResources,[]);assert.equal(report.viewports.reduce((sum,x)=>sum+x.samples.length,0),62);
 report.status='passed';report.finishedAt=new Date().toISOString();report.mixedRevision=false;report.scope='C4 final pilot only. Three adaptive windows, all 8 gaps plus first/last, wide/narrow quarter points, real continuous wheel sweeps and core controls. Independent per-layer framebuffer contribution gate passed before this run. No all-scroll GPU or first-scroll repetition.';await save();console.log('C4 final pilot runtime acceptance passed: 62 views, three responsive interaction runs and six full-route wheel sweeps.');
}catch(error){report.status='failed';report.failure=String(error.stack||error);if(page){try{report.failureState=await page.evaluate(()=>({canvas:[...document.querySelectorAll('canvas')].map(c=>({...c.dataset})),status:document.querySelector('.scene-loading')?.textContent,overflow:document.documentElement.scrollWidth>window.innerWidth}));await page.screenshot({path:fileURLToPath(new URL('runtime-failure.png',output)),fullPage:true});}catch{}}await save();throw error;
}finally{await browser?.close();await vite.close();}

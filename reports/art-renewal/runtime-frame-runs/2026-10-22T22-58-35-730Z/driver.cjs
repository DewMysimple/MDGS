const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const {createHash} = require('node:crypto'), {chromium} = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..'), dist = path.join(root, 'tmp/art-candidate-3-dist');
const id = new Date().toISOString().replace(/[:.]/g, '-'), out = path.join(root, 'reports/art-renewal/runtime-frame-runs', id);
const report = {status:'running',runId:id,startedAt:new Date().toISOString(),scope:'Quiet single-browser representative real-speed source autoplay. Page rAF callback intervals and 20-second cumulative native renderCount observations are separate. GPU submission counters do not prove screen presentation or GPU completion. No screenshots during measurement, private React access, renderer wrapping, source/clock/pixel changes, throttling or forced GC.',cases:[],errors:[]};
const hash = b => createHash('sha256').update(b).digest('hex'), rel = f => path.relative(root,f).split(path.sep).join('/');
const save = () => fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');
let browser,server;
async function walk(dir){let result=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);assert(!e.isSymbolicLink(),rel(f));if(e.isDirectory())result.push(...await walk(f));else if(e.isFile())result.push(f);}return result.sort();}
async function hashes(files){const result={};let next=0;await Promise.all(Array.from({length:8},async()=>{while(next<files.length){const f=files[next++];result[rel(f)]=hash(await fs.readFile(f));}}));return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));}
async function inputs(){return hashes([...await walk(path.join(root,'src')),...await walk(path.join(root,'public')),__filename,...['index.html','vite.config.ts','package.json','package-lock.json'].map(f=>path.join(root,f))]);}
const stats = a => {const s=[...a].sort((a,b)=>a-b);return {count:s.length,mean:s.reduce((a,b)=>a+b,0)/s.length,min:s[0],p50:s[Math.floor(s.length*.5)],p95:s[Math.min(s.length-1,Math.floor(s.length*.95))],p99:s[Math.min(s.length-1,Math.floor(s.length*.99))],max:s.at(-1)};};
const phase=(page,p)=>page.waitForFunction(p=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase===p,p,{timeout:90000});
async function observe(page){
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{
  const sample={armed:false,active:false,complete:false,ticks:[],diagnostics:[],longtasks:[],heaps:[]};window.__frameAudit=sample;
  try{new PerformanceObserver(list=>{for(const e of list.getEntries())sample.longtasks.push({at:e.startTime,duration:e.duration,name:e.name});}).observe({type:'longtask',buffered:true});}catch{}
  let last=-1,lastHeap=0;
  new MutationObserver(()=>{
   const canvas=document.querySelector('.painting canvas');if(!canvas)return;const d=canvas.dataset,count=Number(d.renderCount);if(!Number.isFinite(count)||count===last)return;last=count;
   const now=performance.now(),entry={at:now,count,progress:Number(d.progress),sourceFrame:Number(d.sourceFrame),loading:Number(d.loadingTextures),queued:Number(d.queuedTextures),bytes:Number(d.textureBytes),reads:Number(d.narrativeReads),drawCalls:Number(d.drawCalls)};
   if(sample.armed&&!sample.active&&!sample.complete){sample.active=true;sample.start=now;sample.startEntry=entry;}
   if(sample.active){sample.diagnostics.push(entry);if(now-lastHeap>1000&&performance.memory){lastHeap=now;sample.heaps.push({at:now,used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit});}
    if(now-sample.start>=20000){sample.end=now;sample.endEntry=entry;sample.active=false;sample.complete=true;document.querySelector('.play-button.is-playing')?.click();}
   }
  }).observe(document,{subtree:true,attributes:true,attributeFilter:['data-render-count']});
  function frame(at){if(sample.active)sample.ticks.push(at);requestAnimationFrame(frame);}requestAnimationFrame(frame);
 });
}
async function run(config,chapter,startProgress){
 const context=await browser.newContext({viewport:config.viewport,deviceScaleFactor:config.dpr}),page=await context.newPage();
 const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');await observe(page);
 const item={chapter,startProgress,viewport:config.viewport,dpr:config.dpr,notes:'One 20s representative interval; not a whole-scroll or cross-device benchmark.'};report.cases.push(item);await save();
 try{
  await page.goto(report.url+'#chapter-'+chapter);await phase(page,'SCROLL_VIEWER');
  await page.locator('input[aria-label="画卷游观进度"]').evaluate((input,p)=>{input.step='any';Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(p));input.dispatchEvent(new Event('input',{bubbles:true}));},startProgress);
  await page.waitForFunction(p=>{const d=document.querySelector('.painting canvas')?.dataset;return d&&Math.abs(Number(d.progress)-p)<1e-6&&d.loadingTextures==='0'&&d.queuedTextures==='0'&&d.textureFailed==='0';},startProgress,{timeout:90000});
  await page.waitForTimeout(1200);
  item.environment=await page.locator('.painting canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2'),ext=gl.getExtension('WEBGL_debug_renderer_info'),b=canvas.getBoundingClientRect(),v=JSON.parse(canvas.dataset.sourceViewport),ratio=Math.min(devicePixelRatio,1.65),scale=Math.min(2,4096/(v.width*ratio),4096/(v.height*ratio),Math.sqrt(4*1024*1024/(v.width*v.height*ratio*ratio)));return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),webglVersion:gl.getParameter(gl.VERSION),attributes:gl.getContextAttributes(),actualDevicePixelRatio:devicePixelRatio,canvas:{bufferWidth:canvas.width,bufferHeight:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight,bounds:{x:b.x,y:b.y,width:b.width,height:b.height}},sourceViewport:v,derivedPostTarget:{width:Math.max(1,Math.floor(v.width*ratio*scale)),height:Math.max(1,Math.floor(v.height*ratio*scale)),scale,source:'Calculated from current sourceTargetSize formula and actual CSS gate/DPR; not a private render-target readback.'},initial:{...canvas.dataset}};});
  item.metricsBefore=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  await page.evaluate(()=>{window.__frameAudit.armed=true;document.querySelector('.play-button').click();});
  await page.waitForFunction(()=>window.__frameAudit.complete,null,{timeout:45000,polling:250});
  item.metricsAfter=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  item.raw=await page.evaluate(()=>({sample:window.__frameAudit,canvas:{...document.querySelector('.painting canvas').dataset},phase:document.querySelector('[data-journey-phase]').dataset.journeyPhase,playing:document.querySelector('.play-button').getAttribute('aria-pressed')}));
  const s=item.raw.sample,elapsed=(s.end-s.start)/1000,intervals=s.ticks.slice(1).map((v,i)=>v-s.ticks[i]),count=s.endEntry.count-s.startEntry.count;
  const diagGaps=s.diagnostics.slice(1).map((v,i)=>v.at-s.diagnostics[i].at);
  item.measurement={durationSeconds:elapsed,pageRafFps:(s.ticks.length-1)*1000/(s.ticks.at(-1)-s.ticks[0]),pageRafIntervalsMs:stats(intervals),pageRafGapsOver25ms:intervals.filter(v=>v>25).length,pageRafGapsOver50ms:intervals.filter(v=>v>50).length,pageRafGapsOver100ms:intervals.filter(v=>v>100).length,nativeSubmittedFrameDelta:count,nativeCounterAverageFps:count/elapsed,nativeFpsIfWindowDurationOffBy200ms:{minimum:count/(elapsed+.2),maximum:count/(elapsed-.2)},nativeCounterDiagnosticIntervalsMs:stats(diagGaps),counterLimit:'Counter is cumulative actual completed CPU submission paths; DOM refresh is nominally throttled to100ms. Fresh attribute-observation boundaries are used; diagnostic gaps are not per-native-frame intervals. ±200ms window sensitivity is shown, not a guarantee against arbitrary long-task scheduling. This does not measure monitor presentation or GPU completion.',textureBytes:stats(s.diagnostics.map(d=>d.bytes)),loadingSamples:s.diagnostics.filter(d=>d.loading>0||d.queued>0).length,narrativeReadDelta:s.endEntry.reads-s.startEntry.reads,jsHeapFromPage:stats(s.heaps.map(h=>h.used)),pageHeapLimit:'Chromium performance.memory is an estimate of JavaScript heap, not CPU process RSS or VRAM.',longTasks:s.longtasks.filter(t=>t.at>=s.start&&t.at<=s.end),progressDelta:s.endEntry.progress-s.startEntry.progress};
  item.metricDeltas={};for(const k of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','V8CompileDuration','TaskOtherDuration'])if(k in item.metricsBefore&&k in item.metricsAfter)item.metricDeltas[k]=item.metricsAfter[k]-item.metricsBefore[k];
  item.cdpHeap={before:item.metricsBefore.JSHeapUsedSize,after:item.metricsAfter.JSHeapUsedSize,limit:'CDP V8 JSHeapUsedSize endpoints. No forced GC; not retained-memory or GPU-memory proof.'};
  assert.equal(item.raw.phase,'SCROLL_VIEWER');assert.equal(item.raw.playing,'false');assert.equal(item.raw.canvas.textureFailed,'0');assert.equal(item.raw.canvas.shaderErrors,'[]');assert(count>0&&intervals.length>0&&elapsed>=20);assert.equal(item.environment.actualDevicePixelRatio,config.dpr);
  const timing=JSON.parse(await fs.readFile(path.join(root,`public/assets/new-scrolls/chapter-${chapter}/scene.json`),'utf8'));
  const duration=(timing.frameRange[1]-timing.frameRange[0])/(timing.fps/(timing.fpsBase||1));item.sourceClock={fps:timing.fps,fpsBase:timing.fpsBase,frameRange:timing.frameRange,durationSeconds:duration,expectedProgressDelta:elapsed/duration,absoluteProgressError:Math.abs(item.measurement.progressDelta-elapsed/duration)};
  assert(item.sourceClock.absoluteProgressError<.01,'Actual author clock must continue at real time despite low render rate.');
  item.status='observed';await page.screenshot({path:path.join(out,`c${chapter}-${config.viewport.width}-dpr${config.dpr}-after.png`)});
  console.log(JSON.stringify({chapter,width:config.viewport.width,dpr:config.dpr,rafFps:item.measurement.pageRafFps,nativeFps:item.measurement.nativeCounterAverageFps,p95:item.measurement.pageRafIntervalsMs.p95,clockError:item.sourceClock.absoluteProgressError}));
 }catch(e){item.status='failed';item.error=e.stack||String(e);report.errors.push(item.error);}
 finally{await context.close();await save();}
}
(async()=>{
 await fs.mkdir(out,{recursive:true});await fs.copyFile(__filename,path.join(out,'driver.cjs'));await save();report.inputsBefore=await inputs();
 report.productBefore=await hashes(await walk(dist));report.packageBefore=await hashes(await walk(path.join(root,'dist-exhibition')));report.productDirectory=rel(dist);report.driverSha256=hash(await fs.readFile(__filename));
 const freezeFile=path.join(root,'reports/art-renewal/art-candidate-3-freeze.json'),freeze=JSON.parse(await fs.readFile(freezeFile,'utf8'));assert.equal(freeze.status,'passed');report.candidateFreeze={path:rel(freezeFile),sha256:hash(await fs.readFile(freezeFile)),runId:freeze.runId};
 for(const [f,h]of Object.entries(freeze.inputsAfter))if(f.startsWith('src/')||f.startsWith('public/')||['index.html','vite.config.ts','package.json','package-lock.json'].includes(f))assert.equal(report.inputsBefore[f],h,'Candidate product source changed: '+f);
 const {preview}=await import('vite');server=await preview({root,build:{outDir:dist},preview:{host:'127.0.0.1',port:0},logLevel:'error'});report.url=server.resolvedUrls.local[0];
 browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER,args:['--enable-unsafe-swiftshader']});report.browserVersion=browser.version();
 for(const config of [{viewport:{width:1920,height:1080},dpr:1},{viewport:{width:2560,height:1440},dpr:1.25}])for(const [chapter,p]of [[1,.76],[2,.3],[3,.4],[4,.32]])await run(config,chapter,p);
 report.inputsAfter=await inputs();report.productAfter=await hashes(await walk(dist));report.packageAfter=await hashes(await walk(path.join(root,'dist-exhibition')));assert.deepEqual(report.inputsAfter,report.inputsBefore);assert.deepEqual(report.productAfter,report.productBefore);assert.deepEqual(report.packageAfter,report.packageBefore);assert.deepEqual(report.errors,[]);assert.equal(report.cases.length,8);report.inputsUnchanged=true;report.status='observed';
})().catch(e=>{report.status='failed';report.errors.push(e.stack||String(e));}).finally(async()=>{await Promise.allSettled([browser?.close(),server?.close()]);report.completedAt=new Date().toISOString();await save();await fs.copyFile(path.join(out,'validation.json'),path.join(root,'reports/art-renewal/runtime-frame-performance.json'));console.log(JSON.stringify({status:report.status,runId:id,cases:report.cases.length,errors:report.errors}));if(report.status==='failed')process.exitCode=1;});

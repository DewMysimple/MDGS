const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..'), runId = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(__dirname, 'runs', runId), hash = value => createHash('sha256').update(value).digest('hex');
const rel = file => path.relative(root, file).split(path.sep).join('/');
const report = { status: 'running', runId, startedAt: new Date().toISOString(), prototype: true,
  scope: 'Same-source isolated base/features A/B, fresh browser per case, c3 actual autoplay zero to .5. rAF window .15-.5; native cumulative renderCount is a separate CPU submission-path counter with nominal100ms DOM refresh. No clock acceleration, screenshots during measurement, private React hooks, image downgrade or source program changes. CPU profiling1000us has overhead and is applied equally. OS/GPU driver caches are not reset; ABBA order only partly controls visit/cache bias.', cases: [], errors: [] };
let activeBrowser, servers = [];
const save = () => fs.writeFile(path.join(out, 'validation.json'), JSON.stringify(report, null, 2));
async function walk(directory) { const files=[]; for(const entry of await fs.readdir(directory,{withFileTypes:true})) { assert(!entry.isSymbolicLink()); const file=path.join(directory,entry.name);if(entry.isDirectory())files.push(...await walk(file));else if(entry.isFile())files.push(file); } return files.sort(); }
async function hashes(files) { const result={};let next=0;await Promise.all(Array.from({length:8},async()=>{while(next<files.length){const f=files[next++];result[rel(f)]=hash(await fs.readFile(f));}}));return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b))); }
async function inputHashes() { return hashes([...await walk(path.join(root,'src')),...await walk(path.join(root,'public')),...['index.html','vite.config.ts','tsconfig.json','package.json','package-lock.json'].map(f=>path.join(root,f))]); }
const stats = values => { const s=[...values].sort((a,b)=>a-b);return {count:s.length,min:s[0],mean:s.reduce((a,b)=>a+b,0)/s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.min(s.length-1,Math.floor(s.length*.95))],p99:s[Math.min(s.length-1,Math.floor(s.length*.99))],max:s.at(-1)}; };
function cpuSummary(profile) {const nodes=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();for(let i=0;i<profile.samples.length;i++){const id=profile.samples[i];self.set(id,(self.get(id)||0)+profile.timeDeltas[i]);}return [...self].sort((a,b)=>b[1]-a[1]).slice(0,35).map(([id,time])=>({milliseconds:time/1000,...nodes.get(id).callFrame}));}
async function run(kind,index) {
 const item={kind,index,status:'running',errors:[]}; report.cases.push(item);await save();
 activeBrowser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER,args:['--enable-unsafe-swiftshader']});
 try {
  item.browser=activeBrowser.version();const context=await activeBrowser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const page=await context.newPage();
  page.on('pageerror',e=>item.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)item.errors.push(`HTTP ${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{
   const s=window.__warmupCompare={ticks:[],longtasks:[],phases:[],diagnostics:[],heaps:[],complete:false,started:false,armed:false};
   try{new PerformanceObserver(list=>{for(const e of list.getEntries())s.longtasks.push({at:e.startTime,duration:e.duration});}).observe({type:'longtask',buffered:true});}catch{}
   let phase='',lastCount=-1,lastHeap=0;
   new MutationObserver(()=>{
    const p=document.querySelector('[data-journey-phase]')?.dataset.journeyPhase;
    if(p&&p!==phase){phase=p;s.phases.push({phase,at:performance.now()});}
    const d=document.querySelector('.painting canvas')?.dataset,count=Number(d?.renderCount);
    if(d?.firstFrameReady==='true'&&s.firstFrameReadyAt===undefined)s.firstFrameReadyAt=performance.now();
    const paper=document.querySelector('[data-unfurl][data-presentation-ready]');
    if(paper?.dataset.presentationReady==='true'&&s.paperReadyAt===undefined)s.paperReadyAt=performance.now();
    if(d&&Number.isFinite(count)&&count!==lastCount){lastCount=count;if(s.started&&!s.complete)s.diagnostics.push({at:performance.now(),count,progress:Number(d.progress),frame:Number(d.sourceFrame),loading:Number(d.loadingTextures),bytes:Number(d.textureBytes)});}
   }).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-journey-phase','data-render-count','data-first-frame-ready','data-presentation-ready']});
   function entry(at){const d=document.querySelector('.painting canvas')?.dataset;return{at,count:Number(d?.renderCount),progress:Number(d?.progress),sourceFrame:Number(d?.sourceFrame)};}
   function frame(at){
    const p=Number(document.querySelector('input[aria-label="画卷游观进度"]')?.value);
    if(s.armed&&!s.started&&p>=.15){s.started=true;s.start=entry(at);}
    if(s.started&&!s.complete){s.ticks.push(at);if(at-lastHeap>1000&&performance.memory){lastHeap=at;s.heaps.push({at,used:performance.memory.usedJSHeapSize});}if(p>=.5){s.end=entry(at);s.complete=true;document.querySelector('.play-button.is-playing')?.click();}}
    requestAnimationFrame(frame);
   }requestAnimationFrame(frame);
  });
  const cdp=await context.newCDPSession(page);await cdp.send('Performance.enable');
  const began=Date.now();await page.goto(report.urls[kind]+'#chapter-3');
  await page.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',null,{timeout:90000});
  item.entryWallMilliseconds=Date.now()-began;
  item.environment=await page.locator('.painting canvas').evaluate(c=>{const gl=c.getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return{gpu:e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:e?gl.getParameter(e.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),glVersion:gl.getParameter(gl.VERSION),context:gl.getContextAttributes(),dpr:devicePixelRatio,canvas:{width:c.width,height:c.height},dataset:{...c.dataset}};});
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:1000});await cdp.send('Profiler.start');
  item.metricsBefore=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  await page.evaluate(()=>{window.__warmupCompare.autoplayAt=performance.now();window.__warmupCompare.armed=true;document.querySelector('.play-button').click();});
  await page.waitForFunction(()=>window.__warmupCompare.complete,null,{timeout:65000,polling:200});
  const {profile}=await cdp.send('Profiler.stop');const cpuFile=`${index}-${kind}.cpuprofile`;await fs.writeFile(path.join(out,cpuFile),JSON.stringify(profile));
  item.cpu={path:cpuFile,sha256:hash(await fs.readFile(path.join(out,cpuFile))),scope:'Complete real autoplay zero-.5; not only the .15-.5 rAF window.',topSelf:cpuSummary(profile)};
  item.metricsAfter=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  item.raw=await page.evaluate(()=>({sample:window.__warmupCompare,canvas:{...document.querySelector('.painting canvas').dataset},phase:document.querySelector('[data-journey-phase]').dataset.journeyPhase,playing:document.querySelector('.play-button').getAttribute('aria-pressed')}));
  const s=item.raw.sample,ms=s.end.at-s.start.at,gaps=s.ticks.slice(1).map((at,i)=>at-s.ticks[i]),delta=s.end.count-s.start.count;
  const viewer=s.phases.find(p=>p.phase==='SCROLL_VIEWER');
  item.entryGates={phases:s.phases,paperReadyAt:s.paperReadyAt,nativeFirstFrameReadyAt:s.firstFrameReadyAt,
   viewerAt:viewer?.at,visiblePaperBeforeViewerMilliseconds:viewer&&s.paperReadyAt!==undefined?viewer.at-s.paperReadyAt:null,
   limit:'Page performance.now observer timestamps; first-frame DOM diagnostic can lag its CPU submission by the nominal100ms update cadence. No hidden-page time in this run.'};
  assert(item.entryGates.visiblePaperBeforeViewerMilliseconds>=3998,'Correct paper must remain visibly prepared for at least4s');
  item.measurement={windowMilliseconds:ms,pageRafFps:(s.ticks.length-1)*1000/(s.ticks.at(-1)-s.ticks[0]),rAFGapsMilliseconds:stats(gaps),gapsOver50:gaps.filter(x=>x>50).length,gapsOver100:gaps.filter(x=>x>100).length,
   nativeSubmittedDelta:delta,nativeCounterAveragePerSecond:delta*1000/ms,nativeCounterSensitivity200ms:{min:delta*1000/(ms+200),max:delta*1000/(ms-200)},nativeCounterLimit:'Cumulative completed CPU submission path; two nominal100ms diagnostic boundaries. Not individual frame intervals, GPU completion or display presentation.',
   longtasksWindow:s.longtasks.filter(e=>e.at>=s.start.at&&e.at<=s.end.at),longtasksAutoplay:s.longtasks.filter(e=>e.at>=s.autoplayAt),heapEstimate:stats(s.heaps.map(e=>e.used))};
  const manifest=JSON.parse(await fs.readFile(path.join(root,'public/assets/new-scrolls/chapter-3/scene.json'),'utf8')),duration=(manifest.frameRange[1]-manifest.frameRange[0])/(manifest.fps/(manifest.fpsBase||1));
  item.clock={durationSeconds:duration,progressDelta:s.end.progress-s.start.progress,expectedProgressDelta:ms/1000/duration,error:Math.abs(s.end.progress-s.start.progress-ms/1000/duration)};
  assert(item.clock.error<.01);assert.equal(item.raw.phase,'SCROLL_VIEWER');assert.equal(item.raw.playing,'false');assert.equal(item.raw.canvas.shaderErrors,'[]');assert.equal(item.raw.canvas.textureFailed,'0');assert.deepEqual(item.errors,[]);
  if(kind==='warm'){const warm=JSON.parse(item.raw.canvas.shaderWarmup);assert(warm.extension,'KHR expected on this GPU');assert.equal(warm.abandoned,false);assert(warm.batches>0&&warm.completed>0);item.warmup=warm;}
  item.status='observed';console.log(JSON.stringify({index,kind,entryMs:item.entryWallMilliseconds,maxGap:item.measurement.rAFGapsMilliseconds.max,p99:item.measurement.rAFGapsMilliseconds.p99,longtasks:item.measurement.longtasksWindow.length,nativePerSecond:item.measurement.nativeCounterAveragePerSecond}));
 } catch(error){item.status='failed';item.errors.push(error.stack||String(error));report.errors.push(...item.errors);}
 finally{await activeBrowser?.close();activeBrowser=null;await save();}
}
(async()=>{
 await fs.mkdir(out,{recursive:true});await fs.copyFile(__filename,path.join(out,'driver.cjs'));await save();
 const bindingFile=path.join(__dirname,'build-binding.json'),binding=JSON.parse(await fs.readFile(bindingFile,'utf8'));assert.equal(binding.status,'built-unmeasured');assert(binding.sourceInputsUnchanged);
 report.experimentBefore=await hashes(['ShaderWarmup.ts','SceneRenderer.prototype.ts','build-prototype.mjs','typecheck-prototype.mjs','compare.cjs','helper-safety.cjs','helper-safety.json','build-binding.json'].map(f=>path.join(__dirname,f)));
 assert.equal(hash(await fs.readFile(path.join(__dirname,'ShaderWarmup.ts'))),binding.helperSha256);
 assert.equal(hash(await fs.readFile(path.join(__dirname,'SceneRenderer.prototype.ts'))),binding.prototypeRendererSha256);
 report.driverSha256=hash(await fs.readFile(__filename));
 report.buildBinding={path:rel(bindingFile),sha256:hash(await fs.readFile(bindingFile)),originalRendererSha256:binding.originalRendererSha256,prototypeRendererSha256:binding.prototypeRendererSha256,helperSha256:binding.helperSha256};
 report.inputsBefore=await inputHashes();assert.deepEqual(report.inputsBefore,binding.sourceInputsAfter,'Product inputs changed since paired build');
 const directories={base:path.join(__dirname,'base-dist'),warm:path.join(root,'tmp/shader-warmup-dist')};report.packageBefore={};
 for(const [kind,directory]of Object.entries(directories)){report.packageBefore[kind]=await hashes(await walk(directory));assert.deepEqual(report.packageBefore[kind],binding.packages[kind]);}
 const{preview}=await import('vite');report.urls={};for(const[kind,directory]of Object.entries(directories)){const server=await preview({root,build:{outDir:directory},preview:{host:'127.0.0.1',port:0},logLevel:'error'});servers.push(server);report.urls[kind]=server.resolvedUrls.local[0];}
 const order=process.env.MDGS_WARMUP_ORDER?.split(',')||['base','warm','warm','base'];report.order=order;
 for(let i=0;i<order.length;i++){assert(['base','warm'].includes(order[i]));await run(order[i],i+1);}
 report.inputsAfter=await inputHashes();assert.deepEqual(report.inputsAfter,report.inputsBefore);report.packageAfter={};for(const[kind,directory]of Object.entries(directories)){report.packageAfter[kind]=await hashes(await walk(directory));assert.deepEqual(report.packageAfter[kind],report.packageBefore[kind]);}
 report.experimentAfter=await hashes(['ShaderWarmup.ts','SceneRenderer.prototype.ts','build-prototype.mjs','typecheck-prototype.mjs','compare.cjs','helper-safety.cjs','helper-safety.json','build-binding.json'].map(f=>path.join(__dirname,f)));assert.deepEqual(report.experimentAfter,report.experimentBefore);
 assert.deepEqual(report.errors,[]);report.sourceAndPackagesUnchanged=true;report.status='observed';
})().catch(error=>{report.status='failed';report.errors.push(error.stack||String(error));}).finally(async()=>{await Promise.allSettled([activeBrowser?.close(),...servers.map(s=>s.close())]);report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,runId,cases:report.cases.length,errors:report.errors}));if(report.status==='failed')process.exitCode=1;});

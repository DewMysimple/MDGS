/* Prepared, not yet run. Real UI and real texture arrival; no delay/mocks. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{chromium}=require(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../../..');process.chdir(root);const argv=process.argv.slice(2),arg=n=>argv.includes(n)?argv[argv.indexOf(n)+1]:undefined;
for(const n of ['--build-dir','--freeze-file','--url','--report-dir'])if(!arg(n))throw new Error(`Required ${n}`);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),source='src/components/ArtEncounters.tsx',sourceBefore=sha(fs.readFileSync(source));
const freezeFile=path.resolve(root,arg('--freeze-file')),freeze=JSON.parse(fs.readFileSync(freezeFile,'utf8')),build=path.resolve(root,arg('--build-dir')),out=path.resolve(root,arg('--report-dir')),base=arg('--url');
if(build!==path.resolve(root,freeze.directory)||freeze.sourceInputs[source]!==sourceBefore)throw new Error('Source/build must match specified freeze');
for(const[file,expected]of Object.entries(freeze.code))if(sha(fs.readFileSync(path.join(build,file)))!==expected)throw new Error(`Frozen code mismatch ${file}`);
fs.mkdirSync(out,{recursive:true});
const report={status:'running',scope:'Actual frozen production C3 initial-focus regression: three cold reduced-motion contexts matching the C7 counterexample; a cold normal-motion context; one actual Tab-away while flower is unavailable. No CSS/state/texture mocks, fixed ready delay or focus forcing.',buildDirectory:arg('--build-dir'),freezeFile:arg('--freeze-file'),freezeSha256:sha(fs.readFileSync(freezeFile)),url:base,driverSha256:sha(fs.readFileSync(__filename)),sourceBefore,checks:[],runs:[],errors:[]};
const check=(name,pass,detail)=>report.checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
(async()=>{let browser;try{
 browser=await chromium.launch({...(process.env.MDGS_TEST_BROWSER?{executablePath:process.env.MDGS_TEST_BROWSER}:{}),headless:true});report.browser=browser.version();
 for(const spec of [{name:'cold-reduce-1',reduce:true},{name:'cold-reduce-2',reduce:true},{name:'cold-reduce-3',reduce:true},{name:'cold-normal',reduce:false},{name:'cold-active-tab',reduce:true,tab:true}]){
  const context=await browser.newContext({viewport:{width:1280,height:720},reducedMotion:spec.reduce?'reduce':'no-preference'}),p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));
  const r=await p.goto(new URL('#chapter-3',base).href);check(`${spec.name}: actual HTTP HTML matches freeze`,sha(await r.body())===freeze.code['index.html']);
  await p.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER'&&document.querySelector('#scroll-artwork canvas')?.dataset.chapter==='3',null,{timeout:90000});
  await p.evaluate(()=>{window.__focusTrace=[];let previous='';const sample=(event,detail)=>{const c=document.querySelector('#scroll-artwork canvas'),a=document.activeElement,state={anchors:[...document.querySelectorAll('.art-anchor')].map(e=>({className:e.className,label:e.getAttribute('aria-label'),disabled:e.getAttribute('aria-disabled')})),active:{tag:a?.tagName,className:a?.className,label:a?.getAttribute('aria-label'),text:a?.textContent?.trim().slice(0,60)},phase:document.querySelector('.art-brocade-detail')?.dataset.phase,progress:c?.dataset.progress,loading:c?.dataset.loadingTextures,queued:c?.dataset.queuedTextures};const key=JSON.stringify(state);if(event!=='mutation'||key!==previous){window.__focusTrace.push({at:performance.now(),event,detail,...state});previous=key;}};document.addEventListener('focusin',e=>sample('focusin',e.target.className),true);document.addEventListener('keydown',e=>sample('keydown',e.key),true);document.addEventListener('click',e=>sample('click',{button:e.target.closest('button')?.className,detail:e.detail}),true);new MutationObserver(()=>sample('mutation')).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','aria-disabled','data-phase','data-progress','data-loading-textures','data-queued-textures']});sample('start');});
  await p.getByRole('button',{name:/画中有遇：/}).click();
  let tabTarget;
  if(spec.tab){
   await p.waitForFunction(()=>document.activeElement?.classList.contains('art-close')&&!document.querySelector('.art-anchor--flower'),null,{timeout:10000});
   await p.keyboard.press('Tab');
   tabTarget=await p.evaluate(()=>{window.__manualTabTarget=document.activeElement;return{isSource:document.activeElement?.matches('.art-source'),label:document.activeElement?.textContent,flowerUnavailable:!document.querySelector('.art-anchor--flower')};});
   check(`${spec.name}: real Tab intentionally leaves fallback before flower arrives`,tabTarget.isSource&&tabTarget.flowerUnavailable,tabTarget);
  }
  await p.waitForFunction(()=>{const c=document.querySelector('#scroll-artwork canvas');return document.querySelector('.art-anchor--flower')&&document.querySelector('.art-anchor--cloth')&&c?.dataset.loadingTextures==='0'&&c?.dataset.queuedTextures==='0';},null,{timeout:90000});
  // Wait for a logical state from the actual effects, not a fixed settle sleep.
  if(!spec.tab)await p.waitForFunction(()=>document.activeElement?.classList.contains('art-anchor--flower'),null,{timeout:3000}).catch(()=>{});
  const ready=await p.evaluate(()=>({active:document.activeElement?.className,phase:document.querySelector('.art-brocade-detail')?.dataset.phase,manualTabPreserved:document.activeElement===window.__manualTabTarget,activeSource:document.activeElement?.matches('.art-source')}));
  if(spec.tab)check(`${spec.name}: late flower does not steal user Tab focus`,ready.manualTabPreserved&&ready.activeSource,ready);
  else{
   check(`${spec.name}: initial intent focuses enabled flower`,ready.active?.includes('art-anchor--flower')&&ready.phase==='waiting',ready);
   await p.keyboard.press('Enter');await p.waitForFunction(()=>document.querySelector('.art-brocade-detail')?.dataset.phase==='picked',null,{timeout:3000}).catch(()=>{});
   const picked=await p.evaluate(()=>({phase:document.querySelector('.art-brocade-detail')?.dataset.phase,clothFocus:document.activeElement?.classList.contains('art-anchor--cloth')}));
   check(`${spec.name}: first Enter selects and advances to cloth`,picked.phase==='picked'&&picked.clothFocus,picked);
   await p.keyboard.press('Enter');await p.waitForFunction(()=>document.querySelector('.art-brocade-detail')?.dataset.phase==='woven',null,{timeout:3000}).catch(()=>{});
   check(`${spec.name}: second Enter weaves and exposes reset`,await p.locator('.art-encounters.is-woven').count()===1&&await p.getByRole('button',{name:'重拾',exact:true}).count()===1);
  }
  const trace=await p.evaluate(()=>window.__focusTrace),file=spec.name+'.png';await p.screenshot({path:path.join(out,file)});
  report.runs.push({name:spec.name,ready,tabTarget,trace,screenshot:{file,sha256:sha(fs.readFileSync(path.join(out,file)))}});
  await p.keyboard.press('Escape');await p.waitForSelector('.art-encounters',{state:'detached'});check(`${spec.name}: Escape restores entrance`,await p.getByRole('button',{name:/画中有遇：/}).evaluate(e=>e===document.activeElement));
  await context.close();console.log(JSON.stringify({run:spec.name,checks:report.checks.length,failed:report.checks.filter(c=>!c.pass).length}));
 }
 check('all five cold-context paths completed',report.runs.length===5);check('no page error',report.errors.length===0);report.status=report.checks.every(c=>c.pass)?'passed':'failed';
}catch(error){report.status='failed';report.failure=String(error.stack||error);process.exitCode=1;}finally{await browser?.close();report.sourceAfter=sha(fs.readFileSync(source));report.sourceStable=report.sourceBefore===report.sourceAfter;if(!report.sourceStable)report.status='failed';report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(out,'initial-focus-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({out,status:report.status,checks:report.checks.length,failed:report.checks.filter(c=>!c.pass),sourceStable:report.sourceStable}));if(report.status==='failed')process.exitCode=1;}})();

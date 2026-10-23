import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { preview } from 'vite';
import path from 'node:path';
const root=process.cwd(),runId=new Date().toISOString().replace(/[:.]/g,'-'),out=path.resolve('reports/art-renewal/journey-window-probe',runId+'-stress');
await mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE);
const report={status:'running',scope:'Controlled observer-order counterexample, three real PNGs, unchanged native product clocks. Not a reconstruction of the exact earlier failure cause.',runId,shots:[]};
let server,browser,page;
try{
 server=await preview({root,build:{outDir:'tmp/art-candidate-8-dist'},preview:{host:'127.0.0.1',port:0},logLevel:'error'});
 browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
 page=await browser.newPage({viewport:{width:1672,height:941}});
 await page.addInitScript(()=>{window.__probe=[];function tick(time){const e=document.querySelector('.art-loading');window.__probe.push({time,phase:document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,paper:e?{...e.dataset}:null});requestAnimationFrame(tick);}requestAnimationFrame(tick);});
 await page.goto(server.resolvedUrls.local[0]);
 await page.waitForFunction(()=>window.__MDGS_ATLAS__?.snapshot().ready);
 await page.locator('.study-entry-button[data-chapter-id="3"]').click();
 await page.waitForFunction(()=>{const e=document.querySelector('.art-loading'),p=Number(e?.dataset.unfurl);return document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_LOADING'&&p>.04&&p<.08&&Number(e.dataset.paperVertices)>2000;});
 report.closed=await page.locator('.art-loading').evaluate(e=>({at:performance.now(),...e.dataset}));
 for(let i=0;i<3;i++){
  const before=await page.evaluate(()=>({at:performance.now(),phase:document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,unfurl:document.querySelector('.art-loading')?.dataset.unfurl}));
  await page.screenshot({path:path.join(out,`actual-${i+1}.png`)});
  const after=await page.evaluate(()=>({at:performance.now(),phase:document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,unfurl:document.querySelector('.art-loading')?.dataset.unfurl}));
  report.shots.push({before,after,milliseconds:after.at-before.at});
 }
 report.lateRegistration=await page.evaluate(()=>({at:performance.now(),phase:document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,unfurl:document.querySelector('.art-loading')?.dataset.unfurl}));
 await page.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',null,{timeout:90000});
 report.samples=await page.evaluate(()=>window.__probe);
 const half=report.samples.filter(s=>s.phase==='SCROLL_LOADING'&&Number(s.paper?.unfurl)>.43&&Number(s.paper?.unfurl)<.8);
 report.half={count:half.length,first:half[0],last:half.at(-1)};
 assert(half.length>1&&Number(half.at(-1).paper.renderCount)>Number(half[0].paper.renderCount),'Actual rendered half-window required.');
 assert(half.at(-1).time<report.lateRegistration.at,'Half window must already have rendered before late observer.');
 assert(report.lateRegistration.phase==='SCROLL_VIEWER'||Number(report.lateRegistration.unfurl)>=.8,'Late observer must have missed the original (.43,.8) interval.');
 const opened=report.samples.find(s=>Number(s.paper?.unfurl)>.999);
 assert(Number(report.closed.paperZRange)>.1&&Number(report.closed.paperCurvature)>Number(opened.paper.paperCurvature));
 assert(Number(opened.paper.rodSeparation)>Number(report.closed.rodSeparation)*4);
 const loading=report.samples.find(s=>s.phase==='SCROLL_LOADING'),reveal=report.samples.find(s=>s.phase==='PAINTING_REVEAL');
 assert(reveal.time-loading.time>=3998);report.minimumLoadingMs=reveal.time-loading.time;
 report.status='passed-observer-order-counterexample';
}catch(error){report.status='failed';report.failure={message:error.message,stack:error.stack};if(page)report.samples=await page.evaluate(()=>window.__probe).catch(()=>[]);process.exitCode=1;}
finally{await browser?.close();await server?.close();report.completedAt=new Date().toISOString();const bytes=await readFile(new URL(import.meta.url));report.driverSha256=createHash('sha256').update(bytes).digest('hex');await writeFile(path.join(out,'probe-driver.mjs'),bytes);await writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,directory:out,halfCount:report.half?.count,late:report.lateRegistration,failure:report.failure}));}

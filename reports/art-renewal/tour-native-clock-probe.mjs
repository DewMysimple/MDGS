import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { installLiveAudioCapture } from '../../scripts/exhibition-tour-audio.mjs';
const root=process.cwd(),runId=new Date().toISOString().replace(/[:.]/g,'-');
const output=path.join(root,'tmp/art-renewal/native-audio-clock-probe',runId);
await mkdir(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE);
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><button id="start">Start native reference</button>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,page,capture,finishFailure,diagnostics,audio;
const report={status:'running',startedAt:new Date().toISOString(),output:path.relative(root,output).replaceAll('\\','/'),method:'Native ConstantSource.offset a-rate ramp encodes source sample index / 2^32. Separate native 997Hz sine. No WebGL, product, fake clock or PCM repair. Silent disconnected-input GainNodes churn destination graph locks; reference merger/master remain fixed.'};
report.helperSha256=createHash('sha256').update(await readFile(path.join(root,'scripts/exhibition-tour-audio.mjs'))).digest('hex');
report.probeSha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
 report.browser=browser.version();
 page=await browser.newPage();page.on('console',m=>console.log(m.text()));page.on('pageerror',e=>{report.pageErrors??=[];report.pageErrors.push(e.message);});
 capture=await installLiveAudioCapture(page,path.join(output,'reference.f32'),{waitForLoops:0});
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.evaluate(()=>document.querySelector('#start').onclick=async()=>{
   const ctx=new AudioContext({sampleRate:48000});await ctx.resume();
   const master=ctx.createGain(),merger=ctx.createChannelMerger(2);
   master.gain.value=1;merger.connect(master);master.connect(ctx.destination);
   const ramp=ctx.createConstantSource(),sine=ctx.createOscillator(),sineGain=ctx.createGain();
   const when=ctx.currentTime+.6,duration=60,rate=ctx.sampleRate;
   ramp.offset.setValueAtTime(0,0);ramp.offset.setValueAtTime(0,when);
   ramp.offset.linearRampToValueAtTime(duration*rate/2**32,when+duration);
   sine.type='sine';sine.frequency.value=997;sineGain.gain.value=.0005;
   ramp.connect(merger,0,0);sine.connect(sineGain);sineGain.connect(merger,0,1);
   const bank=Array.from({length:12},()=>ctx.createGain());let mutations=0;
   const churn=setInterval(()=>{for(const node of bank){node.connect(ctx.destination);node.disconnect();mutations+=2;}},8);
   const progress=setInterval(()=>console.log('REFERENCE '+ctx.currentTime.toFixed(3)),5000);
   window.__reference={ctx,when,whenFrame:Math.round(when*rate),duration,rate,frequency:997,sineAmplitude:.0005,rampScale:2**32,finished:false};
   sine.onended=async()=>{clearInterval(churn);clearInterval(progress);await ctx.close();window.__reference.mutations=mutations;window.__reference.finished=true;};
   ramp.start(when);sine.start(when);ramp.stop(when+duration);sine.stop(when+duration);
 });
 await page.click('#start');await capture.ready();
 report.reference=await page.evaluate(()=>{const {ctx,...r}=window.__reference;return r;});
 await writeFile(path.join(output,'reference.json'),JSON.stringify(report,null,2)+'\n');
 await page.waitForFunction(()=>window.__reference.ctx.currentTime>=window.__reference.when+58.5,null,{timeout:85000});
 await capture.armTail();
 await page.waitForFunction(()=>window.__reference.finished,null,{timeout:10000});await page.waitForTimeout(300);
 try{audio=await capture.finish();}catch(error){finishFailure=String(error);}
 diagnostics=await capture.diagnostics();
 report.reference=await page.evaluate(()=>{const {ctx,...r}=window.__reference;return r;});
 report.strictCaptureStatus=finishFailure?'failed':'passed';report.finishFailure=finishFailure;report.status='captured-for-independent-reference-analysis';
 report.audio=audio;await writeFile(path.join(output,'diagnostics.json'),JSON.stringify(diagnostics,null,2)+'\n');
}catch(error){report.status='failed';report.failure=error.stack;if(capture)await writeFile(path.join(output,'diagnostics.json'),JSON.stringify(await capture.diagnostics(),null,2)+'\n').catch(()=>{});}
finally{await capture?.dispose().catch(()=>{});await browser?.close();await new Promise(resolve=>server.close(resolve));report.completedAt=new Date().toISOString();await writeFile(path.join(output,'reference.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,strictCaptureStatus:report.strictCaptureStatus,output:report.output}));}
if(report.status==='failed'||finishFailure)process.exitCode=1;

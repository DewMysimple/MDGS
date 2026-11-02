import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {_electron}=require('C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(), out=path.join(root,'tmp','chapter-music-validation');await mkdir(out,{recursive:true});
const exe=process.argv[2]??path.join(root,'node_modules/electron/dist/electron.exe');
const host=process.argv[3]==='--packaged'?null:(process.argv[3]??path.join(root,'desktop'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:exe,args:[...(host?[host]:[]),'--mdgs-smoke',`--mdgs-smoke-profile=${path.join(out,'profile-'+Date.now())}`],env,timeout:60000});
const report={started:new Date().toISOString(),checks:[],requests:[],errors:[]};
try {
 const page=await app.firstWindow({timeout:60000});page.setDefaultTimeout(120000);
 page.on('pageerror',error=>report.errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('/audio/')) report.requests.push(request.url());});
 await page.addInitScript(()=>{
  localStorage.setItem('guose-fanghua:exhibition-guide:v1',JSON.stringify({home:true,viewer:true,ending:true}));
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){
   if(destination instanceof AudioDestinationNode && this instanceof GainNode){
    const context=this.context,tap=context.createAnalyser();tap.fftSize=2048;connect.call(this,tap);window.__musicTap=tap;
    const processor=context.createScriptProcessor(2048,2,2),silent=context.createGain();silent.gain.value=0;
    const stats={frames:0,peak:0,clipped:0,maxAdjacent:0,last:[0,0]};window.__musicPcm=stats;
    processor.onaudioprocess=event=>{for(let ch=0;ch<event.inputBuffer.numberOfChannels;ch++){
     const data=event.inputBuffer.getChannelData(ch);let last=stats.last[ch]??0;
     for(let i=0;i<data.length;i++){const x=data[i];stats.peak=Math.max(stats.peak,Math.abs(x));if(Math.abs(x)>=1)stats.clipped++;stats.maxAdjacent=Math.max(stats.maxAdjacent,Math.abs(x-last));last=x;}
     stats.last[ch]=last;
    }stats.frames+=event.inputBuffer.length};
    connect.call(this,processor);connect.call(processor,silent);connect.call(silent,context.destination);
   }
   return connect.call(this,destination,...args);
  };
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(when,offset,duration){
   if(this.loop && this.buffer && this.buffer.duration>60 && window.__musicSeekToEnd){offset=this.buffer.duration-1.25;window.__musicSeekToEnd=false;}
   return duration===undefined?start.call(this,when,offset):start.call(this,when,offset,duration);
  };
 });
 await page.goto('mdgs://app/#chapter-1');
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER'&&document.querySelector('.painting canvas')?.dataset.firstFrameReady==='true',null,{timeout:120000});
 const before=report.requests.length;assert.equal(before,0,'Audio requested before user enables it');
 await page.locator('.audio-control--viewer .audio-button').click();
 const waitFor=async chapter=>page.waitForFunction(chapter=>{const s=window.__MDGS_AUDIO__?.snapshot();return s?.enabled&&s.playback==='playing'&&s.activeChapter===chapter&&s.sourceCount===1;},chapter,{timeout:60000});
 const sample=async seconds=>page.evaluate(async seconds=>{const tap=window.__musicTap;if(!tap)throw Error('No output tap');const buf=new Float32Array(tap.fftSize);let peak=0,sum=0,count=0,nonSilent=0,clipped=0,maxAdjacent=0;let end=performance.now()+seconds*1000;while(performance.now()<end){tap.getFloatTimeDomainData(buf);let sq=0;for(let i=0;i<buf.length;i++){let x=buf[i];peak=Math.max(peak,Math.abs(x));sum+=x*x;sq+=x*x;count++;if(Math.abs(x)>=1)clipped++;if(i)maxAdjacent=Math.max(maxAdjacent,Math.abs(x-buf[i-1]));}if(Math.sqrt(sq/buf.length)>.0001)nonSilent++;await new Promise(r=>setTimeout(r,40))}return {peak,rms:Math.sqrt(sum/count),nonSilent,clipped,maxAdjacent};},seconds);
 await waitFor(1);await page.waitForTimeout(1200);
 await page.locator('.art-encounter-entrance').click();
 await page.waitForFunction(()=>{const s=window.__MDGS_AUDIO__.snapshot();return s.reading&&s.musicGain<.65},null,{timeout:15000});
 await page.locator('.art-encounter-entrance').click();
 await page.waitForFunction(()=>{const s=window.__MDGS_AUDIO__.snapshot();return !s.reading&&s.musicGain>.9},null,{timeout:15000});
 report.checks.push({test:'reading-ducks-and-restores-music',passed:true});
 for(let chapter=1;chapter<=4;chapter++){
  if(chapter>1){
   const transition=sample(2);
   await page.locator('.chapter-nav .chapter-link').nth(chapter-1).click();
   await waitFor(chapter);
   const sound=await transition;
   assert(sound.nonSilent>0&&sound.clipped===0&&sound.maxAdjacent<.9,`Chapter ${chapter} transition is silent or clipped`);
   report.checks.push({test:'chapter-transition',chapter,sound,passed:true});
   await page.waitForTimeout(1100);
  }
  const state=await page.evaluate(()=>window.__MDGS_AUDIO__.snapshot());
  const observed=await sample(2);assert(observed.rms>.0001&&observed.nonSilent>0,`Chapter ${chapter} output is silent`);assert.equal(observed.clipped,0,`Chapter ${chapter} output clips`);
  assert(report.requests.some(url=>url.endsWith(`/audio/chapter-${chapter}.mp3`)),`Chapter ${chapter} not requested`);
  report.checks.push({test:'chapter-playback',chapter,state,observed,passed:true});console.log(JSON.stringify({chapter,active:state.activeChapter,rms:observed.rms,peak:observed.peak,clipped:observed.clipped}));
  const continuous=await page.evaluate(()=>window.__musicPcm);
  assert(continuous.frames>48000&&continuous.clipped===0&&continuous.maxAdjacent<.9,`Chapter ${chapter} master output failed PCM checks`);
  await page.locator('.audio-control--viewer .audio-button').click();await page.waitForTimeout(300);
  await page.evaluate(()=>{window.__musicSeekToEnd=true});await page.locator('.audio-control--viewer .audio-button').click();await waitFor(chapter);
  const boundary=await sample(3.5), loopPcm=await page.evaluate(()=>window.__musicPcm);
  assert(boundary.nonSilent>5&&loopPcm.frames>48000&&loopPcm.clipped===0&&loopPcm.maxAdjacent<.9,`Chapter ${chapter} loop boundary failed PCM checks`);
  report.checks.push({test:'chapter-loop-boundary',chapter,boundary,loopPcm,passed:true});
 }
 const pcm=await page.evaluate(()=>window.__musicPcm);
 assert(pcm.frames>48000&&pcm.clipped===0&&pcm.maxAdjacent<.9,'Continuous master output is missing, clips or contains a large sample step');
 report.checks.push({test:'continuous-master-pcm',pcm,passed:true});
 await page.locator('.audio-control--viewer .audio-volume-trigger').click();
 const slider=page.locator('.audio-control--viewer input[type=range]');await slider.fill('0');await page.waitForTimeout(550);
 const muted=await sample(.6);assert(muted.peak<.002,'Volume zero is not silent');
 await slider.fill('100');await page.waitForTimeout(550);const loud=await sample(1);assert(loud.rms>.0001&&loud.clipped===0,'Volume restore failed or output clipped');
 report.checks.push({test:'volume-and-clipping',muted,loud,passed:true});
 await page.locator('.audio-control--viewer .audio-button').click();await page.waitForTimeout(400);assert.equal((await page.evaluate(()=>window.__MDGS_AUDIO__.snapshot())).playback,'off');
 await page.evaluate(()=>{window.__musicSeekToEnd=true});await page.locator('.audio-control--viewer .audio-button').click();await waitFor(4);
 const loop=await sample(3.5);assert(loop.nonSilent>5&&loop.clipped===0&&loop.maxAdjacent<.9,'Loop produced no sound, clipped or had a large discontinuity');report.checks.push({test:'loop-boundary',loop,passed:true});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.waitForFunction(()=>window.__MDGS_AUDIO__.snapshot().playback==='paused',null,{timeout:10000});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});
 await waitFor(4);report.checks.push({test:'visibility-suspend-and-resume',passed:true});
 await page.locator('.brand').click();await page.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='HOME',null,{timeout:60000});await waitFor(1);
 report.checks.push({test:'return-home-uses-first-track',state:await page.evaluate(()=>window.__MDGS_AUDIO__.snapshot()),passed:true});
 // The mdgs: custom protocol bypasses Playwright's HTTP routing. Intercept
 // fetch inside the renderer to exercise the same non-OK response path.
 await page.evaluate(()=>{
  const original=window.fetch.bind(window);window.__musicFail=true;
  window.fetch=(input,init)=>window.__musicFail&&String(input).includes('/audio/chapter-2.mp3')
   ?Promise.resolve(new Response('intentional test outage',{status:503})):original(input,init);
 });
 await page.locator('.atlas-chapter[data-chapter-id="2"]').click();
 try { await page.waitForFunction(()=>window.__MDGS_AUDIO__.snapshot().playback==='error',null,{timeout:30000}); }
 catch (error) { console.error('FAILURE STATE',await page.evaluate(()=>({state:window.__MDGS_AUDIO__?.snapshot(),phase:document.querySelector('[data-journey-phase]')?.dataset.journeyPhase}))); throw error; }
 await page.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',null,{timeout:120000});
 await page.evaluate(()=>{window.__musicFail=false});await page.locator('.audio-control--viewer .audio-button').click();await waitFor(2);
 report.checks.push({test:'missing-audio-error-and-retry',passed:true});
 assert.equal(report.errors.length,0,`Page errors: ${report.errors.join('; ')}`);
 report.status='passed';
} catch(error){report.status='failed';report.errors.push(error.stack||String(error));process.exitCode=1;console.error(error)}
finally {report.finished=new Date().toISOString();await writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));await app.close();}

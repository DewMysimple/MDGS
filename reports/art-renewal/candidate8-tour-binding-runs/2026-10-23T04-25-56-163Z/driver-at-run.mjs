/** A read-only identity wrapper around the unchanged actual capture script.
 * Only call after every product test browser has released the quiet window. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const root=process.cwd(),id=new Date().toISOString().replace(/[:.]/g,'-');
const output=path.join(root,'reports/art-renewal/candidate8-tour-binding-runs',id),movieRoot=path.join(root,'tmp/exhibition-tour-candidate8');
const freezePath=path.join(root,'reports/art-renewal/art-candidate-8-build.json'),directory=path.join(root,'tmp/art-candidate-8-dist');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),rel=p=>path.relative(root,p).replaceAll('\\','/');
const expectedRecorders={'scripts/capture-exhibition-tour.mjs':'fc52cb9d1bfe0ff329f2fcd7c7e5cbc87dbbec36984bf788569cf864b4f98210','scripts/exhibition-tour-audio.mjs':'c3ce6432133fa6403c40a7842473ee0894f8f2631d591289c47faa00017dd4c3','reports/art-renewal/validate-tour-recording.mjs':'e6a9a58bffba9e09768bb679b9edbc30003aed067c662d8e0f101e496a04e481'};
const report={status:'running',startedAt:new Date().toISOString(),scope:'Actual immutable C8 guided excerpt. This wrapper hashes all831 product inputs and all744 candidate files before/after capture, not during it. The capture script now contains only the reviewed end-of-screencast intake latch; it and the unchanged audio helper/fixed checker stay frozen during this run. The prior 34/35 capture is retained. Independent PCM35, full encoded decode and visual review remain separate.',errors:[]};
await fs.mkdir(output,{recursive:true});await fs.copyFile(new URL(import.meta.url),path.join(output,'driver-at-run.mjs'));
report.driverSha256=sha(await fs.readFile(new URL(import.meta.url)));
const save=()=>fs.writeFile(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');
async function walk(d){const list=[];for(const e of await fs.readdir(d,{withFileTypes:true})){assert(!e.isSymbolicLink());const p=path.join(d,e.name);if(e.isDirectory())list.push(...await walk(p));else if(e.isFile())list.push(p);}return list.sort();}
async function hashes(files){const out={};let i=0;await Promise.all(Array.from({length:8},async()=>{while(i<files.length){const file=files[i++];out[rel(file)]=sha(await fs.readFile(file));}}));return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)));}
const inputs=async()=>hashes([...await walk(path.join(root,'src')),...await walk(path.join(root,'public')),...['index.html','vite.config.ts','tsconfig.json','package.json','package-lock.json'].map(f=>path.join(root,f))]);
async function packageHashes(){const records=await hashes(await walk(directory));return Object.fromEntries(Object.entries(records).map(([p,h])=>[p.slice(rel(directory).length+1),h]));}
try{
 const freezeBytes=await fs.readFile(freezePath),freeze=JSON.parse(freezeBytes);report.freeze={path:rel(freezePath),sha256:sha(freezeBytes)};assert.equal(report.freeze.sha256,'305dc8b9b429415093889642ae885ffe564cdd33f156edf30a637bac4a172ea9','The original fixed C8 manifest must remain exact');
 report.recordersBefore=await hashes(Object.keys(expectedRecorders).map(f=>path.join(root,f)));assert.deepEqual(report.recordersBefore,expectedRecorders);
 report.sourceInputsBefore=await inputs();assert.deepEqual(report.sourceInputsBefore,freeze.sourceInputs);
 report.packageBefore=await packageHashes();const expectedPackage={...Object.fromEntries(Object.entries(freeze.sourceInputs).filter(([p])=>p.startsWith('public/')).map(([p,h])=>[p.slice(7),h])),...freeze.code};assert.deepEqual(report.packageBefore,expectedPackage);assert.equal(Object.keys(report.packageBefore).length,744);
 report.inventoryBefore=sha(await fs.readFile(path.join(root,'dist-exhibition/.mdgs-exhibition-package.json')));assert.equal(report.inventoryBefore,freeze.exhibitionInventorySha256);
 await fs.mkdir(movieRoot,{recursive:true});const previous=new Set(await fs.readdir(movieRoot));
 report.command={executable:process.execPath,args:['scripts/capture-exhibition-tour.mjs','--build-dir','tmp/art-candidate-8-dist','--output-dir','tmp/exhibition-tour-candidate8']};
 const chunks=[];const child=spawn(process.execPath,report.command.args,{cwd:root,env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});report.childPid=child.pid;report.captureStartedAt=new Date().toISOString();
 child.stdout.on('data',b=>{chunks.push(b);process.stdout.write(b);});child.stderr.on('data',b=>{chunks.push(b);process.stderr.write(b);});const exited=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});await save();report.exitCode=await exited;
 const log=Buffer.concat(chunks);await fs.writeFile(path.join(output,'capture.log'),log);report.logSha256=sha(log);report.captureEndedAt=new Date().toISOString();
 const created=(await fs.readdir(movieRoot)).filter(name=>!previous.has(name));assert.equal(created.length,1,'One isolated recorder run must have been created');const run=path.join(movieRoot,created[0]);report.runDirectory=rel(run);
 const recordingBytes=await fs.readFile(path.join(run,'recording.json')),recording=JSON.parse(recordingBytes);report.recordingSha256=sha(recordingBytes);report.recordingStatus=recording.status;assert.equal(report.exitCode,0);assert.equal(recording.status,'recorded');assert.deepEqual(recording.errors,[]);assert.deepEqual(recording.bundleBefore,freeze.code);assert.deepEqual(recording.bundleAfter,freeze.code);
 report.artifacts={};for(const name of['国色长卷-导览录像.mp4','导览字幕.srt',recording.keepsake,'recording.json','audio-clock.json','frames.json','live-sound.f32']){const file=path.join(run,name),bytes=await fs.readFile(file);report.artifacts[name]={path:rel(file),bytes:bytes.length,sha256:sha(bytes)};}
 report.video=recording.video;report.browser=recording.browser;report.status='recorded-bound-awaiting-independent-audit';
}catch(error){report.status='failed';report.errors.push(error.stack||String(error));process.exitCode=1;}finally{
 // Bind failed captures as well as successful ones; a failed recorder is never
 // promoted to accepted simply because its immutable inputs remained stable.
 if(report.sourceInputsBefore&&report.packageBefore&&report.recordersBefore&&report.inventoryBefore){
  try{
   report.sourceInputsAfter=await inputs();report.packageAfter=await packageHashes();report.recordersAfter=await hashes(Object.keys(expectedRecorders).map(f=>path.join(root,f)));report.inventoryAfter=sha(await fs.readFile(path.join(root,'dist-exhibition/.mdgs-exhibition-package.json')));
   assert.deepEqual(report.sourceInputsAfter,report.sourceInputsBefore);assert.deepEqual(report.packageAfter,report.packageBefore);assert.deepEqual(report.recordersAfter,report.recordersBefore);assert.equal(report.inventoryAfter,report.inventoryBefore);assert.equal(sha(await fs.readFile(freezePath)),report.freeze.sha256);assert.equal(sha(await fs.readFile(new URL(import.meta.url))),report.driverSha256);report.unchanged=true;
  }catch(error){report.status='failed';report.unchanged=false;report.errors.push('Final identity verification: '+(error.stack||String(error)));process.exitCode=1;}
 }
 report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,bindingReport:rel(path.join(output,'validation.json')),runDirectory:report.runDirectory,unchanged:report.unchanged,errors:report.errors}));
}

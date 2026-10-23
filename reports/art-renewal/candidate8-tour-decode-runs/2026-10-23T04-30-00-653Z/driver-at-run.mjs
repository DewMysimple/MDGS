/** Independent full encoded-media decode. Does not alter the movie or PCM. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
assert(args.includes('--run-dir')&&args.includes('--binding-report'),'Pass explicit actual run and its immutable capture binding report.');
const root=process.cwd(),run=path.resolve(option('--run-dir')),bindingFile=path.resolve(option('--binding-report'));
const allowed=path.join(root,'tmp/exhibition-tour-candidate8');
assert(run.startsWith(allowed+path.sep),'Only an actual isolated C8 tour may be decoded here.');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const rel=file=>path.relative(root,file).replaceAll('\\','/');
const output=path.join(root,'reports/art-renewal/candidate8-tour-decode-runs',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const driver=await fs.readFile(new URL(import.meta.url));await fs.writeFile(path.join(output,'driver-at-run.mjs'),driver);
const report={status:'running',startedAt:new Date().toISOString(),driverSha256:sha(driver),scope:'Decode every encoded video and audio frame to a null sink with FFmpeg software decoders and strict bitstream error handling. This is separate from fixed independent35 raw PCM/package checks and does not establish original-painting pixel fidelity or visual quality.',errors:[]};
const save=()=>fs.writeFile(path.join(output,'validation.json'),JSON.stringify(report,null,2)+'\n');
try{
 const bindingBytes=await fs.readFile(bindingFile),binding=JSON.parse(bindingBytes);
 assert.equal(binding.status,'recorded-bound-awaiting-independent-audit');assert.equal(binding.unchanged,true);
 assert.equal(path.resolve(root,binding.runDirectory),run);
 assert.equal(binding.freeze.sha256,'305dc8b9b429415093889642ae885ffe564cdd33f156edf30a637bac4a172ea9');
 report.binding={path:rel(bindingFile),sha256:sha(bindingBytes)};
 const recordingBytes=await fs.readFile(path.join(run,'recording.json'));assert.equal(sha(recordingBytes),binding.recordingSha256);const recording=JSON.parse(recordingBytes);report.expectedEncodedVideoFrames=Number(recording.probe.streams.find(s=>s.codec_type==='video').nb_frames);assert(report.expectedEncodedVideoFrames>100);
 const movie=path.join(run,'国色长卷-导览录像.mp4'),before=await fs.readFile(movie),expected=binding.artifacts['国色长卷-导览录像.mp4'];
 report.movie={path:rel(movie),bytes:before.length,sha256:sha(before)};assert.equal(report.movie.sha256,expected.sha256);assert.equal(before.length,expected.bytes);
 const executable=process.env.MDGS_FFMPEG||'ffmpeg';
 const commandArgs=['-nostdin','-hide_banner','-loglevel','error','-xerror','-err_detect','explode','-threads','2','-i',movie,'-map','0:v:0','-map','0:a:0','-threads','2','-progress','pipe:1','-nostats','-f','null','-'];
 report.command={executable,args:commandArgs};await save();
 const child=spawn(executable,commandArgs,{windowsHide:true,stdio:['ignore','pipe','pipe']}),stdout=[],stderr=[];
 report.childPid=child.pid;child.stdout.on('data',bytes=>stdout.push(bytes));child.stderr.on('data',bytes=>stderr.push(bytes));
 const timer=setTimeout(()=>{report.timeout=true;child.kill();},120000);
 try{report.exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(timer);}
 const progress=Buffer.concat(stdout),log=Buffer.concat(stderr);await fs.writeFile(path.join(output,'decode-progress.txt'),progress);await fs.writeFile(path.join(output,'decode-errors.txt'),log);
 report.progressSha256=sha(progress);report.stderrSha256=sha(log);report.stderrBytes=log.length;
 const frames=[...progress.toString('utf8').matchAll(/^frame=\s*(\d+)$/gm)];report.decodedVideoFrames=frames.length?Number(frames.at(-1)[1]):null;
 assert.equal(report.exitCode,0);assert(!report.timeout);assert.equal(log.length,0,'Strict error log must be empty.');assert(progress.toString('utf8').includes('progress=end'));assert.equal(report.decodedVideoFrames,report.expectedEncodedVideoFrames,'Every encoded video frame must be decoded.');
 const after=await fs.readFile(movie);assert.equal(sha(after),report.movie.sha256);assert.equal(sha(await fs.readFile(bindingFile)),report.binding.sha256);assert.equal(sha(await fs.readFile(new URL(import.meta.url))),report.driverSha256);
 report.unchanged=true;report.status='passed';
}catch(error){report.status='failed';report.errors.push(error.stack||String(error));process.exitCode=1;}finally{report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,report:rel(path.join(output,'validation.json')),decodedVideoFrames:report.decodedVideoFrames,errors:report.errors}));}

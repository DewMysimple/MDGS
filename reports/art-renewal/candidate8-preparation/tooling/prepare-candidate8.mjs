/** Prepared only. No build/export runs here. inspect is read-only except its report;
 * archive-c7 only makes new copies; freeze only writes a new identity report. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'../..'),reportDir=path.join(root,'reports/art-renewal/candidate8-preparation');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),relative=p=>path.relative(root,p).replaceAll('\\','/');
const freeze7Path=path.join(root,'reports/art-renewal/art-candidate-7-build.json');
const freeze7=JSON.parse(await fs.readFile(freeze7Path,'utf8'));
const candidate7=path.join(root,'tmp/art-candidate-7-dist');
const candidate8=path.join(root,'tmp/art-candidate-8-dist');
async function walk(directory){assert(!(await fs.lstat(directory)).isSymbolicLink(),'Refuse linked directory: '+relative(directory));const list=[];for(const entry of await fs.readdir(directory,{withFileTypes:true})){assert(!entry.isSymbolicLink(),'Refuse linked file: '+entry.name);const file=path.join(directory,entry.name);if(entry.isDirectory())list.push(...await walk(file));else if(entry.isFile())list.push(file);}return list.sort();}
async function hashes(files){const result={};let next=0;await Promise.all(Array.from({length:8},async()=>{while(next<files.length){const file=files[next++];result[relative(file)]=sha(await fs.readFile(file));}}));return Object.fromEntries(Object.entries(result).sort(([a],[b])=>a.localeCompare(b)));}
async function sourceInputs(){return hashes([...await walk(path.join(root,'src')),...await walk(path.join(root,'public')),...['index.html','vite.config.ts','tsconfig.json','package.json','package-lock.json'].map(file=>path.join(root,file))]);}
async function packageHashes(directory){const all=await hashes(await walk(directory));return Object.fromEntries(Object.entries(all).map(([file,h])=>[file.slice(relative(directory).length+1),h]));}
async function verifyCodes(code,directories){for(const directory of directories)for(const[file,h]of Object.entries(code))assert.equal(sha(await fs.readFile(path.join(directory,file))),h,'Code mismatch: '+relative(directory)+'/'+file);}
async function writeNew(name,value){await fs.mkdir(reportDir,{recursive:true});await fs.writeFile(path.join(reportDir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}
async function inspect(){const inputs=await sourceInputs();assert.deepEqual(inputs,freeze7.sourceInputs,'Inspect requires still-unmodified C7 source/public/config');await verifyCodes(freeze7.code,[candidate7,path.join(root,'dist'),path.join(root,'dist-exhibition')]);assert.equal(sha(await fs.readFile(path.join(root,'dist-exhibition/.mdgs-exhibition-package.json'))),freeze7.exhibitionInventorySha256);const candidate=await packageHashes(candidate7),main=await packageHashes(path.join(root,'dist'));assert.deepEqual(candidate,main);return{status:'c7-readonly-base-confirmed',checkedAt:new Date().toISOString(),sourceInputs:Object.keys(inputs).length,packageFiles:Object.keys(candidate).length,freezeSha256:sha(await fs.readFile(freeze7Path)),font:freeze7.font,sourceAndCurrentThreeCodeCopiesMatch:true};}
const command=process.argv[2]||'inspect';
if(command==='inspect'){const report=await inspect();await writeNew('readonly-base-check-'+Date.now()+'.json',report);console.log(JSON.stringify(report));}
else if(command==='archive-c7'){
 await inspect();const target=path.join(root,'tmp/candidate7-active-output-snapshot');
 assert(path.dirname(target)===path.join(root,'tmp'),'Fixed archive path must stay in workspace tmp');
 await fs.mkdir(target); // Exclusive new directory; never replace or delete a previous snapshot.
 const records={};for(const name of['dist','dist-exhibition']){const source=path.join(root,name),before=await packageHashes(source),destination=path.join(target,name);await fs.cp(source,destination,{recursive:true,errorOnExist:true,force:false});assert.deepEqual(await packageHashes(destination),before);assert.deepEqual(await packageHashes(source),before);records[name]=before;}
 await writeNew('c7-active-output-snapshot.json',{createdAt:new Date().toISOString(),directory:relative(target),independentCandidateStillAt:relative(candidate7),freezeSha256:sha(await fs.readFile(freeze7Path)),records});console.log(JSON.stringify({status:'copied-without-changing-c7',directory:relative(target)}));
}
else if(command==='freeze'){
 const before=await sourceInputs();assert.deepEqual(Object.keys(before),Object.keys(freeze7.sourceInputs),'A two-selector fix must not silently add/remove product inputs');
 const changed=Object.keys(before).filter(file=>before[file]!==freeze7.sourceInputs[file]);
 assert(changed.includes('src/components/ArtEncounters.tsx'));
 assert(changed.every(file=>['src/components/ArtEncounters.tsx','public/fonts/provenance.json'].includes(file)),'Unexpected scope drift: '+changed.join(','));
 assert.equal(before['src/components/ArtEncounters.tsx'],'f55cf6c782664968b3c67d8b5c745ab2c42cd4cf0faa59e20da08064acffaced','Candidate must be the reviewed original-byte two-selector patch');
 assert.equal(before['public/fonts/wenkai-web.woff2'],freeze7.font,'No webfont re-encoding in this focused fix');
 const candidate=await packageHashes(candidate8),main=await packageHashes(path.join(root,'dist'));assert.deepEqual(candidate,main,'Independent and main C8 outputs differ');
 const codeFiles=['index.html',...(await fs.readdir(path.join(candidate8,'assets'),{withFileTypes:true})).filter(entry=>entry.isFile()&&/\.(js|css)$/.test(entry.name)).map(entry=>'assets/'+entry.name)].sort();assert.equal(codeFiles.length,5);
 const code=Object.fromEntries(codeFiles.map(file=>[file,candidate[file]]));await verifyCodes(code,[candidate8,path.join(root,'dist'),path.join(root,'dist-exhibition')]);
 for(const[file,h]of Object.entries(before).filter(([file])=>file.startsWith('public/')))assert.equal(candidate[file.slice(7)],h,'Built public bytes differ from current input: '+file);
 const inventoryFile=path.join(root,'dist-exhibition/.mdgs-exhibition-package.json'),inventory=JSON.parse(await fs.readFile(inventoryFile,'utf8'));assert.equal(inventory.status,'ready');assert.equal(inventory.sourceStable,true);assert.equal(inventory.buildSourceVerified,true,'Use the actual export build, not --skip-build');
 for(const item of inventory.files)assert.equal(sha(await fs.readFile(path.join(root,'dist-exhibition',item.path))),item.sha256,'Exhibition file differs from inventory: '+item.path);
 for(const item of inventory.sourceInputs)assert.equal(sha(await fs.readFile(path.join(root,item.path))),item.sha256,'Package source changed after build: '+item.path);
 assert.deepEqual(await sourceInputs(),before,'Source changed while freezing');
 const report={status:'frozen-unvalidated',createdAt:new Date().toISOString(),scope:'C8 applies only the reviewed enabled-anchor focus selectors and updates font corpus provenance. C7 first-cloth focus regression remains historical; full C8 acceptance is separate. Original artwork, sampler queue/cache, source clock and font bytes unchanged.',directory:'tmp/art-candidate-8-dist',code,font:freeze7.font,sourceInputs:before,exhibitionInventorySha256:sha(await fs.readFile(inventoryFile))};
 await fs.writeFile(path.join(root,'reports/art-renewal/art-candidate-8-build.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});await writeNew('c8-freeze-audit.json',{createdAt:new Date().toISOString(),changedInputs:changed,code,sourceInputs:Object.keys(before).length,packageFiles:Object.keys(candidate).length,exhibitionFiles:inventory.files.length,exhibitionSourceBuildVerified:inventory.buildSourceVerified});console.log(JSON.stringify({status:'frozen-unvalidated',changed,inputs:Object.keys(before).length,files:Object.keys(candidate).length,code}));
}else throw new Error('Use inspect, archive-c7 or freeze; no build/export is executed by this helper.');

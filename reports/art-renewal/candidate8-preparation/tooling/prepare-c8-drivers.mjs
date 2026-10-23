import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),sourceDir=path.join(root,'tmp/return-capture-diagnosis'),destination=path.join(sourceDir,'c8-hardware');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
await fs.mkdir(destination,{recursive:true});const records=[];
for(const name of['validate-hardware.cjs','validate-native-hidden.cjs','native-chrome.cjs']){const input=path.join(sourceDir,'c7-hardware',name),bytes=await fs.readFile(input),next=bytes.toString('utf8').replaceAll('art-candidate-7','art-candidate-8').replaceAll('C7','C8').replaceAll('c7-hardware','c8-hardware');await fs.writeFile(path.join(destination,name),next,{flag:'wx'});records.push({source:path.relative(root,input).replaceAll('\\','/'),sourceSha256:sha(bytes),target:name,targetSha256:sha(Buffer.from(next))});}
const f=await fs.readFile(path.join(sourceDir,'focused-c7.cjs')),next=f.toString('utf8').replaceAll('art-candidate-7','art-candidate-8').replaceAll('c7-matrix-runs','c8-matrix-runs');await fs.writeFile(path.join(sourceDir,'focused-c8.cjs'),next,{flag:'wx'});records.push({source:'tmp/return-capture-diagnosis/focused-c7.cjs',sourceSha256:sha(f),target:'focused-c8.cjs',targetSha256:sha(Buffer.from(next))});
await fs.writeFile(path.join(destination,'adaptation.json'),JSON.stringify({createdAt:new Date().toISOString(),scope:'Only C8 identity and independent output/profile names adapted. Original return10 and native hardware16 plus the corrected real partial texture-context17 assertions unchanged.',records},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:'prepared',files:records.length}));

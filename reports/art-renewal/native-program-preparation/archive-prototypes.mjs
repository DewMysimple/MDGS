/** Copy selected small experimental evidence unchanged. Never copy packages or delete originals. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..'),source=path.join(root,'tmp/shader-warmup');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),portable=f=>path.relative(root,f).replaceAll('\\','/');
const allowed=/\.(?:json|cjs|mjs|ts|md|cpuprofile|log|txt)$/i;
const selected=[];
async function visit(directory){for(const entry of await fs.readdir(directory,{withFileTypes:true})){if(entry.isSymbolicLink())throw new Error('Refuse archive symlink');const file=path.join(directory,entry.name);if(entry.isDirectory())await visit(file);else if(entry.isFile()&&(allowed.test(entry.name)||/^(?:failure|native-shader-error).*\.png$/i.test(entry.name)))selected.push(file);}}
for(const folder of ['runs','hardware-runs','chapter2-runs','native-hidden-runs','v2/experiment','v3/fidelity'])await visit(path.join(source,folder));
for(const entry of await fs.readdir(source,{withFileTypes:true}))if(entry.isFile()&&allowed.test(entry.name))selected.push(path.join(source,entry.name));
const records=[];
async function copyBound(file,target){const bytes=await fs.readFile(file),digest=sha(bytes);if(bytes.length>8*1024*1024)throw new Error('Unexpected large evidence file: '+portable(file));await fs.mkdir(path.dirname(target),{recursive:true});try{const old=await fs.readFile(target);if(sha(old)!==digest)throw new Error('Archive destination differs; preserve and choose another path: '+target);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(target,bytes,{flag:'wx'});}if(sha(await fs.readFile(target))!==digest)throw new Error('Archive copy mismatch');records.push({source:portable(file),archive:portable(target),bytes:bytes.length,sha256:digest});}
for(const file of [...new Set(selected)].sort())await copyBound(file,path.join(here,'history',path.relative(source,file)));
for(const file of ['src/scene/ShaderWarmup.ts','src/scene/SceneRenderer.ts','src/components/ScrollViewport.tsx','src/App.tsx'])await copyBound(path.join(root,file),path.join(here,'adoption-source-at-archive',file));
const manifest={schemaVersion:1,archivedAt:new Date().toISOString(),scope:'Byte-exact small experimental reports, code and selected failure screenshots. Historical prototypes are not the adopted C4 product. Full packages,59PNG captures,normal screenshots,large traces and local browser profiles remain local and are deliberately excluded.',files:records,totalBytes:records.reduce((n,r)=>n+r.bytes,0),excluded:['**/*-dist/**','**/warm-dist/**','**/base-dist/**','**/chrome-profiles/**','**/browser/*.png','**/contacts/**','normal success screenshots','large raw trace JSON'],sourcesUnmodified:true};
await fs.writeFile(path.join(here,'archive-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({files:records.length,MiB:manifest.totalBytes/1048576,sourcePreserved:true}));

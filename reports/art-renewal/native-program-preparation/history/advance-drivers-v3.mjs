import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
for(const file of ['hardware-preflight.cjs','chapter2-repeat.cjs','native-hidden-warmup.cjs']){
  const target=path.join(directory,file);let source=await fs.readFile(target,'utf8');
  source=source.replaceAll('v2/warm-dist','v3/warm-dist').replaceAll('build-binding.v2.json','build-binding.v3.json')
    .replaceAll("variant:'v2'","variant:'v3'").replaceAll('Exact v2 package/helper','Exact v3 package/helper');
  if(file==='hardware-preflight.cjs'){
    const begin=source.indexOf(" await check('hidden-tab-pauses-polling-and-visible-return-resumes'");
    const end=source.indexOf(" await check('injected-never-ready-KHR",begin);
    if(begin<0||end<0)throw new Error('Expected hidden-check adapter anchors');
    source=source.slice(0,begin)+` await check('hidden-tab-pauses-polling-and-visible-return-resumes',async e=>{const{spawnSync}=require('node:child_process');const result=spawnSync(process.execPath,[path.join(__dirname,'native-hidden-warmup.cjs')],{cwd:root,env:process.env,windowsHide:true,encoding:'utf8',timeout:105000});e.stdout=result.stdout;e.stderr=result.stderr;assert.equal(result.status,0);const outcome=JSON.parse(result.stdout.trim().split('\\n').at(-1));e.nativeHiddenReport=path.join(__dirname,'native-hidden-runs',outcome.runId,'validation.json');e.nativeHiddenSha256=hash(await fs.readFile(e.nativeHiddenReport));const observed=JSON.parse(await fs.readFile(e.nativeHiddenReport,'utf8'));assert.equal(observed.status,'passed');e.events=observed.resumed.events;e.method=observed.scope;});\n`+source.slice(end);
    source=source.replace('w?.queue===0&&w.pending===0','w?.queue===0&&w.pending===0&&w.submitted===0');
  }
  await fs.writeFile(target,source);
}

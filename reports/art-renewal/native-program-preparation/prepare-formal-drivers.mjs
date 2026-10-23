/** Adapter preparation only; does not build or alter product input. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../../..'),scratch=path.join(root,'tmp/shader-warmup');
let main=await fs.readFile(path.join(scratch,'hardware-preflight.cjs'),'utf8');
main=main.replace("path.resolve(__dirname,'../..')","path.resolve(__dirname,'../../..')")
 .replace("const dist=path.join(__dirname,'v3/warm-dist'),hash=", "const freezePath=path.join(root,'reports/art-renewal/art-candidate-4-build.json');\nconst dist=path.resolve(root,process.env.MDGS_NATIVE_DIST||'tmp/art-candidate-4-dist'),hash=")
 .replace("prototype:true,variant:'v3',", "product:true,milestone:'art-candidate-4',")
 .replace('Actual Chrome/WebGL hardware lifecycle preflight of an isolated override.', 'Actual frozen C4 production package, adopted source helper and explicit App/Viewport owner cancellation. No virtual loader or prototype build.')
 .replaceAll("path.join(__dirname,'ShaderWarmup.ts')", "path.join(root,'src/scene/ShaderWarmup.ts')");
const begin=main.indexOf(' const bindingPath='),end=main.indexOf(' const{preview}',begin);
if(begin<0||end<0)throw new Error('Expected source-binding adapter anchors');
main=main.slice(0,begin)+` const frozen=JSON.parse(await fs.readFile(freezePath,'utf8'));report.freeze={path:rel(freezePath),sha256:hash(await fs.readFile(freezePath))};report.inputsBefore=await inputs();assert.deepEqual(report.inputsBefore,frozen.sourceInputs,'Current product inputs differ from C4 freeze');report.packageBefore=await hashes(await walk(dist));report.helperBefore=hash(await fs.readFile(path.join(root,'src/scene/ShaderWarmup.ts')));assert.equal(report.helperBefore,frozen.sourceInputs['src/scene/ShaderWarmup.ts']);
 report.driverInputsBefore=await hashes([__filename,path.join(__dirname,'native-chrome.cjs'),path.join(__dirname,'validate-native-hidden.cjs'),freezePath]);
 for(const[relative,digest]of Object.entries(frozen.code))for(const directory of[dist,path.join(root,'dist'),path.join(root,'dist-exhibition')])assert.equal(hash(await fs.readFile(path.join(directory,relative))),digest,'Frozen code mismatch: '+relative);
 report.exhibitionInventoryBefore=hash(await fs.readFile(path.join(root,'dist-exhibition/.mdgs-exhibition-package.json')));assert.equal(report.exhibitionInventoryBefore,frozen.exhibitionInventorySha256);
`+main.slice(end);
main=main.replace("path.join(__dirname,'native-hidden-warmup.cjs')", "path.join(__dirname,'validate-native-hidden.cjs')");
main=main.replace("assert.equal(d.warm.checkShaderErrors,true);return d;", "assert.equal(d.warm.checkShaderErrors,true);assert(!('prototype' in d.warm));return d;");
const late=`
 for(const heldFile of['scene.json','source-materials.json'])await check('owner-cancel-before-late-'+heldFile.replaceAll('.','-'),e=>withPage({},async p=>{
  let release;const waiting=new Promise(resolve=>release=resolve);let requested=0;
  await p.route('**/chapter-3/'+heldFile,async route=>{requested++;await waiting;await route.continue().catch(()=>{});});
  try{await p.goto(report.url+'#chapter-3');await phase(p,'SCROLL_LOADING');assert(requested>0);e.before=await diagnostics(p);assert.equal(e.before.canvas.firstFrameReady,'false');assert.equal(e.before.canvas.renderCount,'0');assert.equal(e.before.canvas.shaderWarmup,undefined,'Helper must not yet exist while this owner resource is held');
   await p.evaluate(()=>{window.__hardware.cancelAt=performance.now();});const start=Date.now();await p.locator('.art-loading__return').click();await phase(p,'RETURNING_HOME');await p.waitForTimeout(50);release();
   await p.waitForFunction(()=>{const d=document.querySelector('.painting canvas')?.dataset,w=d?.shaderWarmup&&JSON.parse(d.shaderWarmup);return w?.cancelled===true;},null,{timeout:1500});e.lateHelper=await diagnostics(p);assert.equal(e.lateHelper.warm.reason,'owner-return');assert.equal(e.lateHelper.warm.batches,0);assert.equal(e.lateHelper.canvas.renderCount,'0');
   await phase(p,'HOME',10000);e.returnMilliseconds=Date.now()-start;e.observed=await p.evaluate(()=>window.__hardware);assert(e.returnMilliseconds<2600);assert(e.observed.native.length>1&&e.observed.native.every(s=>s.count===0));assert.equal(await p.locator('.painting canvas').count(),0);
  }finally{release?.();}
 }));
`;
const after=main.indexOf(' report.inputsAfter=');if(after<0)throw new Error('Expected final verification adapter anchor');main=main.slice(0,after)+late+main.slice(after);
main=main.replace("report.unchanged=true;report.status=", "report.driverInputsAfter=await hashes([__filename,path.join(__dirname,'native-chrome.cjs'),path.join(__dirname,'validate-native-hidden.cjs'),freezePath]);assert.deepEqual(report.driverInputsAfter,report.driverInputsBefore);report.exhibitionInventoryAfter=hash(await fs.readFile(path.join(root,'dist-exhibition/.mdgs-exhibition-package.json')));assert.equal(report.exhibitionInventoryAfter,report.exhibitionInventoryBefore);report.unchanged=true;report.status=");
main=main.replace("await save();console.log(JSON.stringify({status:report.status,runId,checks:", "await save();await fs.copyFile(path.join(out,'validation.json'),path.join(__dirname,'hardware-latest.json'));console.log(JSON.stringify({status:report.status,runId,checks:");
await fs.writeFile(path.join(directory,'validate-hardware.cjs'),main);

let hidden=await fs.readFile(path.join(scratch,'native-hidden-warmup.cjs'),'utf8');
hidden=hidden.replace("path.resolve(__dirname,'../..')", "path.resolve(__dirname,'../../..')")
 .replace("dist=path.join(__dirname,'v3/warm-dist')", "dist=path.resolve(root,process.env.MDGS_NATIVE_DIST||'tmp/art-candidate-4-dist')")
 .replace('prototype:true,runId:', "product:true,milestone:'art-candidate-4',runId:")
 .replace("path.join(__dirname,'build-binding.v3.json')", "path.join(root,'reports/art-renewal/art-candidate-4-build.json')")
 .replace("path.join(__dirname,'chrome-profiles'", "path.join(root,'tmp/native-program-preparation/chrome-profiles'");
await fs.writeFile(path.join(directory,'validate-native-hidden.cjs'),hidden);
await fs.copyFile(path.join(scratch,'native-chrome.cjs'),path.join(directory,'native-chrome.cjs'));
console.log('Formal C4 drivers prepared; no product build or mutation.');

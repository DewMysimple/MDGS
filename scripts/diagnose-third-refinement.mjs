/** Read-only visibility evidence: no manifest, scene or source asset mutations. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const options=Object.fromEntries(process.argv.slice(2).map(argument=>{const index=argument.indexOf('=');return index<0?[argument,true]:[argument.slice(0,index),argument.slice(index+1)];}));
const root=new URL('../',import.meta.url),out=new URL(options['--out-dir']?`${String(options['--out-dir']).replace(/\/$/,'')}/`:'reports/chapter-3-refinement/line-diagnostic/',root);
const manifestURL=new URL('public/assets/reconstruction/manifest.json',root),sceneURL=new URL('public/assets/chapter-3/scene.json',root);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const frozenBytes=await readFile(options['--frozen-manifest']?new URL(String(options['--frozen-manifest']),root):manifestURL),manifest=JSON.parse(frozenBytes),snapshotSha256=hash(frozenBytes);
const sceneBefore=hash(await readFile(sceneURL));await mkdir(out,{recursive:true});
await writeFile(new URL('frozen-manifest.json',out),frozenBytes);
const sources=JSON.parse(await readFile(sceneURL,'utf8'));
const frozenAssets=new Map();
function collect(value){if(typeof value==='string'&&value.startsWith('assets/')&&/\.(webp|png|jpg)$/.test(value))frozenAssets.set(value,null);else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
collect(manifest.chapters['3']);
for(const key of frozenAssets.keys())frozenAssets.set(key,await readFile(new URL(`public/${key}`,root)));
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1'},logLevel:'error',plugins:[{name:'refinement-readonly-no-watch',configResolved(config){config.server.watch=null;}}]});
let browser;
try{
 await vite.listen();browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
 const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('**/assets/reconstruction/manifest.json',r=>r.fulfill({body:frozenBytes,contentType:'application/json'}));
 await page.route('**/assets/**',async route=>{
  const path=new URL(route.request().url()).pathname.replace(/^\//,'');
  const body=frozenAssets.get(path);if(body)await route.fulfill({body,contentType:path.endsWith('.webp')?'image/webp':'image/png'});else await route.fallback();
 });
 await page.route('**/src/scene/SceneRenderer.ts',async route=>{
  const response=await route.fetch(),original=await response.text();
  const body=original.replace('this.renderer.sortObjects = true;','this.renderer.sortObjects = true; window.__refinementRenderer=this;');
  assert.notEqual(body,original,'Renderer test injection missed');await route.fulfill({response,body});
 });
 const manifestResponsePromise=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/assets/reconstruction/manifest.json'));
 await page.goto(vite.resolvedUrls.local[0]);await page.locator('.chapter-link').nth(2).click();
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.chapter==='3'&&document.querySelector('.scene-viewport.is-ready'));
 const actualServedManifestSha256=hash(await (await manifestResponsePromise).body());assert.equal(actualServedManifestSha256,snapshotSha256,'Frozen manifest route was bypassed');
 const samples=[];
 const samplesToRun=options['--landscape']?[['stop08',.8673259018926424],['gap08',.9288563525873003],['stop09',.9903868032819582]]:options['--all-gaps']?[[1,.06170822215550957],[2,.18527723828993936],[3,.30891527606479746],[4,.43273851796258755],[5,.5569328988363655],[6,.6811709334158138],[7,.8052932435579894],[8,.9288563525873003]].map(([index,progress])=>[`gap${String(index).padStart(2,'0')}`,progress]):[['gap02',.18527723828993936],['stop05',.4947845160644397],['gap06',.6811709334158138],['stop07',.7432605852233363]];
 for(const [id,progress] of samplesToRun){
  await page.locator('input[type=range]').evaluate((el,p)=>{el.value=String(p);el.dispatchEvent(new Event('input',{bubbles:true}));},progress);
  await page.waitForFunction(p=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-p)<.0011,progress);
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');await page.waitForTimeout(180);
  const candidates=await page.evaluate(()=>{
   const r=window.__refinementRenderer;
   window.__refinementSaved=r.objects.filter(o=>o.mesh.name==='水岸留金'||/^通幅山脊细线_/.test(o.mesh.name)||/^过渡\d{2}_淡云水线\d$/.test(o.mesh.name)||o.mesh.name==='SC06_通道右下花枝'||o.mesh.name==='SC09_05_右侧山水城景.001').map(o=>({o,visible:o.mesh.visible}));
   return window.__refinementSaved.map(s=>({name:s.o.mesh.name,visible:s.visible,url:s.o.url,opacity:s.o.material.opacity}));
  });
  const conditions=[];
  const names=candidates.map(c=>c.name);
  const groups=[['baseline',[]],['without-gold',['水岸留金']],['without-ridges',names.filter(n=>n.startsWith('通幅山脊细线_'))],['without-transitions',names.filter(n=>n.startsWith('过渡'))],['without-all-lines',names.filter(n=>n==='水岸留金'||n.startsWith('通幅')||n.startsWith('过渡'))],['without-floating-flower',['SC06_通道右下花枝']],['without-landscape-duplicate',['SC09_05_右侧山水城景.001']]];
  for(const [condition,hidden] of [...groups,...names.map(n=>[`individual:${n}`,[n]])]){
   const state=await page.evaluate(({condition,hidden})=>{
    const r=window.__refinementRenderer;for(const s of window.__refinementSaved)s.o.mesh.visible=s.visible&&!hidden.includes(s.o.mesh.name);
    r.renderer.render(r.scene,r.camera);const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    if(condition==='baseline')window.__refinementBaseline=pixels;
    let changed=0,minX=w,minY=h,maxX=-1,maxY=-1,brightChanged=0;
    if(condition!=='baseline')for(let i=0;i<pixels.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(pixels[i+c]-window.__refinementBaseline[i+c]));if(d>2){changed++;const x=i/4%w,y=h-1-Math.floor(i/4/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(window.__refinementBaseline[i]+window.__refinementBaseline[i+1]+window.__refinementBaseline[i+2]>pixels[i]+pixels[i+1]+pixels[i+2]+12)brightChanged++;}}
    return{condition,hidden,changedPixels:changed,brightPixelsRemoved:brightChanged,pixelBounds:maxX>=0?[minX,minY,maxX,maxY]:null,drawingBuffer:[w,h],progress:document.querySelector('canvas').dataset.progress};
   },{condition,hidden});
   if(!condition.startsWith('individual:')){const screenshot=`${id}-${condition}.png`;await page.locator('.painting').screenshot({path:fileURLToPath(new URL(screenshot,out))});state.screenshot=screenshot;state.screenshotSha256=hash(await readFile(new URL(screenshot,out)));}
   conditions.push(state);
  }
  await page.evaluate(()=>{const r=window.__refinementRenderer;for(const s of window.__refinementSaved)s.o.mesh.visible=s.visible;r.renderer.render(r.scene,r.camera);window.__refinementBaseline=null;});
  samples.push({id,progress,candidates,conditions});
 }
 const sourceNames=['水岸留金',...sources.meshes.map(m=>m.name).filter(n=>/^通幅山脊细线_|^过渡\d{2}_淡云水线\d$|^SC06_通道右下花枝$|^SC09_05_右侧山水城景\.001$/.test(n))];
 const sourceInventory=sourceNames.map(name=>{const mesh=sources.meshes.find(m=>m.name===name),material=mesh&&sources.materials[mesh.material];return{name,bounds:mesh?.bounds,material,positionCount:mesh?.positions.length/3};});
 const report={status:'read-only-browser-visibility-evidence',snapshotSha256,actualServedManifestSha256,servedFrozenManifest:true,frozenAssets:[...frozenAssets].map(([path,bytes])=>({path,sha256:hash(bytes)})),canonicalAtEndSha256:hash(await readFile(manifestURL)),sceneBeforeSha256:sceneBefore,sceneAfterSha256:hash(await readFile(sceneURL)),sourceInventory,samples,pageErrors:errors,scope:'Temporary visibility only in this isolated browser. Frozen manifest and revised texture bytes served from memory. No source scene or product manifest modified. Individual pixel differences support attribution; aesthetic retirement requires screenshot review.'};
 assert.equal(report.sceneAfterSha256,sceneBefore);assert.equal(errors.length,0);
 await writeFile(new URL('diagnostic.json',out),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,snapshotSha256,samples:samples.map(s=>({id:s.id,groups:s.conditions.filter(c=>!c.condition.startsWith('individual:')).map(c=>({condition:c.condition,changed:c.changedPixels})),affected:s.conditions.filter(c=>c.condition.startsWith('individual:')&&c.changedPixels>0).map(c=>({condition:c.condition,changed:c.changedPixels,bounds:c.pixelBounds}))})),errors},null,2));
}finally{await browser?.close();await vite.close();}

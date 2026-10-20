/** Diagnose the initial C4 blank-design pilot using real draw callbacks and per-layer framebuffer contributions. */
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {createServer} from 'vite';
const expected=process.argv.find(x=>x.startsWith('--expected-hash='))?.split('=')[1]||'e754de4bf3dcafaa0d83c4e5ef86edfcbb97190ac142a039858202a9386f33a9';
const manifestFile=new URL('../public/assets/reconstruction/manifest.json',import.meta.url),text=await readFile(manifestFile,'utf8'),hash=createHash('sha256').update(text).digest('hex');assert.equal(hash,expected,'Do not mix pilot revisions');
const layers=JSON.parse(text).chapters['4'].addedLayers.filter(x=>x.id.startsWith('bd4-'));assert(layers.length>0,'The tested canonical must contain explicit blank-design layers');
const outputArgument=process.argv.find(x=>x.startsWith('--output='))?.split('=').slice(1).join('=');
const output=outputArgument?new URL('../'+outputArgument.replace(/\\/g,'/').replace(/\/?$/,'/'),import.meta.url):new URL('../reports/blank-design/pilot/',import.meta.url);await mkdir(output,{recursive:true});
const batch=hash.slice(0,8);
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');const vite=await createServer({server:{host:'127.0.0.1',watch:null},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));await page.route('**/src/scene/SceneRenderer.ts',async route=>{const response=await route.fetch();const body=(await response.text()).replace('this.renderer.sortObjects = true;','this.renderer.sortObjects = true; window.__blankRenderer=this;');await route.fulfill({response,body});});
 await page.goto(vite.resolvedUrls.local[0]);await page.locator('.chapter-link').nth(3).click();await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.chapter==='4'&&document.querySelector('.scene-viewport.is-ready'));
 const opaque=await page.evaluate(()=>window.__blankRenderer.objects.filter(o=>!o.url&&o.mesh.visible).map(o=>({name:o.mesh.name,depthWrite:o.material.depthWrite,depthTest:o.material.depthTest,transparent:o.material.transparent,color:o.material.color.toArray(),matrix:o.mesh.matrix.toArray()})));
 const samples=[];
 for(const layer of layers){
  const p=layer.blankDesign.progress;await page.locator('input[type=range]').evaluate((el,p)=>{el.value=String(p);el.dispatchEvent(new Event('input',{bubbles:true}));},p);
  await page.waitForFunction(p=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-p)<.0011,p);await page.waitForTimeout(200);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
  const result=await page.evaluate(name=>{
   const r=window.__blankRenderer,target=r.objects.find(o=>o.mesh.name===name),paper=r.objects.find(o=>o.mesh.name==='连续绢本背景 · 756米'),floor=r.objects.find(o=>o.mesh.name==='长卷承托地面');
   if(!target||!paper||!floor)throw new Error('Missing diagnostic object');
   const gl=r.renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;const native=target.mesh.onBeforeRender;let calls=0;target.mesh.onBeforeRender=()=>calls++;
   const read=()=>{r.renderer.render(r.scene,r.camera);const pixels=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
   const saved={paper:paper.material.depthWrite,floor:floor.material.depthWrite,visible:target.mesh.visible};const conditions=[];
   for(const config of [{label:'original',paper:saved.paper,floor:saved.floor},{label:'paper-no-write',paper:false,floor:saved.floor},{label:'floor-no-write',paper:saved.paper,floor:false},{label:'both-no-write',paper:false,floor:false}]){
    paper.material.depthWrite=config.paper;floor.material.depthWrite=config.floor;target.mesh.visible=saved.visible;calls=0;const on=read(),drawCalls=calls;target.mesh.visible=false;const off=read();let changed=0,significant=0,max=0,minX=width,minY=height,maxX=-1,maxY=-1;
    for(let i=0;i<on.length;i+=4){let d=0;for(let c=0;c<4;c++)d=Math.max(d,Math.abs(on[i+c]-off[i+c]));if(d){changed++;const x=(i/4)%width,y=height-1-Math.floor(i/4/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}if(d>2)significant++;max=Math.max(max,d);}
    conditions.push({...config,drawCalls,changedPixels:changed,significantPixels:significant,maxChannelDifference:max,pixelBounds:maxX>=0?[minX,minY,maxX,maxY]:null});
   }
   paper.material.depthWrite=saved.paper;floor.material.depthWrite=saved.floor;target.mesh.visible=saved.visible;target.mesh.onBeforeRender=native;r.renderer.render(r.scene,r.camera);
   return{name,textureLoaded:!!target.material.map,meshVisible:saved.visible,width,height,conditions,diagnostics:{...r.renderer.domElement.dataset}};
  },layer.name);
  result.id=layer.id;result.requestedProgress=p;samples.push(result);
  if(['bd4-gap03-terrace','bd4-gap05-pavilion','bd4-gap08-shore'].includes(layer.id)){
   const stem=batch+'-diagnostic-'+layer.id;await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(stem+'-original.png',output))});
   await page.evaluate(()=>{const r=window.__blankRenderer;window.__paperSaved=r.objects.filter(o=>['连续绢本背景 · 756米','长卷承托地面'].includes(o.mesh.name)).map(o=>({o,value:o.material.depthWrite}));for(const x of window.__paperSaved)x.o.material.depthWrite=false;r.dirty=true;r.requestFrame();});await page.waitForTimeout(100);await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(stem+'-without-background-depth.png',output))});
   await page.evaluate(()=>{const r=window.__blankRenderer;for(const x of window.__paperSaved)x.o.material.depthWrite=x.value;r.dirty=true;r.requestFrame();});await page.waitForTimeout(80);
  }
 }
 const finalHash=createHash('sha256').update(await readFile(manifestFile)).digest('hex');
 const hidden=samples.filter(s=>s.conditions.find(c=>c.label==='original').significantPixels===0),rescued=hidden.filter(s=>s.conditions.find(c=>c.label==='paper-no-write').significantPixels>0);
 const report={status:hidden.length?'failed':'passed',phase:'initial C4 pilot depth diagnosis',canonicalSha256:hash,finalCanonicalSha256:finalHash,mixedRevision:finalHash!==hash,newLayers:layers.length,hiddenInOriginal:hidden.map(s=>s.id),rescuedByPaperDepthWriteOff:rescued.map(s=>s.id),opaqueObjects:opaque,samples,pageErrors:errors,scope:'No production mutation. Per-layer framebuffer on/off differences under four temporary background-depth configurations; not a full runtime acceptance.'};
 await writeFile(new URL(batch+'-depth-diagnostic.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,mixedRevision:report.mixedRevision,hidden:report.hiddenInOriginal,rescued:report.rescuedByPaperDepthWriteOff,pageErrors:errors},null,2));
}finally{await browser?.close();await vite.close();}

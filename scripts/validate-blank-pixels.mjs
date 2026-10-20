/** Verify actual draw calls and framebuffer contributions for every new handscroll layer. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const root=new URL('../',import.meta.url),canonical=new URL('public/assets/reconstruction/manifest.json',root);
const bytes=await readFile(canonical),hash=createHash('sha256').update(bytes).digest('hex'),manifest=JSON.parse(bytes);
const option=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
if(option('expected-hash'))assert.equal(hash,option('expected-hash'));
const output=new URL('reports/blank-design/'+(option('batch')||'final')+'/',root);await mkdir(output,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1',watch:null},logLevel:'error'});let browser;
const report={status:'running',canonicalSha256:hash,method:'Actual onBeforeRender submission and same-frame on/off framebuffer comparison with source paper and original scene otherwise unchanged.',viewport:{width:1440,height:900},samples:[],pageErrors:[]};
try{
 await vite.listen();browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
 const page=await browser.newPage({viewport:report.viewport,reducedMotion:'reduce'});page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
 await page.route('**/src/scene/SceneRenderer.ts',async route=>{const response=await route.fetch(),body=(await response.text()).replace('this.renderer.sortObjects = true;','this.renderer.sortObjects = true; window.__blankRenderer=this;');await route.fulfill({response,body});});
 await page.goto(vite.resolvedUrls.local[0]);
 for(const chapter of manifest.blankDesign.appliedChapters){
  await page.locator('.chapter-link').nth(chapter-1).click();
  await page.waitForFunction(chapter=>document.querySelector('canvas')?.dataset.chapter===String(chapter)&&document.querySelector('.scene-viewport.is-ready'),chapter);
  for(const layer of manifest.chapters[chapter].addedLayers.filter(x=>x.blankDesign)){
   await page.locator('input[type=range]').evaluate((input,p)=>{input.value=String(p);input.dispatchEvent(new Event('input',{bubbles:true}));},layer.blankDesign.progress);
   await page.waitForFunction(p=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-p)<.0011,layer.blankDesign.progress);
   await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
   const result=await page.evaluate(name=>{
    const r=window.__blankRenderer,target=r.objects.find(o=>o.mesh.name===name);if(!target)throw new Error('Missing '+name);
    const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,native=target.mesh.onBeforeRender,saved=target.mesh.visible;let calls=0;
    target.mesh.onBeforeRender=()=>calls++;
    const read=()=>{r.renderer.render(r.scene,r.camera);const p=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
    const on=read(),drawCalls=calls;target.mesh.visible=false;const off=read();let changed=0,significant=0,max=0,minX=w,minY=h,maxX=-1,maxY=-1;
    for(let i=0;i<on.length;i+=4){let d=0;for(let c=0;c<4;c++)d=Math.max(d,Math.abs(on[i+c]-off[i+c]));if(d)changed++;if(d>2){significant++;const x=i/4%w,y=h-1-Math.floor(i/4/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}max=Math.max(max,d);}
    target.mesh.visible=saved;target.mesh.onBeforeRender=native;r.dirty=true;r.requestFrame();
    return{textureLoaded:!!target.material.map,meshVisible:saved,drawCalls,changedPixels:changed,significantPixels:significant,maxChannelDifference:max,pixelBounds:maxX>=0?[minX,minY,maxX,maxY]:null,diagnostics:{...r.renderer.domElement.dataset}};
   },layer.name);
   report.samples.push({chapter,id:layer.id,name:layer.name,progress:layer.blankDesign.progress,...result});
  }
  console.log(`Chapter ${chapter}: framebuffer contribution checked.`);
 }
 report.finalCanonicalSha256=createHash('sha256').update(await readFile(canonical)).digest('hex');assert.equal(report.finalCanonicalSha256,hash);
 report.failures=report.samples.filter(s=>!s.textureLoaded||!s.meshVisible||s.drawCalls===0||s.significantPixels===0||s.diagnostics.textureFailed!=='0').map(s=>s.id);
 report.status=report.failures.length||report.pageErrors.length?'failed':'passed';
 await writeFile(new URL('validation-pixels.json',output),JSON.stringify(report,null,2)+'\n');
 assert.equal(report.status,'passed',JSON.stringify(report.failures));console.log(JSON.stringify({status:report.status,layers:report.samples.length,hash}));
}finally{await browser?.close();await vite.close();}

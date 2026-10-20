/** Read-only framebuffer evidence for the third scroll's source filler geometry. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const manifestURL=new URL('../public/assets/reconstruction/manifest.json',import.meta.url);
const bytes=await readFile(manifestURL),hash=createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(bytes),layers=manifest.chapters['3'].addedLayers;
const out=new URL('../reports/blank-design/third-occlusion/',import.meta.url);await mkdir(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1',watch:null},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('**/src/scene/SceneRenderer.ts',async route=>{const response=await route.fetch();const body=(await response.text()).replace('this.renderer.sortObjects = true;','this.renderer.sortObjects = true; window.__blankRenderer=this;');await route.fulfill({response,body});});
 await page.goto(vite.resolvedUrls.local[0]);await page.locator('.chapter-link').nth(2).click();
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.chapter==='3'&&document.querySelector('.scene-viewport.is-ready'));
 const samples=[];
 for(const id of ['bd3-gap02-objects','bd3-gap03-objects','bd3-gap06-objects']){
  const layer=layers.find(x=>x.id===id);assert(layer,`Unknown layer ${id}`);
  await page.locator('input[type=range]').evaluate((el,p)=>{el.value=String(p);el.dispatchEvent(new Event('input',{bubbles:true}));},layer.blankDesign.progress);
  await page.waitForFunction(p=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-p)<.0011,layer.blankDesign.progress);
  await page.waitForTimeout(150);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
  const conditions=[];
  for(const condition of ['original','without-water','without-water-and-tree-placeholders']){
   const state=await page.evaluate(condition=>{
    const r=window.__blankRenderer;
    if(!window.__sourceSaved)window.__sourceSaved=r.objects.filter(o=>o.mesh.name==='连续水脉'||/^TR\d{2}_/.test(o.mesh.name)).map(o=>({o,visible:o.mesh.visible}));
    for(const item of window.__sourceSaved)item.o.mesh.visible=item.visible&&(condition==='original'||(condition==='without-water'&&item.o.mesh.name!=='连续水脉'));
    r.renderer.render(r.scene,r.camera);
    const gl=r.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let changed=0,minX=w,minY=h,maxX=-1,maxY=-1;
    if(window.__originalPixels){for(let i=0;i<pixels.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(pixels[i+c]-window.__originalPixels[i+c]));if(d>2){changed++;const x=i/4%w,y=h-1-Math.floor(i/4/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}}
    if(condition==='original')window.__originalPixels=pixels;
    return{condition,changedPixels:condition==='original'?0:changed,pixelBounds:maxX>=0?[minX,minY,maxX,maxY]:null,hidden:window.__sourceSaved.filter(x=>!x.o.mesh.visible&&x.visible).map(x=>x.o.mesh.name)};
   },condition);
   const screenshot=`${id}-${condition}.png`;await page.locator('.painting').screenshot({path:fileURLToPath(new URL(screenshot,out))});conditions.push({...state,screenshot});
  }
  await page.evaluate(()=>{const r=window.__blankRenderer;for(const item of window.__sourceSaved)item.o.mesh.visible=item.visible;window.__originalPixels=null;r.dirty=true;r.requestFrame();});
  samples.push({id,progress:layer.blankDesign.progress,conditions});
 }
 const finalHash=createHash('sha256').update(await readFile(manifestURL)).digest('hex');assert.equal(finalHash,hash,'Canonical changed during diagnosis');
 await writeFile(new URL('diagnostic.json',out),JSON.stringify({status:'read-only-evidence',canonicalSha256:hash,samples,pageErrors:errors,scope:'Only temporary visibility in an isolated browser; source and production files unchanged.'},null,2)+'\n');
 console.log(JSON.stringify({hash,samples:samples.map(s=>({id:s.id,conditions:s.conditions.map(c=>({condition:c.condition,changed:c.changedPixels,hidden:c.hidden.length}))})),errors},null,2));
}finally{await browser?.close();await vite.close();}

/** Verify real moving sheets and pointer parallax cannot disturb the corrected overlap stack. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1',watch:null},logLevel:'error'});let browser;
try{
 await vite.listen();browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
 await page.route('**/src/scene/SceneRenderer.ts',async route=>{const response=await route.fetch();const body=(await response.text()).replace('this.renderer.sortObjects = true;','this.renderer.sortObjects = true; window.__depthRenderer=this;');await route.fulfill({response,body});});
 await page.goto(vite.resolvedUrls.local[0]);await page.waitForFunction(()=>document.querySelector('.scene-viewport.is-ready'));
 await page.locator('input[type=range]').evaluate(el=>{el.value='.352';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.progress==='0.352000'&&document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
 await page.waitForTimeout(500);
 await page.evaluate(()=>{
  const r=window.__depthRenderer;window.__depthDwellFrames=[];window.__depthDwellDraws=[];
  for(const o of r.objects)o.mesh.onBeforeRender=()=>window.__depthDwellDraws.push(o.mesh.name);
  const native=r.renderer.render.bind(r.renderer);r.renderer.render=(...args)=>{window.__depthDwellDraws=[];native(...args);const d=r.motionDirector.getDiagnostics();window.__depthDwellFrames.push({time:d.elapsedSeconds,active:d.activeBindings,activeNames:d.activeNames,order:[...new Set(window.__depthDwellDraws)],matrices:r.objects.filter(o=>d.activeNames.includes(o.mesh.name)).map(o=>({name:o.mesh.name,matrix:o.mesh.matrix.toArray()}))});};
 });
 for(const x of [250,1200,250,1200]){await page.mouse.move(x,300,{steps:8});await page.waitForTimeout(550);}
 const frames=await page.evaluate(()=>window.__depthDwellFrames);assert(frames.length>=20);assert(frames.every(f=>f.active>0));assert(frames.at(-1).time>frames[0].time+.8);
 assert(frames.some(f=>JSON.stringify(f.matrices)!==JSON.stringify(frames[0].matrices)),'Visible independent sheets must actually move');
 for(const f of frames){const a=f.order.indexOf('06_01_中央主位女子'),b=f.order.indexOf('06_05_京城全景');assert(a>b&&b>=0,'Real independent animation and pointer parallax must preserve foreground empress');}
 assert.deepEqual(errors,[]);
 await mkdir(new URL('../reports/blank-design/',import.meta.url),{recursive:true});
 const fingerprint=createHash('sha256').update(await readFile(new URL('../src/scene/StableLayerSorting.ts',import.meta.url))).digest('hex');
 await writeFile(new URL('../reports/blank-design/validation-sorting-motion-dwell.json',import.meta.url),JSON.stringify({passed:true,createdAt:new Date().toISOString(),sortingSourceSha256:fingerprint,frameCount:frames.length,timeAdvanced:frames.at(-1).time-frames[0].time,actualMovingSheets:true,pointerDirections:4,flips:0,pageErrors:errors,frames},null,2)+'\n');
 console.log(`Actual moving sheets + pointer parallax: ${frames.length} drawn frames, ${Number(frames.at(-1).time-frames[0].time).toFixed(2)} seconds, zero overlap flips.`);
}finally{await browser?.close();await vite.close();}

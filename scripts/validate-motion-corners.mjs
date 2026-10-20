/** Focused regression after continuous-water/cropped-mountain repairs, without a full GPU rerun. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=new URL('../',import.meta.url),output=new URL('reports/reconstruction/after-motion/',root);
const revisionFile=new URL('public/assets/reconstruction/manifest.json',root);
const revisionText=await readFile(revisionFile,'utf8'),revision=JSON.parse(revisionText);
assert.equal(revision.chapters['2'].replacements.find(item=>item.id==='c2-t002')?.geometryPolicy,'explicit-corners','Wait for the reviewed continuous-river canonical');
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1'},logLevel:'error'});let browser;
await mkdir(output,{recursive:true});
try{
  await vite.listen();const {prepareScene}=await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const manifests=new Map();
  for(const chapter of [2,4])manifests.set(chapter,prepareScene(JSON.parse(await readFile(new URL(`public/assets/chapter-${chapter}/scene.json`,root),'utf8')),chapter));
  browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  // Read-only, test-response instrumentation. Product source has no inspection API/global.
  await page.route('**/src/scene/SceneRenderer.ts*',async route=>{
    const response=await route.fetch(),code=await response.text(),marker='Object.assign(canvas.dataset, {';
    assert(code.includes(marker),'The test-only diagnostic insertion must match the served renderer');
    const diagnostics=`testPendingRefresh:String(this.textureRefreshPending),testCamera:JSON.stringify({matrix:this.camera.matrixWorld.toArray(),projection:this.camera.projectionMatrix.toArray(),size:[this.width,this.height],pointer:this.pointer.toArray(),target:this.pointerTarget.toArray(),pixelRatio:this.renderer.getPixelRatio(),drawing:[canvas.width,canvas.height],viewport:Array.from(this.renderer.getContext().getParameter(this.renderer.getContext().VIEWPORT)??[]),samples:this.renderer.getContext().getParameter(this.renderer.getContext().SAMPLES),clearColor:this.renderer.getClearColor(new THREE.Color()).toArray(),clearAlpha:this.renderer.getClearAlpha(),output:this.renderer.outputColorSpace,drawingColorSpace:this.renderer.getContext().drawingBufferColorSpace,unpackColorSpace:this.renderer.getContext().unpackColorSpace}),testObjects:JSON.stringify(this.objects.filter(object=>object.mesh.visible).map(object=>({name:object.mesh.name,matrix:object.mesh.matrix.toArray(),color:object.material.color.toArray(),opacity:object.material.opacity,transparent:object.material.transparent,depthWrite:object.material.depthWrite,alphaTest:object.material.alphaTest,map:object.material.map?{uuid:object.material.map.uuid,colorSpace:object.material.map.colorSpace,anisotropy:object.material.map.anisotropy,minFilter:object.material.map.minFilter,magFilter:object.material.map.magFilter,generateMipmaps:object.material.map.generateMipmaps,flipY:object.material.map.flipY,premultiplyAlpha:object.material.map.premultiplyAlpha,width:object.material.map.image.width,height:object.material.map.image.height}:null}))),`;
    await route.fulfill({response,body:code.replace(marker,marker+diagnostics)});
  });
  const loaded=async chapter=>{
    await page.waitForFunction(chapter=>document.querySelector('canvas')?.dataset.chapter===String(chapter)&&(document.querySelector('.scene-viewport.is-ready')||document.querySelector('.scene-loading.has-error')),chapter,{timeout:60000});
    if(await page.locator('.scene-loading.has-error').count())throw new Error(await page.locator('.scene-loading.has-error').innerText());
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
    await page.waitForTimeout(450);
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.testPendingRefresh==='false');
  };
  const snap=()=>page.locator('canvas').evaluate(canvas=>({...canvas.dataset,now:performance.now()}));
  const screenshot=async filename=>{await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(filename,output))});return'reports/reconstruction/after-motion/'+filename;};
  await page.goto(vite.resolvedUrls.local[0]);await loaded(1);
  const samples=[];
  for(const chapter of [2,4]){
    await page.locator('.chapter-link').nth(chapter-1).click();await loaded(chapter);
    const stops=manifests.get(chapter).stops;
    const targets=chapter===2?[{label:'stop-4',index:3},{label:'stop-5',index:4}]:[{label:'gap-5',progress:(stops[4].progress+stops[5].progress)/2},{label:'stop-8',index:7}];
    for(const target of targets){
      const progress=target.progress??stops[target.index].progress;
      if(target.index!==undefined)await page.getByRole('button',{name:'游观至'+stops[target.index].name,exact:true}).click();
      else await page.locator('input[type=range]').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},progress);
      await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-progress)<.0011,progress);
      await page.mouse.move(5,5);await loaded(chapter);
      const a=await snap();await page.waitForTimeout(350);const b=await snap();
      assert.equal(a.motionTime,b.motionTime);assert.equal(a.renderCount,b.renderCount);assert.equal(b.activeMotionLayers,'0');assert.equal(b.textureFailed,'0');assert.equal(b.rafRunning,'false');
      const image=await screenshot(`corners-chapter-${chapter}-${target.label}.png`);
      samples.push({chapter,target:target.label,name:target.index!==undefined?stops[target.index].name:stops[4].name+' → '+stops[5].name,requestedProgress:progress,actualProgress:Number(b.progress),a,b,image});
    }
  }
  // The latest eighth scene keeps its authored crop after live motion and a real GPU restore.
  await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(400);
  const onA=await snap();await page.waitForTimeout(500);const onB=await snap();
  assert(Number(onB.motionTime)>Number(onA.motionTime));assert.equal(onB.motionClockSpeed,'0.400000');assert(Number(onB.activeMotionLayers)<=3&&Number(onB.activePetals)<=1);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(350);
  const baseline=await snap(),baselineImage=await screenshot('corners-fourth-before-context.png');
  await page.evaluate(()=>window.__cornerCanvas=document.querySelector('canvas'));
  const supported=await page.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');const extension=gl?.getExtension('WEBGL_lose_context');extension?.loseContext();return!!extension;});
  assert(supported);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.contextLost==='true');
  await page.getByRole('button',{name:'恢复画卷',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.contextLost==='false'&&Number(document.querySelector('canvas')?.dataset.contextRestores)>0);
  await loaded(4);const restored=await snap(),restoredImage=await screenshot('corners-fourth-after-context.png');
  assert.equal(restored.progress,baseline.progress);assert.equal(restored.motionTime,baseline.motionTime);assert.equal(restored.rafRunning,'false');assert(await page.evaluate(()=>window.__cornerCanvas===document.querySelector('canvas')));
  const beforeCamera=JSON.parse(baseline.testCamera),afterCamera=JSON.parse(restored.testCamera);
  for(const key of ['matrix','projection','size','pixelRatio','drawing','viewport','samples','clearColor','clearAlpha','output','drawingColorSpace','unpackColorSpace'])assert.deepEqual(afterCamera[key],beforeCamera[key],`Context restoration must retain the responsive ${key}`);
  assert.equal(restored.testObjects,baseline.testObjects,'Retained matrices, materials and sampler settings must not change during context recovery');
  assert.deepEqual(errors,[]);assert.equal(await readFile(revisionFile,'utf8'),revisionText,'Canonical changed during the focused run');
  const report={passed:true,canonicalSha256:createHash('sha256').update(revisionText).digest('hex'),samples,eighthSceneMotion:{a:onA,b:onB},contextRecovery:{baseline,restored,images:[baselineImage,restoredImage],sameCanvas:true},pageErrors:errors,limitations:'Four requested repaired views only; images require direct seam/composition review. Gap progress follows the existing range control precision. Original all-scroll lifecycle evidence is retained separately.'};
  await writeFile(new URL('validation-motion-corners.json',output),JSON.stringify(report,null,2)+'\n');
  console.log('Four repaired views, eighth-scene decline and original-canvas GPU recovery passed.');
}finally{await browser?.close();await vite.close();}


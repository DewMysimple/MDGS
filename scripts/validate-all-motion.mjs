import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../reports/reconstruction/after-motion/',import.meta.url);
await mkdir(output,{recursive:true});
const revisions = JSON.parse(await readFile(new URL('../public/assets/reconstruction/manifest.json',import.meta.url),'utf8'));
assert.deepEqual(revisions.activeChapters,[1,2,3,4],'All canonical chapters must be activated before the final browser run');
const vite = await createServer({server:{host:'127.0.0.1'},logLevel:'error'});
let browser;
try {
  await vite.listen();
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const manifests = new Map();
  for(const chapter of [1,2,3,4]) manifests.set(chapter,prepareScene(JSON.parse(await readFile(new URL('../public/assets/chapter-'+chapter+'/scene.json',import.meta.url),'utf8')),chapter));
  browser = await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
  const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
  page.setDefaultTimeout(20000);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await page.addInitScript(()=>{
    const native=window.requestAnimationFrame.bind(window);
    window.__motionRafRequests=0;
    window.requestAnimationFrame=callback=>{window.__motionRafRequests++;return native(callback);};
  });
  const inFlight=new Set();let peakRequests=0;
  page.on('request',request=>{
    if(!/\/assets\/.*\.(webp|png)(?:\?|$)/.test(request.url()))return;
    inFlight.add(request);peakRequests=Math.max(peakRequests,inFlight.size);
  });
  page.on('requestfinished',request=>inFlight.delete(request));
  page.on('requestfailed',request=>inFlight.delete(request));
  const snap=()=>page.locator('canvas').evaluate(canvas=>({...canvas.dataset,now:performance.now()}));
  const capture=async name=>{
    const filename=name+'.png';
    await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(filename,output))});
    return 'reports/reconstruction/after-motion/'+filename;
  };
  const loaded=async chapter=>{
    await page.waitForFunction(chapter=>{
      const canvas=document.querySelector('canvas'),host=document.querySelector('.scene-viewport');
      return canvas?.dataset.chapter===String(chapter)&&(host?.classList.contains('is-ready')||document.querySelector('.scene-loading.has-error'));
    },chapter,{timeout:60000});
    const status=page.locator('.scene-loading.has-error');
    if(await status.count())throw new Error(await status.innerText());
    await page.waitForFunction(()=>Number(document.querySelector('canvas')?.dataset.loadingTextures)===0&&Number(document.querySelector('canvas')?.dataset.queuedTextures)===0);
    await page.waitForTimeout(700);
  };
  const chapter=async id=>{await page.locator('.chapter-link').nth(id-1).click();await loaded(id);};
  const seek=async(id,index)=>{
    const stop=manifests.get(id).stops[index];
    await page.getByRole('button',{name:'游观至'+stop.name,exact:true}).click();
    await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-progress)<.0001,stop.progress);
    await page.mouse.move(5,5);await loaded(id);return stop;
  };
  await page.goto(vite.resolvedUrls.local[0]);await loaded(1);
  const budgets=[],probes=[],lifecycles=[];
  for(const id of [1,2,3,4]) {
    if(id!==1)await chapter(id);
    for(const [label,index] of [['start',0],['end',manifests.get(id).stops.length-1]]) {
      const stop=await seek(id,index),a=await snap();
      await page.waitForTimeout(1600);const b=await snap();
      const fps=(Number(b.renderCount)-Number(a.renderCount))/((b.now-a.now)/1000);
      assert(fps>0&&fps<=33,'Idle paint redraw must remain at the 30Hz budget');
      assert.equal(a.progress,b.progress);assert(Number(b.motionTime)>Number(a.motionTime));
      assert.equal(b.textureFailed,'0');assert(Number(b.loadingTextures)<=4);
      assert(Number(b.activeMotionLayers)<=Number(b.effectiveMotionBudget));
      if(id===4&&label==='end'){assert(Number(b.activePetals)<=1);assert(Number(b.activeMotionLayers)<=3);assert(Number(b.motionClockSpeed)<.4);assert(Number(b.cloudDensity)<.3);}
      budgets.push({chapter:id,label,stop:stop.name,progress:stop.progress,rendersPerSecond:fps,a,b,image:await capture('chapter-'+id+'-'+label)});
    }
    const index=id===2?5:id===3?5:id===4?2:0;
    const stop=await seek(id,index),a=await snap(),imageA=await capture('chapter-'+id+'-probe-on-a');
    await page.waitForTimeout(2000);const b=await snap(),imageB=await capture('chapter-'+id+'-probe-on-b');
    const names=JSON.parse(b.activeMotionNames);
    if(id===2)assert(names.includes('2-6 前景 牡丹花枝'),'The actual oblique flower branch must participate');
    if(id===3)assert(names.includes('SC06_16_红色灯笼'),'The actual independent lamp must participate');
    assert.equal(a.progress,b.progress);
    const button=page.getByRole('button',{name:'画中轻动',exact:true});
    await button.click();await page.waitForTimeout(300);
    const offA=await snap(),offImageA=await capture('chapter-'+id+'-probe-off-a');await page.waitForTimeout(500);const offB=await snap(),offImageB=await capture('chapter-'+id+'-probe-off-b');
    assert.equal(offA.renderCount,offB.renderCount);assert.equal(offA.motionTime,offB.motionTime);assert.equal(offB.rafRunning,'false');
    await button.click();await page.waitForTimeout(250);
    const restoredA=await snap();await page.waitForTimeout(500);const restoredB=await snap();
    assert(Number(restoredB.motionTime)>Number(restoredA.motionTime));
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(350);
    const reducedA=await snap(),reducedImageA=await capture('chapter-'+id+'-probe-reduced-a');await page.waitForTimeout(500);const reducedB=await snap(),reducedImageB=await capture('chapter-'+id+'-probe-reduced-b');
    assert.equal(reducedA.renderCount,reducedB.renderCount);assert.equal(reducedA.motionTime,reducedB.motionTime);assert.equal(reducedB.activeMotionLayers,'0');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(300);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    const hiddenA=await snap(),scheduled=await page.evaluate(()=>window.__motionRafRequests);
    await page.waitForTimeout(300);const hiddenB=await snap();
    assert.equal(hiddenA.motionTime,hiddenB.motionTime);assert.equal(await page.evaluate(()=>window.__motionRafRequests),scheduled);
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForTimeout(300);
    assert.equal(await page.locator('canvas').count(),1);
    probes.push({chapter:id,stop:stop.name,a,b,images:[imageA,imageB]});
    lifecycles.push({chapter:id,off:{a:offA,b:offB,images:[offImageA,offImageB]},restored:{a:restoredA,b:restoredB},reduced:{a:reducedA,b:reducedB,images:[reducedImageA,reducedImageB]},hidden:{a:hiddenA,b:hiddenB},singleCanvas:true});
  }
  // A fresh instance is released on every chapter switch, including repeated round trips.
  const roundTrips=[];
  for(const id of [1,4,2,3,1]){await chapter(id);const state=await snap();assert.equal(await page.locator('canvas').count(),1);assert.equal(state.contextLost,'false');roundTrips.push({chapter:id,textures:Number(state.textureCount),geometries:Number(state.geometries),canvases:1});}
  // Actual GPU context loss/restore on the final scroll preserves its reading position.
  await chapter(4);await seek(4,7);
  await page.evaluate(()=>window.__motionCanvas=document.querySelector('canvas'));
  const contextProgress=(await snap()).progress;
  const extension=await page.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');const extension=gl?.getExtension('WEBGL_lose_context');extension?.loseContext();return!!extension;});
  assert(extension);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.contextLost==='true');
  await page.getByRole('button',{name:'恢复画卷',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.contextLost==='false'&&Number(document.querySelector('canvas')?.dataset.contextRestores)>0);
  await loaded(4);assert.equal((await snap()).progress,contextProgress);
  assert(await page.evaluate(()=>window.__motionCanvas===document.querySelector('canvas')));
  const contextRecovery=await snap();
  assert(peakRequests<=4,'The same shared four-request texture cap must hold across completed chapter switches');
  assert.deepEqual(errors,[]);
  const textureRecovery=[];
  for(const id of [1,2,3,4]) {
    const recoveryPage=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'no-preference'});
    recoveryPage.setDefaultTimeout(20000);
    const recoveryErrors=[];recoveryPage.on('pageerror',error=>recoveryErrors.push(error.message));
    await recoveryPage.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    let failedUrl='',attempts=0;
    await recoveryPage.route('**/assets/**',route=>{
      const url=route.request().url();
      const belongs=url.includes('/assets/chapter-'+id+'/')||url.includes('/assets/reconstruction/chapter-'+id+'/');
      if(belongs&&/\.(webp|png)(?:\?|$)/.test(url)&&(!failedUrl||url===failedUrl)) {
        failedUrl=url;attempts++;
        if(attempts===1)return route.abort('failed');
      }
      return route.continue();
    });
    await recoveryPage.goto(vite.resolvedUrls.local[0]);
    await recoveryPage.locator('.scene-viewport.is-ready').waitFor({timeout:60000});
    if(id!==1)await recoveryPage.locator('.chapter-link').nth(id-1).click();
    await recoveryPage.locator('.scene-loading.is-partial').waitFor({timeout:60000});
    await recoveryPage.waitForFunction(id=>document.querySelector('canvas')?.dataset.chapter===String(id)&&Number(document.querySelector('canvas')?.dataset.loadingTextures)===0,id);
    await recoveryPage.evaluate(()=>window.__recoveryCanvas=document.querySelector('canvas'));
    const before=await recoveryPage.locator('canvas').evaluate(canvas=>({...canvas.dataset}));
    await recoveryPage.getByRole('button',{name:'恢复画卷',exact:true}).click();
    await recoveryPage.waitForFunction(()=>document.querySelector('canvas')?.dataset.textureFailed==='0'&&!document.querySelector('.scene-loading'));
    const after=await recoveryPage.locator('canvas').evaluate(canvas=>({...canvas.dataset}));
    assert.equal(attempts,2,'A failed texture is retried exactly once after the explicit recovery action');
    assert.equal(before.progress,after.progress);assert.equal(after.textureFailed,'0');
    assert(await recoveryPage.evaluate(()=>window.__recoveryCanvas===document.querySelector('canvas')));
    assert.deepEqual(recoveryErrors,[]);
    textureRecovery.push({chapter:id,failedAsset:new URL(failedUrl).pathname,attempts,before,after,sameCanvas:true,pageErrors:recoveryErrors});
    await recoveryPage.close();
  }
  const result={passed:true,activeChapters:revisions.activeChapters,viewport:'1440x900',budgets,probes,lifecycles,roundTrips,contextRecovery,textureRecovery,peakTextureRequests:peakRequests,pageErrors:errors,limitations:'Local Chromium checks and estimated texture bytes do not certify every GPU. Visibility is a controlled document.hidden event test. GPU recovery uses the real WEBGL_lose_context extension; texture recovery aborts one actual local texture request per scroll.'};
  await writeFile(new URL('validation-all-motion-browser.json',output),JSON.stringify(result,null,2)+'\n');
  console.log('All four scrolls: endpoint budgets, source branch/lamp probes, pause/reduced/hidden and GPU recovery passed.');

  const videoContext=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',recordVideo:{dir:fileURLToPath(new URL('../tmp/all-motion-video/',import.meta.url)),size:{width:1440,height:900}}});
  const videoPage=await videoContext.newPage();videoPage.setDefaultTimeout(20000);
  await videoPage.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  await videoPage.goto(vite.resolvedUrls.local[0]);await videoPage.locator('.scene-viewport.is-ready').waitFor({timeout:60000});
  await videoPage.locator('.chapter-link').nth(3).click();
  await videoPage.waitForFunction(()=>document.querySelector('canvas')?.dataset.chapter==='4'&&document.querySelector('.scene-viewport.is-ready'));
  const fourthEvidence=[];
  for(const [label,index] of [['flourishing',2],['afterglow',7]]) {
    const stop=manifests.get(4).stops[index];
    await videoPage.getByRole('button',{name:'游观至'+stop.name,exact:true}).click();
    await videoPage.waitForFunction(progress=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-progress)<.0001,stop.progress);
    await videoPage.waitForTimeout(800);
    const imageA='fourth-'+label+'-a.png',imageB='fourth-'+label+'-b.png';
    await videoPage.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(imageA,output))});
    const a=await videoPage.locator('canvas').evaluate(canvas=>({...canvas.dataset}));
    await videoPage.waitForTimeout(3500);
    await videoPage.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(imageB,output))});
    const b=await videoPage.locator('canvas').evaluate(canvas=>({...canvas.dataset}));
    if(label==='afterglow'){assert(Number(b.activePetals)<=1&&Number(b.activeMotionLayers)<=3);assert(Number(b.motionClockSpeed)<.5);}
    fourthEvidence.push({label,stop:stop.name,a,b,images:['reports/reconstruction/after-motion/'+imageA,'reports/reconstruction/after-motion/'+imageB]});
  }
  const video=videoPage.video();await videoContext.close();await video.saveAs(fileURLToPath(new URL('fourth-sheng-shuai.webm',output)));
  await writeFile(new URL('fourth-sheng-shuai.json',output),JSON.stringify({passed:true,evidence:fourthEvidence,video:'reports/reconstruction/after-motion/fourth-sheng-shuai.webm'},null,2)+'\n');
} finally {await browser?.close();await vite.close();}


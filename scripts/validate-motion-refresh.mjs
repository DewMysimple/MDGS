import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root=new URL('../',import.meta.url),output=new URL('reports/reconstruction/after-motion/',root);
const manifestPath=new URL('public/assets/reconstruction/manifest.json',root);
const canonicalText=await readFile(manifestPath,'utf8'),canonical=JSON.parse(canonicalText);
assert.deepEqual(canonical.activeChapters,[1,2,3,4]);
const digest=value=>createHash('sha256').update(value).digest('hex');
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({server:{host:'127.0.0.1'},logLevel:'error'});
await mkdir(output,{recursive:true});let browser;
try {
  await server.listen();
  const {prepareScene}=await server.ssrLoadModule('/src/scene/prepareScene.ts');
  const manifests=new Map();
  for(const chapter of [1,2,3,4])manifests.set(chapter,prepareScene(JSON.parse(await readFile(new URL(`public/assets/chapter-${chapter}/scene.json`,root),'utf8')),chapter));
  browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
  const samples=[],resizeWakeups=[],errors=[];
  for(const viewport of [{width:1440,height:900},{width:360,height:800}]) {
    const page=await browser.newPage({viewport,reducedMotion:'no-preference'});page.setDefaultTimeout(20000);
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    const loaded=async chapter=>{
      await page.waitForFunction(chapter=>document.querySelector('canvas')?.dataset.chapter===String(chapter)&&(document.querySelector('.scene-viewport.is-ready')||document.querySelector('.scene-loading.has-error')),chapter,{timeout:60000});
      if(await page.locator('.scene-loading.has-error').count())throw new Error(await page.locator('.scene-loading.has-error').innerText());
      await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
      await page.waitForTimeout(600);
    };
    await page.goto(server.resolvedUrls.local[0]);await loaded(1);
    const chapters=viewport.width===1440?[2,4]:[1,2,3,4];
    for(const chapter of chapters) {
      if(chapter!==1){await page.locator('.chapter-link').nth(chapter-1).click();await loaded(chapter);}
      const stops=manifests.get(chapter).stops;
      const indices=viewport.width===1440?(chapter===2?[0,5,stops.length-1]:[stops.length-1]):[0,stops.length-1];
      for(const index of indices) {
        const stop=stops[index];await page.getByRole('button',{name:'游观至'+stop.name,exact:true}).click();
        await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-progress)<.0001,stop.progress);
        await page.mouse.move(5,5);await loaded(chapter);
        const snap=()=>page.locator('canvas').evaluate(canvas=>({...canvas.dataset,now:performance.now()}));
        const a=await snap();await page.waitForTimeout(1200);const b=await snap();
        const rendersPerSecond=(Number(b.renderCount)-Number(a.renderCount))/((b.now-a.now)/1000);
        if(Number(b.activeMotionLayers)>0)assert(rendersPerSecond>0&&rendersPerSecond<=33);
        else{assert.equal(rendersPerSecond,0,'No visible motion must not schedule empty ambient redraws');assert.equal(a.motionTime,b.motionTime);assert.equal(b.rafRunning,'false');}
        assert.equal(a.progress,b.progress);assert.equal(b.textureFailed,'0');
        assert(Number(b.activeMotionLayers)<=Number(b.effectiveMotionBudget));
        if(chapter===4&&index===stops.length-1){assert(Number(b.activePetals)<=1);assert(Number(b.activeMotionLayers)<=3);assert.equal(b.motionClockSpeed,'0.320000');}
        const filename=`refresh-${viewport.width}x${viewport.height}-chapter-${chapter}-stop-${index+1}.png`;
        await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(filename,output))});
        const fit=await page.evaluate(()=>({pageFits:document.documentElement.scrollWidth<=innerWidth,canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON(),captions:[...document.querySelectorAll('.art-text-layer')].map(element=>({id:element.dataset.artTextId,display:getComputedStyle(element).display}))}));
        assert(fit.pageFits,'The narrow layout must not acquire horizontal page overflow');
        samples.push({viewport,chapter,stop:stop.name,index,progress:stop.progress,rendersPerSecond,a,b,fit,image:'reports/reconstruction/after-motion/'+filename});
        if(viewport.width===360&&Number(b.activeMotionLayers)===0){
          await page.evaluate(()=>window.__resizeCanvas=document.querySelector('canvas'));
          await page.setViewportSize({width:1440,height:900});await loaded(chapter);
          const wideA=await snap();await page.waitForTimeout(450);const wideB=await snap();
          assert(Number(wideB.activeMotionLayers)>0&&Number(wideB.motionTime)>Number(wideA.motionTime),'Resizing to visible authored layers must wake their independent clock');
          assert.equal(wideB.progress,b.progress);assert(await page.evaluate(()=>window.__resizeCanvas===document.querySelector('canvas')));
          await page.setViewportSize(viewport);await loaded(chapter);
          const narrowA=await snap();await page.waitForTimeout(450);const narrowB=await snap();
          assert.equal(narrowB.activeMotionLayers,'0');assert.equal(narrowA.motionTime,narrowB.motionTime);assert.equal(narrowA.renderCount,narrowB.renderCount);assert.equal(narrowB.rafRunning,'false');
          resizeWakeups.push({chapter,progress:b.progress,wide:{a:wideA,b:wideB},narrow:{a:narrowA,b:narrowB},sameCanvas:true});
        }
      }
    }
    await page.close();
  }
  assert.deepEqual(errors,[]);
  assert.equal(await readFile(manifestPath,'utf8'),canonicalText,'Canonical changed while refreshing evidence; rerun on the stable final manifest');
  const refreshedAssets=[];
  for(const id of ['c2-t004','c2-t029']){
    const replacement=canonical.chapters['2'].replacements.find(item=>item.id===id);assert(replacement);
    refreshedAssets.push({id,asset:replacement.asset,sha256:digest(await readFile(new URL('public/'+replacement.asset,root))),contentAspect:replacement.contentAspect,paddingScale:replacement.paddingScale});
  }
  const result={passed:true,canonicalSha256:digest(canonicalText),refreshedAssets,samples,resizeWakeups,pageErrors:errors,limitations:'Focused final-static-asset refresh and narrow-window motion budgets. No visible independent motion stops the ambient clock/RAF; actual window resize and reading seek wake it. Off-frustum authored captions may intentionally hide; this report does not claim every caption is visible in narrow windows. Full lifecycle evidence remains in validation-all-motion-browser.json.'};
  await writeFile(new URL('validation-motion-refresh.json',output),JSON.stringify(result,null,2)+'\n');
  console.log(`Final asset/narrow motion refresh passed ${samples.length} samples.`);
}finally{await browser?.close();await server.close();}

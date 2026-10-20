/** Record only the final third/eighth scenes; retain previous motion evidence unchanged. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createServer} from 'vite';

const root=new URL('../',import.meta.url),output=new URL('reports/reconstruction/after-motion/',root);
const revisionFile=new URL('public/assets/reconstruction/manifest.json',root),revisionText=await readFile(revisionFile,'utf8');
const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const vite=await createServer({server:{host:'127.0.0.1'},logLevel:'error'});let browser;
await mkdir(output,{recursive:true});
try{
  await vite.listen();const {prepareScene}=await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const manifest=prepareScene(JSON.parse(await readFile(new URL('public/assets/chapter-4/scene.json',root),'utf8')),4);
  browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'no-preference',recordVideo:{dir:fileURLToPath(new URL('tmp/final-fourth-motion/',root)),size:{width:1440,height:900}}});
  const page=await context.newPage(),created=Date.now();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
  const loaded=async chapter=>{
    await page.waitForFunction(chapter=>document.querySelector('canvas')?.dataset.chapter===String(chapter)&&document.querySelector('.scene-viewport.is-ready'),chapter,{timeout:60000});
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.loadingTextures==='0'&&document.querySelector('canvas')?.dataset.queuedTextures==='0');
    assert.equal(await page.locator('.scene-loading.has-error').count(),0);
    await page.waitForTimeout(550);
  };
  const snap=()=>page.locator('canvas').evaluate(canvas=>({...canvas.dataset}));
  const screenshot=async filename=>{await page.locator('.scene-viewport').screenshot({path:fileURLToPath(new URL(filename,output))});return'reports/reconstruction/after-motion/'+filename;};
  await page.goto(vite.resolvedUrls.local[0]);await loaded(1);await page.locator('.chapter-link').nth(3).click();await loaded(4);
  const scenes=[];let start;
  for(const [label,index,dwell] of [['flourishing',2,3500],['afterglow',7,4000]]){
    const stop=manifest.stops[index];await page.getByRole('button',{name:'游观至'+stop.name,exact:true}).click();
    await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-progress)<.0001,stop.progress);
    await page.mouse.move(5,5);await loaded(4);if(start===undefined)start=(Date.now()-created)/1000;
    const a=await snap(),imageA=await screenshot(`final-fourth-${label}-a.png`);
    await page.waitForTimeout(dwell);const b=await snap(),imageB=await screenshot(`final-fourth-${label}-b.png`);
    assert.equal(a.progress,b.progress);assert(Number(b.motionTime)>Number(a.motionTime));
    if(label==='afterglow'){assert.equal(b.motionClockSpeed,'0.400000');assert(Number(b.activeMotionLayers)<=3&&Number(b.activePetals)<=1);}
    scenes.push({label,index:index+1,name:stop.name,progress:stop.progress,dwellMilliseconds:dwell,a,b,images:[imageA,imageB]});
  }
  const end=(Date.now()-created)/1000,video=page.video();await context.close();
  const raw=new URL('tmp/final-fourth-motion/source.webm',root);await video.saveAs(fileURLToPath(raw));
  console.log('Final third/eighth scene GPU recording complete; encoding the trimmed preview.');
  const destination=new URL('final-fourth-motion.webm',output);
  const encoded=spawnSync(process.env.MDGS_FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(start),'-i',fileURLToPath(raw),'-t',String(end-start),'-c:v','libvpx-vp9','-crf','32','-b:v','0','-pix_fmt','yuv420p','-threads','2','-an',fileURLToPath(destination)],{encoding:'utf8'});
  assert.equal(encoded.status,0,encoded.stderr||encoded.error?.message||'FFmpeg failed to encode the final preview');
  assert.deepEqual(errors,[]);assert.equal(await readFile(revisionFile,'utf8'),revisionText);
  await writeFile(new URL('final-fourth-motion.json',output),JSON.stringify({passed:true,canonicalSha256:createHash('sha256').update(revisionText).digest('hex'),scenes,video:'reports/reconstruction/after-motion/final-fourth-motion.webm',durationSeconds:end-start,trimmedLeadingLoadSeconds:start,pageErrors:errors,scope:'Final production scene code without test diagnostics; only the third/eighth-scene recording is retained in the trimmed preview. Previous motion recordings remain historical evidence.'},null,2)+'\n');
  console.log('Final fourth-scroll motion preview saved.');
}finally{await browser?.close();await vite.close();}

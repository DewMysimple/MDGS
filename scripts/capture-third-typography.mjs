/** Capture real product lettering and its unoccluded scene underneath. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const {chromium}=createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const output=new URL((option('output')||'reports/chapter-3-refinement/text-layout-v1').replace(/\\/g,'/').replace(/\/?$/,'/'),root);
assert(output.href.startsWith(new URL('reports/chapter-3-refinement/',root).href));
const bytes=await readFile(new URL('public/assets/reconstruction/manifest.json',root));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonicalHash=sha(bytes);
if(option('expected-hash'))assert.equal(canonicalHash,option('expected-hash'));
const canonical=JSON.parse(bytes),texts=canonical.chapters[3].textLayers.filter(t=>t.layout==='vertical');
assert(texts.length>0&&texts.every(t=>Number.isFinite(t.anchorProgress)));
const opening={id:'chapter-3-opening',title:'锦绣花意',anchorProgress:0,webOnlyOpening:true};
const selectedViews=process.argv.includes('--opening-only')?[opening]:process.argv.includes('--include-opening')?[opening,...texts]:texts;
const requestedIds=option('ids')?.split(',');
const views=requestedIds?selectedViews.filter(view=>requestedIds.includes(view.id)):selectedViews;
assert(views.length>0&&(!requestedIds||views.length===new Set(requestedIds).size),'Every requested ID must exist in this capture selection');
const viewportSizes=(option('viewports')||'1920x1080,960x700,360x800').split(',').map(size=>size.split('x').map(Number));
assert(viewportSizes.every(size=>size.length===2&&size.every(n=>Number.isFinite(n)&&n>=200&&n<=8192)));
const sources=await Promise.all(['src/scene/CalligraphyLayer.ts','src/scene/CalligraphyLayer.css','src/scene/ArtDirectionLayer.ts','src/scene/SceneRenderer.ts','src/styles/handscroll.css'].map(async path=>({path,sha256:sha(await readFile(new URL(path,root)))})));
const report={schemaVersion:1,status:'capturing',canonicalSha256:canonicalHash,manifestFrozenByHttpResponse:true,sources,textGroups:texts.length,viewports:[],pageErrors:[],consoleErrors:[],failedResources:[],note:'Real product canvas and lettering. Pixel captures require visual review; this report does not pass aesthetics.'};
await mkdir(output,{recursive:true});
await writeFile(new URL('manifest.json',output),bytes);
const vite=await createServer({server:{host:'127.0.0.1',watch:null},logLevel:'error',plugins:[{name:'third-text-capture-no-watch',configResolved(config){config.server.watch=null}}]});
let browser;
try{
  await vite.listen();const address=vite.httpServer.address();assert(address&&typeof address==='object');
  browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
  const page=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:'reduce',deviceScaleFactor:1});
  page.setDefaultTimeout(45000);
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text())});
  page.on('response',response=>{if(new URL(response.url()).hostname==='127.0.0.1'&&response.status()>=400)report.failedResources.push({url:response.url(),status:response.status()})});
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.route('**/assets/reconstruction/manifest.json',route=>route.fulfill({body:bytes,contentType:'application/json'}));
  await page.goto(`http://127.0.0.1:${address.port}/`,{waitUntil:'domcontentloaded'});
  await page.locator('.chapter-link').nth(2).click();
  const ready=()=>page.waitForFunction(()=>{const c=document.querySelector('canvas');return c?.dataset.chapter==='3'&&document.querySelector('.scene-viewport.is-ready')&&c.dataset.loadingTextures==='0'&&c.dataset.queuedTextures==='0'});
  await ready();
  for(const [width,height] of viewportSizes){
    await page.setViewportSize({width,height});await page.waitForTimeout(140);
    const folder=`${width}x${height}/`;await mkdir(new URL(folder,output),{recursive:true});
    const viewport={width,height,samples:[]};report.viewports.push(viewport);
    for(const text of [...views].sort((a,b)=>a.anchorProgress-b.anchorProgress)){
      const actualInputProgress=await page.locator('input[type=range]').evaluate((input,progress)=>{input.value=String(progress);input.dispatchEvent(new Event('input',{bubbles:true}));return Number(input.value)},text.anchorProgress);
      await page.waitForFunction(progress=>Math.abs(Number(document.querySelector('canvas')?.dataset.progress)-progress)<.00001,actualInputProgress);
      await ready();await page.waitForTimeout(80);
      // Force an actual product paint before measuring transformed CSS3D text.
      // Immediately after a resize the canvas may be current before the DOM
      // compositor has applied its new camera matrix to the first visible label.
      const filename=`${folder}${text.id}.png`,underlay=`${folder}${text.id}-underlay.png`;
      await page.locator('.painting').screenshot({path:fileURLToPath(new URL(filename,output))});
      const dom=await page.evaluate(id=>{
        const painting=document.querySelector('.painting').getBoundingClientRect();
        const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left-painting.left,right:r.right-painting.left,top:r.top-painting.top,bottom:r.bottom-painting.top,width:r.width,height:r.height}};
        const glyphs=node=>{let index=0;return Array.from(node.textContent).map(char=>{const r=document.createRange();r.setStart(node.firstChild,index);index+=char.length;r.setEnd(node.firstChild,index);return {char,...rect(r)}})};
        const visible=e=>e&&e.style.display!=='none'&&Number(e.style.opacity)>.001;
        const compactOpening=document.querySelector('[data-compact-opening="true"]');
        const element=id==='chapter-3-opening'?(visible(compactOpening)?compactOpening:document.querySelector('.artwork-calligraphy')):[...document.querySelectorAll('[data-art-text-id]')].find(e=>e.dataset.artTextId===id);
        const active=[...document.querySelectorAll('[data-art-text-id],.artwork-calligraphy')].filter(visible).map(e=>({id:e.dataset.artTextId??e.dataset.annotationId,opacity:Number(e.style.opacity)}));
        const title=element.querySelector('h2'),body=[...element.querySelectorAll('p')],seal=element.querySelector('.art-text-layer__inline-seal,.artwork-calligraphy-seal');
        const font=node=>({family:getComputedStyle(node).fontFamily,designSize:getComputedStyle(node).fontSize,writingMode:getComputedStyle(node).writingMode,color:getComputedStyle(node).color,strokeWidth:getComputedStyle(node).webkitTextStrokeWidth});
        return {painting:{width:painting.width,height:painting.height},active,visible:visible(element),opacity:Number(element.style.opacity),dataset:{...element.dataset},bounds:rect(element.querySelector('.art-text-layer__vertical-band')??element),title:{text:title.textContent,rect:rect(title),glyphs:glyphs(title),font:font(title)},body:body.map(p=>({text:p.textContent,rect:rect(p),glyphs:glyphs(p),font:font(p)})),seal:seal?{text:seal.textContent,rect:rect(seal),font:font(seal)}:null,canvas:{...document.querySelector('canvas').dataset},horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
      },text.id);
      await page.locator('.painting').screenshot({path:fileURLToPath(new URL(underlay,output)),style:'.calligraphy-layer{visibility:hidden!important}'});
      viewport.samples.push({id:text.id,title:text.title,anchorProgress:text.anchorProgress,actualInputProgress,screenshot:filename,screenshotSha256:sha(await readFile(new URL(filename,output))),underlay,underlaySha256:sha(await readFile(new URL(underlay,output))),dom});
      if(text===texts.at(-1))await page.screenshot({path:fileURLToPath(new URL(`${folder}full-product.png`,output)),fullPage:true});
    }
    await writeFile(new URL('capture.json',output),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({viewport:[width,height],samples:viewport.samples.length,canonicalSha256:canonicalHash}));
  }
  report.productionCanonicalAtEnd=sha(await readFile(new URL('public/assets/reconstruction/manifest.json',root)));
  report.productionCanonicalChangedDuringFrozenCapture=report.productionCanonicalAtEnd!==canonicalHash;
  report.sourceFilesUnchanged=(await Promise.all(sources.map(async f=>sha(await readFile(new URL(f.path,root)))===f.sha256))).every(Boolean);
  assert(report.sourceFilesUnchanged,'Product source changed during capture');
  assert.equal(report.pageErrors.length+report.consoleErrors.length+report.failedResources.length,0);
  report.status='captured-awaiting-visual-review';
}catch(error){report.status='failed';report.failure=error.stack;throw error}
finally{if(browser)await browser.close();await vite.close();report.ownedServerClosed=!vite.httpServer?.listening;await writeFile(new URL('capture.json',output),JSON.stringify(report,null,2)+'\n')}
console.log(JSON.stringify({status:report.status,samples:report.viewports.reduce((n,v)=>n+v.samples.length,0),canonicalSha256:canonicalHash,ownedServerClosed:report.ownedServerClosed}));

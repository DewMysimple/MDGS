const {chromium}=require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');
const path=require('node:path'),crypto=require('node:crypto'),child=require('node:child_process');
const root=path.resolve(__dirname,'../../..');process.chdir(root);
const base=process.env.MDGS_ENCOUNTERS_URL || 'http://localhost:5188/';
const inputs=['src/components/ArtEncounters.tsx','src/styles/art-encounters.css','src/data/artEncounters.ts','src/scene/artworkProjection.ts','src/scene/SceneRenderer.ts','src/components/ScrollViewport.tsx','src/App.tsx'];
const hashes=()=>Object.fromEntries(inputs.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const before=hashes();
(async()=>{
 const browser=await chromium.launch({...(process.env.MDGS_TEST_BROWSER?{executablePath:process.env.MDGS_TEST_BROWSER}:{}),headless:true});
 const p=await browser.newPage({viewport:{width:1280,height:720},reducedMotion:'reduce'}),errors=[],results=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const mainResponse=await p.goto(base),html=await mainResponse.text(),production=!html.includes('/@vite/client');
 const bundle=[];for(const url of await p.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(es=>es.map(e=>e.getAttribute('src')||e.getAttribute('href')))){const response=await p.request.get(new URL(url,base).href);bundle.push({url,status:response.status(),sha256:crypto.createHash('sha256').update(await response.body()).digest('hex')});}
 await p.getByRole('button',{name:/^展开第壹卷/}).waitFor({timeout:90000});
 await p.getByRole('button',{name:/^展开第壹卷/}).click({timeout:90000});
 await p.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',null,{timeout:90000});
 for(let id=1;id<=4;id++){
  if(id!==1){await p.getByRole('button',{name:new RegExp('^第'+['一','二','三','四'][id-1]+'卷，')}).click();}
  await p.waitForFunction(id=>document.querySelector('#scroll-artwork canvas')?.dataset.chapter===String(id)&&document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',id,{timeout:90000});
  await p.getByRole('button',{name:/画中有遇：/}).click();
  await p.waitForFunction(()=>document.querySelectorAll('.art-anchor').length>=1,null,{timeout:90000});await p.waitForTimeout(1200);
  results.push({id,narrativeRetracted:await p.locator('.narrative-passage.is-visible').count()===0});
  if(id===3){await p.keyboard.press('Enter');await p.keyboard.press('Enter');results.push({id,keyboardWeaving:await p.locator('.art-encounters.is-woven').count()===1});await p.getByRole('button',{name:'重拾',exact:true}).click();results.push({id,resetFocus:await p.evaluate(()=>document.activeElement?.classList.contains('art-anchor--flower'))});}
  if(id===4){const t=p.getByRole('button',{name:'展读原诗',exact:true});await t.focus();await p.keyboard.press('Enter');results.push({id,poemToggleFocus:await p.getByRole('button',{name:'合笺',exact:true}).evaluate(e=>e===document.activeElement)});}
  for(const [width,height]of [[1280,720],[1920,1080],[2560,1440]]){
    await p.setViewportSize({width,height});await p.waitForTimeout(1100);
    results.push(await p.evaluate(()=>{
      const b=document.querySelector('#scroll-artwork').getBoundingClientRect(),n=document.querySelector('.art-paper').getBoundingClientRect(),t=document.querySelector('.narrative-passage.is-visible')?.getBoundingClientRect(),secondary=document.querySelector('.secondary-controls').getBoundingClientRect(),play=document.querySelector('.playback-controls').getBoundingClientRect();
      return{chapterId:Number(document.querySelector('#scroll-artwork canvas').dataset.chapter),width:innerWidth,inside:n.left>=b.left&&n.top>=b.top&&n.right<=b.right&&n.bottom<=b.bottom,narrativeOverlap:!!t&&n.left<t.right&&n.right>t.left&&n.top<t.bottom&&n.bottom>t.top,controlsOverlap:secondary.left<play.right&&secondary.right>play.left,sourceViewport:JSON.parse(document.querySelector('#scroll-artwork canvas').dataset.sourceViewport),note:n.toJSON(),text:t?.toJSON(),markers:[...document.querySelectorAll('.art-anchor')].map(e=>({label:e.getAttribute('aria-label'),box:e.getBoundingClientRect().toJSON()})),bodyFont:getComputedStyle(document.querySelector('.art-copy,.art-poem-note')).fontSize,sourceFont:getComputedStyle(document.querySelector('.art-source')).fontSize,shader:document.querySelector('#scroll-artwork canvas').dataset.shaderErrors,textureFailed:document.querySelector('#scroll-artwork canvas').dataset.textureFailed};
    }));
    if(width===1920)await p.screenshot({path:path.join(__dirname,`chapter-${id}-1920.png`)});
  }
  await p.keyboard.press('Escape');await p.waitForSelector('.art-encounters',{state:'detached'});
  await p.waitForSelector('.narrative-passage.is-visible',{state:'visible',timeout:15000});
  results.push({id,narrativeRestored:await p.locator('.narrative-passage.is-visible').count()===1,narrativeMode:await p.locator('.narrative-calligraphy').getAttribute('data-mode')});
  const before=await p.locator('#scroll-artwork canvas').getAttribute('data-progress');const box=await p.locator('#scroll-artwork').boundingBox();await p.mouse.move(box.x+box.width*.5,box.y+box.height*.35);await p.mouse.wheel(0,100);await p.waitForTimeout(700);const after=await p.locator('#scroll-artwork canvas').getAttribute('data-progress');
  results.push({id,escClosed:await p.locator('.art-encounters').count()===0,wheelWorks:Number(after)>Number(before),before,after});
  await p.setViewportSize({width:1280,height:720});
 }
 const after=hashes();const sourceStable=inputs.every(file=>before[file]===after[file]);
 const metadata={at:new Date().toISOString(),base,browser:browser.version(),reducedMotion:'reduce',sourceEdition:'peony-2.0-2026-10-23',baseCommit:child.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),driver:'reports/art-renewal/encounters/verify-integrated.cjs',driverSha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),workingTree:`Uncommitted art-renewal implementation; Vite ${production?'production preview':'development server'}, not deployed.`,production,bundle,sourceStable,sourceHashesBefore:before,sourceHashesAfter:after};
 fs.writeFileSync(path.join(__dirname,'integrated.json'),JSON.stringify({metadata,errors,results},null,2));console.log(JSON.stringify({sourceStable,errors,layoutCases:results.filter(r=>r.width).length,results:results.filter(r=>!r.width)},null,2));await browser.close();
 if(!sourceStable)process.exitCode=1;
 if(errors.length||results.some(r=>r.narrativeOverlap||r.controlsOverlap||r.inside===false||r.wheelWorks===false||r.keyboardWeaving===false||r.resetFocus===false||r.poemToggleFocus===false||r.narrativeRetracted===false||r.narrativeRestored===false||r.shader&&r.shader!=='[]'||r.textureFailed&&r.textureFailed!=='0'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});


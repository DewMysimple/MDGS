/* Production-only QA. Build separately, then preview that directory; no HMR. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),child=require('node:child_process'),ts=require('typescript');
const {chromium}=require(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../../..');process.chdir(root);
const base=process.env.MDGS_POETRY_URL||'http://127.0.0.1:5193/';
const buildDirectory=process.env.MDGS_POETRY_BUILD_DIR||'tmp/poetry-qa-dist';
const output=process.env.MDGS_POETRY_REPORT_DIR?path.resolve(process.env.MDGS_POETRY_REPORT_DIR):__dirname;
fs.mkdirSync(output,{recursive:true});
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inputs=['src/data/poeticNarrative.ts','src/data/newNarrative.ts','src/data/narrativeTrack.ts','src/data/viewerSettings.ts','src/components/NarrativeCalligraphy.tsx','src/styles/narrative-calligraphy.css','src/scene/NarrativeSpace.ts','src/scene/SceneRenderer.ts','src/App.tsx','src/components/ViewerSettingsPanel.tsx','src/components/CulturePanel.tsx'];
const hashes=()=>Object.fromEntries(inputs.map(file=>[file,digest(fs.readFileSync(file))]));
const before=hashes();
function evaluate(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});return exports;}
const {buildPoeticTrack}=evaluate('src/data/poeticNarrative.ts'),{narrativeChapters}=evaluate('src/data/newNarrative.ts');
const sources=[1,2,3,4].map(id=>{const bytes=fs.readFileSync(`public/assets/new-scrolls/chapter-${id}/scene.json`),scene=JSON.parse(bytes);return{id,scene,sha256:digest(bytes),track:buildPoeticTrack(id,scene.stops,scene.sourceDurationSeconds)};});
const settingsKey='guose-fanghua:viewer-settings:v2';
const motion=process.env.MDGS_POETRY_MOTION||'reduce';
(async()=>{
 const browser=await chromium.launch({...(process.env.MDGS_TEST_BROWSER?{executablePath:process.env.MDGS_TEST_BROWSER}:{}),headless:true});
 const p=await browser.newPage({viewport:{width:1920,height:1080},reducedMotion:motion});
 const errors=[],checks=[],cases=[],modes=[],emotions=[],stopChecks=[];
 const check=(name,pass,detail)=>checks.push({name,pass:!!pass,...(detail===undefined?{}:{detail})});
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const pageResponse=await p.goto(base);const html=await pageResponse.text();
 const assets=await p.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(es=>es.map(e=>e.getAttribute('src')||e.getAttribute('href')));
 const bundle=[];for(const url of assets){const r=await p.request.get(new URL(url,base).href);const body=await r.body();bundle.push({url,status:r.status(),sha256:digest(body)});}
 check('production page has no Vite HMR client',!html.includes('/@vite/client')&&!assets.some(u=>u.includes('/src/')));
 await enter();
 check('first visit defaults to poetic',await mode()==='poetic');
 async function enter(id=1){if(!/^#chapter-[1-4]$/.test(new URL(p.url()).hash))await p.getByRole('button',{name:/^展开第壹卷/}).click({timeout:90000});await waitChapter(id);console.log(`entered production scroll ${id}`);}
 async function waitChapter(id){try{await p.waitForFunction(id=>document.querySelector('#scroll-artwork canvas')?.dataset.chapter===String(id)&&document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',id,{timeout:60000});await p.evaluate(()=>document.fonts.ready);}catch(error){await p.screenshot({path:path.join(output,'failed-entry.png')});console.log(await p.evaluate(()=>({phase:document.querySelector('[data-journey-phase]')?.dataset.journeyPhase,loading:{...document.querySelector('.art-loading')?.dataset},error:document.querySelector('[role=alert]')?.textContent})));throw error;}}
 async function chapter(id){const actual=await p.locator('#scroll-artwork canvas').getAttribute('data-chapter');if(actual!==String(id)){await p.getByRole('button',{name:new RegExp('^第'+['一','二','三','四'][id-1]+'卷，')}).click();await waitChapter(id);}}
 async function mode(){return p.locator('.narrative-calligraphy').getAttribute('data-mode');}
 async function range(selector,value){await p.locator(selector).evaluate((element,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,String(value));element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));},value);}
 async function configure(value,padding){await p.getByRole('button',{name:'打开设置',exact:true}).click();if(value)await p.locator(`input[name="narrative-mode"][value="${value}"]`).check();if(padding!==undefined)await range('#text-plate-padding',padding);await p.getByRole('button',{name:'完成',exact:true}).click();await p.waitForTimeout(100);}
 async function seek(progress,cue){await range('input[aria-label="画卷游观进度"]',progress);await p.waitForFunction(({progress,cue})=>{const c=document.querySelector('#scroll-artwork canvas'),n=document.querySelector('.narrative-calligraphy');return c&&Math.abs(Number(c.dataset.progress)-progress)<.0011&&c.dataset.loadingTextures==='0'&&c.dataset.queuedTextures==='0'&&(!cue||n?.dataset.cueId===cue&&n?.dataset.placementReady==='true'&&!!n.querySelector('.is-visible')&&c.dataset.narrativeReadPending==='false'&&Math.floor(Number(c.dataset.narrativeReadProgress)*24)===Math.floor(Number(c.dataset.progress)*24));},{progress,cue},{timeout:90000});await p.waitForTimeout(motion==='reduce'?230:700);}
 async function measurement(){return p.evaluate(()=>{
   const ink=document.querySelector('.narrative-passage.is-visible .narrative-ink'),root=document.querySelector('.narrative-calligraphy'),canvas=document.querySelector('#scroll-artwork canvas'),painting=document.querySelector('#scroll-artwork').getBoundingClientRect();
   if(!ink)return{missing:true,mode:root.dataset.mode,cue:root.dataset.cueId,ready:root.dataset.placementReady};
   const paper=ink.getBoundingClientRect(),article=ink.parentElement.getBoundingClientRect(),glyphs=[];
   for(const selector of ['h2','p','.narrative-ordinal','.narrative-small-seal']){const el=ink.querySelector(selector),walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;let start=0;for(const char of node.textContent){const end=start+char.length;if(!/\s/u.test(char)){const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);for(const r of range.getClientRects())if(r.width&&r.height)glyphs.push({selector,char,x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,top:r.top,right:r.right,bottom:r.bottom});}start=end;}}}
   const outside=(r,b,tolerance=.8)=>r.left<b.left-tolerance||r.top<b.top-tolerance||r.right>b.right+tolerance||r.bottom>b.bottom+tolerance;
   const pbox=ink.querySelector('p').getBoundingClientRect(),hbox=ink.querySelector('h2').getBoundingClientRect(),sbox=ink.querySelector('.narrative-small-seal').getBoundingClientRect();
   const intersects=(a,b)=>a.left<b.right-.8&&a.right>b.left+.8&&a.top<b.bottom-.8&&a.bottom>b.top+.8;
   const glyphInkOverflow=glyphs.filter(r=>outside(r,paper)),copySealCellContacts=glyphs.filter(r=>r.selector==='p'&&intersects(r,sbox));
   // Range returns a full em cell for upright ideographic punctuation, not its
   // small visible dot. Retain these contacts separately for screenshot review.
   const copySealLetterOverlap=copySealCellContacts.filter(r=>/[\p{L}\p{N}]/u.test(r.char));
   return{cue:root.dataset.cueId,mode:root.dataset.mode,ready:root.dataset.placementReady,progress:Number(canvas.dataset.progress),width:innerWidth,height:innerHeight,padding:getComputedStyle(ink).paddingRight,font:getComputedStyle(ink.querySelector('p')).fontSize,heading:ink.querySelector('h2').textContent,text:ink.querySelector('p').textContent,layout:root.dataset.layout,side:root.dataset.side,ink:paper.toJSON(),region:article.toJSON(),painting:painting.toJSON(),glyphCount:glyphs.length,glyphInkOverflow,glyphPaintingOverflow:glyphs.filter(r=>outside(r,painting)),copyHeadingOverlap:intersects(pbox,hbox),copySealCellContacts,copySealLetterOverlap,inkInsidePainting:!outside(paper,painting),shader:canvas.dataset.shaderErrors,textureFailed:canvas.dataset.textureFailed};
 });}
 // All mode changes use the actual settings controls. A reload checks storage.
 for(const value of ['original','quiet','poetic']){
   console.log(`mode check: ${value}`);
   await configure(value);await seek(.03,value==='poetic'?sources[0].track[0].id:undefined);
   modes.push({mode:value,actual:await mode(),visibleCount:await p.locator('.narrative-passage.is-visible').count(),articleCount:await p.locator('.narrative-passage').count(),storage:await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),settingsKey)});
   check(`${value} settings mode applied`,await mode()===value);
   if(value==='quiet')check('quiet has zero narrative articles and visible body',await p.locator('.narrative-passage').count()===0&&await p.locator('.narrative-passage.is-visible').count()===0);
   await p.reload();await enter();check(`${value} survives full reload`,await mode()===value);
   check(`${value}: non-zero progress survives full reload`,Math.abs(Number(await p.locator('#scroll-artwork canvas').getAttribute('data-progress'))-.03)<.0011);
 }
 for(const source of sources){
   const {id,scene,track}=source;await chapter(id);
   for(const [width,height]of [[1280,720],[1920,1080],[2560,1440]]){
    await p.setViewportSize({width,height});
    for(const padding of [12,24]){
     await configure('poetic',padding);
     for(const cue of track){
       const progress=(cue.start+cue.end)/2;await seek(progress,cue.id);const row={chapterId:id,paddingSetting:padding,expectedCue:cue.id,...await measurement()};cases.push(row);
       const key=(id===1&&cue.paragraphIndex===10)||(id===2&&cue.paragraphIndex===1&&cue.partIndex===0)||(id===3&&cue.paragraphIndex===5)||(id===4&&[3,4,7,8].includes(cue.paragraphIndex));
       if(key&&width===1920&&padding===12){const filename=`poetic-c${id}-s${cue.paragraphIndex+1}-1920.png`;await p.screenshot({path:path.join(output,filename)});emotions.push({chapterId:id,sourceNode:cue.sourceNode,sourceProgress:progress,heading:row.heading,text:row.text,screenshot:filename});}
     }
    }
    console.log(JSON.stringify({chapter:id,viewport:[width,height],cases:cases.length,overflow:cases.filter(c=>c.glyphInkOverflow?.length||c.glyphPaintingOverflow?.length).length}));
   }
   // Exact source-node seeks exercise the normalized boundary, not a midpoint.
   await p.setViewportSize({width:1920,height:1080});await configure('poetic',12);
   for(let index=0;index<scene.stops.length;index++){
     await p.locator('.timeline-stop').nth(index).click();const expected=track.find(c=>scene.stops[index].progress>=c.start&&scene.stops[index].progress<c.end);
     await p.waitForFunction(id=>document.querySelector('.narrative-calligraphy')?.dataset.cueId===id&&document.querySelector('.narrative-calligraphy')?.dataset.placementReady==='true',expected?.id,{timeout:90000});
     stopChecks.push({chapter:id,stop:index+1,sourceProgress:scene.stops[index].progress,expected:expected?.id,actual:await p.locator('.narrative-calligraphy').getAttribute('data-cue-id')});
   }
   // Reassemble all DOM original passages and read the permanent full transcript.
   await configure('original');await seek(.03);const domParagraphs=await p.locator('.narrative-passage').evaluateAll(es=>{const result={};for(const e of es){const key=e.dataset.narrativeId.replace(/-\d+$/,'');result[key]=(result[key]||'')+e.querySelector('p').textContent;}return result;});
   const expected=narrativeChapters[id].paragraphs;check(`chapter ${id}: original narrative DOM retains each paragraph`,expected.every(item=>domParagraphs[item.id]===item.text),{paragraphs:expected.length});
   await p.getByRole('button',{name:'打开文化解读',exact:true}).click();await p.getByRole('tab',{name:'原作全文',exact:true}).click();const full=await p.locator('.culture-prose p').allTextContents();check(`chapter ${id}: permanent original full text exact`,JSON.stringify(full)===JSON.stringify(expected.map(item=>item.text)));await p.keyboard.press('Escape');
   await configure('poetic');
 }
 // The fourth scroll's emotional turn must remain a loss after resumed entry.
 const turnCue=sources[3].track.find(cue=>cue.paragraphIndex===4),turnProgress=(turnCue.start+turnCue.end)/2;
 await seek(turnProgress,turnCue.id);await p.reload();await enter(4);await p.waitForFunction(cue=>document.querySelector('.narrative-calligraphy')?.dataset.cueId===cue&&!!document.querySelector('.narrative-passage.is-visible'),turnCue.id);
 check('fourth-scroll loss and caption survive non-zero reload',await p.locator('.narrative-passage.is-visible p').textContent()===turnCue.text&&Math.abs(Number(await p.locator('#scroll-artwork canvas').getAttribute('data-progress'))-turnProgress)<.0011);
 check('all 45 captions tested in all six desktop combinations',cases.length===270);
 check('every tested caption matches source contemporary writing',cases.every(row=>sources.find(s=>s.id===row.chapterId).track.find(c=>c.id===row.expectedCue)?.text===row.text&&row.expectedCue===row.cue));
 check('all body and heading glyph boxes fit their ink paper',cases.every(row=>!row.glyphInkOverflow?.length));
 check('all glyph boxes fit the painting viewport',cases.every(row=>!row.glyphPaintingOverflow?.length));
 check('all ink papers fit painting viewport',cases.every(row=>row.inkInsidePainting));
 check('no letter or digit cell overlaps heading or small seal',cases.every(row=>!row.copyHeadingOverlap&&!row.copySealLetterOverlap?.length));
 check('40 exact source-stop seeks read immediately',stopChecks.length===40&&stopChecks.every(row=>row.expected&&row.actual===row.expected));
 check('all tested WebGL source frames have no shader or texture failure',cases.every(row=>row.shader==='[]'&&row.textureFailed==='0'));
 check('no page or console errors',errors.length===0);
 const after=hashes(),sourceStable=inputs.every(file=>before[file]===after[file]);
 check('source inputs stable throughout capture',sourceStable);
 const screenshots=emotions.map(row=>({file:row.screenshot,sha256:digest(fs.readFileSync(path.join(output,row.screenshot)))}));
 const summary={layoutCases:cases.length,glyphCells:cases.reduce((sum,row)=>sum+row.glyphCount,0),punctuationCellContactCases:cases.filter(row=>row.copySealCellContacts.length).length,letterOrDigitSealCollisions:cases.filter(row=>row.copySealLetterOverlap.length).length};
 const report={at:new Date().toISOString(),base,browser:browser.version(),reducedMotion:motion,baseCommit:child.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),driver:'reports/art-renewal/poetic-narrative/verify-browser.cjs',driverSha256:digest(fs.readFileSync(__filename)),background:`Vite production preview of ${buildDirectory}; no deployed or dev-HMR evidence.`,buildDirectory,bundle,sourceHashesBefore:before,sourceHashesAfter:after,sourceStable,sources:sources.map(s=>({chapterId:s.id,sha256:s.sha256,cueCount:s.track.length})),summary,screenshots,checks,modes,errors,emotions,stopChecks,cases,passed:checks.every(c=>c.pass)};
 fs.writeFileSync(path.join(output,'browser-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,sourceStable,checks,errors},null,2));await browser.close();if(!report.passed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});

/* Supplement the 270-case geometry report with a direct image of its new contact. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{chromium}=require(process.env.MDGS_PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../../..');process.chdir(root);
const base=process.env.MDGS_POETRY_URL||'http://127.0.0.1:5193/';
const output=process.env.MDGS_POETRY_REPORT_DIR?path.resolve(process.env.MDGS_POETRY_REPORT_DIR):__dirname;
const reference=JSON.parse(fs.readFileSync(path.join(output,'browser-validation.json')));
const target=reference.cases.find(row=>row.expectedCue==='poetic-c4-s3-1'&&row.width===2560&&row.paddingSetting===12);
if(!target)throw new Error('Run the 270-case production report first.');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const inputs=['src/data/poeticNarrative.ts','src/components/NarrativeCalligraphy.tsx','src/styles/narrative-calligraphy.css','src/App.tsx'];
const hashes=()=>Object.fromEntries(inputs.map(file=>[file,sha(fs.readFileSync(file))])),before=hashes();
(async()=>{
 const b=await chromium.launch({...(process.env.MDGS_TEST_BROWSER?{executablePath:process.env.MDGS_TEST_BROWSER}:{}),headless:true});
 const p=await b.newPage({viewport:{width:2560,height:1440},reducedMotion:'reduce'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await p.goto(new URL('#chapter-4',base).href);
 await p.waitForFunction(()=>document.querySelector('[data-journey-phase]')?.dataset.journeyPhase==='SCROLL_VIEWER',null,{timeout:90000});
 await p.evaluate(()=>document.fonts.ready);
 await p.locator('input[aria-label="画卷游观进度"]').evaluate((e,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));},target.progress);
 await p.waitForFunction(id=>{const c=document.querySelector('#scroll-artwork canvas'),n=document.querySelector('.narrative-calligraphy');return n?.dataset.cueId===id&&n.dataset.placementReady==='true'&&c.dataset.loadingTextures==='0'&&c.dataset.queuedTextures==='0'&&c.dataset.narrativeReadPending==='false'&&Math.floor(Number(c.dataset.narrativeReadProgress)*24)===Math.floor(Number(c.dataset.progress)*24);},target.expectedCue,{timeout:90000});
 await p.waitForTimeout(230);
 const actual=await p.evaluate(()=>{
  const ink=document.querySelector('.narrative-passage.is-visible .narrative-ink'),copy=ink.querySelector('p'),seal=ink.querySelector('.narrative-small-seal').getBoundingClientRect(),contacts=[];
  const walker=document.createTreeWalker(copy,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){const node=walker.currentNode;let start=0;for(const char of node.textContent){const end=start+char.length,r=document.createRange();r.setStart(node,start);r.setEnd(node,end);for(const box of r.getClientRects())if(box.left<seal.right-.8&&box.right>seal.left+.8&&box.top<seal.bottom-.8&&box.bottom>seal.top+.8)contacts.push({char,box:box.toJSON()});start=end;}}
  return{text:copy.textContent,heading:ink.querySelector('h2').textContent,mode:document.querySelector('.narrative-calligraphy').dataset.mode,bodyFont:getComputedStyle(copy).fontSize,padding:getComputedStyle(ink).paddingRight,seal:seal.toJSON(),contacts};
 });
 const file='punctuation-c4-s3-2560.png';await p.screenshot({path:path.join(output,file)});
 const bundle=[];for(const url of await p.locator('script[src],link[rel="stylesheet"][href]').evaluateAll(es=>es.map(e=>e.getAttribute('src')||e.getAttribute('href')))){const response=await p.request.get(new URL(url,base).href);bundle.push({url,status:response.status(),sha256:sha(await response.body())});}
 const after=hashes(),sourceStable=inputs.every(file=>before[file]===after[file]);
 const passed=sourceStable&&errors.length===0&&actual.text===target.text&&actual.mode==='poetic'&&actual.contacts.length>0&&actual.contacts.every(row=>row.char==='。')&&JSON.stringify(bundle)===JSON.stringify(reference.bundle);
 const report={at:new Date().toISOString(),base,driver:'reports/art-renewal/poetic-narrative/verify-punctuation-contact.cjs',driverSha256:sha(fs.readFileSync(__filename)),browser:b.version(),viewport:{width:2560,height:1440},reducedMotion:'reduce',referenceDriverSha256:reference.driverSha256,targetCue:target.expectedCue,sourceHashesBefore:before,sourceHashesAfter:after,sourceStable,bundle,actual,screenshot:{file,sha256:sha(fs.readFileSync(path.join(output,file)))},interpretation:'DOM Range measures full-em ideographic punctuation cells. Inspect this unretouched screenshot for visible ink separation; no Han/letter/digit overlap was exempted.',errors,passed};
 fs.writeFileSync(path.join(output,'punctuation-contact-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await b.close();if(!passed)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});

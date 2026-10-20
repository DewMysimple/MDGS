/** Isolated browser typography probe; never rewrites the production manifest. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const {chromium} = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const output = new URL('reports/chapter-3-refinement/typography-probe/', root);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['src/scene/CalligraphyLayer.ts', 'src/scene/CalligraphyLayer.css'];
const sources = await Promise.all(sourceFiles.map(async path => ({path, sha256: sha(await readFile(new URL(path, root)))})));
const probeHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;background:#f5ecdc}#host{position:relative;overflow:hidden;background:#f5ecdc;--serif:SimSun,serif;--calligraphy:KaiTi,SimSun,serif}
</style></head><body><div id="host"></div><script type="module">
import * as THREE from '/node_modules/three/build/three.module.js';
import {CalligraphyLayer} from '/src/scene/CalligraphyLayer.ts';
const host=document.querySelector('#host');const layer=new CalligraphyLayer(host);
const camera=new THREE.PerspectiveCamera(35,1,.01,100);camera.position.set(0,0,10);camera.updateMatrixWorld(true);
const matrix=(x,y=1.5)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,0),new THREE.Quaternion(),new THREE.Vector3(2.2*200/360,2.2,1)).toArray();
const base={name:'竖题探针',title:'经纬生芳',lines:['丝线勾花影','把春意留在寻常'],matrix:matrix(5),domWidth:200,domHeight:360,color:'#4b3b2b',bodyColor:'#75624c',narrative:'孤立文字测量，不代表场景美术通过',layout:'vertical',titleSize:50,bodySize:34,range:[.1,.3],anchorProgress:.2,fade:.02,seal:'岁安'};
const fixture=(set)=>set==='legacy'?[{...base,id:'legacy',layout:undefined,seal:undefined,range:[.1,.3]}]:set==='overlap'?[{...base,id:'current'},{...base,id:'next',matrix:matrix(-12),range:[.2,.5],anchorProgress:.4},{...base,id:'remote',matrix:matrix(30),range:[.7,.8],anchorProgress:.75}]:[{...base,id:'current'}];
window.probe={resize(w,h){host.style.width=w+'px';host.style.height=h+'px';camera.aspect=w/h;const compact=layer.getCompactLayout(w,h);if(compact){const s=1-compact.reserveFraction;camera.setViewOffset(w*s,h*s,(s-1)*w/2,(s-1)*h,w,h)}else camera.clearViewOffset();camera.updateProjectionMatrix();layer.resize(w,h);return compact},load(set='single'){layer.load(1,{cameras:[],stops:[]},fixture(set))},render(p){layer.render(camera,p)},dispose(){layer.dispose()}};
window.probe.load();window.ready=true;
</script></body></html>`;
const vite = await createServer({server:{host:'127.0.0.1',watch:null},logLevel:'error',plugins:[{
  name:'third-typography-isolated-probe',
  configResolved(config){config.server.watch=null},
  configureServer(server){server.middlewares.use(async(req,res,next)=>{
    if(req.url?.split('?')[0]!=='/__third_typography_probe'){next();return}
    res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/__third_typography_probe',probeHtml));
  })},
}]});
let browser;
const report={schemaVersion:1,status:'running',scope:'Isolated production CalligraphyLayer browser typography, not full scene aesthetic approval',sources,samples:[],fade:[],errors:[]};
await mkdir(output,{recursive:true});
try{
  await vite.listen();
  const address=vite.httpServer.address();
  assert(address && typeof address==='object');
  browser=await chromium.launch({headless:true,executablePath:process.env.MDGS_TEST_BROWSER});
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/__third_typography_probe`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.ready);
  const measure=()=>page.evaluate(()=>[...document.querySelectorAll('.art-text-layer')].map(element=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const glyph=node=>{const r=document.createRange();r.setStart(node.firstChild,0);r.setEnd(node.firstChild,1);return rect(r)};
    const band=element.querySelector('.art-text-layer__vertical-band');
    const title=element.querySelector('h2');const lines=[...element.querySelectorAll('p')];
    return {id:element.dataset.artTextId,visible:element.style.display!=='none'&&Number(element.style.opacity)>.001,opacity:Number(element.style.opacity),dataset:{...element.dataset},bounds:band?rect(band):rect(element),title:rect(title),body:lines.map(p=>({bounds:rect(p),glyph:glyph(p),writingMode:getComputedStyle(p).writingMode,text:p.textContent})),titleGlyph:glyph(title),pointerEvents:getComputedStyle(element).pointerEvents};
  }));
  for(const size of [[1388,476],[908,400],[308,224],[308,320],[324,380]]){
    const compact=await page.evaluate(([w,h])=>{const compact=window.probe.resize(w,h);window.probe.load();window.probe.render(.2);return compact},size);
    const [text]=await measure();
    assert(text.visible,`Current vertical group must survive ${size}`);
    assert.equal(text.dataset.layoutOverflow,'false',`Short copy must fit ${size}`);
    assert(Number(text.dataset.screenBodySize)>=14-.001);
    assert(Number(text.dataset.screenTitleSize)>=18-.001);
    assert(text.bounds.left>=size[0]*.07-1 && text.bounds.right<=size[0]*.93+1);
    const safeTop=compact?.05:.24,safeBottom=compact?compact.reserveFraction-.03:.70;
    assert(text.bounds.top>=size[1]*safeTop-1 && text.bounds.bottom<=size[1]*safeBottom+1);
    assert.equal(text.body.length,2);
    assert(text.body.every(line=>line.writingMode==='vertical-rl'&&line.glyph.width>=13.5&&line.glyph.height>=13.5));
    assert(text.titleGlyph.width>=17.5&&text.titleGlyph.height>=17.5);
    assert(text.title.left>text.body[0].bounds.left&&text.body[0].bounds.left>text.body[1].bounds.left,'Columns must read from right to left');
    assert.equal(text.pointerEvents,'none');
    const name=`typography-${size[0]}x${size[1]}.png`;
    await page.locator('#host').screenshot({path:fileURLToPath(new URL(name,output))});
    report.samples.push({painting:size,compact,...text,screenshot:`reports/chapter-3-refinement/typography-probe/${name}`,sha256:sha(await readFile(new URL(name,output)))});
  }
  for(const p of [.1,.105,.11,.115,.12,.28,.285,.29,.295,.3]){
    await page.evaluate(p=>window.probe.render(p),p);
    const [text]=await measure();report.fade.push({progress:p,opacity:text.opacity});
  }
  assert.equal(report.fade[0].opacity,0);assert.equal(report.fade.at(-1).opacity,0);
  assert(Math.abs(report.fade.find(x=>x.progress===.11).opacity-.5)<.001);
  assert(Math.abs(report.fade.find(x=>x.progress===.29).opacity-.5)<.001);
  assert.equal(report.fade.find(x=>x.progress===.12).opacity,1);
  await page.evaluate(()=>{window.probe.load('overlap');window.probe.render(.22)});
  const overlap=await measure();
  assert.deepEqual(overlap.filter(x=>x.visible).map(x=>x.id),['current']);
  await page.evaluate(()=>window.probe.render(.4));
  const later=await measure();
  assert.deepEqual(later.filter(x=>x.visible).map(x=>x.id),['next']);
  report.semanticSelection={overlap:overlap.map(x=>({id:x.id,visible:x.visible})),later:later.map(x=>({id:x.id,visible:x.visible}))};
  await page.evaluate(()=>{window.probe.resize(1388,476);window.probe.load('legacy');window.probe.render(.2)});
  const [legacy]=await measure();
  assert(legacy.body.every(line=>line.writingMode==='horizontal-tb'));
  report.legacyCaptionUntouched=true;
  assert.equal(report.errors.length,0);
  report.status='passed';
}catch(error){report.status='failed';report.failure=error.stack;throw error}
finally{
  if(browser)await browser.close();
  await vite.close();
  report.ownedServerClosed=!vite.httpServer?.listening;
  await writeFile(new URL('validation.json',output),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({status:report.status,sizes:report.samples.map(x=>x.painting),fadePoints:report.fade.length,ownedServerClosed:report.ownedServerClosed}));

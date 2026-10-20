/** Reproduce the reported overlap flip, then exercise the real browser painter stack in both directions. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const output = new URL('../reports/blank-design/', import.meta.url);
await mkdir(output, { recursive: true });
const files = ['src/scene/StableLayerSorting.ts', 'src/scene/SceneRenderer.ts', 'public/assets/reconstruction/manifest.json', ...[1,2,3,4].map(i=>`public/assets/chapter-${i}/scene.json`)];
const fingerprints = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(new URL('../'+file, import.meta.url))).digest('hex')])));
const vite = await createServer({ server: { host: '127.0.0.1', watch: null }, logLevel: 'error' });
let browser;
try {
  await vite.listen();
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const stops = new Map();
  for (const chapter of [1,2,3,4]) stops.set(chapter, prepareScene(JSON.parse(await readFile(new URL(`../public/assets/chapter-${chapter}/scene.json`, import.meta.url), 'utf8')), chapter).stops);
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(45000);
  const errors = [], consoleMessages=[];
  page.on('console',message=>{if(['warning','error'].includes(message.type()))consoleMessages.push(message.text());});
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('**/src/scene/SceneRenderer.ts', async route => {
    const response = await route.fetch(), code = await response.text();
    assert(code.includes('this.renderer.sortObjects = true;'));
    await route.fulfill({ response, body: code.replace('this.renderer.sortObjects = true;', 'this.renderer.sortObjects = true; window.__depthRenderer = this;') });
  });
  const loaded = async chapter => {
    try {
    await page.waitForFunction(chapter => document.querySelector('canvas')?.dataset.chapter === String(chapter) && document.querySelector('.scene-viewport.is-ready'), chapter);
    await page.waitForFunction(() => document.querySelector('canvas')?.dataset.loadingTextures === '0' && document.querySelector('canvas')?.dataset.queuedTextures === '0');
    await page.waitForTimeout(180);
    } catch(error) {
      const state=await page.evaluate(()=>({canvases:[...document.querySelectorAll('canvas')].map(el=>({...el.dataset})),status:document.querySelector('.scene-loading')?.textContent,ready:[...document.querySelectorAll('.scene-viewport')].map(el=>el.className),renderer:window.__depthRenderer?{chapter:window.__depthRenderer.chapterId,disposed:window.__depthRenderer.disposed,loaded:window.__depthRenderer.loaded,contextLost:window.__depthRenderer.contextLost}:null}));
      await page.screenshot({path:fileURLToPath(new URL('sorting-load-failure.png',output))});await writeFile(new URL('sorting-load-failure.json',output),JSON.stringify({expectedChapter:chapter,state,pageErrors:errors,consoleMessages},null,2));throw error;
    }
  };
  const instrument = () => page.evaluate(() => {
    const r = window.__depthRenderer;
    window.__depthFrames = [];
    window.__depthDraws = [];
    const native = r.renderer.render.bind(r.renderer);
    for (const o of r.objects) o.mesh.onBeforeRender = () => window.__depthDraws.push(o.mesh.name);
    r.renderer.render = (...args) => {
      window.__depthDraws = [];
      native(...args);
      window.__depthFrames.push({ progress: r.progress, motion: r.getMotionState().enabled, order: [...new Set(window.__depthDraws)] });
    };
  });
  const seek = async progress => {
    await page.locator('input[type=range]').evaluate((input, value) => { input.value=String(value); input.dispatchEvent(new Event('input', { bubbles: true })); }, progress);
    await page.waitForFunction(value => Math.abs(Number(document.querySelector('canvas')?.dataset.progress) - value) < .0011, progress);
    await page.waitForTimeout(40);
  };
  const render = async () => {
    await page.evaluate(() => { const r=window.__depthRenderer; r.dirty=true; r.requestFrame(); });
    await page.waitForTimeout(80);
  };
  const snapshot = (withObjects=false) => page.evaluate(withObjects => {
    const r = window.__depthRenderer;
    return { progress: r.progress, axis: r.layerSorting?.axis.toArray() ?? null, frame: window.__depthFrames.at(-1), camera: { matrix: r.camera.matrix.toArray(), projection: r.camera.projectionMatrix.toArray() }, objects: withObjects ? r.objects.map(o=>({name:o.mesh.name,matrix:o.mesh.matrix.toArray(),geometry:o.mesh.geometry.attributes.position.array.slice().toString()})) : undefined, diagnostics: {...r.renderer.domElement.dataset} };
  }, withObjects);
  const capture = async name => {
    const file = name + '.png';
    await page.locator('.scene-viewport').screenshot({ path: fileURLToPath(new URL(file, output)) });
    return 'reports/blank-design/' + file;
  };
  const empress = '06_01_中央主位女子', palace = '06_05_京城全景';
  const pairSign = snap => {
    const order = snap.frame.order, a=order.indexOf(empress), b=order.indexOf(palace);
    assert(a >= 0 && b >= 0, 'Both reported subjects must actually be rendered');
    return Math.sign(a-b);
  };
  await page.goto(vite.resolvedUrls.local[0]); await loaded(1); await instrument();
  await page.evaluate(()=>window.__depthRenderer.renderer.setTransparentSort(null));
  const baseline=[];
  for (const progress of [.348,.352]) {
    await seek(progress); await loaded(1); await render();
    const snap = await snapshot(true);
    baseline.push({progress, pairSign:pairSign(snap), frame:snap.frame, image:await capture(`sorting-before-${progress}`), camera:snap.camera, objects:snap.objects});
  }
  assert.notEqual(baseline[0].pairSign,baseline[1].pairSign,'The unfixed Three sorter must reproduce the exact reported inversion');
  await page.evaluate(()=>{const r=window.__depthRenderer;r.renderer.setTransparentSort(r.layerSorting.compare);window.__depthFrames=[];});
  const corrected=[];
  for (let i=0;i<baseline.length;i++) {
    await seek(baseline[i].progress); await loaded(1); await render();
    const snap = await snapshot(true);
    assert.equal(pairSign(snap),1,'Palace must be painted before the complete foreground empress');
    assert.deepEqual(snap.camera,baseline[i].camera,'The fix must leave the original camera unchanged');
    assert.deepEqual(snap.objects,baseline[i].objects,'The fix must leave source pose and repaired geometry unchanged');
    corrected.push({progress:snap.progress,axis:snap.axis,pairSign:pairSign(snap),frame:snap.frame,image:await capture(`sorting-after-${snap.progress}`)});
  }
  const sweepReports=[];
  for (const mode of ['reduce','no-preference']) {
    await page.emulateMedia({reducedMotion:mode});
    await page.evaluate(()=>window.__depthFrames=[]);
    // Four passes reverse both sides of the exact former crossing, using the actual range interaction.
    for(let direction=0;direction<4;direction++) {
      for(let i=0;i<=64;i++) await seek(.322+(direction%2?64-i:i)*.00075);
    }
    await loaded(1);
    const frames=await page.evaluate(()=>window.__depthFrames);
    let shared=0;
    for(const frame of frames) {
      const a=frame.order.indexOf(empress),b=frame.order.indexOf(palace);
      if(a>=0&&b>=0){shared++;assert(a>b,`Overlap inverted at ${frame.progress}, ${mode}`);}
    }
    assert(shared>200);
    assert.equal(frames.some(frame=>frame.motion),mode==='no-preference','The enabled pass must exercise actual independent animation');
    sweepReports.push({reducedMotion:mode,passes:4,range:[.322,.37],samples:frames.length,framesWithBothSubjects:shared,flips:0,frames});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  console.log('Exact reproduction and eight directional motion sweeps passed.');
  const responsive=[];
  for(const viewport of [{width:1920,height:1080},{width:960,height:700},{width:360,height:800}]) {
    await page.setViewportSize(viewport);await seek(.35);await loaded(1);await render();
    const snap=await snapshot();
    // A narrow viewport may legitimately exclude the palace, while the base order remains invariant.
    const order=await page.evaluate(([a,b])=>{const r=window.__depthRenderer;const oa=r.objects.find(o=>o.mesh.name===a),ob=r.objects.find(o=>o.mesh.name===b);return Math.sign(r.layerSorting.compare({groupOrder:0,renderOrder:0,z:0,id:oa.mesh.id,object:oa.mesh},{groupOrder:0,renderOrder:0,z:0,id:ob.mesh.id,object:ob.mesh}));},[empress,palace]);
    assert.equal(order,1);responsive.push({viewport,axis:snap.axis,pairSign:order,image:await capture(`sorting-responsive-${viewport.width}`)});
  }
  await page.setViewportSize({width:1440,height:900});
  // The comparator remains attached to the same renderer through a real GPU rebuild.
  await seek(.352);await loaded(1);await render();
  const recoveryBefore=await snapshot(true);
  await page.evaluate(()=>window.__depthOriginalCanvas=document.querySelector('canvas'));
  const canLose=await page.locator('canvas').evaluate(canvas=>{const gl=canvas.getContext('webgl2')??canvas.getContext('webgl');const ext=gl?.getExtension('WEBGL_lose_context');ext?.loseContext();return!!ext;});
  assert(canLose);await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.contextLost==='true');
  await page.getByRole('button',{name:'恢复画卷',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.contextLost==='false'&&Number(document.querySelector('canvas')?.dataset.contextRestores)>0);
  await loaded(1);await render();const recoveryAfter=await snapshot(true);
  assert.equal(pairSign(recoveryAfter),1);assert.deepEqual(recoveryAfter.camera,recoveryBefore.camera);assert.deepEqual(recoveryAfter.objects,recoveryBefore.objects);
  assert(await page.evaluate(()=>window.__depthOriginalCanvas===document.querySelector('canvas')));
  const recovery={sameCanvas:true,orderRetained:true,sourcePoseAndGeometryRetained:true,cameraRetained:true,image:await capture('sorting-after-context-recovery')};
  console.log('Responsive painter stack and actual GPU restoration passed.');
  await writeFile(new URL('validation-layer-sorting-focused.json',output),JSON.stringify({passed:true,fingerprints,baseline:baseline.map(({objects,...rest})=>rest),corrected,sweeps:sweepReports,responsive,recovery,pageErrors:errors},null,2)+'\n');
  const chapterRegressions=[];
  // All four chapters, complete route, forward/reverse. Capture exact draw order
  // and compare recurring pairs only where BOTH were rendered, across 60 samples.
  for(const chapter of [1,2,3,4]) {
    await page.locator('.chapter-link').nth(chapter-1).click();await loaded(chapter);await instrument();console.log(`Scroll ${chapter}: loaded.`);
    const snapshots=[];
    for(let i=0;i<=30;i++){await seek(i/30);await loaded(chapter);await render();snapshots.push(await snapshot());}
    for(let i=30;i>=0;i--){await seek(i/30);await loaded(chapter);await render();const snap=await snapshot();const prior=snapshots[i];assert.deepEqual(snap.frame.order,prior.frame.order,`Reverse route changed a frozen painter order, chapter ${chapter}, ${i}`);}
    const usesStable=await page.evaluate(()=>!!window.__depthRenderer.layerSorting);
    assert.equal(usesStable,chapter===1,'Other three original scene sorters must be untouched');
    for(const index of [0,Math.floor(stops.get(chapter).length/2),stops.get(chapter).length-1]){
      await seek(stops.get(chapter)[index].progress);await loaded(chapter);await capture(`sorting-chapter-${chapter}-stop-${index+1}`);
    }
    chapterRegressions.push({chapter,usesStableSorting:usesStable,forwardReverseSamples:62,matchedReverseOrders:true,stops:stops.get(chapter),frames:snapshots.map(s=>({progress:s.progress,frame:s.frame,diagnostics:s.diagnostics}))});
    await writeFile(new URL('validation-layer-sorting-routes.json',output),JSON.stringify({passed:chapterRegressions.length===4,fingerprints,completedChapters:chapterRegressions.map(x=>x.chapter),chapters:chapterRegressions,pageErrors:errors},null,2)+'\n');
    console.log(`Scroll ${chapter}: forward/reverse sorting order verified.`);
  }
  assert.deepEqual(errors,[]);
  for (const chapter of chapterRegressions) for (const frame of chapter.frames) assert.equal(frame.diagnostics.textureFailed,'0','Sorting regression must not conceal a missing image');
  for (const [file, hash] of Object.entries(fingerprints)) assert.equal(createHash('sha256').update(await readFile(new URL('../'+file,import.meta.url))).digest('hex'),hash,'A verified runtime input changed during the run: '+file);
  const report={passed:true,createdAt:new Date().toISOString(),fingerprints,baseline:baseline.map(({objects,...rest})=>rest),corrected,sweeps:sweepReports,responsive,recovery,chapters:chapterRegressions,pageErrors:errors,limitations:'Chromium on the current Windows host. Corrected first-scroll painter stack is tested directly with actual draw callbacks; other three retain their previous sorter. Static base poses, geometry and source camera are compared at the exact reproduction. Continuous motion is separately exercised across the former crossing.'};
  await writeFile(new URL('validation-layer-sorting.json',output),JSON.stringify(report,null,2)+'\n');
  console.log('Exact inversion reproduced; corrected multi-direction painter stack, motion, responsive and all-scroll reversals passed.');
}finally{await browser?.close();await vite.close();}

/** Run the established runtime/journey acceptance against the Peony 2.0 edition.
 * node scripts/validate-peony2-runtime.mjs
 * node scripts/validate-peony2-runtime.mjs --journey
 *
 * Existing typography, narration, bounds, audio, ending, entry, retry and cancel
 * assertions are retained. Only the retired extra ambient-motion assertions are
 * replaced with the requested native-only motion policy and actual source FPS.
 * Results never overwrite the historical new-scrolls reports.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, unlink} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const journey = process.argv.includes('--journey');
const original = path.join(root, 'scripts', journey ? 'validate-new-scroll-journey.mjs' : 'validate-new-scroll-runtime.mjs');
let source = await readFile(original, 'utf8');
const originalHash = createHash('sha256').update(source).digest('hex');
const adapterHash = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const output = `reports/peony2-fidelity/${journey ? 'journey' : 'runtime'}`;

function replaceOnce(before, after) {
  assert.equal(source.split(before).length - 1, 1, 'Legacy acceptance changed; review this adapter before running: ' + before.slice(0, 100));
  source = source.replace(before, after);
}

replaceOnce("fileURLToPath(new URL('../',import.meta.url))", JSON.stringify(root));
source = source.replaceAll("'reports/new-scrolls'", JSON.stringify(output));
source = source.replaceAll('validation-runtime-new.json', 'validation-runtime-peony2.json')
  .replaceAll('validation-journey-new.json', 'validation-journey-peony2.json');
if (journey) {
  replaceOnce("assert.equal(await page.locator('.painting canvas').getAttribute('data-chapter'),String(id));",
    "assert.equal(await page.locator('.painting canvas').getAttribute('data-chapter'),String(id));assert.equal(await page.locator('.painting canvas').getAttribute('data-source-revision'),'peony-2.0-2026-10-23');assert.equal(await page.locator('.painting canvas').getAttribute('data-source-materials-ready'),'true');assert.equal(await page.locator('.painting canvas').getAttribute('data-edition-atmosphere-layers'),'0');");
} else {
  replaceOnce("'tmp/new-scrolls/runtime'", JSON.stringify(`${output}/captures`));
  source = source.replaceAll("'tmp/new-scrolls/runtime/'", JSON.stringify(`${output}/captures/`));
  replaceOnce("assert.equal(manifest.sourceRevision,'peony-2026-10-21');", "assert.equal(manifest.sourceRevision,'peony-2.0-2026-10-23');");
  replaceOnce('assert.equal(Number(first.editionAtmosphereLayers),[30,14,18,18][id-1]);',
    "assert.equal(Number(first.editionAtmosphereLayers),0);assert.equal(first.activeMotionNames,'[]');assert.equal(first.sourceMaterialsReady,'true');");
  replaceOnce("await page.locator('input[aria-label=\"画卷游观进度\"]').fill(String(value));", `await page.locator('input[aria-label="画卷游观进度"]').evaluate((element,value)=>{
  element.step='any';Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,String(value));
  element.dispatchEvent(new Event('input',{bubbles:true}));
 },value);`);
  const start = "  await page.setViewportSize({width:1672,height:941});await seek(.001);await page.waitForTimeout(500);";
  const end = "  report.checks.push({test:`actual-motion-off-reduce-${id}`,moving:after.activeMotionNames,passed:true});";
  const first = source.indexOf(start), last = source.indexOf(end);
  assert(first >= 0 && last > first, 'Review the old ambient-motion acceptance before adapting.');
  source = source.slice(0, first) + `  await page.setViewportSize({width:1672,height:941});await seek(.125);
  const stillBefore=await data();await page.waitForTimeout(350);const stillAfter=await data();
  assert.equal(stillBefore.sourceFrame,stillAfter.sourceFrame,'A paused authored film must not advance.');
  assert.equal(stillAfter.editionAtmosphereLayers,'0');assert.equal(stillAfter.activeMotionNames,'[]');
  assert.equal(await page.getByRole('button',{name:'画中轻动',exact:true}).count(),0,'The native edition must not offer extra motion.');
  const clockSnapshot=()=>page.locator('.painting canvas').evaluate((canvas,range)=>({frame:range[0]+Number(document.querySelector('input[aria-label="画卷游观进度"]').value)*(range[1]-range[0]),canvasFrame:Number(canvas.dataset.sourceFrame),now:performance.now(),data:{...canvas.dataset}}),manifest.frameRange);
  const beforePlay=await clockSnapshot();
  await page.getByRole('button',{name:'自动展卷',exact:true}).click();await page.waitForTimeout(700);
  await page.getByRole('button',{name:'暂停展卷',exact:true}).click();
  const afterPlay=await clockSnapshot();
  const frameDelta=afterPlay.frame-beforePlay.frame,expectedDelta=(afterPlay.now-beforePlay.now)/1000*manifest.fps/(manifest.fpsBase||1);
  assert(frameDelta>0&&Math.abs(frameDelta-expectedDelta)<8,'Autoplay must follow the authored FPS, including at the current display rate.');
  await page.waitForTimeout(400);assert.equal((await clockSnapshot()).frame,afterPlay.frame,'Pause must immediately stop the controller clock.');
  await page.waitForFunction(frame=>Math.abs(Number(document.querySelector('.painting canvas')?.dataset.sourceFrame)-frame)<1e-7,afterPlay.frame,{timeout:30000});
  const stoppedRenderedFrame=Number((await data()).sourceFrame);
  await page.waitForTimeout(400);assert.equal(Number((await data()).sourceFrame),stoppedRenderedFrame,'The final in-flight rendered frame must then remain exactly frozen.');
  assert.equal((await clockSnapshot()).frame,afterPlay.frame,'The controller must remain stopped after rendering catches up.');
  assert.equal(afterPlay.data.editionAtmosphereLayers,'0');assert.equal(afterPlay.data.activeMotionNames,'[]');
  report.checks.push({test:'native-source-clock-and-no-extra-motion-'+id,frameDelta,expectedDelta,passed:true});
` + source.slice(last + end.length);
}
const injection = `report.applicability={sourceRevision:'peony-2.0-2026-10-23',legacyAcceptance:${JSON.stringify(path.basename(original))},legacyAcceptanceSha256:${JSON.stringify(originalHash)},adapterSha256:${JSON.stringify(adapterHash)},retained:'All original typography/narration/bounds/audio/ending/entry/retry/cancel assertions.',changed:'Current edition identity; no extra ambient geometry or clock; real source FPS; new report destination.'};
report.scope=report.scope.replace('small motion controls,','source FPS, playback pause and no added motion,');\n`;
const anchor = journey ? 'let server,browser,page;' : 'let browser,server,page;';
replaceOnce(anchor, injection + anchor);
const directory = path.join(root, '.asset-cache/peony2-validation');
await mkdir(directory, {recursive: true});
const driver = path.join(directory, `${journey ? 'journey' : 'runtime'}-${process.pid}-${Date.now()}.mjs`);
await writeFile(driver, source);
try {
  if (process.argv.includes('--check-adapter')) {
    execFileSync(process.execPath, ['--check', driver], {stdio: 'pipe'});
    console.log(JSON.stringify({status: 'adapter-syntax-pass', mode: journey ? 'journey' : 'runtime', legacyAcceptanceSha256: originalHash}));
  } else await import(pathToFileURL(driver).href);
} finally {
  await unlink(driver).catch(() => {});
}

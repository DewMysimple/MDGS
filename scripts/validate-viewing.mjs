import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

// This is a CPU route test, so importing its two pure TS modules should not
// start Vite, a port, dependency scanning or an esbuild parent-directory crawl.
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dataUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const read = relative => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
const optionsUrl = dataUrl(compile(await read('src/data/sceneOptions.ts')));
const prepareUrl = dataUrl(compile(await read('src/scene/prepareScene.ts')).replace(/from (['"])\.\.\/data\/sceneOptions\1/, `from "${optionsUrl}"`));
const { prepareScene } = await import(prepareUrl);
const editionUrl = dataUrl(compile(await read('src/data/sourceEdition.ts')).replaceAll('import.meta.env.BASE_URL', '"./"'));
const { activeSourceEdition, chapterAssetBase } = await import(editionUrl);
const editions = [
  { name:'legacy', base:id=>`./assets/chapter-${id}/`, active:false },
  { name:activeSourceEdition, base:chapterAssetBase, active:true },
];
const results = [];
for (const edition of editions) {
  for (let id = 1; id <= 4; id++) {
    const assetBase = edition.base(id);
    assert(assetBase.startsWith('./assets/'), 'The runtime edition must use portable public paths.');
    const source = JSON.parse(await read(`public/${assetBase.slice(2)}scene.json`));
    if (edition.active) assert.equal(source.sourceRevision, activeSourceEdition);
    else assert.equal(source.sourceRevision, undefined, 'Keep historical route fixtures separate from the active works.');
    const before = JSON.stringify(source);
    const scene = prepareScene(source, id);
    assert.equal(scene.cameras[0].progress, 0);
    assert.equal(scene.cameras.at(-1).progress, 1);
    assert.equal(scene.stops[0].progress, 0);
    assert.equal(scene.stops.length, [15, 7, 9, 9][id - 1]);
    scene.cameras.forEach((sample, i) => {
      assert(Number.isFinite(sample.fov) && sample.fov > 5 && sample.fov < 100);
      assert(sample.progress >= 0 && sample.progress <= 1);
      if (i) assert(sample.progress > scene.cameras[i - 1].progress);
    });
    scene.stops.forEach((stop, i) => {
      assert(stop.progress >= 0 && stop.progress <= 1);
      if (i) assert(stop.progress > scene.stops[i - 1].progress);
    });
    // Historical crane shots remain trimmed only for their original source.
    if (!edition.active && id === 1) assert.equal(Math.round(scene.cameras.at(-1).frame), 13474);
    if (!edition.active && id === 2) {
      assert.equal(Math.round(scene.cameras.at(-1).frame), 5521);
      assert(scene.cameras.at(-1).position[2] < source.cameras.at(-1).position[2] / 2);
    }
    let visibilityBoundaries = 0;
    if (edition.active) {
      assert.equal(scene.cameras[0].frame, source.frameRange[0]);
      assert.equal(scene.cameras.at(-1).frame, source.frameRange[1]);
      assert.equal(scene.cameras.length, source.cameras.length, 'The revised route must retain every source camera sample.');
      scene.cameras.forEach((sample,index) => {
        const original = source.cameras[index];
        assert.equal(sample.sourceProgress,original.progress);
        assert.equal(sample.frame,original.frame);
        assert.deepEqual(sample.position,original.position);
        assert.deepEqual(sample.quaternion,original.quaternion);
        assert.equal(sample.fov,original.fov);
      });
      assert.deepEqual(scene.animations,source.animations);
      assert.deepEqual(scene.visibility,source.visibility);
      assert.deepEqual(scene.markers,source.markers);
      assert(scene.stops.every((stop,index)=>stop.frame===source.stops[index].frame && stop.authoredFrame===source.stops[index].authoredFrame));
      const toSource = progress => {
        const index=scene.cameras.findIndex(sample=>sample.progress>=progress);
        if(index<=0) return scene.cameras[0].sourceProgress;
        const a=scene.cameras[index-1],b=scene.cameras[index];
        const mix=(progress-a.progress)/Math.max(1e-12,b.progress-a.progress);
        return a.sourceProgress+(b.sourceProgress-a.sourceProgress)*mix;
      };
      for (const track of Object.values(source.visibility)) for (const key of track) {
        const index=scene.cameras.findIndex(sample=>sample.sourceProgress>=key.progress);
        const a=scene.cameras[Math.max(0,index-1)],b=scene.cameras[Math.max(0,index)];
        const mix=(key.progress-a.sourceProgress)/Math.max(1e-12,b.sourceProgress-a.sourceProgress);
        const mapped=a.progress+(b.progress-a.progress)*mix;
        assert(Math.abs(toSource(mapped)-key.progress)<1e-6,'Native visibility boundaries must survive source-to-reading progress mapping.');
        visibilityBoundaries++;
      }
    }
    assert.deepEqual(scene.meshes, source.meshes, 'View normalization must not modify scene geometry');
    assert.equal(JSON.stringify(source),before,'Preparing a view must never mutate its source manifest.');
    results.push({ edition:edition.name, active:edition.active, chapter: id, assetBase, stops: scene.stops.length, cameraSamples: scene.cameras.length, sourceFrameRange: [scene.cameras[0].frame, scene.cameras.at(-1).frame], sourceVisibilityBoundaries:visibilityBoundaries, passed: true });
  }
}
await writeFile(new URL('../reports/validation-viewing.json', import.meta.url), JSON.stringify({status:'pass',testedAt:new Date().toISOString(),activeEdition:activeSourceEdition,scope:'CPU route and immutable source validation for the retained legacy works and the runtime-selected revised edition. No browser claim.',results}, null, 2)+'\n');
console.log(JSON.stringify({status:'pass',editions:editions.map(edition=>edition.name),chapters:results.length,activeVisibilityBoundaries:results.reduce((sum,result)=>sum+result.sourceVisibilityBoundaries,0)}));

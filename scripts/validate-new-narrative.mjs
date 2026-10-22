/** Exact supplied-text coverage and monotonic source-node mapping. Browser
 * typography/occlusion must be inspected separately against the new paintings. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = JSON.parse(await readFile(new URL('../reports/new-scrolls/narrative-source.json', import.meta.url), 'utf8'));
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dataUrl = moduleUrl(compile(await readFile(new URL('../src/data/newNarrative.ts', import.meta.url), 'utf8')));
const data = await import(dataUrl);
const optionsUrl = moduleUrl(compile(await readFile(new URL('../src/data/sceneOptions.ts',import.meta.url),'utf8')));
const { sceneOptions } = await import(optionsUrl);
const prepareText=compile(await readFile(new URL('../src/scene/prepareScene.ts',import.meta.url),'utf8')).replace(/from (['"])\.\.\/data\/sceneOptions\1/,`from "${optionsUrl}"`);
const { prepareScene }=await import(moduleUrl(prepareText));
const editionText=compile(await readFile(new URL('../src/data/sourceEdition.ts',import.meta.url),'utf8')).replaceAll('import.meta.env.BASE_URL','"./"');
const { activeSourceEdition,chapterAssetBase }=await import(moduleUrl(editionText));
const trackText = compile(await readFile(new URL('../src/data/narrativeTrack.ts', import.meta.url), 'utf8')).replace(/from (['"])\.\/newNarrative\1/, `from "${dataUrl}"`);
const { buildNarrativeTrack, splitNarrativeText, activeNarrativeCue } = await import(moduleUrl(trackText));
const checks = [], mappings = [];
const prose = source.paragraphs.filter(text => !text.startsWith('画卷'));
assert.equal(source.tables.length, 0);
assert.equal(createHash('sha256').update(await readFile(new URL(`../${source.source}`, import.meta.url))).digest('hex'), source.sourceSha256);
assert.equal(data.narrativeSource.sha256, source.sourceSha256);
assert.deepEqual(Object.values(data.narrativeChapters).flatMap(chapter => chapter.paragraphs.map(paragraph => paragraph.text)), prose);
assert.deepEqual(Object.values(data.narrativeChapters).map(chapter => chapter.paragraphs.length), [6,6,6,7]);
checks.push({ test: 'all-25-docx-paragraphs-preserved-character-for-character', passed: true });
for (const text of prose) for (const maximum of [28, 44, 68]) {
  const parts = splitNarrativeText(text, maximum);
  assert.equal(parts.join(''), text); assert(parts.every(part => [...part].length <= maximum));
}
checks.push({ test: 'responsive-passages-preserve-words-punctuation-and-spaces', passed: true });
for (const chapter of Object.values(data.narrativeChapters)) {
  const audit = JSON.parse(await readFile(new URL(`../reports/new-scrolls/chapter-${chapter.id}-source-audit.json`, import.meta.url), 'utf8'));
  const span = audit.frames[1] - audit.frames[0];
  const authoredStops = audit.markers.filter(marker => !/参考全景/.test(marker.name)).map(marker => ({ ...marker, progress: Math.max(0, (marker.frame - audit.frames[0]) / span) }));
  const manifest=JSON.parse(await readFile(new URL(`../public/${chapterAssetBase(chapter.id).replace(/^\.\//,'')}scene.json`,import.meta.url),'utf8'));
  assert.equal(manifest.sourceRevision,activeSourceEdition);
  const prepared=prepareScene(manifest,chapter.id),stops=prepared.stops;
  const routeChecks=[];
  for(const [routeName,routeStops] of [['prepared-runtime',stops],['authored-frame',authoredStops]]) for(const maximum of [28,44,68]) {
    const routeCues=buildNarrativeTrack(chapter.id,routeStops,maximum);
    assert.equal(routeCues[0].start,0);assert.equal(routeCues.at(-1).end,.982);
    routeCues.forEach((cue,index)=>{
      assert(cue.end>cue.start,`${chapter.id}/${routeName}/${maximum}: ${cue.id} must have an observable reading interval.`);
      if(index)assert(Math.abs(cue.start-routeCues[index-1].end)<1e-12);
      assert.equal(activeNarrativeCue(routeCues,(cue.start+cue.end)/2)?.id,cue.id);
      assert.equal(activeNarrativeCue(routeCues,cue.start)?.id,cue.id);
      // The normal autoplay interval must outlast the .65s ink fade even for
      // short mobile clauses; a minimum .9s prevents an invisible flash of text.
      assert((cue.end-cue.start)*sceneOptions[chapter.id].autoplayDuration>=.9,`${cue.id}: autoplay skips a clause before its fade can be read.`);
    });
    const paragraphWindows=chapter.paragraphs.map(paragraph=>{
      const parts=routeCues.filter(cue=>cue.paragraphId===paragraph.id);
      assert.equal(parts.map(cue=>cue.text).join(''),paragraph.text);
      assert(parts.every(cue=>[...cue.text].length<=maximum));
      return{id:paragraph.id,start:parts[0].start,end:parts.at(-1).end,span:parts.at(-1).end-parts[0].start};
    });
    if(chapter.id===3){
      for(const window of paragraphWindows.slice(-2))assert(window.span>=.08,'Both formerly lost third-scroll tail paragraphs need real reading time.');
      assert(paragraphWindows.at(-1).end===.982);
    }
    assert.equal(activeNarrativeCue(routeCues,.995),null);
    routeChecks.push({route:routeName,maximum,passages:routeCues.length,minimumAutoplaySeconds:Math.min(...routeCues.map(cue=>(cue.end-cue.start)*sceneOptions[chapter.id].autoplayDuration)),paragraphWindows});
  }
  const cues = buildNarrativeTrack(chapter.id, stops);
  assert.equal(cues[0].start, 0); assert.equal(cues.at(-1).end, .982);
  cues.forEach((cue, index) => {
    assert(cue.end > cue.start); assert(cue.start >= 0 && cue.end <= .982);
    if (index) assert(Math.abs(cue.start - cues[index - 1].end) < 1e-12);
    assert.equal(activeNarrativeCue(cues, (cue.start + cue.end) / 2)?.id, cue.id);
  });
  for (const paragraph of chapter.paragraphs) assert.equal(cues.filter(cue => cue.paragraphId === paragraph.id).map(cue => cue.text).join(''), paragraph.text);
  assert.equal(activeNarrativeCue(cues, .995), null);
  assert.equal(activeNarrativeCue(cues, Number.NaN), null);
  assert.equal(activeNarrativeCue(cues, cues[1].start)?.id, cues[1].id);
  assert.equal(activeNarrativeCue(cues, cues[0].start)?.id, cues[0].id);
  mappings.push({ chapter: chapter.id, title: chapter.title, source: audit.source, sourceSha256: audit.sourceSha256, canonicalNodes: stops.length, ending: chapter.ending, routeChecks,cues });
  checks.push({ test: `chapter-${chapter.id}-real-prepared-and-authored-routes-all-responsive-passages-forward-backward-and-ending-gap`, paragraphCount: chapter.paragraphs.length, cueCount: cues.length,routeChecks, passed: true });
}
const css = await readFile(new URL('../src/styles/narrative-calligraphy.css', import.meta.url), 'utf8');
assert(css.includes('transition:opacity .65s')); assert(css.includes('transition:opacity .18s'));
assert(css.includes('pointer-events:none!important'));
checks.push({ test: 'css-fade-and-reduced-motion-keep-inputs-transparent', passed: true });
const report = { status: 'pass', testedAt: new Date().toISOString(), scope: 'CPU exact DOCX text, source storyboard order, route coverage and CSS contract. Actual viewport visibility and artwork occlusion require browser review.', sourceSha256: source.sourceSha256, checks };
await writeFile(new URL('../reports/new-scrolls/narrative-validation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
await writeFile(new URL('../reports/new-scrolls/narrative-mapping.json', import.meta.url), JSON.stringify({ basis: 'Actual prepareScene runtime reading progress is primary. Authored frame progress is also validated. Source-node anchors remain in order; bounded length-weighted reading windows prevent stationary tail scenes from erasing paragraphs.', mappings }, null, 2) + '\n');
console.log(JSON.stringify({ status: 'pass', tests: checks.length, sourceParagraphs: prose.length, passages: mappings.reduce((sum, chapter) => sum + chapter.cues.length, 0), root }));

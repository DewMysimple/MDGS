/** Regression check against the supplied prose already transcribed and verified
 * in the previous delivery. Does not claim a new verification of the DOCX bytes. */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';

const read = async file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
}).outputText).toString('base64');
const dataUrl = moduleUrl(await read('src/data/newNarrative.ts'));
const {narrativeChapters, narrativeSource} = await import(dataUrl);
const trackUrl = moduleUrl((await read('src/data/narrativeTrack.ts')).replace("'./newNarrative'", JSON.stringify(dataUrl)));
const {buildNarrativeTrack, activeNarrativeCue} = await import(trackUrl);
const source = await read('reports/new-scrolls/narrative-source.json');
const reference = JSON.parse(source);
assert.equal(narrativeSource.sha256, reference.sourceSha256);
assert.deepEqual(Object.values(narrativeChapters).flatMap(chapter => chapter.paragraphs.map(item => item.text)), reference.paragraphs.filter(text => !text.startsWith('画卷')));
const checks = [];
for (const chapter of Object.values(narrativeChapters)) {
  const manifest = JSON.parse(await read(`public/assets/new-scrolls/chapter-${chapter.id}/scene.json`));
  const duration = (manifest.frameRange[1] - manifest.frameRange[0]) * (manifest.fpsBase ?? 1) / manifest.fps;
  for (const maximum of [14, 28, 44, 68]) {
    const cues = buildNarrativeTrack(chapter.id, manifest.stops, maximum, duration);
    assert.equal(cues[0].start, 0); assert.equal(cues.at(-1).end, .982);
    for (const [index, cue] of cues.entries()) {
      assert(cue.end > cue.start);
      if (index) assert(Math.abs(cue.start - cues[index - 1].end) < 1e-12);
      assert.equal(activeNarrativeCue(cues, cue.start)?.id, cue.id);
      const minimum = maximum === 14 ? .65 : .9;
      assert((cue.end - cue.start) * duration >= minimum, `Chapter ${chapter.id}, ${cue.id}: actual source clock cannot complete its .65s fade.`);
    }
    for (const paragraph of chapter.paragraphs) assert.equal(cues.filter(cue => cue.paragraphId === paragraph.id).map(cue => cue.text).join(''), paragraph.text);
    assert.equal(activeNarrativeCue(cues, .995), null);
    checks.push({chapter: chapter.id, maximum, paragraphs: chapter.paragraphs.length, cues: cues.length,
      sourceDurationSeconds: duration, minimumPassageSeconds: Math.min(...cues.map(cue => (cue.end - cue.start) * duration)), passed: true});
  }
}
const report = {status: 'pass', completedAt: new Date().toISOString(),
  scope: 'All 25 paragraphs match the previously verified supplied-text transcription. Current 2.0 authored stops, actual source durations and every responsive passage retain contiguous reading windows and enough time for the ink fade. The original DOCX file is not reverified by this check.',
  referenceTranscriptSha256: createHash('sha256').update(source).digest('hex'), recordedOriginalDocxSha256: reference.sourceSha256, checks};
await writeFile(new URL('../reports/peony2-fidelity/narrative.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: 'pass', checks: checks.length, paragraphs: 25}));

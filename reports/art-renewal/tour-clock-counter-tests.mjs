import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';
import { inspectNativeFrameLabels } from '../../scripts/exhibition-tour-audio.mjs';

const source = await readFile(new URL('../../scripts/exhibition-tour-audio.mjs', import.meta.url), 'utf8');
const inner = source.match(/const processor = `([\s\S]*?)`;/)[1];
new vm.Script(inner);
const trace = offsets => offsets.map((offset, index) => ({ processSeq: index + 1,
  counterFrame: index * 128, currentFrame: index * 128 + offset, frames: 128 }));
const cases = [
  ['stable', [1024, 1024, 1024, 1024], true],
  ['initial isolated frozen tag', [896, 1024, 1024, 1024, 1024], true],
  ['middle isolated frozen tag', [1024, 1024, 1024, 896, 1024, 1024, 1024], true],
  ['four quantum constant frozen tag', [1024, 1024, 1024, 896, 768, 640, 512, 1024, 1024, 1024], true],
  ['initial four quantum constant frozen tag', [896, 768, 640, 512, 1024, 1024, 1024], true],
  ['terminal frozen tag', [1024, 1024, 1024, 896], false],
  ['terminal four quantum frozen tag', [1024, 1024, 1024, 1024, 1024, 896, 768, 640, 512], false],
  ['consecutive offset stale with advancing label', [1024, 1024, 1024, 896, 896, 1024, 1024, 1024], false],
  ['positive offset', [1024, 1024, 1024, 1152, 1024, 1024, 1024], false],
  ['persistent offset from missed process', [1024, 1024, 1024, 1152, 1152, 1152, 1152], false],
  ['persistent negative offset', [1024, 1024, 1024, 896, 896, 896, 896], false],
  ['frozen then different recovery offset', [1024, 1024, 1024, 896, 768, 1152, 1152, 1152], false],
  ['ambiguous anchor', [1024, 1024, 896, 896], false],
];
const results = cases.map(([name, offsets, expectedValid]) => {
  const audit = inspectNativeFrameLabels(trace(offsets));
  assert.equal(audit.valid, expectedValid, name);
  return { name, expectedValid, actualValid: audit.valid };
});
for (const [name, mutate] of [
  ['missing process', values => values.splice(3, 1)],
  ['counter changed', values => values[3].counterFrame += 128],
  ['process reorder', values => [values[3], values[4]] = [values[4], values[3]]],
  ['invalid NaN label', values => values[3].currentFrame = NaN],
]) {
  const values = trace(Array(8).fill(1024)); mutate(values);
  assert.equal(inspectNativeFrameLabels(values).valid, false, name);
  results.push({ name, expectedValid: false, actualValid: false });
}

// An explicit mock tests the packet builder only. It is never presented as
// native browser timing evidence; that requires the separate 60-second probe.
const messages = []; let Processor;
const box = {
  AudioWorkletProcessor: class {
    constructor() { this.port = { postMessage: (value, transfer) => messages.push(structuredClone(value, { transfer })) }; }
  },
  Float32Array, Uint32Array, ArrayBuffer, Math,
  sampleRate: 48000, currentFrame: 0, currentTime: 0,
  registerProcessor: (_name, constructor) => Processor = constructor,
};
vm.runInNewContext(inner, box);
const processor = new Processor(), expected = [];
for (let quantum = 0; quantum < 100; quantum++) {
  if (quantum === 50) processor.port.onmessage({ data: 'tail' });
  const left = Float32Array.from({ length: 128 }, (_, index) => Math.sin((quantum * 128 + index) * .03));
  const right = Float32Array.from({ length: 128 }, (_, index) => (quantum * 128 + index) / 20000);
  for (let index = 0; index < 128; index++) expected.push(left[index], right[index]);
  const frozenLag = quantum === 0 ? 128 : quantum >= 33 && quantum <= 36 ? (quantum - 32) * 128 : 0;
  box.currentFrame = 4096 + quantum * 128 - frozenLag; box.currentTime = box.currentFrame / 48000;
  assert.equal(processor.process([[left, right]], [[new Float32Array(128), new Float32Array(128)]]), true);
}
const packets = messages.filter(message => message.packetSeq);
const actual = new Float32Array(expected.length), observations = new Map(); let offset = 0;
messages.forEach((message, index) => assert.equal(message.portMessageSeq, index + 1));
packets.forEach((packet, index) => {
  assert.equal(packet.packetSeq, index + 1); assert.equal(packet.startFrame, offset / 2);
  const data = new Float32Array(packet.bytes); assert.equal(data.length, packet.frames * 2);
  actual.set(data, offset); offset += data.length;
  for (const quantum of packet.clockObservations) {
    const previous = observations.get(quantum.processSeq);
    if (previous) assert.deepEqual(previous, quantum);
    observations.set(quantum.processSeq, quantum);
  }
});
assert.equal(offset, expected.length); assert.deepEqual(actual, new Float32Array(expected));
const audit = inspectNativeFrameLabels([...observations.values()]);
assert.equal(audit.valid, true); assert.equal(audit.anchorOffset, 4096);
assert.deepEqual(audit.acceptedFrozenTagRuns.map(run => run.processCount), [1, 4]);
assert.equal(audit.processedFrames, 12800);
const report = { status: 'passed', completedAt: new Date().toISOString(),
  scope: 'Pure clock-classifier assertions and mocked-worklet structure; not native timing proof.',
  helperSha256: createHash('sha256').update(source).digest('hex'),
  driverSha256: createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),
  cases: results, structure: { frames: 12800, packets: packets.length, processCount: observations.size,
    sampleForSampleFloat32Equality: true, portAndPacketSequenceContinuous: true,
    absoluteAnchor: audit.anchorOffset, frozenRunLengths: audit.acceptedFrozenTagRuns.map(run => run.processCount) } };
await writeFile(new URL('./tour-clock-counter-tests.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, classifierCases: results.length, structure: report.structure }));

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Execute the production hook with deterministic React hook cells and a
// renderer-driven clock. GPU presentation is checked separately.
const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFile(path.join(root, file), 'utf8');
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
let cursor = 0, cells = [], effects = [];
const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => value === b[index]);
globalThis.hooks = {
  useRef(value) { const index = cursor++; return cells[index] ?? (cells[index] = { current: value }); },
  useState(value) {
    const index = cursor++;
    if (!cells[index]) cells[index] = { value: typeof value === 'function' ? value() : value };
    return [cells[index].value, next => { cells[index].value = typeof next === 'function' ? next(cells[index].value) : next; }];
  },
  useCallback(callback, deps) {
    const index = cursor++;
    if (!cells[index] || !same(cells[index].deps, deps)) cells[index] = { value: callback, deps };
    return cells[index].value;
  },
  useEffect(callback, deps) {
    const index = cursor++;
    if (!cells[index] || !same(cells[index].deps, deps)) { cells[index] = { deps }; effects.push(callback); }
  },
};
let time = 0, lastDrawTime = 0, requested = false;
globalThis.performance = { now: () => time };
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
};
globalThis.sessionStorage = { getItem() { return null; }, setItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const imports = {
  react: moduleUrl('export const {useCallback,useEffect,useRef,useState}=globalThis.hooks;'),
  '../data/sceneOptions': moduleUrl('export const sceneOptions={};'),
  '../data/sourceEdition': moduleUrl("export const activeSourceEdition='test';"),
};
for (const [name, file] of [['./scrollMotion', 'src/hooks/scrollMotion.ts'], ['../scene/sourceClock', 'src/scene/sourceClock.ts'], ['../scene/FramePacer', 'src/scene/FramePacer.ts']]) {
  imports[name] = moduleUrl(compile(await read(file)));
}
const source = compile(await read('src/hooks/useScrollController.ts'))
  .replace(/from (['"])([^'"]+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(imports[name])}`);
const { useScrollController } = await import(moduleUrl(source));
const timing = { sourceRevision: 'test', frameRange: [1, 101], fps: 10 };
let controller;
function render() {
  cursor = 0; controller = useScrollController(1, { timing });
  const pending = effects; effects = []; pending.forEach(callback => callback());
}
function tick(at, gridElapsed = at - lastDrawTime) {
  time = at;
  if (!requested) return;
  requested = false;
  const drawn = controller.driveFrame(at, gridElapsed);
  lastDrawTime = at;
  if (drawn.active) requested = true;
  render();
  assert.equal(drawn.progress, controller.progress, 'Each renderer tick uses the same progress sent to the UI');
}
render(); controller.setFrameDriverWake(() => { requested = true; }); controller.togglePlaying(); tick(5000);
assert.equal(controller.progress, 0, 'Initial preparation must stop autoplay');
assert.equal(requested, false);
controller.setPlaybackBlocked(false); tick(5000); tick(5100);
assert(Math.abs(controller.progress - .01) < 1e-12);
controller.setPlaybackBlocked(true); tick(5200);
const held = controller.progress; tick(15200);
assert.equal(controller.progress, held, 'Ten seconds of resource wait must not advance the film');
assert.equal(requested, false, 'An idle streaming wait must not keep requesting frames');
controller.setPlaybackBlocked(false); tick(15200); tick(15300);
assert(Math.abs(controller.progress - held - .01) < 1e-12, 'Resume must exclude all waiting time');
controller.setPlaybackBlocked(true); controller.seek(.4, true); render();
assert.equal(controller.progress, .4, 'Immediate manual seek remains effective while blocked');
controller.seek(.6); tick(15400);
assert(controller.progress > .4 && controller.progress < .6, 'Manual smoothing continues while autoplay is blocked');
time = 25400; controller.setPlaybackBlocked(false); tick(25416);
assert.equal(controller.target, .6, 'Unblocking during an existing manual RAF must exclude its long waiting interval');
tick(25516); assert(Math.abs(controller.progress - .61) < 1e-12);
controller.stop(); controller.seek(.9); tick(25616);
const manualPosition = controller.progress;
assert(manualPosition > .61 && manualPosition < .9);
time = 30616; controller.togglePlaying(); render();
assert.equal(controller.target, manualPosition, 'Starting playback discards an unfinished manual target');
tick(30632);
assert.equal(controller.progress, manualPosition, 'Starting playback during a manual RAF discards the old timestamp');
tick(32632);
assert(Math.abs(controller.progress - manualPosition - .01) < 1e-12, 'A slow RAF advances at most one authored frame');
timing.fps = 30; timing.fpsBase = 1.001;
const beforeFractionalRate = controller.progress;
tick(34632);
assert(Math.abs(controller.progress - beforeFractionalRate - .01) < 1e-12, 'Source fps_base is honored for the one-frame cap');
const beforeFineStep = controller.progress;
tick(34649, 1000 / 60);
assert(Math.abs(controller.progress - beforeFineStep - (1 / 60) / (100 * 1.001 / 30)) < 1e-12,
  'Playback follows the accepted display grid');
// 250 Hz cannot divide either target rate evenly. Verify that the accepted
// 32/36 ms and 16/20 ms refresh intervals retain the intended source speed.
const { FramePacer } = await import(imports['../scene/FramePacer']);
timing.frameRange = [1, 30001]; timing.fps = 30; timing.fpsBase = 1;
for (const rate of [30, 60]) {
  const pacer = new FramePacer(rate);
  const start = time + 100;
  const before = controller.progress;
  let accepted = 0, approvedMs = 0;
  for (let step = 0; step <= 5000; step++) {
    const now = start + step * 4;
    if (!pacer.shouldRender(now)) continue;
    if (accepted > 0) approvedMs += Math.min(pacer.elapsedMs, 1000 / 30);
    tick(now, pacer.elapsedMs);
    accepted++;
  }
  assert(Math.abs(accepted - rate * 20) <= 2, `${rate} fps at 250 Hz keeps its intended cadence`);
  assert(Math.abs(controller.progress - before - approvedMs / 1000000) < 1e-9,
    `${rate} fps preserves source speed across fractional refresh intervals`);
}
console.log(JSON.stringify({ status: 'pass', checks: [
  'initial-first-frame-gate', 'autoplay-pauses-during-wait', 'resume-excludes-wait-duration',
  'idle-wait-has-no-raf-loop', 'manual-immediate-seek-while-blocked', 'manual-smoothing-while-blocked',
  'resume-during-manual-raf-resets-clock',
  'manual-to-play-discards-pending-target', 'manual-to-play-resets-existing-raf-clock',
  'slow-frame-cannot-skip-authored-frames', 'source-fps-base-is-honored', 'display-ticks-keep-grid-time',
  'renderer-and-ui-use-same-progress', '30-and-60fps-on-250hz-display',
] }));

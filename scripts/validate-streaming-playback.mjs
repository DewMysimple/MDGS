import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

// Execute the production hook with deterministic React hook cells and RAF.
// No renderer/GPU is mocked here; renderer feedback is covered separately.
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
let time = 0, nextId = 0, raf = new Map(), timers = new Map();
globalThis.performance = { now: () => time };
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { at: time + delay, callback }); return id; },
  clearTimeout(id) { timers.delete(id); },
};
globalThis.sessionStorage = { getItem() { return null; }, setItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = callback => { const id = ++nextId; raf.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => raf.delete(id);
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
  cursor = 0; controller = useScrollController(1, { timing, frameRateLimit: 60 });
  const pending = effects; effects = []; pending.forEach(callback => callback());
}
function tick(at) {
  time = at;
  for (const [id, timer] of [...timers]) if (timer.at <= at) { timers.delete(id); timer.callback(); }
  const pending = [...raf.values()]; raf.clear();
  pending.forEach(callback => callback(at)); render();
}
render(); controller.togglePlaying(); tick(5000);
assert.equal(controller.progress, 0, 'Initial preparation must stop autoplay');
assert.equal(raf.size, 0);
controller.setPlaybackBlocked(false); tick(5000); tick(5100);
assert(Math.abs(controller.progress - .01) < 1e-12);
controller.setPlaybackBlocked(true); tick(5200);
const held = controller.progress; tick(15200);
assert.equal(controller.progress, held, 'Ten seconds of resource wait must not advance the film');
assert.equal(raf.size, 0, 'An idle streaming wait must not keep the controller RAF alive');
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
tick(34649);
assert(Math.abs(controller.progress - beforeFineStep - (1 / 60) / (100 * 1.001 / 30)) < 1e-12,
  'Accepted display ticks retain their exact sub-frame clock interval');
console.log(JSON.stringify({ status: 'pass', checks: [
  'initial-first-frame-gate', 'autoplay-pauses-during-wait', 'resume-excludes-wait-duration',
  'idle-wait-has-no-raf-loop', 'manual-immediate-seek-while-blocked', 'manual-smoothing-while-blocked',
  'resume-during-manual-raf-resets-clock',
  'manual-to-play-discards-pending-target', 'manual-to-play-resets-existing-raf-clock',
  'slow-raf-cannot-skip-authored-frames', 'source-fps-base-is-honored', 'fast-raf-keeps-sub-frame-timing',
] }));

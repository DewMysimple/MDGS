import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
async function sourceModule(name) {
  const source = await fs.readFile(path.join(root, 'src/scene', name + '.ts'), 'utf8');
  let js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
  if (name === 'sourceViewport') {
    const quality = await fs.readFile(path.join(root, 'src/scene/renderQuality.ts'), 'utf8');
    const compiled = ts.transpileModule(quality, { compilerOptions: { module: ts.ModuleKind.ES2022 } }).outputText;
    js = js.replace("'./renderQuality'", JSON.stringify('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')));
  }
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}
const { sourceDuration, advanceSourceProgress } = await sourceModule('sourceClock');
const { fitSourceViewport, sourceTargetSize } = await sourceModule('sourceViewport');
const chapters = [[1, 3024], [33, 2184], [1, 2068], [1, 1800]];
const checks = [];
for (const [index, frameRange] of chapters.entries()) {
  const timing = { sourceRevision: 'peony-2.0-2026-10-23', frameRange, fps: 30, fpsBase: 1 };
  const duration = sourceDuration(timing, 154);
  assert.equal(duration, (frameRange[1] - frameRange[0]) / 30);
  for (const rate of [60, 30, 15, 10]) {
    let progress = 0, elapsed = 0;
    while (elapsed < duration - 1e-9) {
      const dt = Math.min(1 / rate, duration - elapsed);
      progress = advanceSourceProgress(progress, dt, duration);
      elapsed += dt;
    }
    assert(Math.abs(progress - 1) < 1e-9, `chapter ${index + 1} source duration at ${rate} Hz`);
    assert.equal(advanceSourceProgress(1, 1 / rate, duration), 1);
  }
  for (const [width, height] of [[360, 565], [1626, 737], [800, 220]]) {
    const render = { width: index === 3 ? 1512 : 1920, height: 1080, pixelAspectX: 1, pixelAspectY: 1 };
    const view = fitSourceViewport(width, height, render);
    assert(Math.abs(view.width / view.height - render.width / render.height) < 1e-12);
    assert(view.x >= -1e-9 && view.y >= -1e-9 && view.x + view.width <= width + 1e-9 && view.y + view.height <= height + 1e-9);
    // Both horizontal and vertical source gates remain visible, without cropping.
    assert(Math.abs(view.x * 2 + view.width - width) < 1e-9);
    assert(Math.abs(view.y * 2 + view.height - height) < 1e-9);
  }
  checks.push({ chapter: index + 1, frameRange, sourceDurationSeconds: duration, displayRates: [60, 30, 15, 10], passed: true });
}
assert.equal(sourceDuration(undefined, 154), 154);
assert(Math.abs(sourceDuration({ sourceRevision: 'native', frameRange: [1, 301], fps: 30, fpsBase: 1.001 }, 154) - 10.01) < 1e-12);
assert.throws(() => sourceDuration({ sourceRevision: 'native', frameRange: [1, 1], fps: 30 }, 154));
const anamorphic = fitSourceViewport(1000, 500, { width: 1000, height: 1000, pixelAspectX: 2, pixelAspectY: 1 });
assert.deepEqual(anamorphic, { x: 0, y: 0, width: 1000, height: 500, aspect: 2 });
for (const [width, height] of [[0, 0], [390, 844], [960, 540], [1512, 1080], [1920, 1080], [3840, 2160], [7680, 4320], [8192, 8192]]) {
  for (const ratio of [1, 1.65, 2, 3]) {
    const size = sourceTargetSize(width, height, ratio);
    assert(size.width >= 1 && size.height >= 1 && size.width <= 4096 && size.height <= 4096);
    assert(size.width * size.height <= 4 * 1024 * 1024);
    assert(size.width * size.height * 60 <= 240 * 1024 * 1024);
  }
}
assert.deepEqual(sourceTargetSize(960, 540, 1), { width: 1920, height: 1080, scale: 2 });
assert.throws(() => sourceTargetSize(Infinity, 540, 1));
checks.push({ test: 'HDR-and-depth-budget-through-8k-and-3x-DPR', maximumPixels: 4194304, maximumTargetBytes: 251658240, passed: true });
const result = { status: 'pass', completedAt: new Date().toISOString(), scope: 'Current source clock, full camera gate and bounded HDR/depth memory; includes low display rates, fractional Blender fps_base, narrow windows and high-DPI displays.', checks };
await fs.mkdir(path.join(root, 'reports/peony2-fidelity'), { recursive: true });
await fs.writeFile(path.join(root, 'reports/peony2-fidelity/clock-and-viewport.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));

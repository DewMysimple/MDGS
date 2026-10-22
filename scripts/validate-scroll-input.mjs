import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

const compiled = ts.transpileModule(await readFile(new URL('../src/hooks/scrollMotion.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { wheelProgress, nudgedTarget, smoothProgress, dragGlide } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const checks = [];
const check = (name, run) => { run(); checks.push({ name, passed: true }); };
const close = (a, b, epsilon = 1e-12) => assert(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);

check('default-100-css-pixels-is-half-percent', () => close(wheelProgress(0, 100, 0, 800), 0.005));
check('line-and-pixel-device-units-agree', () => close(wheelProgress(0, 3, 1, 800), wheelProgress(0, 48, 0, 800)));
check('dominant-horizontal-axis-and-reverse-directions', () => {
  close(wheelProgress(-100, 5, 0, 800), -0.005);
  close(wheelProgress(5, -100, 0, 800), -0.005);
});
check('fine-trackpad-deltas-remain-proportional', () => close(wheelProgress(0, 0.4, 0, 800), 0.00002));
check('page-mode-and-extreme-driver-events-are-bounded', () => {
  close(wheelProgress(0, 1, 2, 800), 0.008);
  close(wheelProgress(0, 100000, 0, 800), 0.008);
  close(wheelProgress(0, -100000, 0, 800), -0.008);
});
check('setting-scales-distance-without-changing-input-units', () => {
  close(wheelProgress(0, 100, 0, 800, 0.1), 0.001);
  close(wheelProgress(0, 100, 0, 800, 2), 0.02);
});
check('malformed-events-cannot-poison-progress', () => {
  assert.equal(wheelProgress(0, NaN, 0, 800), 0);
  assert.equal(wheelProgress(0, Infinity, 0, 800), 0);
  assert.equal(nudgedTarget(0.2, 0.3, NaN), 0.3);
});
check('rapid-wheel-events-cannot-queue-an-entire-world', () => {
  let target = 0.4;
  for (let event = 0; event < 1000; event++) target = nudgedTarget(0.4, target, 0.008);
  close(target, 0.46);
});
check('reversing-direction-discards-stale-forward-travel', () => close(nudgedTarget(0.4, 0.46, -0.005), 0.395));
check('keyboard-step-and-scroll-endpoints-still-work', () => {
  close(nudgedTarget(0.2, 0.2, 0.035), 0.235);
  close(nudgedTarget(0.999, 0.999, 0.008), 1);
  close(nudgedTarget(0.001, 0.001, -0.008), 0);
});
for (const fps of [15, 30, 60, 120, 144]) {
  check(`same-smoothing-time-at-${fps}hz`, () => {
    let progress = 0.2;
    const seconds = 0.4;
    const count = Math.ceil(fps * seconds);
    for (let frame = 0; frame < count; frame++) progress = smoothProgress(progress, 0.3, seconds / count, 180);
    close(progress, 0.3 - 0.1 * Math.exp(-seconds / 0.18));
  });
  check(`same-drag-inertia-distance-at-${fps}hz`, () => {
    let velocity = 0.12, distance = 0;
    const count = Math.ceil(fps * 0.5);
    for (let frame = 0; frame < count; frame++) {
      const step = dragGlide(velocity, 0.5 / count);
      distance += step.distance; velocity = step.velocity;
    }
    close(distance, 0.12 * (1 - Math.exp(-4)) / 8);
    close(velocity, 0.12 * Math.exp(-4));
  });
}
check('smoothing-settles-exactly-and-never-overshoots', () => {
  let progress = 0;
  for (let frame = 0; frame < 500; frame++) {
    const next = smoothProgress(progress, 0.008, 1 / 60, 180);
    assert(next >= progress && next <= 0.008);
    progress = next;
  }
  assert.equal(progress, 0.008);
});
check('larger-smoothing-setting-eases-more-gradually', () => {
  assert(smoothProgress(0.2, 0.3, 0.1, 500) < smoothProgress(0.2, 0.3, 0.1, 60));
});

const report = {
  status: 'pass', testedAt: new Date().toISOString(),
  scope: 'CPU checks for device wheel units, bounded jumps and queued input, direction reversal, exact settling, and equal elapsed-time smoothing/inertia across 15–144 Hz. Browser lifecycle is tested separately.',
  checks,
};
await mkdir(new URL('../reports/new-scrolls/', import.meta.url), { recursive: true });
await writeFile(new URL('../reports/new-scrolls/validation-scroll-input.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, checks: checks.length }));

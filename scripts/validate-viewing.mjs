import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { prepareScene } = await server.ssrLoadModule('/src/scene/prepareScene.ts');
  const results = [];
  for (let id = 1; id <= 4; id++) {
    const source = JSON.parse(await readFile(new URL(`../public/assets/chapter-${id}/scene.json`, import.meta.url), 'utf8'));
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
    // These two authored crane shots must remain outside the interactive reading path.
    if (id === 1) assert.equal(Math.round(scene.cameras.at(-1).frame), 13474);
    if (id === 2) {
      assert.equal(Math.round(scene.cameras.at(-1).frame), 5521);
      assert(scene.cameras.at(-1).position[2] < source.cameras.at(-1).position[2] / 2);
    }
    assert.deepEqual(scene.meshes, source.meshes, 'View normalization must not modify scene geometry');
    results.push({ chapter: id, stops: scene.stops.length, cameraSamples: scene.cameras.length, sourceFrameRange: [scene.cameras[0].frame, scene.cameras.at(-1).frame], passed: true });
  }
  await writeFile(new URL('../reports/validation-viewing.json', import.meta.url), JSON.stringify(results, null, 2));
  console.log('All four continuous viewing paths passed. Original geometry is unchanged.');
} finally { await server.close(); }

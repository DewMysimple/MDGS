/** Source graph/driver CPU validation. GPU compilation is checked separately. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
const report = { status: 'running', startedAt: new Date().toISOString(), chapters: [], checks: [],
  approximation: 'Source graph links, sampled scalar/driver timing, Map Range interpolation and coordinate matrices are retained. Noise uses normalized value-noise fBM with source detail/roughness/lacunarity/distortion. 4D W is embedded in 3D; Voronoi uses matching source dimensionality/F1/Euclidean with a different deterministic seed hash. These fields are WebGL approximations, not pixel-identical Cycles Noise/Voronoi. Hidden and proven spatially invariant completed alpha masks take uniform fast paths; native completed UV feathers retain the source graph. No whole-layer UV deformation, new bloom, geometry change or opacity animation is introduced.' };
const owned = [];
try {
  const { SourceMaterialEffects, compileSourceEffectGraph, sampleSourceScalar } = await server.ssrLoadModule('/src/scene/SourceMaterialEffects.ts');
  let scalarSamples = 0, registered = 0, unsupported = 0, hiddenStates = 0, completeStates = 0, completeUvSamples = 0, invariantCompletedGraphs = 0, spatialCompletedGraphs = 0;
  const edgeCoordinates = [0, .005, .02, .08, .16, .5, .84, .9, .98, .995, 1];
  const completedUvs = edgeCoordinates.flatMap(u => edgeCoordinates.map(v => [u, v]));
  const allPrograms = new Set();
  for (let chapter = 1; chapter <= 4; chapter++) {
    const manifest = JSON.parse(await readFile(new URL(`../public/assets/new-scrolls/chapter-${chapter}/scene.json`, import.meta.url), 'utf8'));
    const effects = manifest.sourceEffects, range = manifest.frameRange;
    assert(effects?.materials?.length > 0);
    const effectIds = new Set(effects.materials.map(source => source.materialId));
    const effectUvs = manifest.meshes.filter(mesh => effectIds.has(mesh.material)).flatMap(mesh => mesh.uvs ?? []);
    assert(effectUvs.length && effectUvs.every(value => value >= 0 && value <= 1), `Chapter ${chapter} effect UVs must remain inside the proven unit coordinate domain.`);
    for (const [name, track] of Object.entries(effects.scalarTracks)) {
      for (const sample of track) {
        const progress = (sample.frame - range[0]) / (range[1] - range[0]);
        assert(Math.abs(sampleSourceScalar(track, progress, range) - sample.value) < 1e-7, name);
        scalarSamples++;
      }
      if (track.length > 1) {
        const index = Math.floor((track.length - 1) / 2), a = track[index], b = track[index + 1];
        const middle = ((a.frame + b.frame) / 2 - range[0]) / (range[1] - range[0]);
        assert(Math.abs(sampleSourceScalar(track, middle, range) - (a.value + b.value) / 2) < 1e-7);
      }
    }
    const director = new SourceMaterialEffects(effects, range), graphs = [];
    const world = effects.coordinateObjects?.[0]?.matrix?.slice(12, 15) ?? [0, 0, 0];
    let hooks = 0;
    for (const source of effects.materials) {
      const graph = compileSourceEffectGraph(effects, source); graphs.push({ source, graph });
      assert.deepEqual(graph.unsupported, [], `${chapter}/${source.name}`); unsupported += graph.unsupported.length;
      allPrograms.add(graph.programKey);
      const definition = manifest.meshes.find(mesh => mesh.material === source.materialId);
      assert(definition, `An active source effect must map to an exported mesh: ${source.name}`);
      const geometry = new THREE.PlaneGeometry(), map = new THREE.Texture();
      const material = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: .63, alphaTest: .02 });
      const originalCompile = material.onBeforeCompile, originalCache = material.customProgramCacheKey;
      const mesh = new THREE.Mesh(geometry, material); owned.push(geometry, map, material);
      assert(director.register(mesh, definition)); registered++;
      const shader = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader, uniforms: {} };
      material.onBeforeCompile(shader, {});
      assert(shader.vertexShader.includes('mdgsEffectWorld=(modelMatrix*vec4(position,1.0)).xyz'));
      assert(shader.fragmentShader.includes('if(mdgsEffectMode < -0.5) discard;'));
      assert(shader.fragmentShader.indexOf('if(mdgsEffectMode < 0.5)') < shader.fragmentShader.indexOf('vec4 mdgsGraph=mdgsSourceGraph(diffuseColor)'));
      assert(shader.uniforms.mdgsEffectMode); hooks++;
      assert.equal(material.opacity, .63); assert.equal(material.map, map); assert.equal(mesh.geometry, geometry);
      for (const progress of [0, .2, .5, .8, 1]) {
        const mode = graph.update(progress, range), sampled = graph.evaluate([.37, .62], [.4, .3, .2, 1], [0, 0, 0], world);
        assert(sampled.every(Number.isFinite), `${source.name} produced invalid fragment values`);
        assert(sampled[3] >= -1e-6 && sampled[3] <= 1.00001);
        if (mode < 0) { assert(sampled[3] < .001, `Hidden fast path disagrees with ${source.name} at ${progress}: ${sampled}`); hiddenStates++; }
        if (mode > 0) {
          assert(graph.fullAlphaInvariant && Math.abs(sampled[3] - graph.fullAlpha) < .0001 && graph.fullAlpha > 0, `Full fast path disagrees with ${source.name} at ${progress}: ${sampled}`);
          for (const uv of completedUvs) {
            const alpha = graph.evaluate(uv, [.4, .3, .2, 1], [17, -9, 4], world.map((value, i) => value + [23, -11, 7][i]))[3];
            assert(Math.abs(alpha - graph.fullAlpha) < .0001, `Completed alpha fast path lost spatial mask at ${chapter}/${source.name}/${progress}/UV ${uv}: ${alpha} versus ${graph.fullAlpha}`);
            completeUvSamples++;
          }
          completeStates++;
        }
      }
      // Test the proof's actual completed state even when the native final frame
      // fades this layer back to zero. Edge/corner samples guard source feathers.
      const before = graph.tracks.map(track => track.uniform.value);
      graph.tracks.forEach(track => { track.uniform.value = track.max; });
      for (const uv of completedUvs) {
        const alpha = graph.evaluate(uv, [.4, .3, .2, 1], [17, -9, 4], world)[3];
        assert(alpha >= graph.completedAlphaBounds[0] - 1e-7 && alpha <= graph.completedAlphaBounds[1] + 1e-7, `Completed alpha escaped proven interval at ${chapter}/${source.name}/UV ${uv}`);
        if (graph.fullAlphaInvariant) assert(Math.abs(alpha - graph.fullAlpha) < 1e-7, `Invalid spatial invariance proof: ${chapter}/${source.name}/UV ${uv}`);
        completeUvSamples++;
      }
      graph.tracks.forEach((track, index) => { track.uniform.value = before[index]; });
      if (graph.fullAlphaInvariant) invariantCompletedGraphs++; else spatialCompletedGraphs++;
      source.__restoreCheck = () => { assert.equal(material.onBeforeCompile, originalCompile); assert.equal(material.customProgramCacheKey, originalCache); };
    }
    // Seek forwards and backwards: uniforms always follow source time, independent
    // of environmental motion or existing material opacity.
    for (const progress of [1, 0, .75, .25, .5, 1]) director.update(progress);
    const finalDiagnostics = director.getDiagnostics();
    assert.equal(finalDiagnostics.registered, effects.materials.length);
    assert.equal(finalDiagnostics.unsupported, 0);
    const begin = performance.now();
    for (let frame = 0; frame < 720; frame++) director.update((frame % 240) / 239);
    const updateMs = (performance.now() - begin) / 720;
    if (chapter === 1) {
      const burn = graphs.filter(({ source }) => source.kind === 'burn'); assert.equal(burn.length, 2);
      const driverFrames = [2539, 2540, 2553, 2568, 2582, 2596, 2597];
      for (const frame of driverFrames) {
        const progress = (frame - range[0]) / (range[1] - range[0]);
        burn.forEach(({ graph }) => graph.update(progress, range));
        const a = burn[0].graph.evaluate([.1, .2], [.4, .3, .2, 1], [10, 2, 5], world);
        const b = burn[1].graph.evaluate([.8, .9], [.4, .3, .2, 1], [-1, 4, 6], world);
        assert(Math.abs(a[3] - b[3]) < 1e-7, `Shared-coordinate mask seam at source frame ${frame}`);
      }
      report.checks.push({ test: 'first-scroll-two-burn-planes-share-world-coordinate-mask-and-driver-time', frames: driverFrames, passed: true });
      const ink = graphs.find(({ source }) => source.kind === 'ink' && source.name.startsWith('04'));
      const curve = ink.graph.tracks[0], middle = curve.track.find(sample => sample.value > .5 && sample.value < .7);
      ink.graph.update((middle.frame - range[0]) / (range[1] - range[0]), range);
      assert(ink.graph.evaluate([.05, .5])[3] > ink.graph.evaluate([.95, .5])[3], 'Native first-scroll UV reveal must advance from the source X edge.');
      report.checks.push({ test: 'native-uv-mask-direction-retained', frame: middle.frame, passed: true });
    }
    if (chapter === 2) {
      const river = graphs.find(({ source }) => source.materialId === 24);
      assert(river?.source.name.includes('右下河流与岸景'));
      assert.equal(river.graph.update(.5, range), 0, 'A completed timed reveal must retain its native spatial feather.');
      assert.equal(river.graph.fullAlphaInvariant, false);
      const samples = [.02, .08, .5, .9, .98].map(u => ({ u, alpha: river.graph.evaluate([u, .5])[3] }));
      assert(Math.abs(samples[0].alpha - .0070860530422212535) < 1e-8);
      assert(Math.abs(samples[1].alpha - .4169100777890908) < 1e-8);
      assert(Math.abs(samples[3].alpha - .6920680729353567) < 1e-8);
      assert.equal(samples[2].alpha, 1);
      report.checks.push({ test: 'completed-river-keeps-native-left-and-right-16-percent-uv-feathers', sourceMaterialId: 24,
        progress: .5, mode: river.graph.mode, completedAlphaBounds: river.graph.completedAlphaBounds, samples, passed: true });
    }
    director.dispose(); for (const source of effects.materials) source.__restoreCheck();
    report.chapters.push({ chapter, sourceMaterials: effects.materials.length, scalarTracks: Object.keys(effects.scalarTracks).length,
      reachableNodes: graphs.reduce((sum, item) => sum + item.graph.nodeCount, 0), shaderTopologies: new Set(graphs.map(item => item.graph.programKey)).size,
      shaderHooks: hooks, provenConstantCompletedGraphs: graphs.filter(item => item.graph.fullAlphaInvariant).length,
      retainedSpatialCompletedGraphs: graphs.filter(item => !item.graph.fullAlphaInvariant).length,
      finalDiagnostics, sourceClockUpdateCpuMs: updateMs, passed: true });
  }
  assert(hiddenStates > 0 && completeStates > 0);
  assert(invariantCompletedGraphs >= registered * .8, 'The conservative proof must retain lightweight completion for the great majority of source effects.');
  report.checks.push({ test: 'completed-alpha-spatial-interval-proof-and-11-by-11-uv-grid', uvGridSamples: completedUvs.length,
    completeUvSamples, invariantCompletedGraphs, spatialCompletedGraphs, passed: true });
  report.checks.push({ test: 'all-source-material-graphs-and-real-scalar-driver-samples', registered, scalarSamples, unsupported, hiddenStates, completeStates, uniqueShaderTopologies: allPrograms.size, passed: true });
  report.status = 'pass';
} catch (error) { report.status = 'fail'; report.failure = { message: error.message, stack: error.stack }; throw error; }
finally {
  owned.forEach(resource => resource.dispose()); await server.close();
  report.completedAt = new Date().toISOString();
  const directory = new URL('../reports/peony-2.0/', import.meta.url); await mkdir(directory, { recursive: true });
  await writeFile(new URL('validation-source-effects-cpu.json', directory), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, chapters: report.chapters, checks: report.checks }, null, 2));
}

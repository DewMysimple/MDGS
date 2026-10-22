/** Peony 2.0 acceptance against fresh, independent Blender evidence.
 *
 * node scripts/validate-peony2-fidelity.mjs --structural-only
 * node scripts/validate-peony2-fidelity.mjs --capture-browser
 * node scripts/validate-peony2-fidelity.mjs --check-binding
 * node scripts/validate-peony2-fidelity.mjs --pixel-captures <capture-manifest.json>
 *
 * Structural-only is explicitly not a visual acceptance. The full command
 * requires source-aspect artwork captures for every native reference frame.
 * Old new-scrolls reports are neither read nor overwritten.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile, mkdir, stat, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {gunzipSync} from 'node:zlib';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'reports/peony2-fidelity');
const args = process.argv.slice(2);
const value = flag => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
const structuralOnly = args.includes('--structural-only');
const captureBrowser = args.includes('--capture-browser');
let pixelManifest = value('--pixel-captures');
const expectedMeshCounts = [149, 58, 79, 52];
const expectedRawImageCounts = [99, 35, 66, 43];
const expectedStops = [15, 7, 9, 9];
const expectedNativeFrameCounts = [3, 3, 29, 24];
const fixedNativeFrames = [[2540, 2568, 2596], [350, 656, 955],
  [1, 31, 61, 471, 951, 1206, 1236, 1627, 1671, 1926, 1956],
  [1, 45, 90, 195, 218, 1407, 1575, 1596]];
const report = {status: 'running', startedAt: new Date().toISOString(),
  mode: structuralOnly ? 'structural-only' : 'structural-and-native-pixel-comparison',
  scope: 'Current Peony 2.0 source hashes, independently reopened native evidence, exact geometry/morph/camera clocks, symmetric original image provenance and complete lossless decoded RGBA. Full mode also compares every native keyframe to a bound actual browser artwork capture.',
  chapters: [], pixels: [], errors: []};
const absolute = file => path.isAbsolute(file) ? file : path.join(root, file);
const json = async file => JSON.parse(await readFile(absolute(file), 'utf8'));
const digest = async file => createHash('sha256').update(await readFile(absolute(file))).digest('hex');
const reportFile = structuralOnly ? 'validation-structural.json' : 'validation-fidelity.json';
const save = () => writeFile(path.join(output, reportFile), JSON.stringify(report, null, 2) + '\n');
const rawCache = absolute(value('--raw-cache') || '.asset-cache/new-scrolls/peony-2.0-2026-10-23');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonicalSha = object => sha(JSON.stringify(object));
const portable = file => file.split(path.sep).join('/');

async function filesBelow(directory) {
  const result = [];
  for (const entry of await readdir(absolute(directory), {withFileTypes: true})) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await filesBelow(file));
    else if (entry.isFile()) result.push(file);
  }
  return result.sort();
}

async function hashFiles(files) {
  const result = {};
  for (const file of [...files].sort()) result[portable(file)] = await digest(file);
  return result;
}

async function currentSourceHashes() {
  return hashFiles([...await filesBelow('src'), 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json',
    ...((await readdir(root)).filter(file => /^tsconfig.*\.json$/.test(file)))]);
}

function requiredReferenceFrames(chapter, evidence) {
  const nearest = new Map();
  for (const track of evidence.materialParameterTracks) {
    if (!['特效进度', '选择性出场', '灰度溶解'].some(word => track.path.includes(word))) continue;
    assert.equal(track.samples.length, evidence.frameRange[1] - evidence.frameRange[0] + 1);
    for (const target of [0.1, 0.5, 0.9]) {
      const identity = JSON.stringify([track.material, track.path, target]);
      for (let i = 0; i < track.samples.length; i++) {
        const distance = Math.abs(track.samples[i] - target);
        if (!nearest.has(identity) || distance < nearest.get(identity).distance) nearest.set(identity,
          {distance, frame: evidence.frameRange[0] + i});
      }
    }
  }
  return [...new Set([...fixedNativeFrames[chapter - 1], ...[...nearest.values()]
    .filter(row => row.distance < 0.12).map(row => row.frame)])].sort((a, b) => a - b);
}

/** Recompile in memory: an old dist cannot be bound to newly edited TS/GLSL. */
async function reproduceCurrentBuild() {
  const {build} = await import('vite');
  const outputs = await build({root, logLevel: 'error', build: {
    write: false, emptyOutDir: false, copyPublicDir: false,
  }});
  const expected = {};
  for (const output of Array.isArray(outputs) ? outputs : [outputs]) {
    for (const file of output.output) {
      const bytes = file.type === 'chunk' ? Buffer.from(file.code)
        : typeof file.source === 'string' ? Buffer.from(file.source) : Buffer.from(file.source);
      expected[file.fileName] = sha(bytes);
      assert.equal(await digest(`dist/${file.fileName}`), expected[file.fileName],
        'Actual dist differs from an independent in-memory build of the current source: ' + file.fileName);
    }
  }
  assert(expected['index.html'], 'The current build did not emit index.html.');
  const actualCode = (await filesBelow('dist')).filter(file => /\.(?:js|css)$/.test(file)).map(file => file.slice(5));
  assert.deepEqual(actualCode.sort(), Object.keys(expected).filter(file => /\.(?:js|css)$/.test(file)).sort(),
    'Dist contains stale or missing compiled JS/CSS.');
  return {method: 'independent-vite-build-write-false', passed: true,
    files: Object.fromEntries(Object.entries(expected).sort(([a], [b]) => a.localeCompare(b)))};
}

async function captureArtifactBinding(reproduce = false) {
  assert(!args.includes('--dev'), 'Final pixel acceptance requires production dist; dev captures are diagnostic only.');
  const beforeSource = await currentSourceHashes();
  const reproduction = reproduce ? await reproduceCurrentBuild() : null;
  const buildFiles = await hashFiles((await filesBelow('dist')).filter(file => file === 'dist/index.html' || /\.(?:js|css)$/.test(file)));
  const sourceFiles = await currentSourceHashes();
  assert.deepEqual(sourceFiles, beforeSource, 'Product source changed during the independent current-build check.');
  const chapters = {};
  for (const chapter of [1, 2, 3, 4]) {
    const directory = `public/assets/new-scrolls/chapter-${chapter}`;
    const files = {};
    for (const file of await filesBelow(directory)) {
      const relative = file.slice('public/'.length);
      files[relative] = await digest(file);
      assert.equal(await digest(`dist/${relative}`), files[relative],
        'Production copy differs from the currently verified public asset: ' + relative);
    }
    chapters[chapter] = {sourceMaterialsSha256: files[`assets/new-scrolls/chapter-${chapter}/source-materials.json`],
      renderSettingsSha256: files[`assets/new-scrolls/chapter-${chapter}/render-settings.json`],
      sceneSha256: files[`assets/new-scrolls/chapter-${chapter}/scene.json`], files};
  }
  assert.deepEqual(await currentSourceHashes(), sourceFiles, 'Product source changed while binding production assets.');
  const content = {schemaVersion: 1, buildFiles, sourceFiles, chapters};
  return {...content, sha256: canonicalSha(content), ...(reproduction ? {buildReproduction: reproduction} : {})};
}

async function bindResponseBody(relative, expected, body, contentEncoding) {
  const actual = sha(body);
  let bodyRepresentation = 'file-bytes';
  if (actual !== expected && relative.endsWith('.gz') && /\bgzip\b/.test(contentEncoding)) {
    assert.equal(actual, sha(gunzipSync(await readFile(absolute(`dist/${relative}`)))),
      'Actual browser HTTP-decoded payload differs from bound dist: ' + relative);
    bodyRepresentation = 'http-gzip-decoded';
  } else assert.equal(actual, expected, 'Actual browser response differs from bound dist: ' + relative);
  return {sha256: actual, fileSha256: expected, contentEncoding, bodyRepresentation};
}

async function verifyCaptureBinding(captures, current) {
  assert.equal(captures.status, 'captured', 'Browser capture did not finish successfully.');
  assert.deepEqual(captures.errors, [], 'Browser capture contains resource or rendering errors.');
  assert(captures.artifactBinding?.buildReproduction?.passed,
    'Capture lacks independent current-source/dist reproduction and complete artifact binding.');
  assert.equal(captures.artifactBinding.sha256, current.sha256,
    'Capture is stale: current source, production code, scene, materials, settings or pigment/field bytes changed.');
  const recorded = captures.artifactBinding;
  assert.equal(recorded.sha256, canonicalSha({schemaVersion: recorded.schemaVersion,
    buildFiles: recorded.buildFiles, sourceFiles: recorded.sourceFiles, chapters: recorded.chapters}));
  assert(captures.actualResponses?.['index.html'], 'The actual served HTML was not bound.');
  for (const [url, response] of Object.entries(captures.actualResponses)) {
    const expected = recorded.buildFiles[`dist/${url}`]
      || Object.values(recorded.chapters).map(chapter => chapter.files[url]).find(Boolean);
    assert(expected, 'Actual served code/asset was not part of the bound build: ' + url);
    assert.equal(response.fileSha256, expected, 'The response was bound to a different disk resource: ' + url);
    if (response.bodyRepresentation === 'http-gzip-decoded') {
      assert(/\bgzip\b/.test(response.contentEncoding), 'Decoded HTTP body lacks gzip transfer metadata.');
      assert.equal(response.sha256, sha(gunzipSync(await readFile(absolute(`dist/${url}`)))),
        'Actual HTTP-decoded resource differs from the bound gzip payload: ' + url);
    } else {
      assert.equal(response.bodyRepresentation, 'file-bytes');
      assert.equal(response.sha256, expected, 'Actual served bytes differ from bound dist: ' + url);
    }
  }
  for (const file of Object.keys(recorded.buildFiles)) assert(captures.actualResponses[file.slice(5)],
    'A compiled HTML/JS/CSS file was not observed in the actual browser responses: ' + file);
  for (const chapter of [1, 2, 3, 4]) for (const file of ['scene.json', 'source-materials.json', 'render-settings.json']) {
    const url = `assets/new-scrolls/chapter-${chapter}/${file}`;
    assert(captures.actualResponses[url], 'The browser did not actually consume a bound native scene/material/settings JSON: ' + url);
  }
}

function finite(value, label) {
  if (typeof value === 'number') assert(Number.isFinite(value), `Non-finite value: ${label}`);
  else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) finite(item, `${label}.${key}`);
}

function sampleTrack(samples, frame) {
  assert(samples.length > 0, 'Empty native parameter track.');
  if (frame <= samples[0].frame) return samples[0].value;
  if (frame >= samples.at(-1).frame) return samples.at(-1).value;
  let low = 0, high = samples.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (samples[middle].frame <= frame) low = middle; else high = middle;
  }
  const a = samples[low], b = samples[high], t = (frame - a.frame) / (b.frame - a.frame);
  return Array.isArray(a.value) ? a.value.map((v, i) => v + (b.value[i] - v) * t)
    : a.value + (b.value - a.value) * t;
}

function close(actual, expected, label, tolerance = 2e-6) {
  const a = Array.isArray(actual) ? actual : [actual];
  const b = Array.isArray(expected) ? expected : [expected];
  assert.equal(a.length, b.length, label + ': length differs');
  assert(a.every((v, i) => Math.abs(v - b[i]) <= tolerance), label + ': source values differ');
}

function reachableNodes(graph) {
  const nodes = new Set(graph?.nodes.filter(node => ['OUTPUT_MATERIAL', 'GROUP_OUTPUT'].includes(node.type)).map(node => node.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of graph?.links || []) if (nodes.has(link[2]) && !nodes.has(link[0])) {
      nodes.add(link[0]); changed = true;
    }
  }
  return nodes;
}

async function verifyMaterials(directory, manifest, evidence) {
  const source = await json(`${directory}/source-materials.json`);
  assert.equal(source.sourceRevision, manifest.sourceRevision);
  assert.equal(source.sourceSha256, evidence.sourceSha256);
  assert.equal(source.sourceUnchanged, true);
  assert.deepEqual(source.frameRange, evidence.frameRange);
  assert.equal(source.fps, evidence.fps);
  assert.equal(source.fpsBase, evidence.fpsBase);
  const programs = Object.values(source.programs);
  assert.equal(programs.length, manifest.meshes.length);
  const nativeMaterials = new Map(evidence.materials.map(material => [material.name, material]));
  const usedMaterials = new Set();
  for (const mesh of manifest.meshes) {
    const program = source.programs[`${mesh.material}:${mesh.name}`];
    assert(program && program.body.length > 0, 'Source shader program missing: ' + mesh.name);
    assert.equal(program.objectName, mesh.name);
    assert.equal(program.materialName, manifest.materials[mesh.material].name);
    assert(nativeMaterials.has(program.materialName));
    assert.equal(program.surfaceRenderMethod, nativeMaterials.get(program.materialName).surfaceRenderMethod,
      'Native DITHERED/BLENDED rendering method was omitted or changed: ' + mesh.name);
    assert(['DITHERED', 'BLENDED'].includes(program.surfaceRenderMethod));
    usedMaterials.add(program.materialName);
  }
  let parameterFrameChecks = 0, activeNativeCurves = 0;
  for (const track of evidence.materialParameterTracks) {
    if (!usedMaterials.has(track.material)) continue;
    const nodeMatch = track.path.match(/nodes\[("(?:[^"\\]|\\.)*")\]/);
    const nodeName = nodeMatch ? JSON.parse(nodeMatch[1]) : null;
    if (nodeName && !reachableNodes(nativeMaterials.get(track.material).graph).has(nodeName)) continue;
    activeNativeCurves++;
    const materialPrograms = programs.filter(program => program.materialName === track.material);
    const candidateKeys = new Set(materialPrograms.flatMap(program => Object.values(program.uniforms)
      .map(uniform => uniform.track).filter(Boolean)));
    const matches = [...candidateKeys].map(key => source.tracks[key]).filter(candidate => candidate?.sourcePath === track.path);
    assert(matches.length > 0, 'Reachable native material animation omitted: ' + track.material + '/' + track.path);
    const match = matches[0];
    for (let i = 0; i < track.samples.length; i++) {
      const actual = sampleTrack(match.samples, evidence.frameRange[0] + i);
      close(Array.isArray(actual) ? actual[track.index] : actual, track.samples[i],
        `shader parameter ${track.material}/${track.path} frame ${evidence.frameRange[0] + i}`);
      parameterFrameChecks++;
    }
  }
  let coordinateFrameChecks = 0;
  for (const [name, track] of Object.entries(source.coordinateTracks || {})) {
    const expected = evidence.coordinateObjectInverseMatrices?.[name];
    assert(expected, 'No independent native coordinate-object trajectory: ' + name);
    for (let i = 0; i < expected.length; i++) {
      close(sampleTrack(track.samples, evidence.frameRange[0] + i), expected[i],
        `source texture coordinate ${name} frame ${evidence.frameRange[0] + i}`);
      coordinateFrameChecks++;
    }
  }
  const checkedFields = new Set();
  for (const field of source.fields || []) {
    if (checkedFields.has(field.url)) continue;
    checkedFields.add(field.url);
    const bytes = await readFile(absolute(`${directory}/${field.url}`));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), field.sha256,
      'Native shader field differs from its source-bound export.');
    assert.equal(field.encoding, 'gzip-float16-le');
    const decoded = gunzipSync(bytes);
    assert.equal(decoded.length, field.width * field.height * field.channels * 2);
    for (let i = 0; i < decoded.length; i += 2) assert((decoded.readUInt16LE(i) & 0x7c00) !== 0x7c00,
      'Non-finite value in native procedural field.');
  }
  return {programs: programs.length, activeNativeCurves, parameterFrameChecks,
    coordinateFrameChecks, nativeProceduralFieldsDecoded: checkedFields.size,
    surfaceRenderMethods: Object.fromEntries(['DITHERED', 'BLENDED'].map(method =>
      [method, programs.filter(program => program.surfaceRenderMethod === method).length])),
    manifestSha256: await digest(`${directory}/source-materials.json`)};
}

async function verifyNativeGlare(directory, evidence) {
  const settings = await json(`${directory}/render-settings.json`);
  const baked = await json('reports/peony2-fidelity/native-glare.json');
  assert.equal(settings.sourceSha256, evidence.sourceSha256);
  assert.equal(settings.nativeGlareSourceSha256, evidence.sourceSha256);
  assert.equal(settings.nativeGlareIncludesMixFactor, true);
  assert.equal(baked.status, 'pass');
  assert.equal(baked.sourceUnchanged, true);
  assert.equal(baked.sourceSha256, evidence.sourceSha256);
  assert(baked.reconstructionChecks?.length >= 3 && baked.reconstructionChecks.every(check => check.passed),
    'Native full EXR minus native base Image was not verified against the baked glow.');
  const frames = settings.nativeGlareFrames;
  assert(frames?.length > 0);
  assert.deepEqual(frames.map(frame => frame.frame), [...frames.map(frame => frame.frame)].sort((a, b) => a - b));
  assert.equal(new Set(frames.map(frame => frame.frame)).size, frames.length);
  const recipe = settings.nativeGlareRecipe;
  assert.equal(recipe.sha256, baked.recipeSha256);
  assert.equal(recipe.aov, '花岩灼烧 · 专用火线');
  assert.equal(recipe.glareOutput, 'Glare');
  assert.equal(recipe.mixFactorSocketIndex, 0);
  assert.equal(recipe.includesMixFactor, true);
  assert.equal(recipe.origin, 'bottom-left');
  assert.equal(recipe.colorSpace, 'scene-linear-rec709');
  const nativeMix = evidence.compositorGraph.nodes.find(node => node.type === 'MIX');
  close(recipe.mixFactor, nativeMix.inputs[0].value, 'Native RGBA ADD mix factor');
  for (const [material, window] of Object.entries(recipe.progressMaterialWindows)) {
    const track = evidence.materialParameterTracks.find(track => track.material === material
      && track.path === 'nodes["灼烧入场"].inputs[1].default_value');
    assert(track, 'Independent native burn progression missing: ' + material);
    const values = Buffer.alloc(track.samples.length * 4);
    track.samples.forEach((value, index) => values.writeFloatLE(value, index * 4));
    assert.equal(createHash('sha256').update(values).digest('hex'), window.progressSha256,
      'Baked active-window proof differs from the independently reopened source.');
  }
  const byFrame = new Map(frames.map(frame => [frame.frame, frame]));
  for (let frame = recipe.changingProgressWindow[0]; frame <= recipe.changingProgressWindow[1]; frame++) {
    assert(byFrame.has(frame), 'Native glare integer frame omitted: ' + frame);
  }
  for (const frame of recipe.boundaryProbeFrames) assert(byFrame.get(frame)?.zero,
    'Native AOV/glow boundary probe is not exactly zero.');
  let fields = 0, bytes = 0;
  for (const frame of frames) {
    assert.equal(frame.width, evidence.render.width);
    assert.equal(frame.height, evidence.render.height);
    assert.equal(frame.channels, 3);
    assert.equal(frame.encoding, 'gzip-float16-le');
    assert.equal(frame.origin, 'bottom-left');
    assert.equal(frame.colorSpace, 'scene-linear-rec709');
    const proof = baked.frames.find(item => item.frame === frame.frame);
    assert.deepEqual(frame, proof);
    if (frame.zero) {
      assert.equal(frame.url, null); assert.equal(frame.bytes, 0);
      assert.equal(frame.nonzeroHalfChannels, 0);
      continue;
    }
    const compressed = await readFile(absolute(`${directory}/${frame.url}`));
    assert.equal(createHash('sha256').update(compressed).digest('hex'), frame.sha256);
    assert.equal(compressed.length, frame.bytes);
    const decoded = gunzipSync(compressed);
    assert.equal(decoded.length, frame.width * frame.height * frame.channels * 2);
    let nonzero = 0;
    for (let i = 0; i < decoded.length; i += 2) {
      const half = decoded.readUInt16LE(i);
      assert((half & 0x7c00) !== 0x7c00, 'Non-finite native glare half float.');
      if (half & 0x7fff) nonzero++;
    }
    assert.equal(nonzero, frame.nonzeroHalfChannels);
    fields++; bytes += compressed.length;
  }
  return {frames: frames.length, nonzeroFields: fields, bytes,
    nativeEXRReconstructionChecks: baked.reconstructionChecks.length,
    recipeSha256: baked.recipeSha256};
}

function python(code, input) {
  const child = spawnSync(process.env.MDGS_PYTHON || 'python', ['-c', code], {
    input: JSON.stringify(input), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || 'Pixel decoder failed');
  return JSON.parse(child.stdout);
}

const exactImages = String.raw`
import hashlib,json,sys
from pathlib import Path
from PIL import Image,ImageOps,ImageChops
request=json.load(sys.stdin);result=[]
for item in request:
 source=Path(item['source']);web=Path(item['web'])
 assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sourceSha256'],'Raw cache differs from the independently verified packed source'
 with Image.open(source) as im:a=ImageOps.exif_transpose(im).convert('RGBA');a.load()
 with Image.open(web) as im:b=im.convert('RGBA');b.load()
 same_size=a.size==b.size
 ab=a.tobytes();bb=b.tobytes()
 equal=same_size and ab==bb
 delta=ImageChops.difference(a,b).getextrema() if same_size else None
 result.append({'chapter':item['chapter'],'sourceSha256':item['sourceSha256'],'web':item['relativeWeb'],'sourceSize':list(a.size),'webSize':list(b.size),'sameDecodedRGBA':equal,'rgbaSha256':hashlib.sha256(ab).hexdigest(),'webRgbaSha256':hashlib.sha256(bb).hexdigest(),'channelDifferenceExtrema':delta})
print(json.dumps(result,separators=(',',':')))
`;

const comparePixels = String.raw`
import json,sys,math
from PIL import Image,ImageChops,ImageStat
request=json.load(sys.stdin);result=[]
for item in request:
 with Image.open(item['native']) as im:a=im.convert('RGBA');a.load()
 with Image.open(item['web']) as im:b=im.convert('RGBA');b.load()
 row={'chapter':item['chapter'],'frame':item['frame'],'nativeSize':list(a.size),'webSize':list(b.size)}
 if a.size!=b.size:row.update(passed=False,failure='Source camera aspect/output dimensions differ');result.append(row);continue
 d=ImageChops.difference(a,b);channels=d.split();mx=ImageChops.lighter(ImageChops.lighter(channels[0],channels[1]),channels[2]);hist=mx.histogram();pixels=a.width*a.height
 limit=math.ceil(pixels*.99);count=0;p99=255
 for i,n in enumerate(hist):
  count+=n
  if count>=limit:p99=i;break
 st=ImageStat.Stat(d)
 mean=sum(st.mean[:3])/3
 fraction=sum(hist[21:])/pixels
 alpha_max=channels[3].getextrema()[1]
 row.update(meanAbsoluteRGB8=mean,rootMeanSquareRGB8=math.sqrt(sum(x*x for x in st.rms[:3])/3),p99MaximumChannelError8=p99,fractionPixelsAbove20=fraction,maximumAlphaError8=alpha_max)
 row['passed']=mean<=2.0 and p99<=12 and fraction<=.005 and alpha_max==0
 result.append(row)
print(json.dumps(result,separators=(',',':')))
`;

async function captureActualBrowser(nativeFrames) {
  const {chromium} = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
  const {preview, createServer} = await import('vite');
  let server, browser;
  const result = {status: 'running', startedAt: new Date().toISOString(), captures: [], errors: []};
  const target = path.join(output, 'browser-captures.json');
  const directory = path.join(output, 'browser');
  await mkdir(directory, {recursive: true});
  try {
    result.artifactBinding = await captureArtifactBinding(true);
    result.actualResponses = {};
    const external = value('--url') || process.env.MDGS_PREVIEW_URL;
    if (!external) {
      if (args.includes('--dev')) {
        server = await createServer({root, server: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
        await server.listen();
      } else server = await preview({root, preview: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
    }
    const url = external || server.resolvedUrls.local[0];
    browser = await chromium.launch({headless: true, executablePath: process.env.MDGS_TEST_BROWSER});
    const page = await browser.newPage({viewport: {width: 1280, height: 900}, deviceScaleFactor: 1});
    const responseTasks = [];
    const base = new URL(url);
    page.on('response', response => {
      const resource = new URL(response.url());
      if (resource.origin !== base.origin) return;
      const relative = decodeURIComponent(resource.pathname.slice(base.pathname.endsWith('/') ? base.pathname.length : base.pathname.lastIndexOf('/') + 1)) || 'index.html';
      const expected = result.artifactBinding.buildFiles[`dist/${relative}`]
        || Object.values(result.artifactBinding.chapters).map(chapter => chapter.files[relative]).find(Boolean);
      if (!expected) return;
      responseTasks.push((async () => {
        assert.equal(response.status(), 200, 'Bound resource was not served successfully: ' + relative);
        const contentEncoding = response.headers()['content-encoding'] || 'identity';
        result.actualResponses[relative] = await bindResponseBody(relative, expected, await response.body(), contentEncoding);
      })().catch(error => result.errors.push(error.stack || String(error))));
    });
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => {if (message.type() === 'error') result.errors.push(message.text());});
    await page.addInitScript(() => localStorage.setItem('guose-fanghua:painting-motion', 'off'));
    await page.goto(url + '#chapter-1');
    for (const chapter of [1, 2, 3, 4]) {
      if (chapter > 1) {
        await page.evaluate(() => document.getElementById('native-fidelity-capture-style')?.remove());
        await page.locator('.chapter-link').nth(chapter - 1).click();
      }
      await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, {timeout: 120000});
      const frames = [...nativeFrames.values()].filter(frame => frame.chapter === chapter).sort((a, b) => a.frame - b.frame);
      for (const reference of frames) {
        const width = Math.round(reference.sourceRenderResolution[0] * reference.scalePercent / 100);
        const height = Math.round(reference.sourceRenderResolution[1] * reference.scalePercent / 100);
        await page.evaluate(({width, height}) => {
          let style = document.getElementById('native-fidelity-capture-style');
          if (!style) {style = document.createElement('style'); style.id = 'native-fidelity-capture-style'; document.head.append(style);}
          style.textContent = `.painting{position:fixed!important;left:0!important;top:0!important;width:${width}px!important;height:${height}px!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;z-index:2147483646!important;border:0!important;padding:0!important;margin:0!important;box-shadow:none!important;transform:none!important}.painting>.scene-viewport{width:100%!important;height:100%!important}.painting canvas{opacity:1!important;transition:none!important}.narrative-calligraphy,.end-colophon,.calligraphy-layer,.scroll-roller,.brocade-border{display:none!important}.painting::before,.painting::after{display:none!important;content:none!important}`;
        }, {width, height});
        const progress = (reference.frame - reference.frameRange[0]) / (reference.frameRange[1] - reference.frameRange[0]);
        await page.locator('input[aria-label="画卷游观进度"]').evaluate((element, progress) => {
          element.step = 'any';
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(progress));
          element.dispatchEvent(new Event('input', {bubbles: true}));
          element.dispatchEvent(new Event('change', {bubbles: true}));
        }, progress);
        await page.waitForFunction(({frame, width, height}) => {
          const canvas = document.querySelector('.painting canvas');
          if (!canvas) return false;
          const data = canvas.dataset;
          const rect = canvas.getBoundingClientRect();
          return Math.abs(Number(data.sourceFrame) - frame) < 1e-7
            && data.loadingTextures === '0' && data.queuedTextures === '0' && data.textureFailed === '0'
            && data.sourceMaterialsReady === 'true'
            && Math.abs(rect.width - width) < 0.01 && Math.abs(rect.height - height) < 0.01;
        }, {frame: reference.frame, width, height}, {timeout: 120000});
        await page.waitForTimeout(120);
        const canvas = page.locator('.painting canvas');
        const diagnostics = await canvas.evaluate(element => ({...element.dataset}));
        assert(Math.abs(Number(diagnostics.sourceFrame) - reference.frame) < 1e-7);
        assert.equal(diagnostics.loadingTextures, '0'); assert.equal(diagnostics.queuedTextures, '0');
        assert.equal(diagnostics.textureFailed, '0'); assert.equal(diagnostics.sourceMaterialsReady, 'true');
        const viewport = JSON.parse(diagnostics.sourceViewport);
        assert.equal(viewport.x, 0); assert.equal(viewport.y, 0);
        assert.equal(viewport.width, width); assert.equal(viewport.height, height);
        const bounds = await canvas.boundingBox();
        const file = path.join(directory, `chapter-${chapter}-frame-${String(reference.frame).padStart(4, '0')}.png`);
        await page.screenshot({path: file, clip: bounds});
        result.captures.push({chapter, frame: reference.frame, sourceFrame: Number(diagnostics.sourceFrame),
          captureMode: 'artwork-only-source-aspect', sourceSha256: reference.sourceSha256,
          webManifestSha256: reference.manifestSha256,
          sourceMaterialsSha256: result.artifactBinding.chapters[chapter].sourceMaterialsSha256,
          renderSettingsSha256: result.artifactBinding.chapters[chapter].renderSettingsSha256,
          artifactBindingSha256: result.artifactBinding.sha256,
          path: path.relative(root, file).split(path.sep).join('/'),
          sha256: await digest(file), diagnostics});
        await writeFile(target, JSON.stringify(result, null, 2) + '\n');
      }
    }
    await Promise.all(responseTasks);
    assert.deepEqual(result.errors, [], 'Browser reported rendering or resource errors.');
    result.status = 'captured';
    const current = await captureArtifactBinding();
    await verifyCaptureBinding(result, current);
    return target;
  } catch (error) {
    result.status = 'fail'; result.errors.push(error.stack || String(error));
    throw error;
  } finally {
    result.completedAt = new Date().toISOString();
    await writeFile(target, JSON.stringify(result, null, 2) + '\n');
    await browser?.close();
    await server?.close();
  }
}

await mkdir(output, {recursive: true});
if (args.includes('--check-binding')) {
  const check = {status: 'running', startedAt: new Date().toISOString()};
  try {
    check.artifactBinding = await captureArtifactBinding(true);
    if (args.includes('--http-probe')) {
      const {preview} = await import('vite');
      const server = await preview({root, preview: {host: '127.0.0.1', port: 0}, logLevel: 'error'});
      try {
        check.actualHTTP = {};
        const material = await json('dist/assets/new-scrolls/chapter-1/source-materials.json');
        const settings = await json('dist/assets/new-scrolls/chapter-1/render-settings.json');
        const resources = ['index.html', Object.keys(check.artifactBinding.buildFiles).find(file => file.endsWith('.js')).slice(5),
          `assets/new-scrolls/chapter-1/${material.fields[0].url}`,
          `assets/new-scrolls/chapter-1/${settings.nativeGlareFrames.find(frame => !frame.zero).url}`];
        for (const relative of resources) {
          const response = await fetch(new URL(relative, server.resolvedUrls.local[0]));
          assert.equal(response.status, 200);
          check.actualHTTP[relative] = await bindResponseBody(relative, await digest(`dist/${relative}`),
            Buffer.from(await response.arrayBuffer()), response.headers.get('content-encoding') || 'identity');
        }
      } finally {await server.close();}
    }
    check.status = 'pass';
  } catch (error) {check.status = 'fail'; check.error = error.stack || String(error);}
  check.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'validation-capture-binding.json'), JSON.stringify(check, null, 2) + '\n');
  console.log(JSON.stringify({status: check.status, sha256: check.artifactBinding?.sha256, error: check.error?.split('\n')[0]}));
  process.exit(check.status === 'pass' ? 0 : 1);
}
await save();
try {
  assert(structuralOnly || pixelManifest || captureBrowser, 'Full fidelity acceptance needs --capture-browser or --pixel-captures; use --structural-only for an explicitly limited check.');
  const native = await json('reports/peony2-fidelity/validation-native.json');
  assert.equal(native.status, 'pass', 'Fresh independent Blender native verification must pass first.');
  assert.equal(native.mode, 'independent-source-verification');
  assert.equal(native.chapters.length, 4);
  const prepareSource = (await readFile(path.join(root, 'src/scene/prepareScene.ts'), 'utf8'))
    .replace(/^import[^\n]*\n/gm, '').replace('export function prepareScene', 'function prepareScene');
  const prepareCode = ts.transpileModule(prepareSource, {compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }}).outputText;
  const prepare = runInNewContext(`${prepareCode}\nprepareScene;`, {sceneOptions: {}}, {timeout: 1000});
  const imageChecks = [], nativeFrames = new Map();
  let totalMorphs = 0;
  for (const chapter of [1, 2, 3, 4]) {
    const directory = `public/assets/new-scrolls/chapter-${chapter}`;
    const manifestFile = `${directory}/scene.json`;
    const manifest = await json(manifestFile);
    const entry = native.chapters.find(item => item.chapter === chapter);
    assert(entry && entry.status === 'pass' && !entry.errors.length);
    assert.equal(await digest(entry.evidence), entry.evidenceSha256, 'Native chapter evidence changed after verification.');
    const evidence = await json(entry.evidence);
    assert.match(evidence.blenderVersion, /^5\.2\./, 'Native evidence needs the source-compatible Blender 5.2 runtime.');
    assert.equal(await digest(manifestFile), entry.manifestSha256, 'Manifest changed after independent source verification.');
    assert.equal(evidence.sourceSha256, manifest.sourceSha256);
    const editableDelivery = `artwork/blender-reconstructed/chapter-${chapter}_reconstructed.blend`;
    assert((await stat(absolute(editableDelivery))).size > 1024, 'Editable delivery is an unresolved LFS pointer.');
    assert.equal(await digest(editableDelivery), evidence.sourceSha256,
      'The editable delivered Blender file is not byte-identical to the supplied source.');
    assert.equal(evidence.sourceUnchanged, true);
    assert.equal(manifest.sourceRevision, 'peony-2.0-2026-10-23');
    assert.equal(manifest.source, evidence.source);
    assert.equal(manifest.meshes.length, expectedMeshCounts[chapter - 1]);
    assert.equal(new Set(manifest.meshes.map(mesh => mesh.name)).size, manifest.meshes.length);
    assert.equal(new Set(manifest.images.map(image => image.sourceSha256)).size, expectedRawImageCounts[chapter - 1]);
    assert.deepEqual(new Set(manifest.images.map(image => image.sourceSha256)), new Set(evidence.sourceImageUsage.usedOriginalSha256));
    assert.deepEqual(manifest.frameRange, evidence.frameRange);
    assert.equal(manifest.fps, evidence.fps);
    assert.equal(manifest.fpsBase, evidence.fpsBase);
    assert.equal(manifest.sourceDurationSeconds, evidence.sourceDurationSeconds);
    assert.equal(manifest.render.width, evidence.render.width);
    assert.equal(manifest.render.height, evidence.render.height);
    assert.equal(manifest.render.pixelAspectX, evidence.render.pixelAspectX);
    assert.equal(manifest.render.pixelAspectY, evidence.render.pixelAspectY);
    const [start, end] = manifest.frameRange;
    assert.equal(manifest.cameras.length, end - start + 1, 'Every original camera frame must be represented.');
    assert.equal(manifest.stops.length, expectedStops[chapter - 1]);
    assert(!manifest.stops.some(stop => stop.name.includes('参考全景')));
    // The 2.0 films also mark effect boundaries. Numbered scene entries are
    // reading stops; unnumbered burn/reveal cues remain in the full markers.
    const authoredStops = evidence.markers.filter(marker => /^(?:\d{2}\s*[·・]|\d+-\d+\s)/.test(marker.name)
      && !marker.name.includes('参考全景'));
    assert.equal(authoredStops.length, manifest.stops.length);
    authoredStops.forEach((marker, index) => {
      const stop = manifest.stops[index];
      assert.equal(stop.name, marker.name);
      assert.equal(stop.authoredFrame ?? stop.frame, marker.frame);
      assert.equal(stop.frame, Math.max(start, Math.min(end, marker.frame)));
      assert(Math.abs(stop.progress - (stop.frame - start) / (end - start)) <= 5.1e-8);
    });
    for (let index = 0; index < manifest.cameras.length; index++) {
      const camera = manifest.cameras[index];
      assert.equal(camera.frame, start + index);
      assert(Math.abs(camera.progress - index / (end - start)) <= 5.1e-8);
    }
    const prepared = prepare(manifest, chapter);
    assert.equal(prepared.cameras.length, manifest.cameras.length);
    prepared.cameras.forEach((camera, index) => {
      assert.equal(camera.progress, manifest.cameras[index].progress, 'Prepared path altered the authored camera clock.');
      assert.equal(camera.sourceProgress, manifest.cameras[index].progress);
    });
    for (const [index, stop] of prepared.stops.entries()) {
      assert(Math.abs(stop.progress - manifest.stops[index].progress) <= 1e-9, 'Prepared path altered the authored marker clock.');
    }
    for (const mesh of manifest.meshes) {
      assert.equal(mesh.positions.length / 3, mesh.uvs.length / 2);
      if (mesh.morphTargets?.length) {
        totalMorphs++;
        assert.equal(mesh.morphTargetsRelative, true);
        assert(mesh.morphWeights.length > 0);
        assert.equal(mesh.morphWeights[0].frame, start);
        assert.equal(mesh.morphWeights.at(-1).frame, end);
        for (const target of mesh.morphTargets) assert.equal(target.positions.length, mesh.positions.length);
        mesh.morphWeights.forEach((key, index) => {
          assert(key.frame >= start && key.frame <= end);
          assert(index === 0 || key.frame > mesh.morphWeights[index - 1].frame);
          assert.equal(key.weights.length, mesh.morphTargets.length);
        });
      }
    }
    finite(manifest, `chapter-${chapter}`);
    const rawDirectory = path.join(rawCache, `chapter-${chapter}`);
    for (const image of manifest.images) {
      const webFile = `${directory}/${image.src}`;
      assert.equal(await digest(webFile), image.webSha256);
      assert.equal((await stat(absolute(webFile))).size, image.bytes);
      assert.equal(image.lossless, true);
      assert.equal(image.resized, false);
      imageChecks.push({chapter, source: path.join(rawDirectory, `${image.id}.source`),
        sourceSha256: image.sourceSha256, web: absolute(webFile), relativeWeb: webFile});
    }
    assert.equal(evidence.renders?.length, expectedNativeFrameCounts[chapter - 1],
      'The complete authored effect-keyframe baseline is required; no reference frames may be omitted.');
    assert.equal(new Set(evidence.renders.map(render => render.frame)).size, evidence.renders.length);
    assert.deepEqual(evidence.renders.map(render => render.frame).sort((a, b) => a - b),
      requiredReferenceFrames(chapter, evidence),
      'Native baseline must contain all fixed frames plus every independently derived 10/50/90 percent effect frame.');
    for (const render of evidence.renders) {
      assert.equal(render.sourceSha256, evidence.sourceSha256);
      assert.equal(render.nativeMaterialsLightingDepthOfFieldAndCompositing, true);
      assert.equal(render.engine, evidence.engine);
      assert.equal(render.scalePercent, 50);
      assert.deepEqual(render.sourceRenderResolution, [evidence.render.width, evidence.render.height]);
      assert(Number.isInteger(render.frame) && render.frame >= start && render.frame <= end);
      assert.equal(await digest(render.path), render.sha256);
      nativeFrames.set(`${chapter}:${render.frame}`, {...render, manifestSha256: entry.manifestSha256,
        sourceSha256: evidence.sourceSha256, frameRange: evidence.frameRange});
    }
    const materials = await verifyMaterials(directory, manifest, evidence);
    const nativeGlare = chapter === 1 ? await verifyNativeGlare(directory, evidence) : null;
    report.chapters.push({chapter, sourceSha256: evidence.sourceSha256,
      manifestSha256: entry.manifestSha256, meshCount: manifest.meshes.length,
      sourceMaterialsSha256: await digest(`${directory}/source-materials.json`),
      renderSettingsSha256: await digest(`${directory}/render-settings.json`),
      independentOriginalImages: new Set(manifest.images.map(image => image.sourceSha256)).size,
      cameraSamples: manifest.cameras.length, morphObjects: manifest.meshes.filter(mesh => mesh.morphTargets?.length).length,
      nativeReferenceFrames: evidence.renders?.length || 0, materials, nativeGlare, structuralPassed: true});
  }
  assert.equal(totalMorphs, 25, 'All 25 authored shape-key objects must survive.');
  report.images = python(exactImages, imageChecks);
  assert(report.images.every(image => image.sameDecodedRGBA), 'A web pigment differs from the full-resolution original RGBA.');
  report.structuralPassed = true;
  await save();
  if (!structuralOnly) {
    if (captureBrowser) pixelManifest = await captureActualBrowser(nativeFrames);
    const captures = await json(pixelManifest);
    assert(Array.isArray(captures.captures) && captures.captures.length > 0);
    const currentBinding = await captureArtifactBinding(!captureBrowser);
    await verifyCaptureBinding(captures, currentBinding);
    report.captureArtifactBindingSha256 = currentBinding.sha256;
    report.captureManifest = portable(path.relative(root, absolute(pixelManifest)));
    report.buildReproduction = captures.artifactBinding.buildReproduction;
    const provided = new Map(captures.captures.map(capture => [`${capture.chapter}:${capture.frame}`, capture]));
    assert.equal(captures.captures.length, nativeFrames.size, 'The capture manifest must contain exactly the full native frame set.');
    assert.equal(provided.size, nativeFrames.size, 'Duplicate browser reference frames are not allowed.');
    const comparisons = [];
    for (const [key, reference] of nativeFrames) {
      const capture = provided.get(key);
      assert(capture, 'Native keyframe has no actual browser pixel capture: ' + key);
      assert.equal(capture.captureMode, 'artwork-only-source-aspect');
      assert.equal(capture.webManifestSha256, reference.manifestSha256);
      assert.equal(capture.sourceSha256, reference.sourceSha256);
      assert.equal(capture.sourceMaterialsSha256, currentBinding.chapters[capture.chapter].sourceMaterialsSha256);
      assert.equal(capture.renderSettingsSha256, currentBinding.chapters[capture.chapter].renderSettingsSha256);
      assert.equal(capture.artifactBindingSha256, currentBinding.sha256);
      assert(Math.abs(capture.sourceFrame - reference.frame) < 1e-6, 'Browser did not display the requested exact source frame.');
      assert.equal(await digest(capture.path), capture.sha256);
      comparisons.push({chapter: reference.chapter, frame: reference.frame,
        native: absolute(reference.path), web: absolute(capture.path)});
    }
    assert(nativeFrames.size > 0, 'Native keyframe renders are required for visual acceptance.');
    report.pixelThresholds = {meanAbsoluteRGB8: 2, p99MaximumChannelError8: 12,
      fractionPixelsAbove20: 0.005, maximumAlphaError8: 0,
      scope: 'Bounds allow small rasterization differences; they do not allow replacement of native effects, lighting or composition.'};
    report.pixels = python(comparePixels, comparisons);
    report.pixelSummary = {frames: report.pixels.length, passed: report.pixels.filter(frame => frame.passed).length,
      chapters: [1, 2, 3, 4].map(chapter => {
        const frames = report.pixels.filter(frame => frame.chapter === chapter);
        return {chapter, frames: frames.length, passed: frames.filter(frame => frame.passed).length,
          meanAbsoluteRGB8: frames.reduce((sum, frame) => sum + frame.meanAbsoluteRGB8, 0) / frames.length,
          worstMeanAbsoluteRGB8: Math.max(...frames.map(frame => frame.meanAbsoluteRGB8)),
          worstP99MaximumChannelError8: Math.max(...frames.map(frame => frame.p99MaximumChannelError8)),
          worstFractionPixelsAbove20: Math.max(...frames.map(frame => frame.fractionPixelsAbove20))};
      })};
    await save();
    const contact = spawnSync(process.env.MDGS_PYTHON || 'python', [absolute('scripts/validate-peony2-contact.py'), absolute(pixelManifest)], {
      encoding: 'utf8', maxBuffer: 1024 * 1024,
    });
    assert.equal(contact.status, 0, contact.stderr || 'Contact sheet generation failed.');
    report.contacts = JSON.parse(contact.stdout).contacts;
    assert(report.pixels.every(frame => frame.passed), 'Actual browser artwork differs from the authored native keyframes.');
    report.visualPassed = true;
    report.status = 'pass';
  } else {
    report.visualPassed = false;
    report.status = 'structural-pass';
  }
} catch (error) {
  report.status = 'fail';
  report.errors.push(error.stack || String(error));
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({status: report.status, chapters: report.chapters.length,
    images: report.images?.length || 0, pixelFrames: report.pixels.length,
    errors: report.errors.map(error => error.split('\n')[0])}));
}

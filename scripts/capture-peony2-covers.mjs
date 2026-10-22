/** Capture covers from the current production WebGL first frames.
 * This owns one browser and one renderer at a time; run when other GPU checks
 * have finished. No source scene, material, camera or compositing is replaced.
 * MDGS_PLAYWRIGHT_MODULE / MDGS_TEST_BROWSER select the installed browser.
 * MDGS_PYTHON selects Python with Pillow for exact lossless WebP encoding.
 * node scripts/capture-peony2-covers.mjs [--capture-only] [--cover-width=1280]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'reports/peony2-fidelity/covers');
const edition = 'peony-2.0-2026-10-23';
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const coverWidth = Number(option('cover-width') ?? 1280);
assert(Number.isInteger(coverWidth) && coverWidth >= 256 && coverWidth <= 4096, '--cover-width must be an integer between 256 and 4096.');
const captureOnly = process.argv.includes('--capture-only');
const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const run = promisify(execFile);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimeFiles = ['src/scene/SceneRenderer.ts', 'src/scene/SourceMaterial.ts', 'src/scene/SourceNoise3D.ts', 'src/scene/SourceLighting.ts',
  'src/scene/SourcePostProcessing.ts', 'src/scene/sourceViewport.ts', 'src/scene/prepareScene.ts',
  'src/data/sourceEdition.ts', 'src/types.ts', 'package-lock.json'];
const assetFiles = [1, 2, 3, 4].flatMap(id => ['scene.json', 'source-materials.json', 'render-settings.json']
  .map(name => `public/assets/new-scrolls/chapter-${id}/${name}`));
const fingerprint = async () => Object.fromEntries(await Promise.all([...runtimeFiles, ...assetFiles]
  .map(async file => [file, sha(await readFile(path.join(root, file)))])));
const inputHashes = await fingerprint();
await mkdir(output, { recursive: true });
await mkdir(path.join(root, 'tmp'), { recursive: true });
const temporary = await mkdtemp(path.join(root, 'tmp/peony2-cover-'));
const relative = path.relative(root, temporary).split(path.sep).join('/');
await writeFile(path.join(temporary, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Native first frame cover capture</title><link rel="icon" href="data:,">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}#host{position:relative;width:100vw;height:100vh;background:#f8f5ed}canvas{display:block}</style>
</head><body><div id="host"></div><script type="module" src="./harness.ts"></script></body></html>`);
await writeFile(path.join(temporary, 'harness.ts'), `
import { SceneRenderer } from '/src/scene/SceneRenderer.ts';
const host=document.querySelector('#host');
let engine;
window.__peony2Cover={
 async open(chapter){
  engine?.dispose();
  engine=new SceneRenderer(host,()=>{});
  engine.resize(innerWidth,innerHeight);
  engine.setMotionEnabled(false);
  engine.setProgress(0);
  await engine.load(chapter);
 },
 snapshot(){return {...engine?.renderer.domElement.dataset};},
 dispose(){engine?.dispose();engine=undefined;}
};`);

const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, watch: null }, logLevel: 'error' });
let browser;
const report = { status: 'running', startedAt: new Date().toISOString(), sourceRevision: edition,
  method: 'Actual production SceneRenderer WebGL canvas at source progress 0 and native render resolution. Authored materials, lighting, shadows, whole camera gate and source postprocessing execute unchanged. No HTML narration is included. Standard browser compositing over the viewer paper color #f8f5ed. No retouching or recomposition.',
  inputHashes, coverMaximumWidth: coverWidth, captures: [], errors: [] };
try {
  report.gitHead = (await run('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ deviceScaleFactor: 1, reducedMotion: 'reduce', viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(new URL(`${relative}/index.html`, server.resolvedUrls.local[0]).href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__peony2Cover);
  for (const chapter of [1, 2, 3, 4]) {
    const base = `public/assets/new-scrolls/chapter-${chapter}/`;
    const manifest = JSON.parse(await readFile(path.join(root, base, 'scene.json'), 'utf8'));
    assert.equal(manifest.sourceRevision, edition);
    const width = manifest.render.width, height = manifest.render.height;
    assert.equal(manifest.render.pixelAspectX, manifest.render.pixelAspectY, 'Non-square source pixels need an explicit capture-size policy.');
    await page.setViewportSize({ width, height });
    await page.evaluate(chapter => window.__peony2Cover.open(chapter), chapter);
    await page.waitForFunction(() => {
      const data = window.__peony2Cover.snapshot();
      return data.firstFrameReady === 'true' && data.loadingTextures === '0';
    }, undefined, { timeout: 180000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const diagnostics = await page.evaluate(() => window.__peony2Cover.snapshot());
    assert.equal(diagnostics.chapter, String(chapter));
    assert.equal(diagnostics.progress, '0.000000');
    assert.equal(Number(diagnostics.sourceFrame), manifest.frameRange[0]);
    assert.equal(diagnostics.sourceRevision, edition);
    assert.equal(diagnostics.sourceMaterialsReady, 'true');
    assert.equal(diagnostics.motionEnabled, 'false');
    assert.equal(diagnostics.sourceHiddenVisibleLayers, '0');
    assert.equal(diagnostics.textureFailed, '0');
    assert.deepEqual(JSON.parse(diagnostics.shaderErrors), []);
    assert.deepEqual(JSON.parse(diagnostics.textureErrors), {});
    const gate = JSON.parse(diagnostics.sourceViewport);
    assert(Math.abs(gate.x) < 1e-6 && Math.abs(gate.y) < 1e-6 && Math.abs(gate.width - width) < 1e-6 && Math.abs(gate.height - height) < 1e-6, 'Capture must include the whole native camera frame.');
    const png = `chapter-${chapter}-first-frame.png`;
    await page.locator('#host canvas').screenshot({ path: path.join(output, png), type: 'png' });
    report.captures.push({ chapter, png: `reports/peony2-fidelity/covers/${png}`, pngSha256: sha(await readFile(path.join(output, png))),
      width, height, progress: 0, frame: manifest.frameRange[0], sourceRevision: manifest.sourceRevision,
      sourceSha256: manifest.sourceSha256, diagnostics });
    await page.evaluate(() => window.__peony2Cover.dispose());
    console.log(`Captured chapter ${chapter}: source frame ${manifest.frameRange[0]}, ${width}x${height}.`);
  }
  assert.deepEqual(await fingerprint(), inputHashes, 'Production scene/shader inputs changed during capture; discard this mixed batch.');
  assert.deepEqual(report.errors, [], 'A cover cannot be accepted with WebGL or resource errors.');
  report.status = 'pass'; report.completedAt = new Date().toISOString();
  await writeFile(path.join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
} catch (error) {
  report.status = 'failed'; report.failure = String(error.stack || error);
  await writeFile(path.join(output, 'capture.json'), JSON.stringify(report, null, 2) + '\n');
  throw error;
} finally {
  await browser?.close();
  await server.close();
  const expectedParent = path.resolve(root, 'tmp') + path.sep;
  assert(path.resolve(temporary).startsWith(expectedParent));
  await rm(temporary, { recursive: true, force: true });
}
if (!captureOnly) {
  const result = await run(process.env.MDGS_PYTHON || 'python', [path.join(root, 'scripts/encode-peony2-covers.py'), '--capture-report', path.join(output, 'capture.json'), '--max-width', String(coverWidth)], { cwd: root });
  console.log(result.stdout.trim());
}

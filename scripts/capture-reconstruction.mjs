/** Capture real authored views for visual review. Each run owns an ephemeral Vite server. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';

const { chromium } = createRequire(import.meta.url)(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const option = name => process.argv.find(argument => argument.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const stage = option('stage') ?? 'after';
if (!['before', 'pilot', 'after'].includes(stage)) throw new Error('Use --stage=before, pilot, or after.');
const selectedChapter = Number(option('chapter') ?? 0);
if (![0, 1, 2, 3, 4].includes(selectedChapter)) throw new Error('Use --chapter=1..4 or omit to capture all four.');
const output = path.resolve(root, option('output') ?? `reports/reconstruction/${stage}`);
const reportsRoot = path.join(root, 'reports') + path.sep;
if (!output.startsWith(reportsRoot)) throw new Error('--output must stay inside the project reports directory.');
const width = Number(option('width') ?? 1440), height = Number(option('height') ?? 900);
if (![width, height].every(value => Number.isFinite(value) && value >= 200 && value <= 8192)) throw new Error('Capture viewport dimensions must be between 200 and 8192.');
const includeQuarters = process.argv.includes('--quarterpoints');
const viewFilter = option('views') ? new Set(option('views').split(',')) : null;
if (viewFilter && [...viewFilter].some(value => !/^(stop|gap|quarter):[1-9]\d*$/.test(value))) throw new Error('--views uses comma-separated stop:3,gap:2,quarter:4 selectors.');
const manifestPath = path.join(root, 'public/assets/reconstruction/manifest.json');
const manifestBytes = await readFile(manifestPath);
const artRevisions = JSON.parse(manifestBytes);
const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');
await mkdir(output, { recursive: true });
const vite = await createServer({ server: { host: '127.0.0.1' }, logLevel: 'error' });
let browser;
try {
  await vite.listen();
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  browser = await chromium.launch({ headless: true, executablePath: process.env.MDGS_TEST_BROWSER });
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.goto(vite.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' });
  const frames = [], transitions = [], quarterpoints = [];
  for (let chapter = 1; chapter <= 4; chapter++) {
    if (selectedChapter && selectedChapter !== chapter) continue;
    const raw = JSON.parse(await readFile(path.join(root, `public/assets/chapter-${chapter}/scene.json`), 'utf8'));
    const manifest = prepareScene(raw, chapter);
    await writeFile(path.join(output, `chapter-${chapter}-manifest.json`), JSON.stringify({ schemaVersion: 1, stage: 'captured-blank-design-chapter', activeChapters: [chapter], parentCanonicalSha256: manifestHash, chapters: { [chapter]: artRevisions.chapters[String(chapter)] } }, null, 2) + '\n');
    await page.locator('.chapter-link').nth(chapter - 1).click();
    await page.waitForFunction(() => !document.querySelector('.scene-loading') || document.querySelector('.scene-loading.has-error'), null, { timeout: 30000 });
    if (await page.locator('.scene-loading.has-error').count()) throw new Error(await page.locator('.scene-loading').innerText());
    for (const kind of includeQuarters ? ['stop', 'gap', 'quarter'] : ['stop', 'gap']) {
      const points = kind === 'stop' ? manifest.stops : manifest.stops.slice(0, -1).flatMap((stop, index) => (kind === 'gap' ? [.5] : [.25, .75]).map(fraction => ({
        name: `${stop.name} → ${manifest.stops[index + 1].name}`, gapIndex: index + 1, fraction,
        progress: stop.progress + (manifest.stops[index + 1].progress - stop.progress) * fraction,
      })));
      for (let index = 0; index < points.length; index++) {
        if (viewFilter && !viewFilter.has(`${kind}:${index + 1}`)) continue;
        const point = points[index];
        await page.locator('input[type=range]').evaluate((input, progress) => { input.value = String(progress); input.dispatchEvent(new Event('input', { bubbles: true })); }, point.progress);
        await page.waitForFunction(progress => Math.abs(Number(document.querySelector('input[type=range]').value) - progress) < .0011, point.progress);
        await page.waitForTimeout(180);
        await page.waitForLoadState('networkidle');
        const screenshot = `chapter-${chapter}-${kind}-${String(index + 1).padStart(2, '0')}.jpg`;
        await page.locator('.painting').screenshot({ path: path.join(output, screenshot), type: 'jpeg', quality: 90, style: '.end-colophon{visibility:hidden!important}' });
        const evidence = { chapter, kind, index: index + 1, name: point.name, progress: point.progress, ...(point.gapIndex ? { gapIndex: point.gapIndex, fraction: point.fraction } : {}), screenshot, renderer: await page.locator('canvas').evaluate(canvas => ({ ...canvas.dataset })) };
        (kind === 'stop' ? frames : kind === 'gap' ? transitions : quarterpoints).push(evidence);
      }
    }
    console.log(`Chapter ${chapter}: ${manifest.stops.length} stops and ${manifest.stops.length - 1} transitions captured.`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const mergePrevious = async (filename, values) => {
    let previous = [];
    if (selectedChapter) try { previous = JSON.parse(await readFile(path.join(output, filename), 'utf8')).filter(row => row.chapter !== selectedChapter); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    return [...previous, ...values].sort((a, b) => a.chapter - b.chapter || a.index - b.index);
  };
  const allFrames = await mergePrevious('frames.json', frames), allTransitions = await mergePrevious('transitions.json', transitions);
  await writeFile(path.join(output, 'frames.json'), `${JSON.stringify(allFrames, null, 2)}\n`);
  await writeFile(path.join(output, 'transitions.json'), `${JSON.stringify(allTransitions, null, 2)}\n`);
  const allQuarters = includeQuarters ? await mergePrevious('quarterpoints.json', quarterpoints) : [];
  if (includeQuarters) await writeFile(path.join(output, 'quarterpoints.json'), `${JSON.stringify(allQuarters, null, 2)}\n`);
  if (createHash('sha256').update(await readFile(manifestPath)).digest('hex') !== manifestHash) throw new Error('The production manifest changed during capture; do not use this mixed batch as acceptance evidence.');
  await writeFile(path.join(output, 'capture.json'), `${JSON.stringify({ stage, manifestSha256: manifestHash, lastSelectedChapter: selectedChapter || 'all', viewport: { width, height }, reducedMotion: true, browserErrors: errors, frames: allFrames.length, transitions: allTransitions.length, quarterpoints: allQuarters.length, ...(viewFilter ? { partialProbe: true, requestedViews: [...viewFilter] } : {}), note: 'Pixel captures require visual review; this file does not declare aesthetic acceptance.' }, null, 2)}\n`);
} finally { await browser?.close(); await vite.close(); }

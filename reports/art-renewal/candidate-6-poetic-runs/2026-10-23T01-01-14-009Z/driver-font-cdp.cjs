/* Frozen-build font proof through real UI controls. No product DOM/font mocks.
 * Preparation is not a pass: this script must run after the final build freezes.
 * node .../verify-final-font.cjs --build-dir tmp/<frozen-build> --report-file reports/<unique-run>/font-cdp.json
 * Optional --expected-font-sha256 HASH; dependencies: MDGS_PLAYWRIGHT_MODULE / MDGS_TEST_BROWSER. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
assert(option('--build-dir'), 'Specify the frozen --build-dir explicitly; no implicit dist or dev build.');
const build = path.resolve(root, option('--build-dir'));
const output = path.resolve(root, option('--report-file', 'reports/art-renewal/font-fallback/final-font-validation.json'));
const shots = option('--shots-dir') ? path.resolve(root, option('--shots-dir')) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const expectedFont = option('--expected-font-sha256');
const prefix = '/exhibition/font-proof/';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const inputs = ['src/App.tsx', 'src/components/PeonyAtlasHome.tsx', 'src/components/CulturePanel.tsx', 'src/components/ScrollColophon.tsx', 'src/components/FlowerLetterDialog.tsx', 'src/art/flowerLetter.ts', 'src/data/curatorialNotes.ts', 'src/data/flowerLetters.ts', 'src/styles.css', 'src/styles/scroll-2026.css', 'src/styles/exhibition-theme.css', 'src/styles/peony-atlas.css', 'src/styles/curatorial-reading.css', 'src/styles/flower-letter.css', 'public/fonts/wenkai-web.woff2', 'public/fonts/provenance.json', 'public/fonts/OFL-WenKai.txt'];
const metadata = file => ({ bytes: fs.statSync(file).size, sha256: sha(fs.readFileSync(file)) });
const sourceManifest = () => Object.fromEntries(inputs.map(file => [file, metadata(path.join(root, file))]));
const buildFiles = ['index.html', 'fonts/wenkai-web.woff2', 'fonts/provenance.json', 'fonts/OFL-WenKai.txt', ...fs.readdirSync(path.join(build, 'assets')).filter(name => /\.(js|css)$/.test(name)).map(name => `assets/${name}`)];
const buildManifest = () => Object.fromEntries(buildFiles.map(file => [file, metadata(path.join(build, file))]));
const report = { status: 'running', startedAt: new Date().toISOString(), scope: 'Actual DOM platform fonts in a specified frozen production build: home, chapter-2 cultural notes/original chronology note, real colophon keepsake button and FlowerLetter UI. Includes focused primary-button states and two-size chronology layout checks when --shots-dir is provided. This does not infer the font of individual pixels in the exported PNG.', buildDirectory: relative(build), driver: relative(__filename), driverSha256: sha(fs.readFileSync(__filename)), sourceBefore: sourceManifest(), buildBefore: buildManifest(), expectedFontSha256: expectedFont || null, nodes: [], checks: [], http: [], browserFontResponses: [], primaryStates: [], chronologyLayouts: [], expectedFailures: [], errors: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!pathname.startsWith(prefix)) { response.writeHead(404).end(); return; }
  const file = path.resolve(build, pathname.slice(prefix.length) || 'index.html');
  if (!file.startsWith(build + path.sep)) { response.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'content-length': stat.size, 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(response);
  });
});
let browser;
const fontResponses = [];
(async () => {
  const font = report.buildBefore['fonts/wenkai-web.woff2'];
  check('frozen font matches current approved public font', font.sha256 === report.sourceBefore['public/fonts/wenkai-web.woff2'].sha256);
  if (expectedFont) check('frozen font matches freeze SHA', font.sha256 === expectedFont);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}${prefix}`;
  report.base = base;
  browser = await chromium.launch({ ...(process.env.MDGS_TEST_BROWSER ? { executablePath: process.env.MDGS_TEST_BROWSER } : {}), headless: true });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => {
    if (response.request().resourceType() === 'font') fontResponses.push((async () => {
      const bytes = await response.body();
      report.browserFontResponses.push({ url: response.url(), status: response.status(), bytes: bytes.length, sha256: sha(bytes) });
    })().catch(error => report.errors.push(`font response: ${error.message}`)));
  });
  const response = await page.goto(base);
  const html = await response.body();
  report.http.push({ path: 'index.html', status: response.status(), bytes: html.length, sha256: sha(html), matchesBuild: sha(html) === report.buildBefore['index.html'].sha256 });
  check('production page contains no HMR client', !html.toString().includes('/@vite/client'));
  await page.waitForFunction(() => document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'HOME' && document.querySelector('.peony-atlas')?.classList.contains('is-ready'), null, { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  async function keyboardTarget(targetPage, selector) {
    for (let count = 0; count < 160; count++) {
      await targetPage.keyboard.press('Tab');
      if (await targetPage.locator(selector).evaluate(node => node === document.activeElement && node.matches(':focus-visible'))) return;
    }
    throw new Error(`Keyboard cannot reach ${selector}`);
  }
  async function crop(targetPage, selector, filename) {
    if (!shots) return null;
    const box = await targetPage.locator(selector).boundingBox(), view = targetPage.viewportSize();
    const clip = { x: Math.max(0, box.x - 24), y: Math.max(0, box.y - 24), width: Math.min(view.width, box.x + box.width + 24) - Math.max(0, box.x - 24), height: Math.min(view.height, box.y + box.height + 24) - Math.max(0, box.y - 24) };
    const file = path.join(shots, filename); await targetPage.screenshot({ path: file, clip }); return { file: relative(file), sha256: sha(fs.readFileSync(file)) };
  }
  async function primary(targetPage, name, selector, foreground) {
    if (!shots) return;
    const target = targetPage.locator(selector);
    await target.waitFor({ state: 'visible' });
    await targetPage.mouse.move(2, 2);
    if (await target.evaluate(node => node === document.activeElement)) await targetPage.keyboard.press('Tab');
    const states = [];
    async function record(state) {
      await targetPage.waitForTimeout(460);
      const value = await target.evaluate(node => { const style = getComputedStyle(node), label = node.querySelector('span'); return { text: node.textContent, color: style.color, labelColor: label ? getComputedStyle(label).color : style.color, backgroundColor: style.backgroundColor, outlineColor: style.outlineColor, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, outlineOffset: style.outlineOffset, focusVisible: node.matches(':focus-visible'), hovered: node.matches(':hover'), disabled: node.disabled }; });
      const expected = foreground.match(/\w\w/g).map(value => parseInt(value, 16));
      const actual = value.color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      const same = actual?.every((value, index) => value === expected[index]);
      const fills = name === 'home-begin' ? ['415849', '314b3e'] : name === 'loading-retry' ? ['4d6555', '3b5743'] : ['52664e', '3e5b43'];
      const expectedFill = fills[state.includes('hover') ? 1 : 0].match(/\w\w/g).map(value => parseInt(value, 16));
      const actualFill = value.backgroundColor.match(/[\d.]+/g)?.slice(0, 3).map(Number);
      const luminance = channels => channels.map(channel => channel / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
      const levels = [luminance(actual), luminance(actualFill)].sort((a, b) => b - a);
      value.actualContrastRatio = (levels[0] + .05) / (levels[1] + .05);
      check(`${name} ${state}: approved light ink and dark fill remain`, same && value.labelColor === value.color && actualFill?.every((channel, index) => channel === expectedFill[index]) && value.actualContrastRatio >= 4.5 && !value.disabled, value);
      if (state.includes('focus')) check(`${name} ${state}: keyboard ring visible`, value.focusVisible && parseFloat(value.outlineWidth) > 0 && value.outlineStyle !== 'none', value);
      if (state === 'hover' || state === 'keyboard-focus') value.screenshot = await crop(targetPage, selector, `${name}-${state}.png`);
      states.push({ state, ...value });
    }
    await record('default'); await target.hover(); await record('hover');
    await targetPage.mouse.move(2, 2); await keyboardTarget(targetPage, selector); await record('keyboard-focus');
    await target.hover(); await record('hover-plus-focus');
    report.primaryStates.push({ name, selector, states });
  }
  async function collect(name, selector, strictCustom = true) {
    const element = page.locator(selector);
    await element.waitFor({ state: 'visible' });
    await element.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const { root: documentNode } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector });
    assert(nodeId, `Actual node missing: ${selector}`);
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    const data = await element.evaluate(node => ({ text: node.textContent, computedFamily: getComputedStyle(node).fontFamily, fontSize: getComputedStyle(node).fontSize, bounds: node.getBoundingClientRect().toJSON() }));
    const used = fonts.filter(font => font.glyphCount > 0), customOnly = used.length > 0 && used.every(font => font.isCustomFont);
    const evidence = { name, selector, chapter: await page.evaluate(() => document.querySelector('#scroll-artwork canvas')?.getAttribute('data-chapter') || null), ...data, fonts, customOnly, strictCustom };
    report.nodes.push(evidence);
    if (strictCustom) check(`${name}: only custom platform fonts used`, customOnly, { selector, fonts });
    if (!customOnly && !strictCustom) evidence.explanationRequired = 'Inspect actual symbols and CSS intent before accepting any system-font contribution; node-level CDP counts do not identify individual characters.';
    return evidence;
  }
  await collect('home live prologue', '.atlas-prologue');
  await collect('home live title caption', '.atlas-title-caption > span');
  await primary(page, 'home-begin', '.atlas-begin', 'f5efdf');
  if (shots) {
    await page.getByRole('button', { name: '打开设置', exact: true }).click();
    await primary(page, 'settings-done', '.settings-done', 'f6efdb');
    await page.getByRole('button', { name: '完成', exact: true }).click();
  }
  await page.locator('.study-entry-button[data-chapter-id="2"]').click();
  await page.waitForFunction(() => document.querySelector('#scroll-artwork canvas')?.dataset.chapter === '2' && document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 90000 });
  report.gpu = await page.locator('#scroll-artwork canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl ? { version: gl.getParameter(gl.VERSION), vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL || gl.VENDOR), renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL || gl.RENDERER) } : null;
  });
  await page.getByRole('button', { name: '打开文化解读', exact: true }).click();
  await collect('formerly mixed chapter-2 boat/bridge paragraph', '.culture-looking p');
  await page.getByRole('tab', { name: '原作全文', exact: true }).click();
  const chronology = await collect('formerly mixed chapter-2 chronology note', '.culture-transcript-note p');
  check('chronology note contains approved 705/710/712 wording', chronology.text === '705年中宗复位，710年睿宗再度即位，712年传位玄宗。本卷以文学笔意串联花事，赏花风尚的流转跨越更长的时光。');
  await collect('chronology title', '.culture-transcript-note > strong');
  await collect('chronology primary-source link', '.culture-transcript-note > a');
  report.primaryLink = await page.locator('.culture-transcript-note > a').evaluate(node => ({ href: node.href, target: node.target, rel: node.rel }));
  check('chronology actual primary href and safe new tab', report.primaryLink.href === new URL('https://zh.wikisource.org/wiki/舊唐書/卷7').href && report.primaryLink.target === '_blank' && report.primaryLink.rel.includes('noopener') && report.primaryLink.rel.includes('noreferrer'));
  if (shots) for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width, height });
    for (const tab of ['花事札记', '原作全文']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      const selector = tab === '原作全文' ? '.culture-transcript-note' : '.culture-reference-list > a:last-child';
      await page.locator(selector).scrollIntoViewIfNeeded();
      if (tab === '原作全文') await keyboardTarget(page, '.culture-transcript-note > a');
      await page.waitForTimeout(250);
      const layout = await page.locator(selector).evaluate(node => {
        const panel = node.closest('.culture-panel'), bounds = node.getBoundingClientRect(), parent = panel.getBoundingClientRect(), glyphs = [];
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) { const text = walker.currentNode; let offset = 0; for (const character of text.textContent) { const end = offset + character.length; if (!/\s/u.test(character)) { const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, end); for (const box of range.getClientRects()) if (box.width && box.height) glyphs.push({ character, ...box.toJSON() }); } offset = end; } }
        return { text: node.textContent, bounds: bounds.toJSON(), panel: parent.toJSON(), scrollWidth: node.scrollWidth, clientWidth: node.clientWidth, glyphs, primaryFocusVisible: !!node.querySelector('a:focus-visible'), href: (node.matches('a') ? node : node.querySelector('a'))?.href };
      });
      check(`chapter-2 ${tab} ${width}: no note/link or glyph overflow`, layout.bounds.left >= -.8 && layout.bounds.right <= width + .8 && layout.bounds.top >= -.8 && layout.bounds.bottom <= height + .8 && layout.scrollWidth <= layout.clientWidth + 1 && layout.glyphs.every(box => box.left >= layout.bounds.left - .8 && box.right <= layout.bounds.right + .8 && box.top >= layout.bounds.top - .8 && box.bottom <= layout.bounds.bottom + .8), layout);
      if (tab === '原作全文') check(`chapter-2 chronology ${width}: actual keyboard source focus`, layout.primaryFocusVisible);
      check(`chapter-2 ${tab} ${width}: actual history URL`, layout.href === report.primaryLink.href);
      const filename = path.join(shots, `chapter-2-${tab === '原作全文' ? 'chronology' : 'notes-source'}-${width}.png`);
      await page.screenshot({ path: filename }); report.chronologyLayouts.push({ width, height, tab, ...layout, screenshot: relative(filename), screenshotSha256: sha(fs.readFileSync(filename)) });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.keyboard.press('Escape');
  await page.getByRole('slider', { name: '画卷游观进度', exact: true }).fill('1');
  await page.locator('.colophon-keepsake > span').waitFor({ state: 'visible', timeout: 90000 });
  await collect('formerly mixed chapter-2 real keepsake button', '.colophon-keepsake > span');
  await page.getByRole('button', { name: '留一笺春色', exact: true }).click();
  await page.locator('.flower-letter-dialog[open]').waitFor();
  await page.waitForFunction(() => document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false', null, { timeout: 90000 });
  for (const [name, selector] of [
    ['letter kicker', '.flower-letter-kicker'], ['letter title', '#flower-letter-title'],
    ['letter introduction', '.flower-letter-intro'], ['letter chosen contemporary verse', '.flower-letter-selected'],
    ['letter seal action', '.flower-letter-primary > span'], ['letter export metadata', '.flower-letter-footnote'],
  ]) await collect(name, selector);
  for (let index = 1; index <= 4; index++) {
    await collect(`letter choice ${index} word`, `.flower-letter-choices > button:nth-child(${index}) > span`);
    await collect(`letter choice ${index} caption`, `.flower-letter-choices > button:nth-child(${index}) > small`);
  }
  await primary(page, 'letter-seal', '.flower-letter-primary', 'f6efdb');
  const unsealedPreview = await page.locator('.flower-letter-preview > img').getAttribute('src');
  await page.getByRole('button', { name: '钤印 · 留芳', exact: true }).click();
  await page.waitForFunction(previous => document.querySelector('.flower-letter-dialog')?.classList.contains('is-sealed') && document.querySelector('.flower-letter-preview')?.getAttribute('aria-busy') === 'false' && document.querySelector('.flower-letter-preview > img')?.getAttribute('src') !== previous && !document.querySelector('.flower-letter-primary')?.disabled, unsealedPreview, { timeout: 90000 });
  await collect('sealed letter status', '.flower-letter-sealed-note');
  await collect('sealed letter save action', '.flower-letter-primary > span');
  await collect('sealed letter recompose action', '.flower-letter-again');
  await primary(page, 'letter-save', '.flower-letter-primary', 'f6efdb');
  await page.waitForTimeout(260);
  report.sealedChoices = await page.locator('.flower-letter-choices > button').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, selected: node.getAttribute('aria-pressed') === 'true', disabled: node.disabled, opacity: Number(getComputedStyle(node).opacity) })));
  check('sealed choices remain disabled and selected remains fully visible', report.sealedChoices.length === 4 && report.sealedChoices.every(node => node.disabled && node.opacity === (node.selected ? 1 : .65)) && report.sealedChoices.filter(node => node.selected).length === 1, report.sealedChoices);
  report.letterPreview = await page.locator('.flower-letter-preview > img').evaluate(image => ({ naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, alt: image.alt }));
  check('real local letter preview generated', report.letterPreview.naturalWidth === 1200 && report.letterPreview.naturalHeight === 1600);
  await page.keyboard.press('Escape');
  check('letter closes back to real keepsake button', await page.getByRole('button', { name: '留一笺春色', exact: true }).evaluate(node => node === document.activeElement));
  if (shots) {
    const errorPage = await browser.newPage({ viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' });
    try {
      errorPage.on('pageerror', error => report.errors.push(error.message));
      let injected = 0;
      await errorPage.route('**/assets/new-scrolls/chapter-1/scene.json', route => {
        injected++; report.expectedFailures.push({ status: 503, url: route.request().url(), reason: 'Deliberate manifest failure to inspect the real loading retry button; no product error-state mock.' });
        return route.fulfill({ status: 503, contentType: 'text/plain', body: 'Deliberate retry-state verification' });
      });
      await errorPage.goto(base);
      await errorPage.waitForFunction(() => document.querySelector('.peony-atlas')?.classList.contains('is-ready'), null, { timeout: 90000 });
      await errorPage.locator('.atlas-begin').click();
      await errorPage.locator('.art-loading__retry').waitFor({ state: 'visible', timeout: 90000 });
      await errorPage.evaluate(() => document.fonts.ready);
      await primary(errorPage, 'loading-retry', '.art-loading__retry', 'f4ebdc');
      check('loading retry is a real failed resource state', injected > 0 && await errorPage.locator('.art-loading__error[role="alert"]').count() === 1);
    } finally { await errorPage.close(); }
  }
  for (const asset of buildFiles.filter(file => file !== 'index.html')) {
    const result = await page.request.get(new URL(asset, base).href), body = await result.body();
    report.http.push({ path: asset, status: result.status(), bytes: body.length, sha256: sha(body), matchesBuild: sha(body) === report.buildBefore[asset].sha256 });
  }
  await Promise.all(fontResponses);
  check('browser actually fetched exact frozen font bytes', report.browserFontResponses.some(result => result.status === 200 && result.bytes === font.bytes && result.sha256 === font.sha256));
  check('HTTP font/license/bundle bytes match frozen build', report.http.every(result => result.status === 200 && result.matchesBuild));
  report.limitations = ['CSS.getPlatformFontsForNode reports actual fonts used by child text nodes, not each individual character.', 'Only real UI nodes are queried. No cloned probes, FontFace.check coverage test or DOM text replacement is used.', 'Exported PNG has no DOM/platform-font trace. Its text corpus must additionally be covered by the decoded WOFF2 cmap and its image/canvas checks; this proof does not infer a font from PNG pixels.', 'Glyph geometry/collision validation remains a separate 270-case test. This font proof does not replace it.'];
})().catch(error => { report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  try { await Promise.all(fontResponses); if (browser) await browser.close(); } catch (error) { report.errors.push(`cleanup browser: ${error.message}`); }
  if (server.listening) await new Promise(resolve => server.close(resolve));
  report.sourceAfter = sourceManifest(); report.buildAfter = buildManifest();
  check('source inputs unchanged during font proof', JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter));
  check('frozen build inputs unchanged during font proof', JSON.stringify(report.buildBefore) === JSON.stringify(report.buildAfter));
  check('no browser errors', report.errors.length === 0);
  report.completedAt = new Date().toISOString(); report.passed = !report.failure && report.checks.every(result => result.pass);
  report.status = report.passed ? 'passed' : 'failed';
  if (!report.passed) process.exitCode = 1;
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, report: relative(output), checks: report.checks.length, nodes: report.nodes.length, errors: report.errors, failure: report.failure }, null, 2));
});

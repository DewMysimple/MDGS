/* Read-only CDP evidence on the immutable, old-font editorial build.
 * This does not certify font coverage; it records actual fonts used by UI nodes. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { chromium } = require(process.env.MDGS_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../../..');
const build = path.resolve(root, process.env.MDGS_FONT_BUILD_DIR || 'tmp/editorial-candidate-dist');
const output = path.resolve(process.env.MDGS_FONT_REPORT || path.join(__dirname, 'editorial-old-font.json'));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const manifest = () => Object.fromEntries(['index.html', 'fonts/wenkai-web.woff2', ...fs.readdirSync(path.join(build, 'assets')).filter(n => /\.(js|css)$/.test(n)).map(n => `assets/${n}`)].map(file => [file, { bytes: fs.statSync(path.join(build, file)).size, sha256: sha(fs.readFileSync(path.join(build, file))) }]));
const before = manifest();
const report = { scope: 'Actual CDP platform-font usage in an immutable old-font editorial candidate; not candidate 4, not a coverage or layout certification.', started: new Date().toISOString(), driverSha256: sha(fs.readFileSync(__filename)), buildDirectory: path.relative(root, build), before, nodes: [], errors: [] };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(build, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (file !== build && !file.startsWith(build + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'content-length': stat.size });
    fs.createReadStream(file).pipe(res);
  });
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ executablePath: process.env.MDGS_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  report.browser = browser.version();
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  p.on('pageerror', e => report.errors.push(e.message));
  const response = await p.goto(`${base}#chapter-2`);
  report.http = [{ path: '/', status: response.status(), sha256: sha(await response.body()) }];
  await p.waitForFunction(() => document.querySelector('#scroll-artwork canvas')?.dataset.chapter === '2' && document.querySelector('[data-journey-phase]')?.dataset.journeyPhase === 'SCROLL_VIEWER', null, { timeout: 90000 });
  await p.evaluate(() => document.fonts.ready);
  for (const asset of ['fonts/wenkai-web.woff2', ...Object.keys(before).filter(n => /\.(js|css)$/.test(n))]) {
    const r = await p.request.get(new URL(asset, base).href);
    const body = await r.body();
    report.http.push({ path: asset, status: r.status(), bytes: body.length, sha256: sha(body), matchesBuild: sha(body) === before[asset].sha256 });
  }
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  async function collect(name, selector) {
    await p.locator(selector).scrollIntoViewIfNeeded();
    await p.evaluate(() => document.fonts.ready);
    const { root: documentNode } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: documentNode.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    const node = await p.locator(selector).evaluate(el => ({ text: el.textContent, fontFamily: getComputedStyle(el).fontFamily, fontSize: getComputedStyle(el).fontSize, displayed: !!el.getClientRects().length }));
    report.nodes.push({ name, chapterId: 2, selector, ...node, fonts, usesCustomAndSystemFonts: fonts.some(f => f.isCustomFont && f.glyphCount > 0) && fonts.some(f => !f.isCustomFont && f.glyphCount > 0) });
  }
  await p.getByRole('button', { name: '打开文化解读', exact: true }).click();
  await collect('花事札记真实舟桥正文', '.culture-looking p');
  await p.getByRole('tab', { name: '原作全文', exact: true }).click();
  await collect('新增年代参读正文（旧字体）', '.culture-transcript-note p');
  report.primaryHref = await p.locator('.culture-transcript-note a').getAttribute('href');
  await p.keyboard.press('Escape');
  await p.locator('input[aria-label="画卷游观进度"]').evaluate(el => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '1');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await p.locator('.colophon-keepsake > span').waitFor({ state: 'visible', timeout: 90000 });
  await collect('卷二卷末真实留笺按钮', '.colophon-keepsake > span');
  report.actualFallbackObserved = report.nodes.filter(n => /舟|桥|笺/.test(n.text)).every(n => n.usesCustomAndSystemFonts);
  report.limitations = ['Platform-font entries describe the real node as a whole; CDP does not assign each individual character to a font.', 'Previous glyph-cell geometry checks establish bounds and collision behavior, not complete use of a single custom font.', 'No FontFace.check coverage assertion is used.', 'The old 242380-byte build font is intentional. New public-font changes are outside this immutable-build evidence.'];
})().catch(error => { report.failure = error.stack; process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
  report.after = manifest();
  report.buildUnchanged = JSON.stringify(before) === JSON.stringify(report.after);
  report.completed = new Date().toISOString();
  report.passed = !report.failure && !report.errors.length && report.buildUnchanged && report.actualFallbackObserved && report.http.every(r => r.status === 200 && r.matchesBuild !== false);
  if (!report.passed) process.exitCode = 1;
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, report: output, nodes: report.nodes.map(n => ({ name: n.name, fonts: n.fonts })) }, null, 2));
});

/** Build a self-contained Windows x64 portable EXE and deliver a verified ZIP
 * plus the files actually extracted from it. Build tools are never needed by
 * the recipient. node scripts/package-desktop.mjs --output <empty directory>
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const deliverOnly = args.includes('--deliver-only');
assert((args.length === 2 || (args.length === 3 && args[2] === '--deliver-only')) && args[0] === '--output' && args[1], 'Usage: npm run export:desktop -- --output <directory> [--deliver-only]');
assert.equal(process.platform, 'win32', 'Build this Windows package on Windows.');
const output = path.resolve(args[1]);
const folderName = '数字牡丹赋-Windows-x64', zipName = folderName + '.zip';
for (const target of [path.join(output, folderName), path.join(output, zipName)]) {
  await assert.rejects(access(target), error => error.code === 'ENOENT', `Refusing to overwrite an existing delivery: ${target}`);
}
async function run(executable, arguments_, cwd = root, environment = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(executable, arguments_, { cwd, windowsHide: true, stdio: 'inherit', env: { ...process.env, ...environment } });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} exited with ${code}`)));
  });
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}
if (!deliverOnly) {
await run(process.execPath, [path.join(root, 'scripts/package-exhibition.mjs')]);
// Also works with npm versions that defer dependency lifecycle scripts.
await run(process.execPath, [path.join(root, 'node_modules/electron/install.js')]);
await run(process.execPath, [path.join(root, 'node_modules/electron-builder/cli.js'), '--config', 'electron-builder.config.cjs', '--win', 'portable', '--x64', '--publish', 'never'], root, {
  ELECTRON_BUILDER_7ZIP_PATH: require('7zip-bin').path7za,
  ELECTRON_BUILDER_CACHE: path.join(root, 'tmp/desktop-builder-cache'),
});
}
const portable = path.join(root, 'dist-desktop/数字牡丹赋.exe');
assert((await stat(portable)).size > 100 * 1024 * 1024, 'A bundled browser must be present in the portable executable.');
const inventory = JSON.parse(await readFile(path.join(root, 'dist-exhibition/.mdgs-exhibition-package.json'), 'utf8'));
assert.equal(inventory.status, 'ready'); assert.equal(inventory.buildSourceVerified, true);
// A resumed delivery must still refer to the source and desktop host that were
// built, rather than silently shipping an unrelated older dist directory.
for (const item of inventory.sourceInputs) assert.equal(await sha256(path.join(root, item.path)), item.sha256, 'Source changed after the exhibition build: ' + item.path);
const asar = require('@electron/asar');
const appArchive = path.join(root, 'dist-desktop/win-unpacked/resources/app.asar');
for (const name of ['main.cjs', 'package.json', 'icon.ico']) assert.deepEqual(asar.extractFile(appArchive, name), await readFile(path.join(root, 'desktop', name)), 'Packaged desktop host differs: ' + name);
assert.equal(await sha256(path.join(root, 'dist-desktop/win-unpacked/resources/web/.mdgs-exhibition-package.json')), await sha256(path.join(root, 'dist-exhibition/.mdgs-exhibition-package.json')));
await mkdir(path.join(root, 'tmp'), { recursive: true });
const staging = await mkdtemp(path.join(root, 'tmp/desktop-delivery-'));
const folder = path.join(staging, folderName);
await mkdir(folder);
await copyFile(portable, path.join(folder, '数字牡丹赋.exe'));
await writeFile(path.join(folder, '运行说明.txt'), '\ufeff国色长卷 · 数字牡丹赋\r\n\r\n双击“数字牡丹赋.exe”即可运行，无需安装。\r\n适用于 Windows 10/11 64位。程序已内置 Chromium 浏览器内核、Node.js、四卷原画与模型、字体、声音及全部运行资源，无需安装浏览器、Node.js、Python或Blender；作品可以断网运行。\r\n首次启动需把内置运行文件释放到系统临时目录，请等待窗口出现。\r\n\r\nF11：切换全屏；Esc：退出全屏。窗口关闭即退出。\r\n点击“启声”开启原创数字声景。使用滚轮、拖拽、方向键、分镜或自动展卷游观。\r\n卷末可择意钤印并保存花笺PNG，保存时自行选择文件夹。设置保存在当前Windows用户的应用数据目录，更新EXE不清空设置。\r\n文献与馆藏参读链接会在系统浏览器打开，仅此类外部网页需要联网。\r\n\r\n无需管理员权限。请保留原始EXE；程序不安装服务，不下载运行依赖。内置作品来源及第三方许可随EXE收录。\r\n', 'utf8');
const desktopMetadata = JSON.parse(await readFile(path.join(root, 'desktop/package.json'), 'utf8'));
const manifest = {
  generator: 'MDGS Windows portable delivery', version: desktopMetadata.version,
  createdAt: new Date().toISOString(), platform: 'win32-x64',
  electron: require('../package.json').devDependencies.electron,
  includesBrowserAndNode: true, offlineRuntime: true,
  originalArtworkCopiedWithoutReencoding: inventory.copiedOriginalArtworkWithoutReencoding,
  exhibitionInventorySha256: await sha256(path.join(root, 'dist-exhibition/.mdgs-exhibition-package.json')),
  files: await Promise.all(['数字牡丹赋.exe', '运行说明.txt'].map(async name => ({
    path: name, bytes: (await stat(path.join(folder, name))).size, sha256: await sha256(path.join(folder, name)),
  }))),
};
await writeFile(path.join(folder, '交付清单.json'), JSON.stringify(manifest, null, 2) + '\n');
const archive = path.join(staging, zipName), sevenZip = require('7zip-bin').path7za;
await run(sevenZip, ['a', '-tzip', '-mx=0', archive, folderName], staging);
await run(sevenZip, ['t', archive]);
await mkdir(output, { recursive: true });
const deliveredZip = path.join(output, zipName);
await copyFile(archive, deliveredZip);
assert.equal(await sha256(deliveredZip), await sha256(archive), 'ZIP copy hash mismatch.');
await run(sevenZip, ['x', deliveredZip, '-o' + output, '-aos']);
for (const file of [...manifest.files, { path: '交付清单.json', sha256: await sha256(path.join(folder, '交付清单.json')) }]) {
  assert.equal(await sha256(path.join(output, folderName, file.path)), file.sha256, 'Extracted file mismatch: ' + file.path);
}
const report = {
  status: 'passed', ...manifest, sourceBuildVerified: true, desktopBuildMode: deliverOnly ? 'Previously built EXE supplied; current source and packaged host checked before delivery.' : 'Electron builder executed by this command.',
  zip: { path: deliveredZip, bytes: (await stat(deliveredZip)).size, sha256: await sha256(deliveredZip), integrityTestPassed: true },
  extractedDirectory: path.join(output, folderName), extractedFileHashesPassed: true,
  runtimeValidation: 'Run npm run test:desktop against the packaged executable; this report verifies packaging, not interactive behavior.',
};
await mkdir(path.join(root, 'reports/desktop'), { recursive: true });
await writeFile(path.join(root, 'reports/desktop/package.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ status: report.status, zip: report.zip, extractedDirectory: report.extractedDirectory }, null, 2));

/** Build a self-contained exhibition folder without altering public assets.
 * Original textures/program fields are copied byte-for-byte, never optimized.
 * node scripts/package-exhibition.mjs [--skip-build]
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, writeFile, readdir, stat, lstat, realpath, mkdir, rm, rename, open, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const physicalRoot = await realpath(root);
const build = path.join(root, 'dist'), destination = path.join(root, 'dist-exhibition');
const staging = path.join(root, 'dist-exhibition.staging'), marker = '.mdgs-exhibition-package.json';
const skipBuild = process.argv.includes('--skip-build');
assert(process.argv.slice(2).every(arg => arg === '--skip-build'), 'Only --skip-build is supported.');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
async function assertLocalInput(file, directory = false) {
  const local = path.relative(root, file);
  assert(local && !local.startsWith('..' + path.sep) && !path.isAbsolute(local), 'Input must stay within this workspace.');
  const info = await lstat(file);
  assert(!info.isSymbolicLink() && (directory ? info.isDirectory() : info.isFile()), `Unexpected linked or non-regular input: ${relative(file)}`);
  assert.equal(path.relative(path.join(physicalRoot, local), await realpath(file)), '', `Input parent must not redirect outside its expected location: ${relative(file)}`);
}
async function walk(directory) {
  await assertLocalInput(directory, true);
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    assert(!item.isSymbolicLink(), `Package inputs must not be symlinks: ${relative(path.join(directory, item.name))}`);
    const file = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...await walk(file)); else if (item.isFile()) result.push(file);
  }
  return result.sort();
}
async function hashFiles(files) {
  const results = new Array(files.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
    while (next < files.length) { const index = next++, file = files[index]; await assertLocalInput(file); const bytes = await readFile(file);
      results[index] = { path: relative(file), bytes: bytes.length, sha256: digest(bytes) };
    }
  }));
  return results;
}
async function run(file, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, file), ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited with ${code}`)));
  });
}
// Both removable paths are fixed, resolved children of this workspace. A
// marker is required so an unrelated user directory is never replaced.
async function assertGenerated(directory) {
  assert([destination, staging].includes(directory) && path.dirname(directory) === path.resolve(root), 'Unexpected package target.');
  try {
    const info = await lstat(directory); assert(info.isDirectory() && !info.isSymbolicLink(), 'Package target must be a real directory.');
    const identity = JSON.parse(await readFile(path.join(directory, marker), 'utf8'));
    assert.equal(identity.generator, 'MDGS exhibition package'); return true;
  } catch (error) { if (error.code === 'ENOENT') {
      try { await lstat(directory); } catch (missing) { if (missing.code === 'ENOENT') return false; throw missing; }
      throw new Error(`Refusing to replace an unmarked directory: ${relative(directory)}`);
    } throw error; }
}
const roots = ['assets/new-scrolls', 'ui/peony-atlas', 'fonts'];
const singles = ['index.html', 'favicon.svg', 'ui/brocade.svg', ...['strings', 'breath', 'atmosphere'].map(name => `audio/peony-v3-${name}.mp3`),
  ...['manifest', 'provenance', 'score'].map(name => `audio/peony-v3-${name}.json`)];
const libraries = ['react', 'react-dom', 'scheduler', 'three', 'lucide-react'];
async function sourceInputFiles() {
  const publicFiles = singles.filter(file => file !== 'index.html').map(file => path.join(root, 'public', file));
  for (const directory of roots) publicFiles.push(...await walk(path.join(root, 'public', directory)));
  return [...await walk(path.join(root, 'src')), ...['index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'scripts/package-exhibition.mjs', 'scripts/serve-exhibition.cjs'].map(file => path.join(root, file)),
    ...libraries.flatMap(name => ['LICENSE', 'package.json'].map(file => path.join(root, 'node_modules', name, file))), ...publicFiles].sort();
}
const lockPath = path.join(root, '.mdgs-exhibition.lock');
const lock = await open(lockPath, 'wx').catch(error => { if (error.code === 'EEXIST') throw new Error('Another exhibition export may be running. Inspect .mdgs-exhibition.lock before retrying.'); throw error; });
try {
await lock.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
const sourceFiles = await sourceInputFiles();
const before = await hashFiles(sourceFiles);
const expectedPublic = new Map(before.filter(item => item.path.startsWith('public/')).map(item => [item.path.slice(7), item.sha256]));
if (!skipBuild) {
  try { await assertLocalInput(build, true); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await run('node_modules/typescript/bin/tsc', ['-b']);
  await run('node_modules/vite/bin/vite.js', ['build']);
}
const selected = [...singles.map(file => path.join(build, file))];
for (const directory of roots) selected.push(...await walk(path.join(build, directory)));
for (const item of await readdir(path.join(build, 'assets'), { withFileTypes: true })) {
  assert(!item.isSymbolicLink()); if (item.isFile()) selected.push(path.join(build, 'assets', item.name));
}
selected.sort();
const outputFiles = [], buildBytes = (await Promise.all((await walk(build)).map(async file => (await stat(file)).size))).reduce((a, b) => a + b, 0);
await assertGenerated(destination);
if (await assertGenerated(staging)) await rm(staging, { recursive: true });
await mkdir(staging);
await writeFile(path.join(staging, marker), JSON.stringify({ generator: 'MDGS exhibition package', status: 'preparing' }));
for (const file of selected) {
  const item = path.relative(build, file).replaceAll('\\', '/');
  assert(item && !item.startsWith('../') && !path.isAbsolute(item));
  const target = path.join(staging, item); await mkdir(path.dirname(target), { recursive: true });
  await assertLocalInput(file);
  const bytes = await readFile(file); await writeFile(target, bytes);
  if (item !== 'index.html' && !/^assets\/[^/]+$/.test(item)) {
    assert(expectedPublic.has(item), `Built public asset was not in the source snapshot: ${item}`);
    assert.equal(digest(bytes), expectedPublic.get(item), `Built public asset differs from its source: ${item}`);
  }
  assert.equal(digest(await readFile(target)), digest(bytes), `Copy verification failed: ${item}`);
  outputFiles.push({ path: item, bytes: bytes.length, sha256: digest(bytes), origin: relative(file) });
}
const extras = {
  'serve.cjs': await readFile(path.join(root, 'scripts/serve-exhibition.cjs')),
  '启动展览.cmd': Buffer.from('@echo off\r\nsetlocal\r\npushd "%~dp0"\r\nnode serve.cjs --open\r\npopd\r\npause\r\n', 'utf8'),
  '运行说明.txt': Buffer.from('国色长卷 · 数字牡丹赋\n\n电脑端数字艺术作品。此目录为完整运行文件，无需项目源码、npm依赖、Blender或外部字体。\n\nWindows：安装Node.js 18或更新版本后，双击“启动展览.cmd”。\n其他系统：在本目录运行 node serve.cjs --open。\n也可以将本目录交给任意支持静态文件的HTTP服务器。请通过HTTP地址进入，勿直接双击index.html。\n\n首次点击“启声”开启原创数字声景。四卷可滚轮、拖拽、方向键游观或自动展卷；“画中有遇”参与画中叙事，卷末可保存观者花笺。\n\n展示包仅收录当前四卷及选用美术、声音与字体。原画纹理与程序场逐字节复制；工程、旧版素材、可编辑原件和创作报告保留在完整仓库。\n', 'utf8'),
  '创作与来源.txt': Buffer.from('国色长卷 · 数字牡丹赋\n\n一朵花，如何进入中国人的生活与想象？本作以四卷国画连接山野、御苑、人间与诗意，让游观、辨读、入锦与落印成为观众参与叙事的方式。\n\n四卷原作：用户提供的“牡丹2.0”。本轮保留作者图层、几何、镜头、材质、动画及25段原文；新增诗意短章、花事札记与观者花笺为当代展览新题。贬花烈火明确为传说；第三卷入锦为艺术化联想，不模拟特定织造技法。\n\n首页美术：内置image_gen辅助生成四幅独立画层，再进行原创分层布局、风动、湿色与指针交互。没有将参考网站的画面、代码或音轨复制进作品。提示、尺寸与哈希见ui/peony-atlas/provenance.json；原始PNG与完整调研在工程仓库。\n\n声音：《一庭春深》三轨原创数字声景，由独立乐谱和本地合成制作，无外部录音、借用旋律或分离音轨。不声称真人器乐演奏或唐乐复原。来源与乐谱见audio/peony-v3-provenance.json及peony-v3-score.json。\n\n字体：本地霞鹜文楷，OFL许可全文见fonts/OFL-WenKai.txt。程序运行库与许可见third-party-licenses/NOTICE.txt。新增文化札记在网页内直接提供文献、馆藏参读链接，未把这些馆藏图片收入作品。\n', 'utf8'),
};
const notices = [];
for (const name of libraries) {
  const file = path.join(root, 'node_modules', name, 'LICENSE');
  extras[`third-party-licenses/${name}.txt`] = await readFile(file);
  const metadata = JSON.parse(await readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'));
  notices.push(`${name} ${metadata.version} — third-party-licenses/${name}.txt`);
}
extras['third-party-licenses/NOTICE.txt'] = Buffer.from('Bundled runtime library notices\n\n' + notices.join('\n') + '\n\nThe local Wenkai font license is supplied separately in fonts/OFL-WenKai.txt.\n', 'utf8');
for (const [name, bytes] of Object.entries(extras)) {
  await mkdir(path.dirname(path.join(staging, name)), { recursive: true });
  await writeFile(path.join(staging, name), bytes); outputFiles.push({ path: name, bytes: bytes.length, sha256: digest(bytes), origin: 'exhibition tooling or bundled third-party license' });
}
const after = await hashFiles(await sourceInputFiles());
assert.deepEqual(after, before, 'Product source changed during packaging; rebuild after concurrent edits finish.');
const packageBytes = outputFiles.reduce((sum, item) => sum + item.bytes, 0);
const inventory = {
  generator: 'MDGS exhibition package', status: 'ready', createdAt: new Date().toISOString(),
  sourceAssociation: skipBuild ? 'Prebuilt dist supplied; source-to-build association not re-executed.' : 'TypeScript and Vite build executed between matching source snapshots.',
  buildSourceVerified: !skipBuild,
  sourceStable: true, sourceInputs: before, files: outputFiles, runtimeEdition: 'peony-2.0-2026-10-23',
  bytesExcludingInventory: packageBytes, fullBuildBytes: buildBytes, excludedHistoricalBytes: buildBytes - outputFiles.filter(item => item.origin.startsWith('dist/')).reduce((sum, item) => sum + item.bytes, 0),
  copiedOriginalArtworkWithoutReencoding: true,
};
await writeFile(path.join(staging, marker), JSON.stringify(inventory, null, 2) + '\n');
if (await assertGenerated(destination)) await rm(destination, { recursive: true });
for (let attempt = 0; ; attempt++) {
  try { await rename(staging, destination); break; }
  catch (error) {
    if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 3) throw error;
    await delay(200 * (attempt + 1));
  }
}
await mkdir(path.join(root, 'reports/art-renewal'), { recursive: true });
await writeFile(path.join(root, 'reports/art-renewal/exhibition-package.json'), JSON.stringify({ ...inventory, sourceInputs: before.map(item => ({ ...item })), inventorySha256: digest(await readFile(path.join(destination, marker))), outputDirectory: 'dist-exhibition' }, null, 2) + '\n');
console.log(`Exhibition package: dist-exhibition / ${outputFiles.length} files / ${(packageBytes / 1e6).toFixed(2)} MB. Original artwork bytes preserved.`);
} finally { await lock.close(); await unlink(lockPath); }

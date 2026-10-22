/**
 * Reproducible structural validation for the Blender-to-Web scene manifests.
 * Run from any directory: node scripts/validate-assets.mjs
 * No Blender, browser, image packages or network access is required.
 */
import { readFile, stat, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const options = { assetsDir: path.join(projectRoot, 'public', 'assets'), reportDir: path.join(projectRoot, 'reports'), maxTextureEdge: 4096 };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--help') {
    console.log('Usage: node scripts/validate-assets.mjs [--assets-dir PATH] [--report-dir PATH] [--max-texture-edge 4096]');
    process.exit(0);
  }
  if (arg === '--assets-dir' && process.argv[i + 1]) options.assetsDir = path.resolve(process.argv[++i]);
  else if (arg === '--report-dir' && process.argv[i + 1]) options.reportDir = path.resolve(process.argv[++i]);
  else if (arg === '--max-texture-edge' && process.argv[i + 1]) options.maxTextureEdge = Number(process.argv[++i]);
  else throw new Error(`Unknown or incomplete argument: ${arg}`);
}
if (!Number.isFinite(options.maxTextureEdge) || options.maxTextureEdge <= 0) throw new Error('--max-texture-edge must be positive');

const finite = value => typeof value === 'number' && Number.isFinite(value);
const vector = (value, length) => Array.isArray(value) && value.length === length && value.every(finite);
const mib = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
const sum = values => values.reduce((total, value) => total + value, 0);
const formatTime = date => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' }).format(date);

async function directoryFiles(directory) {
  const results = [];
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) results.push(...await directoryFiles(target));
      else if (entry.isFile()) results.push({ path: target, bytes: (await stat(target)).size });
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return results;
}

// Read encoded dimensions, rather than trusting a source image's pre-resize size.
function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { format: 'PNG', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { format: 'WebP', width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    if (chunk === 'VP8 ' && buffer[23] === 157 && buffer[24] === 1 && buffer[25] === 42) {
      return { format: 'WebP', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L' && buffer[20] === 47) {
      const bits = buffer.readUInt32LE(21);
      return { format: 'WebP', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216) {
    let cursor = 2;
    while (cursor + 8 < buffer.length) {
      if (buffer[cursor] !== 255) { cursor++; continue; }
      while (buffer[cursor] === 255) cursor++;
      const marker = buffer[cursor++];
      if (marker === 217 || marker === 218) break;
      if (marker === 0 || marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (cursor + 2 > buffer.length) break;
      const length = buffer.readUInt16BE(cursor);
      if (length < 2) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && cursor + 7 < buffer.length) {
        return { format: 'JPEG', width: buffer.readUInt16BE(cursor + 5), height: buffer.readUInt16BE(cursor + 3) };
      }
      cursor += length;
    }
  }
  return null;
}

function matrixDeterminant(elements) {
  const rows = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, column) => elements[column * 4 + row]));
  let determinant = 1;
  for (let column = 0; column < 4; column++) {
    let pivot = column;
    for (let row = column + 1; row < 4; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (rows[pivot][column] === 0) return 0;
    if (pivot !== column) { [rows[pivot], rows[column]] = [rows[column], rows[pivot]]; determinant *= -1; }
    const value = rows[column][column];
    determinant *= value;
    for (let row = column + 1; row < 4; row++) {
      const factor = rows[row][column] / value;
      for (let k = column + 1; k < 4; k++) rows[row][k] -= factor * rows[column][k];
    }
  }
  return determinant;
}

async function validateChapter(number) {
  const id = `chapter-${number}`;
  const directory = path.join(options.assetsDir, id);
  const manifestPath = path.join(directory, 'scene.json');
  const result = { id, manifestPath, status: 'fail', errors: [], warnings: [], counts: {}, sizes: {}, textures: [], sourceAudit: {} };
  const error = (location, message) => result.errors.push({ location, message });
  const warn = (location, message) => result.warnings.push({ location, message });
  let scene, raw;
  try { raw = await readFile(manifestPath); scene = JSON.parse(raw.toString('utf8')); }
  catch (failure) { error('scene.json', failure.code === 'ENOENT' ? '场景清单不存在，资产尚未导出。' : `无法读取场景清单：${failure.message}`); return result; }
  if (!scene || typeof scene !== 'object' || Array.isArray(scene)) { error('scene.json', '场景清单必须为 JSON 对象。'); return result; }
  const files = await directoryFiles(directory);
  result.sizes.manifestBytes = raw.byteLength;
  result.sizes.directoryBytes = sum(files.map(file => file.bytes));
  result.sizes.fileCount = files.length;
  if (raw.byteLength > 20 * 1024 * 1024) warn('scene.json', '清单超过 20 MiB；建议检查几何体规模或改用二进制几何。');
  if (scene.version !== 1) error('version', `不支持的版本 ${scene.version}，需要 version: 1。`);
  if (scene.id !== id) error('id', `应为 ${id}，实际为 ${scene.id}。`);
  if (scene.matrixOrder !== 'column-major') error('matrixOrder', '需要明确使用 column-major 矩阵。');
  if (scene.quaternionOrder !== 'xyzw') error('quaternionOrder', '需要明确使用 xyzw 四元数。');
  const frameRangeValid = vector(scene.frameRange, 2) && scene.frameRange[1] > scene.frameRange[0];
  if (!frameRangeValid) error('frameRange', '帧范围必须为递增的两个有限数值。');
  if (!finite(scene.fps) || scene.fps <= 0) error('fps', '帧率必须为正数。');
  for (const key of ['width', 'height', 'pixelAspectX', 'pixelAspectY']) {
    if (!finite(scene.render?.[key]) || scene.render[key] <= 0) error(`render.${key}`, '渲染尺寸和像素比例必须为正数。');
  }
  if (!['X', 'Y', 'Z'].includes(scene.travel?.axis)) error('travel.axis', '游观轴应为 X、Y 或 Z。');
  if (![1, -1].includes(scene.travel?.sign)) error('travel.sign', '游观方向应为 1 或 -1。');
  if (!vector(scene.travel?.range, 2)) error('travel.range', '游观范围必须为两个有限数值。');
  else if (scene.travel.range[1] !== scene.travel.range[0] && Math.sign(scene.travel.range[1] - scene.travel.range[0]) !== scene.travel.sign) error('travel', '游观范围与方向符号不一致。');
  if (!finite(scene.camera?.near) || !finite(scene.camera?.far) || scene.camera.near <= 0 || scene.camera.far <= scene.camera.near) error('camera', '近远裁剪面无效。');

  function validateMatrix(matrix, location) {
    if (!vector(matrix, 16)) { error(location, '矩阵必须有 16 个有限数值。'); return; }
    if ([3, 7, 11].some(index => Math.abs(matrix[index]) > 0.0001) || Math.abs(matrix[15] - 1) > 0.0001) error(location, '列主序仿射矩阵的末行应为 [0,0,0,1]。');
    const determinant = matrixDeterminant(matrix);
    if (!finite(determinant) || determinant === 0) warn(location, '矩阵不可逆；请确认源场景是否有刻意压平或零缩放对象。');
  }

  function validateTimeline(items, location, { requireEndpoints = false, withFrame = true, authoredMarkers = false } = {}) {
    if (!Array.isArray(items) || items.length === 0) { error(location, '时间序列必须为非空数组。'); return []; }
    let previous = -Infinity;
    for (const [index, item] of items.entries()) {
      const at = `${location}[${index}]`;
      // Revised Blender scenes may retain an original pre-roll marker while the
      // executable stop is clamped to their actual render range. Accept only an
      // explicit same-name authoredFrame link with the exact clamped stop; this
      // exception never applies to cameras, stops or object animation tracks.
      const authoredStop = authoredMarkers && typeof scene.sourceRevision === 'string' && frameRangeValid
        && scene.stops?.find(stop => stop.name === item.name && stop.authoredFrame === item.frame
          && stop.frame === Math.min(scene.frameRange[1], Math.max(scene.frameRange[0], item.frame))
          && finite(stop.progress) && stop.progress >= 0 && stop.progress <= 1);
      if (!finite(item.progress) || ((!authoredStop) && (item.progress < 0 || item.progress > 1))) error(`${at}.progress`, '进度必须在 0..1 内；源档案标记须有明确且正确裁定的执行节点。');
      else {
        if (item.progress < previous) error(`${at}.progress`, '时间序列未按进度单调排列。');
        previous = item.progress;
      }
      if (withFrame && frameRangeValid) {
        if (!finite(item.frame) || (!authoredStop && (item.frame < scene.frameRange[0] || item.frame > scene.frameRange[1]))) error(`${at}.frame`, '帧超出场景范围或数值无效。');
        else if (finite(item.progress) && Math.abs(item.progress - (item.frame - scene.frameRange[0]) / (scene.frameRange[1] - scene.frameRange[0])) > 0.000002) error(at, '帧数与归一化进度不一致。');
      }
    }
    if (requireEndpoints && (Math.abs(items[0].progress) > 0.000002 || Math.abs(items.at(-1).progress - 1) > 0.000002)) error(location, '相机或动画样本应覆盖 0 到 1 的完整进度。');
    return items;
  }

  const cameras = validateTimeline(scene.cameras, 'cameras', { requireEndpoints: true });
  for (const [index, camera] of cameras.entries()) {
    if (!vector(camera.position, 3)) error(`cameras[${index}].position`, '相机位置必须为 xyz 三个有限数值。');
    if (!vector(camera.quaternion, 4)) error(`cameras[${index}].quaternion`, '相机四元数必须为 xyzw 四个有限数值。');
    else if (Math.abs(Math.hypot(...camera.quaternion) - 1) > 0.005) error(`cameras[${index}].quaternion`, '相机四元数未归一化。');
    if (!['PERSP', 'ORTHO'].includes(camera.type)) error(`cameras[${index}].type`, '相机投影必须为 PERSP 或 ORTHO。');
    if (!finite(camera.fov) || camera.fov <= 0 || camera.fov >= 180) error(`cameras[${index}].fov`, '相机垂直视场角必须在 0..180 度内。');
    if (camera.type === 'ORTHO' && (!finite(camera.orthoScale) || camera.orthoScale <= 0)) error(`cameras[${index}].orthoScale`, '正交相机缩放应为正数。');
  }
  if (cameras.length && vector(scene.travel?.range, 2)) {
    const axis = 'XYZ'.indexOf(scene.travel.axis);
    if (axis >= 0 && vector(cameras[0].position, 3) && vector(cameras.at(-1).position, 3)) {
      if (Math.abs(scene.travel.range[0] - cameras[0].position[axis]) > 0.0001 || Math.abs(scene.travel.range[1] - cameras.at(-1).position[axis]) > 0.0001) error('travel.range', '游观范围与实际相机的首尾位置不一致。');
    }
  }
  const stops = validateTimeline(scene.stops, 'stops');
  for (const [index, stop] of stops.entries()) if (typeof stop.name !== 'string' || !stop.name.trim()) error(`stops[${index}].name`, '分镜名称不能为空。');
  if (Array.isArray(scene.markers) && scene.markers.length) validateTimeline(scene.markers, 'markers', { authoredMarkers: true });

  const materials = Array.isArray(scene.materials) ? scene.materials : [];
  const meshes = Array.isArray(scene.meshes) ? scene.meshes : [];
  const images = Array.isArray(scene.images) ? scene.images : [];
  if (materials.length === 0) error('materials', '没有导出的材质。');
  if (meshes.length === 0) error('meshes', '没有导出的几何体。');
  const textureReferences = new Map();
  function addTexture(src, location) {
    if (typeof src !== 'string' || !src.trim()) { error(location, '纹理路径必须为非空字符串。'); return; }
    if (!textureReferences.has(src)) textureReferences.set(src, []);
    textureReferences.get(src).push(location);
  }
  for (const [index, material] of materials.entries()) {
    if (material.id !== index) error(`materials[${index}].id`, '材质 id 应与数组索引相同。');
    if (material.texture !== null && material.texture !== undefined) addTexture(material.texture, `materials[${index}].texture`);
    if (!vector(material.color, 3)) error(`materials[${index}].color`, '材质颜色应为 RGB 三个有限数值。');
    if (!finite(material.opacity) || material.opacity < 0 || material.opacity > 1) error(`materials[${index}].opacity`, '不透明度必须在 0..1 内。');
  }
  for (const [index, image] of images.entries()) addTexture(image.src, `images[${index}].src`);

  let vertices = 0, triangles = 0, textMeshes = 0;
  for (const [index, mesh] of meshes.entries()) {
    const location = `meshes[${index}] (${mesh.name ?? 'unnamed'})`;
    validateMatrix(mesh.matrix, `${location}.matrix`);
    if (!Array.isArray(mesh.positions) || mesh.positions.length === 0 || mesh.positions.length % 3 || !mesh.positions.every(finite)) { error(`${location}.positions`, '顶点应为非空、完整且有限的 xyz 数组。'); continue; }
    const vertexCount = mesh.positions.length / 3;
    vertices += vertexCount;
    if (mesh.indices !== undefined) {
      if (!Array.isArray(mesh.indices) || mesh.indices.length % 3 || !mesh.indices.every(value => Number.isInteger(value) && value >= 0 && value < vertexCount)) error(`${location}.indices`, '三角形索引必须为有效顶点索引，数量为 3 的倍数。');
      else triangles += mesh.indices.length / 3;
    } else {
      if (vertexCount % 3) error(`${location}.positions`, '非索引几何的顶点数量应为 3 的倍数。');
      triangles += vertexCount / 3;
    }
    if (!Array.isArray(mesh.uvs) || mesh.uvs.length !== vertexCount * 2 || !mesh.uvs.every(finite)) error(`${location}.uvs`, 'UV 数量应为顶点数量的两倍，且全部为有限数值。');
    if (!Number.isInteger(mesh.material) || mesh.material < 0 || mesh.material >= materials.length) error(`${location}.material`, '材质索引超出材质数组。');
    if (!vector(mesh.bounds?.min, 3) || !vector(mesh.bounds?.max, 3) || mesh.bounds.min.some((value, axis) => value > mesh.bounds.max[axis])) error(`${location}.bounds`, '几何包围盒无效。');
    if (mesh.isText) textMeshes++;
  }
  const animations = scene.animations ?? {};
  for (const [name, samples] of Object.entries(animations)) {
    for (const [index, sample] of validateTimeline(samples, `animations.${name}`, { requireEndpoints: true, withFrame: false }).entries()) validateMatrix(sample.matrix, `animations.${name}[${index}].matrix`);
    if (!meshes.some(mesh => mesh.name === name)) warn(`animations.${name}`, '动画对象未在导出几何中找到。');
  }

  let textureBytes = 0, texturePixels = 0;
  for (const [src, references] of textureReferences) {
    const target = path.resolve(directory, src.replaceAll('/', path.sep));
    const relative = path.relative(directory, target);
    if (path.isAbsolute(src) || relative.startsWith('..') || path.isAbsolute(relative) || /^[a-z][a-z\d+.-]*:/i.test(src)) { error(src, '纹理路径应位于当前卷的资产目录。'); continue; }
    try {
      const metadata = await stat(target);
      if (!metadata.isFile() || metadata.size === 0) { error(src, '纹理文件为空或不是普通文件。'); continue; }
      const dimensions = imageDimensions(await readFile(target));
      if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) { error(src, '无法读取有效的 PNG、JPEG 或 WebP 图像尺寸。'); continue; }
      for (const image of images.filter(item => item.src === src)) {
        if (image.webSize && (!vector(image.webSize, 2) || image.webSize[0] !== dimensions.width || image.webSize[1] !== dimensions.height)) error(src, '图像清单 webSize 与实际编码尺寸不一致。');
        if (image.bytes !== undefined && image.bytes !== metadata.size) error(src, '图像清单 bytes 与实际文件体积不一致。');
      }
      if (Math.max(dimensions.width, dimensions.height) > options.maxTextureEdge) warn(src, `纹理 ${dimensions.width} × ${dimensions.height} 超过建议边长 ${options.maxTextureEdge}。`);
      if (metadata.size > 8 * 1024 * 1024) warn(src, `单张纹理 ${mib(metadata.size)} 超过 8 MiB。`);
      textureBytes += metadata.size;
      texturePixels += dimensions.width * dimensions.height;
      result.textures.push({ src, ...dimensions, bytes: metadata.size, references: references.length });
    } catch (failure) { error(src, failure.code === 'ENOENT' ? `纹理引用不存在（${references.join(', ')}）。` : `纹理读取失败：${failure.message}`); }
  }
  result.counts = { meshes: meshes.length, textMeshes, materials: materials.length, textures: textureReferences.size, validTextures: result.textures.length, vertices, triangles, cameraSamples: cameras.length, stops: stops.length, markers: scene.markers?.length ?? 0, animatedObjects: Object.keys(animations).length };
  result.sizes.textureBytes = textureBytes;
  result.sizes.browserBytes = raw.byteLength + textureBytes;
  result.sizes.decodedRgbaBytes = texturePixels * 4;
  result.sizes.maxTextureEdge = Math.max(0, ...result.textures.map(texture => Math.max(texture.width, texture.height)));
  if (result.sizes.browserBytes > 150 * 1024 * 1024) warn('sizes.browserBytes', `本卷浏览器资源合计 ${mib(result.sizes.browserBytes)}，建议检查分段加载。`);
  result.sourceAudit = { missingImages: scene.audit?.missingImages ?? [], skippedObjects: scene.audit?.skippedObjects ?? [], repairedImages: scene.audit?.repairs?.length ?? 0 };
  for (const missing of result.sourceAudit.missingImages) error('audit.missingImages', `源图像缺失：${missing.image ?? JSON.stringify(missing)}`);
  for (const skipped of result.sourceAudit.skippedObjects) warn('audit.skippedObjects', `导出跳过对象：${skipped.name ?? JSON.stringify(skipped)}${skipped.reason ? `（${skipped.reason}）` : ''}`);
  result.status = result.errors.length ? 'fail' : result.warnings.length ? 'pass-with-warnings' : 'pass';
  return result;
}

// Validate one chapter at a time to avoid holding four large geometry arrays in memory.
const chapters = [];
for (let number = 1; number <= 4; number++) chapters.push(await validateChapter(number));
const report = {
  checkedAt: new Date().toISOString(),
  localTime: formatTime(new Date()),
  timeZone: 'Asia/Shanghai',
  assetsDir: options.assetsDir,
  status: chapters.some(chapter => chapter.errors.length) ? 'fail' : 'pass',
  scope: '结构与文件完整性检查；不代替浏览器视觉、运行帧率或 GPU 资源释放验收。',
  totals: { chapters: chapters.length, errors: sum(chapters.map(chapter => chapter.errors.length)), warnings: sum(chapters.map(chapter => chapter.warnings.length)), browserBytes: sum(chapters.map(chapter => chapter.sizes.browserBytes ?? 0)), directoryBytes: sum(chapters.map(chapter => chapter.sizes.directoryBytes ?? 0)) },
  chapters,
};
const rows = chapters.map(chapter => `| ${chapter.id} | ${chapter.status} | ${chapter.counts.meshes ?? '—'} | ${chapter.counts.validTextures ?? 0}/${chapter.counts.textures ?? 0} | ${chapter.counts.cameraSamples ?? '—'} | ${chapter.counts.stops ?? '—'} | ${mib(chapter.sizes.browserBytes ?? 0)} | ${mib(chapter.sizes.directoryBytes ?? 0)} | ${chapter.errors.length} / ${chapter.warnings.length} |`);
const details = chapters.flatMap(chapter => [
  `\n## ${chapter.id}\n`,
  `纹理最大边长：${chapter.sizes.maxTextureEdge ?? 0}px。全卷纹理同时解码为 RGBA 的估算上限：${mib(chapter.sizes.decodedRgbaBytes ?? 0)}（不含 mipmap、几何、驱动开销；实际按需加载占用应另行测量）。`,
  ...(chapter.errors.length ? ['\n错误：\n', ...chapter.errors.map(item => `- \`${item.location}\`：${item.message}`)] : ['\n错误：无。']),
  ...(chapter.warnings.length ? ['\n提醒：\n', ...chapter.warnings.map(item => `- \`${item.location}\`：${item.message}`)] : ['\n提醒：无。']),
]);
const markdown = [
  '# Blender 网页资产校验',
  `\n检查时间：${report.localTime}（Asia/Shanghai）。结果：**${report.status}**。`,
  '\n执行命令：`node scripts/validate-assets.mjs`。有结构错误或缺失资源时进程退出码为 1。',
  `\n${report.scope}`,
  '\n检查了每卷纹理引用与实际文件、图像编码尺寸、非索引三角几何及可选索引、UV 数量、材质索引、列主序矩阵、包围盒、相机四元数与投影、相机/分镜/标记/对象动画的进度范围及单调性。非索引几何无需额外几何索引数组。',
  '\n| 章节 | 结果 | 几何 | 有效/引用纹理 | 相机样本 | 分镜 | 浏览器资源 | 目录体积 | 错误/提醒 |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...rows,
  `\n四卷浏览器资源合计：${mib(report.totals.browserBytes)}。目录合计：${mib(report.totals.directoryBytes)}。`,
  '\n浏览器资源体积统计清单与唯一引用纹理；目录体积还包括导出中间文件等其他内容。',
  ...details,
  '',
].join('\n');
await mkdir(options.reportDir, { recursive: true });
await writeFile(path.join(options.reportDir, 'validation-assets.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(path.join(options.reportDir, 'validation-assets.md'), markdown);
for (const chapter of chapters) console.log(`${chapter.id}: ${chapter.status}; ${chapter.counts.meshes ?? 0} meshes, ${chapter.counts.validTextures ?? 0}/${chapter.counts.textures ?? 0} textures, ${mib(chapter.sizes.browserBytes ?? 0)}, ${chapter.errors.length} errors, ${chapter.warnings.length} warnings`);
console.log(`Reports: ${path.join(options.reportDir, 'validation-assets.json')} and validation-assets.md`);
if (report.totals.errors) process.exitCode = 1;

/** Curated execution plan only: never mutates canonical manifests or original assets. */
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const inventory = await read('reports/reconstruction/layers-inventory.json');
const target = 'reports/reconstruction/extended-layer-plan.json';
let previous = {}; try { previous = await read(target); } catch { /* First plan. */ }
const pixelTargets = {
  'C2-T002': '保留亭台、游人、花石和完整水纹，向右补全岸边柳树/亭台收口，向下补水面与石岸，最后自然淡墨散边并留透明余量。几何内部竖切与原图右/底裁切并存；三副本不能同步铺满整图。',
  'C2-T005': '清除原图上方两行烘焙长文，不重写文字；保留远山/城廓主结构，左右及底部扩出连续淡墨远景，使城郊自然散边而非矩形截图。修复图完成前禁止fullUV。',
  'C2-T006': '保留静坐赏花人物、栏杆和花丛；仅补上方被裁屋檐/帷幔及左侧柱头合理端部，延出自然轮廓与接地淡墨，透明底。',
  'C2-T010': '保留安静街市和花木；向右补全被直切街屋及行人、路面，再自然淡墨收边。不要新增斗花比赛或喧闹商贩情节。',
  'C2-T011': '保留朝臣、红柱、栏杆与原构图，只向上补齐截断屋脊和檐顶并留透明上缘，下部石阶延成自然接地。',
  'C2-T012': '保留优质牡丹花头、叶与山石主体；向下补少量石根、叶端和自然接地淡墨，避免在原画布内仅模糊花叶。',
  'C2-T018': '保留宫门纹样、朱柱与格窗，向上/左补完整檐口和门楼合理端部，底部接庭院石地后自然散边，透明背景。',
  'C2-T028': '保留全部完整花头、中心山石；只向下补被齐切的叶片石根，左右补贴边枝叶，形成自然不规则外轮廓与透明余量。',
  'C2-T034': '保留核心牡丹与曲折水岸画法，向左补被纵向直切的花石/岸边，水纹渐疏并留真实透明安全边。',
  'C3-T027': '保留完整室内屏风、帷幔和装饰细节，只向上补齐长平截线处屏架/绢帘端部，原下缘不改，形成柔和自然轮廓与透明余量。',
  'C3-T028': '保留迎亲街景的全部人物、红灯笼、帷带、远山与塔；仅向右扩出被画布纵切的屋檐完整收头、立柱和台阶/墙体合理端部，向下接少量石地墨气，形成自然完整不规则轮廓并留真实透明余量；不得擦掉人物或把截断屋檐简单模糊。',
  'C3-T054': '保留宫苑楼群、人物与原有金青色调；只补近景大屋面上方缺失的完整檐顶、下方柱脚与台阶接地，使建筑端部成立，不用透明渐变擦掉建筑。',
  'C3-T056': '保留完整圆镜内山水、镜框、花瓶、牡丹、所有桌面器物与原摆放，只向下扩全被原画布齐切的桌裙、桌腿与垂布完整自然下缘；不新增器物或第二张桌，不裁掉花头，真实透明背景与安全余量。',
  'C4-T007': '保留完整黑金栏柱、石台面与落花，向左右/底端补真实石地端部、少量接地墨气和透明安全边；不切掉栏杆或把花纹模糊。当前mesh仅选地坪，仍保留该功能摘取。',
  'C4-T008': '保留两仕女面容、衣袂、红帘和黑金屏风，只向上补完整屏架端部，向下补栏板基座，左右收成合理建筑/帘带自然轮廓与透明余量；不新增人物，不把人画成全幅新场景。',
  'C4-T027': '保留夕日、山峦与行进兵马队列，只向右补齐被原画幅切去的最大骑者与马身完整轮廓，补少量路面/雾气自然收边，不删除骑者来掩盖缺口。',
  'C4-T029': '保留黑金屏案、翻倒杯与落花地面，只补左侧被切的花叶/屏边、底部接地石面与自然墨气，形成不规则外轮廓及真实透明安全边。',
};
const pixelRepairs = Object.entries(pixelTargets).map(([label, repairTarget]) => {
  const texture = inventory.textures.find(t => t.label === label);
  if (!texture) throw new Error(`Missing audited texture ${label}`);
  const id = label.toLowerCase();
  const old = previous.pixelRepairs?.find(entry => entry.id === id);
  return { ...old, id, chapter: texture.chapter, label, sourceTextureId: texture.id, sourcePath: texture.texturePath,
    sourceName: texture.sourceName, sourceSize: texture.sourceSize,
    sourceMeshNames: texture.meshIds.map(id => inventory.meshes.find(mesh => mesh.id === id).name),
    repairTarget, treatment: '修复', requiresRealPixelCompletion: true, shaderFadeIsNotCompletion: true,
    status: old?.status ?? 'needs-imagegen-edit', rawOutput: old?.rawOutput ?? `artwork/reconstruction/raw/${id}-edge-repair.png`,
    assigned: texture.chapter === 2 ? 'source_blender_audit' : 'layer_inventory',
    restrictions: ['原图不覆盖', '保留完整原主体和叙事', '真实透明背景', '不生成文字', '不以擦除/模糊缺失主体冒充补全'] };
});
for (const reportPath of ['reports/reconstruction/pixel-repairs-chapter-2.json', 'reports/reconstruction/pixel-repairs-chapters-3-4.json']) {
  let readyReport; try { readyReport = await read(reportPath); } catch { continue; }
  for (const ready of readyReport.repairs ?? readyReport.entries ?? []) {
    const entry = pixelRepairs.find(pixel => pixel.id === ready.id);
    if (!entry || !ready.raw?.path || !ready.web?.url) continue;
    Object.assign(entry, { status: 'packed-visual-reviewed-awaiting-scene-integration', rawOutput: ready.raw.path,
      productionPng: ready.production.path, webAsset: ready.web.url, pixelQAReport: reportPath });
  }
}
const chapters = Object.fromEntries([2,3,4].map(c => [String(c), { geometryRepairs: [], hiddenMeshNames: [], backgroundMeshNames: [], textLayers: [], edgeRepairs: [], geometryDecisions: [] }]));
// Commit the actionable image queue before the optional text metadata work.
await writeFile(path.join(root, target), JSON.stringify({ ...previous, schemaVersion: 1, status: 'execution-plan-not-canonical', pixelRepairs, chapters: previous.chapters ?? chapters }, null, 2) + '\n');
if (process.argv.includes('--pixels-only')) { console.log(JSON.stringify({ pixelRepairs: pixelRepairs.length, chapters: [2,3,4], canonicalModified: false })); process.exit(0); }
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const scenes = Object.fromEntries(await Promise.all([2,3,4].map(async c => [c, prepareScene(await read(`public/assets/chapter-${c}/scene.json`), c)])));
  const textureFor = label => inventory.textures.find(t => t.label === label);
  const rowsFor = label => textureFor(label).meshIds.map(id => inventory.meshes.find(mesh => mesh.id === id));
  const addGeometry = (chapter, name, narrative) => {
    const mesh = inventory.meshes.find(m => m.chapter === chapter && m.name === name);
    if (!mesh) throw new Error(`Missing mesh ${name}`);
    chapters[chapter].geometryRepairs.push({ id: `${mesh.id}-full-uv`, meshNames: [name], role: mesh.type, narrative, geometryPolicy: 'full-uv-affine', treatment: '修复', sourceMeshId: mesh.id });
  };
  addGeometry(3, 'SC02_03_右上仕女群', '原图完整仕女群的内部横切在第二景暴露，局部恢复完整原图，不改人物与世界变换。');
  addGeometry(3, 'SC02_06_上方人物背景', '原图右侧柱脚和阶台完整；旧网格局部L形缺口在gap02实景暴露，恢复该单实例完整UV，不动世界变换。');
  chapters[4].edgeRepairs.push(
    { id: 'c4-t005-primary-region-edge', sourceTextureId: textureFor('C4-T005').id, meshNames: ['05_字幕替换意境山水'],
      uvRect: [0, 0, .7516756, 1], fades: { left: 0, right: .045, top: 0, bottom: 0 }, role: '后景连续层', narrative: '只散去第五景山水主实例右侧局部边口，保留既有摘取和位置，避免整图克隆。' },
  );
  chapters[4].hiddenMeshNames.push('4-8 · 01 · 故国山水城景.001', '05_字幕替换意境山水.001');
  const geometryReview = await read('reports/reconstruction/geometry-review-chapters-2-4.json');
  for (const c of [2,3,4]) chapters[c].geometryDecisions = geometryReview.chapters[c].candidates.map(row => ({ id: row.id, name: row.name, textureId: row.textureId, action: row.recommendedAction ?? row.visualReview?.classification,
    recommendation: row.visualReview?.recommendation ?? row.visualReview?.observation, pendingImplementation: true }));
  const finalDecisions = {
    'SC02_06_上方人物背景': ['full-uv-affine-single-instance', '最终gap02证明柱脚L形缺口暴露，原图完整，恢复本实例整UV。'],
    '05_字幕替换意境山水': ['preserve-region-with-right-ink-edge', '保原几何与UV域，只在主实例右侧轻散边；不复制完整宫殿。'],
    '05_字幕替换意境山水.001': ['retire-duplicate-landscape-helper', '最终gap05实景证明：仅把原UV域两侧边缘软化仍重复同套宫殿与山峰，edge-only方案已被取代；直接退役该辅助副本，不再fullUV或复制，保留主山水及新增淡山承接留白。'],
    '4-8 · 01 · 故国山水城景.001': ['retire-auxiliary-mask-preserve-primary', '最终stop08/gap07暴露阶梯式山峰mask，退役辅助片，完整主实例和原布局保留。'],
  };
  for (const chapter of Object.values(chapters)) for (const decision of chapter.geometryDecisions) if (finalDecisions[decision.name]) {
    [decision.action, decision.recommendation] = finalDecisions[decision.name]; decision.evidence = 'Final full-size stop/transition review, 2026-10-20';
    if (decision.name === '05_字幕替换意境山水.001') decision.supersededActions = ['full-uv-affine-single-instance', 'preserve-region-with-left-right-ink-edge'];
  }
  const captionSpecs = [
    ['C2-T030', 6, '春野静赏', ['花由苑囿入私园。', '春游静赏，渐入寻常。'], .78],
    ['C3-T026', 3, '凤穿牡丹', ['花入嫁衣，寄托良缘。', '凤凰穿花，锦绣承愿。'], .92],
    ['C3-T033', 4, '花结良缘', ['凤凰寄祥瑞，牡丹寓富贵。', '同心相映，祈愿家业兴旺。'], .86],
    ['C3-T051', 6, '岁岁圆满', ['花盘与香囊，寄意人丁兴旺。', '牡丹满开，愿家运昌隆。'], .88],
    ['C4-T011', 1, '人花合一', ['牡丹与美人相映。', '花意由此华贵倾城。'], .86],
    ['C4-T048', 9, '千古兴衰', ['盛世寄富贵，故国留追忆。', '花开花落，诗意代代流传。'], .85],
  ];
  const makeText = (label, stopNumber, title, lines, widthScale, variant) => {
    const texture = textureFor(label), mesh = rowsFor(label)[0], scene = scenes[texture.chapter];
    const stop = scene.stops[stopNumber - 1];
    const i = scene.cameras.findIndex(camera => camera.progress >= stop.progress);
    const a = scene.cameras[Math.max(0, i - 1)], b = scene.cameras[Math.max(0, i)];
    const mix = a === b ? 0 : (stop.progress - a.progress) / (b.progress - a.progress);
    const quaternion = new THREE.Quaternion().fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), mix);
    const center = new THREE.Vector3().fromArray(mesh.bounds.min).add(new THREE.Vector3().fromArray(mesh.bounds.max)).multiplyScalar(.5);
    const size = new THREE.Vector3().fromArray(mesh.bounds.max).sub(new THREE.Vector3().fromArray(mesh.bounds.min));
    const horizontal = texture.chapter === 2 ? size.x : size.y;
    const domWidth = variant === 'seal' ? 72 : 640, domHeight = variant === 'seal' ? 96 : 250;
    // Match the DOM aspect so min-font scaling never stretches glyphs or makes
    // a shallow source panel too wide to remain readable in a narrow viewport.
    const width = horizontal * widthScale, height = width * domHeight / domWidth;
    const range = [stopNumber === 1 ? 0 : (scene.stops[stopNumber - 2].progress + stop.progress) / 2,
      stopNumber === scene.stops.length ? 1 : (stop.progress + scene.stops[stopNumber].progress) / 2];
    const config = { id: `${label.toLowerCase()}-readable-${variant === 'seal' ? 'seal' : 'caption'}`, name: variant === 'seal' ? '吉庆，中性数字展陈印记' : title,
      title, lines, matrix: new THREE.Matrix4().compose(center, quaternion, new THREE.Vector3(width, height, 1)).toArray(),
      domWidth, domHeight, color: variant === 'seal' ? '#9b402f' : '#73533d',
      narrative: variant === 'seal' ? '中性当代展陈印记，不作为历史真印或考据证据。' : texture.narrativeMatch.basis,
      range, ...(variant ? { variant } : {}) };
    chapters[texture.chapter].textLayers.push(config);
    chapters[texture.chapter].hiddenMeshNames.push(...rowsFor(label).map(row => row.name));
    return { sourceTextureId: texture.id, label, sourceName: texture.sourceName, originalRasterRetired: true, originalMeshNames: rowsFor(label).map(row => row.name),
      sourceBounds: mesh.bounds, sourceWorldMatrix: mesh.matrix, sourceStop: stopNumber, sourceStopRange: [stopNumber, stopNumber], sourceFrame: stop.frame,
      normalizedReadingRange: range, matrixMethod: 'Original mesh bounds center + authored source camera quaternion; explicit world width/height derived from original bounds, unchanged source coordinates. CalligraphyLayer keeps a screen-readable minimum and edge-safe projection.',
      fullTextDestination: 'existing chapter interpretation drawer; original narrative not deleted', bakedTextReintroduced: false, config };
  };
  const textPlan = captionSpecs.map(spec => makeText(...spec));
  textPlan.push(makeText('C3-T052', 6, '吉庆', [], 1, 'seal'));
  const output = { ...previous, schemaVersion: 1, status: 'execution-plan-not-canonical', activeChapterChange: false,
    scope: 'Reviewed chapters2–4 execution recommendations. No canonical or original scene/image is changed by this script.',
    chapters, pixelRepairs, textPlan, geometryReport: 'reports/reconstruction/geometry-review-chapters-2-4.json',
    implementationNotes: ['只应用逐实例geometryRepairs，不整纹理批量fullUV。', '三卷花灯保留单灯摘取；四卷地坪保留去高栏摘取。', '无实证纸底遮挡，backgroundMeshNames均为空。', 'C2河景三副本保留原摘取语义，按preserve-region映射并轻散口，避免复制三幅完整游人河景。', 'C4-T005辅助副本的fullUV和edge-only均因gap05重复宫殿/山峰而取代：退役.001，仅保主片右墨边与淡山留白承接；C4-T041阶梯mask辅助副本退役，完整主实例保留。', '长正文由原解读抽屉承担，短题签保持世界锚点。', '所有新像素、题签、几何仍需各卷全部节点/过渡宽窄窗实测。'] };
  await writeFile(path.join(root, target), JSON.stringify(output, null, 2) + '\n');
  console.log(JSON.stringify({ pixelRepairs: pixelRepairs.length, geometryRepairs: Object.values(chapters).reduce((n,c) => n+c.geometryRepairs.length,0), textLayers: textPlan.length, canonicalModified: false }));
} finally { await vite.close(); }

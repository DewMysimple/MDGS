"""Assemble delivery documentation from verified evidence without touching .blend files."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
reports = [read(HERE / f'blender-reconstruction-chapter-{chapter}.json') for chapter in range(1, 5)]
geometry_pilot = read(HERE / 'blender-original-geometry-chapter-1.json')
entries = []
for report in reports:
    chapter = report['chapter']
    reopen = read(HERE / f'blender-reopen-validation-chapter-{chapter}.json')
    output, manifest = ROOT / report['output'], ROOT / report['manifest']
    assert report['status'] == reopen['status'] == 'verified'
    assert sha(output) == report['outputSha256'] == reopen['outputSha256']
    assert sha(manifest) == report['manifestSha256']
    assert report['sourceHashesBefore'] == report['sourceHashesAfter'] == reports[0]['sourceHashesBefore']
    originals = report.get('originalMeshGeometry', geometry_pilot['sourceMeshGeometry'])
    operations = []
    for kind in ('replacements', 'geometryRepairs'):
        for operation in report.get(kind, []):
            for target in operation['targets']:
                operations.append({'id': operation['id'], 'name': target['name'],
                                   'policy': target.get('geometryPolicy', operation.get('geometryPolicy', 'full-uv-affine')),
                                   'sourceImageReplaced': kind == 'replacements'})
    entries.append({
        'chapter': chapter, 'output': report['output'], 'bytes': output.stat().st_size,
        'sha256': report['outputSha256'], 'manifest': report['manifest'], 'manifestSha256': report['manifestSha256'],
        'originalObjects': len(report['originalScene']['objects']), 'derivedObjects': len(report['derivedObjects']),
        'originalMeshCount': len(originals), 'explicitGeometryChanges': operations,
        'sourceCameraCount': len(report['originalScene']['cameras']), 'markerCount': len(report['originalScene']['markers']),
        'sourceCollectionCount': len(report['originalScene']['collectionNames']),
        'originalFrameRange': report['originalScene']['frameRange'],
        'packedImages': len(report['packedImages']), 'packedFonts': len(report.get('packedFonts', [])),
        'editableFontObjectsIncludingOriginals': reopen['verification']['editableTextObjectCount'],
        'hiddenOriginalObjects': reopen['verification']['explicitRenderHideExceptions'],
        'backgroundPresentation': report.get('backgroundPresentation', {}),
        'verificationReport': f'reports/reconstruction/blender-reopen-validation-chapter-{chapter}.json',
        'originalFilesUnchanged': True,
    })

sources = read(HERE / 'source-paths.local.json')
for key, path in sources.items():
    assert sha((HERE / path).resolve()) == reports[0]['sourceHashesBefore'][key]
index = {'schemaVersion': 1, 'status': 'verified', 'sourceHashes': reports[0]['sourceHashesBefore'],
         'entries': entries, 'sourceAndDerivedFilesWrittenByThisIndex': False}
(HERE / 'blender-delivery-index.json').write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')

lines = ['# Blender 重构副本交付', '',
         '四卷副本均已实际保存，并在独立 Blender 进程中重新打开验证。原四个 `.blend` 从未覆盖，前后 SHA-256 保持一致。以下路径均相对工程根目录，可随工程整体搬迁。', '',
         '## 副本与固定输入清单', '',
         '| 卷 | 副本 | 字节 | SHA-256 |', '| --- | --- | ---: | --- |']
for entry in entries:
    lines.append(f"| {entry['chapter']} | `{entry['output']}` | {entry['bytes']} | `{entry['sha256']}` |")
lines += ['', '| 卷 | 归档清单 | 清单 SHA-256 |', '| --- | --- | --- |']
for entry in entries:
    lines.append(f"| {entry['chapter']} | `{entry['manifest']}` | `{entry['manifestSha256']}` |")
lines += ['', '首卷沿用已展示样板的固定清单；第二至四卷分别归档仅含本卷的快照，并保留 `parentCanonicalSha` 与阶段。独立验证按各卷快照及资源哈希进行，后续其他卷改动不会使已保存证据失效。', '',
          '## 保留的原结构', '',
          '四卷保留全部原对象、原父子关系、原 Collection 嵌套树及成员链接；另建八类角色 Collection，链接相同对象。角色为主体叙事、前景遮挡、中景承接、后景连续、留白、连接过渡、动效、装饰。所有对象记录 `stable_id`、`original_name`、`narrative`、`treatment`、`motion_role`。', '',
          '所有原对象世界矩阵保持；原相机投影参数和 marker/首尾采样帧求值矩阵、原动画对象求值矩阵、动作归属、时间轴范围、fps、相机 marker 均校验一致。没有修改原相机节点或新增主体动画。新增微动层在 Blender 记录动态角色，网页按角色执行持续轻动；这些网页运动没有额外烘焙为 Blender 关键帧。', '',
          '| 卷 | 原/现对象 | 原网格 | 原相机 | marker | 原 Collection | 打包图像/字体 | FONT总数（含原） |',
          '| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |']
for entry in entries:
    lines.append(f"| {entry['chapter']} | {entry['originalObjects']}/{entry['derivedObjects']} | {entry['originalMeshCount']} | {entry['sourceCameraCount']} | {entry['markerCount']} | {entry['sourceCollectionCount']} | {entry['packedImages']}/{entry['packedFonts']} | {entry['editableFontObjectsIncludingOriginals']} |")
lines += ['', '图像及中文字体均打包进副本。原外部图像按完整原路径最长后缀和章节分镜语义重链；不同内容同分候选会直接报错，禁止静默选第一张。副本可直接打开，继续编辑 Collection、图像材质和 FONT；资源清单中的 production PNG 另存于 artwork，网页使用单独 WebP。', '',
          '## 明确允许的派生几何例外', '',
          '除下表外，所有原网格的逐顶点位置、拓扑与每一 UV 层严格保持。首卷由 `blender-original-geometry-chapter-1.json` 额外只读对照证明，另三卷将原始指纹直接记入构建证据并在重开时核验。', '',
          '`full-uv-affine` 根据原局部位置/UV拟合完整0..1四角，恢复原裁片漏掉的内容，替换图再按真实透明gutter和内容比例适配；改变派生网格，不改变对象matrix。`explicit-corners` 只用于第二卷连续水岸，原三片world union拟合raw比例后逆变换成主载体local四角，仅外扩gutter。`preserve-region` 保留原位置和拓扑，只将原摘取UV映射进生产PNG的精确内容区域，避免恢复出整栏架。', '',
          '| 卷 | ID | 原对象 | 允许策略 |', '| --- | --- | --- | --- |']
for entry in entries:
    for change in entry['explicitGeometryChanges']:
        lines.append(f"| {entry['chapter']} | `{change['id']}` | `{change['name']}` | `{change['policy']}` |")
lines += ['', '墨边在复制后的材质里对真实UV域做窄smoothstep alpha混合，原RGB/原着色表面保留。几何修复与像素补绘分开记录；不会用shader羽化冒充缺失衣摆、桌脚或建筑补全。第四卷原地坪仅UV重映射，原点位/拓扑完全不动。', '',
          '## 明确允许的可见性例外', '',
          '以下仅在副本 `hide_render=true`，原对象、原矩阵、父子和原 Collection 成员关系仍保留，原源完全不动。', '']
for entry in entries:
    lines.append(f"### 第{entry['chapter']}卷")
    lines.append('')
    lines += [f'- `{name}`' for name in entry['hiddenOriginalObjects']]
    lines.append('')
lines += ['首卷连续绢本地形隐藏render以免剪断完整裙摆和画片；后方原天幕继续渲染，World未修改。第二至四卷纸底均保持。第二卷两份重复水岸退休，由一张连续岸线承接；第四卷两块重复/阶梯辅助山景退休，完整主景保留。低清题签/印记以新可编辑FONT承担，原图文件不删除。', '',
          '## 原源哈希', '', '| 卷 | 原源（相对工程根） | SHA-256 |', '| --- | --- | --- |']
for chapter in range(1, 5):
    key = f'chapter-{chapter}'
    original = reports[chapter - 1]['original']
    lines.append(f"| {chapter} | `{original}` | `{reports[0]['sourceHashesBefore'][key]}` |")
lines += ['', '## 验证与复现', '',
          '实际工具为本机 Blender 5.0.0。所有四卷经过原子另存、临时副本重开、最终路径重开和独立新进程验证，退出0。验证包含固定输入清单/资源、副本文件、原文件哈希、打包图像字节、打包字体、shader/几何/元数据指纹及上述原场景不变量。17项前置测试覆盖路径防覆盖、完整UV拟合、保留区域映射、显式四角不重复做aspect缩放、几何改动白名单和可编辑印记。', '',
          '下例 `$blenderExecutable` 由调用者提供，可来自 PATH、环境变量或本机配置，不将机器位置写入工程代码：', '',
          '```powershell',
          '& $blenderExecutable --background --factory-startup --disable-autoexec --python-exit-code 1 --python scripts/validate-reconstructed-blender.py -- --report reports/reconstruction/blender-reconstruction-chapter-4.json',
          '```', '',
          '对其他卷替换 report 中章号。构建入口为 `scripts/reconstruct-blender.py`，以 `--source-config`、`--manifest`、`--chapter`、`--output-dir` 决定路径；`--check-only` 只检查资源，`--dry-run` 完整修改内存并验证但不另存。禁止将output放回任何原源目录。', '',
          '精确证据为 `blender-reconstruction-chapter-1/2/3/4.json`、`blender-reopen-validation-chapter-1/2/3/4.json` 和 `blender-delivery-index.json`。首卷样板展示后才扩展其余三卷；网页画面由各章节实际新截图审查，第四卷本代理独立看全9停点8转场，问题与修正见 `visual-acceptance-chapter-4.json`；第二、三卷视觉由相应审查方验收，本说明不冒称代看。原source没有上传，也没有执行Git操作。', '']
(HERE / 'blender-delivery.md').write_text('\n'.join(lines), encoding='utf-8')
print('BLENDER_DELIVERY_VERIFIED', len(entries), 'derived copies; source/derived bytes unchanged')

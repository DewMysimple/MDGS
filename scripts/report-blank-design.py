"""Compile the final region ledger from frozen audits and verified delivery evidence."""
from pathlib import Path
import csv
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports/blank-design'


def read(path):
    return json.loads((ROOT / path).read_text(encoding='utf-8-sig'))


def digest(path):
    h = hashlib.sha256()
    with (ROOT / path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write(path, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    config = read('reports/blank-design/final/acceptance-sources.json')
    assert config['status'] == 'ready-for-final-evidence', 'Final runtime or another required gate remains pending'
    canonical_path = 'public/assets/reconstruction/manifest.json'
    canonical = read(canonical_path)
    sha = digest(canonical_path)
    assert sha == config['canonicalSha256']
    layers = read('reports/blank-design/applied-layers.json')
    assert layers['canonicalSha256'] == sha
    prepared = read('reports/blank-design/prepared-assets.json')['entries']
    source_config = ROOT / 'reports/reconstruction/source-paths.local.json'
    source_hashes = {key: digest((source_config.parent / value).resolve()) for key, value in read(source_config).items()}
    static = {}
    blender = []
    for chapter in range(1, 5):
        evidence = config['chapters'][str(chapter)]
        captured = read(evidence['manifest'])
        assert captured['chapters'][str(chapter)] == canonical['chapters'][str(chapter)], f'Stale C{chapter} capture'
        review = read(evidence['review'])
        assert review['status'].startswith('passed'), f'C{chapter} visual review not passed'
        assert review['canonicalSha256'] == captured.get('parentCanonicalSha256', digest(evidence['manifest'])), f'Mixed C{chapter} review/capture revisions'
        views = review['views']
        expected_stops = len(read(f'public/assets/chapter-{chapter}/scene.json')['stops'])
        assert len(views) == expected_stops + (expected_stops - 1) * 3
        for view in views:
            assert view.get('status', view.get('decision')) == 'pass'
            image_path = view.get('screenshot', view.get('image'))
            if not image_path.startswith('reports/'):
                image_path = str(Path(evidence['review']).parent / image_path).replace('\\', '/')
            assert digest(image_path) == view['sha256'], f'Changed image {image_path}'
            static[(chapter, view['kind'], view['index'])] = {**view, 'verifiedImage': image_path, 'review': evidence['review']}
        saved = read(f'reports/blank-design/blender/blender-reconstruction-chapter-{chapter}.json')
        reopened = read(f'reports/blank-design/blender/blender-reopen-validation-chapter-{chapter}.json')
        assert saved['status'] == reopened['status'] == 'verified'
        assert saved['originalFilesUnchanged'] and reopened['originalFilesUnchanged']
        assert saved['sourceHashesBefore'] == saved['sourceHashesAfter'] == source_hashes, 'An original source changed after verification'
        assert digest(saved['output']) == saved['outputSha256'] == reopened['outputSha256']
        assert digest(saved['manifest']) == saved['manifestSha256'] == reopened['manifestSha256']
        assert read(saved['manifest'])['chapters'][str(chapter)] == canonical['chapters'][str(chapter)]
        preview = read(evidence['blenderPreview'])
        assert preview['status'] == 'verified-visible-new-layers' and preview['inputsUnchanged']
        assert preview['inputHashesBefore']['blend'] == saved['outputSha256']
        for frame in preview['frames']:
            assert digest(frame['image']) == frame['sha256'], 'Changed Blender preview image'
        blender.append({'chapter': chapter, 'path': saved['output'], 'sha256': saved['outputSha256'], 'packedImageCount': len(saved['packedImages']), 'editableFontObjectCount': saved['verification']['editableTextObjectCount'], 'packedFontCount': len(saved['packedFonts']), 'reconstructionReport': f'reports/blank-design/blender/blender-reconstruction-chapter-{chapter}.json', 'preview': evidence['blenderPreview'], 'independentReopen': f'reports/blank-design/blender/blender-reopen-validation-chapter-{chapter}.json'})
    for name in ['validation-placement.json', 'final/validation-pixels.json', 'final/validation-runtime.json']:
        result = read('reports/blank-design/' + name)
        assert result['status'] == 'passed' and result['canonicalSha256'] == sha, f'Stale or failed {name}'
    runtime = read('reports/blank-design/final/validation-runtime.json')
    assert runtime['mixedRevision'] is False
    assert runtime['summary']['stableScreenshots'] == 102 and runtime['summary']['wheelSweeps'] == 12
    for viewport in runtime['viewports']:
        for sample in viewport['samples']:
            assert digest('reports/blank-design/final/' + sample['image']) == sample['sha256']
    assert [item['id'] for item in runtime['expectedNarrowCrops']] == ['bd2-stop07-edge']
    crop = runtime['expectedNarrowCrops'][0]
    assert digest(crop['proof']) == crop['proofSha256']
    assert crop['sampledFrustumIntersections'] == 0 and crop['routeSamples'] == 1001
    startup = read('reports/blank-design/final/validation-startup.json')
    assert startup['status'] == 'pass' and startup['processExitCode'] == 0 and startup['cwdRestored']
    assert len(startup['checks']) == len(startup['cleanup']) == 5
    assert all(item['status'] == 'closed' and item['listening'] is False and item['address'] is None for item in startup['cleanup'])
    assert digest('scripts/validate-startup.mjs') == startup['validatorSha256']
    assert digest('dist/assets/reconstruction/manifest.json') == sha
    portable = read('reports/validation-portable-subpath.json')
    assert portable['status'] == 'pass' and not portable['pageErrors'] and not portable['failedResources']
    for item in portable['chapters']:
        assert item['addedLayers'] == len(canonical['chapters'][str(item['chapter'])]['addedLayers']) and not item['overflow']
    rows = []
    for audit_path in ['reports/blank-design/audit-chapters-1-2.json', 'reports/blank-design/audit-chapters-3-4.json']:
        for view in read(audit_path)['views']:
            chapter = view['chapter']
            kind = view.get('frameKind', view.get('kind'))
            index = view.get('frameIndex', view.get('index'))
            after = static[(chapter, kind, index)]
            for region in view['regions']:
                rid = region.get('regionId', region.get('id'))
                decision = region['decision']
                original_action = '留白保留' if decision in ('retain', '保留留白') else '已有层修复' if decision == 'repair_existing' else '叙事补充'
                override = config.get('regionOverrides', {}).get(rid)
                partial = config.get('partialTreatments', {}).get(rid, [])
                for treatment in partial:
                    assert treatment['evidence'] == after['review']
                    assert all(any(layer['id'] == lid and layer['chapter'] == chapter for layer in layers['layers']) for lid in treatment.get('newLayerIds', []))
                action = override['finalClassification'] if override else original_action
                assert action in ('留白保留', '叙事补充', '已有层修复')
                planned_layers = [layer for layer in layers['layers'] if rid in layer['blankDesign']['regions']]
                # A nearby low ground may frame an upper sky region without
                # painting that sky. Do not call the retained region filled.
                applied = planned_layers if action == '叙事补充' else []
                if action == '叙事补充':
                    assert applied, f'Unimplemented audit region {rid}'
                repair = None
                if rid == 'c1-stop-06-r01':
                    repair = {'implementation': 'src/scene/StableLayerSorting.ts', 'evidence': 'reports/blank-design/validation-layer-sorting.json', 'result': '原女帝/宫城稳定深度轴排序；不改原矩阵/相机'}
                if rid == 'c2-stop-07-r01':
                    repair = {'implementation': '退役派生实体纸地，网页使用既有纸色、Blender独立纸色World', 'evidence': 'reports/blank-design/background-and-c2-rectangle.json', 'result': '纸地末端硬矩形与色差消除；原源文件不变'}
                if action == '已有层修复':
                    assert repair
                rows.append({'regionId': rid, 'chapter': chapter, 'kind': kind, 'index': index, 'progress': view['progress'], 'finalClassification': action, 'originalDecision': decision, 'finalReclassification': override, 'rectNormalized': region.get('normalizedRect', region.get('rectNormalized')), 'originalObservation': region.get('currentProblem', region.get('observation')), 'purpose': region.get('narrativePurpose', region.get('narrative')), 'finalAction': override['reason'] if override else region.get('handling', region.get('action')) if action == '留白保留' else '; '.join(layer['narrative'] for layer in applied) if applied else repair['result'], 'newLayerIds': [layer['id'] for layer in applied], 'newObjectNames': [layer['name'] for layer in applied], 'newAssetIds': list(dict.fromkeys(layer['blankDesign']['assetId'] for layer in applied)), 'adjacentSupportingLayerIds': [layer['id'] for layer in planned_layers] if override and action == '留白保留' else [], 'existingLayerRepair': repair, 'before': f'reports/blank-design/before/chapter-{chapter}-{kind}-{index:02}.jpg', 'after': after['verifiedImage'], 'afterSha256': after['sha256'], 'visualReview': after['review'], 'status': 'implemented-and-view-reviewed' if action != '留白保留' else 'preserved-and-view-reviewed'})
                rows[-1]['partialTreatments'] = partial
                rows[-1]['beforeSha256'] = digest(rows[-1]['before'])
                assert rows[-1]['beforeSha256'] == view.get('imageSha256', view.get('sha256')), 'Changed frozen audit image'
                if partial:
                    if action == '留白保留':
                        rows[-1]['finalAction'] = '保留周边纸底与气口，以下局部加入叙事承托'
                    rows[-1]['finalAction'] += '；局部处理：' + '；'.join(item['reason'] for item in partial)
    assert len(rows) == 190
    counts = {key: sum(row['finalClassification'] == key for row in rows) for key in ['留白保留', '叙事补充', '已有层修复']}
    assert counts == config['finalClassificationCounts']
    assert counts['已有层修复'] == 2 and sum(counts.values()) == 190
    report = {'schemaVersion': 1, 'status': 'verified-final-evidence', 'canonicalSha256': sha, 'counts': counts, 'reviewedViews': len(static), 'newWorldLayers': layers['addedLayerCount'], 'newAssets': len({layer['blankDesign']['assetId'] for layer in layers['layers']}), 'sourceHashesVerifiedCurrent': source_hashes, 'chapters': config['chapters'], 'blender': blender, 'regions': rows, 'scope': 'Frozen baseline audit mapped to actual final layers and same-chapter identical accepted captures; 148 independently reviewed wide views plus separate responsive/runtime and Blender evidence. No claim of cross-browser or physical-device verification.'}
    report['originalAuditCounts'] = {'留白保留': 92, '叙事补充': 96, '已有层修复': 2}
    report['regionReclassifications'] = config.get('regionOverrides', {})
    report['partialTreatments'] = config.get('partialTreatments', {})
    report['classificationBoundary'] = config['classificationBoundary']
    write('reports/blank-design/final/region-implementation.json', report)
    with (REPORTS / 'final/region-implementation.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        fields = ['regionId', 'chapter', 'kind', 'index', 'progress', 'originalDecision', 'finalClassification', 'partialTreatments', 'originalObservation', 'finalAction', 'newLayerIds', 'newAssetIds', 'before', 'beforeSha256', 'after', 'afterSha256', 'visualReview', 'status']
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(row[key], ensure_ascii=False) if isinstance(row[key], list) else row[key] for key in fields})
    text = ['# 最终逐区域实施表', '', f'最终canonical：`{sha}`。190区域：{counts["留白保留"]}保留留白、{counts["叙事补充"]}叙事补充、2已有层修复。初审92/96/2另保留originalDecision，最终改判含明确理由与审查依据。148张逐景审查与对应章节内容完全一致，未沿用已改动版本的图片。', '', '| 区域 | 结论 | 实际新增层 / 已有层处理 | 对照截图 |', '|---|---|---|---|']
    for row in rows:
        actual = '、'.join(row['newLayerIds']) or ('稳定深度排序' if row['regionId'] == 'c1-stop-06-r01' else '纸底末端硬边' if row['existingLayerRepair'] else '保留题字/云气/情绪与边缘气口')
        if row['finalReclassification']:
            actual = '终审改判留白；相邻低坡只作框景，原因见JSON/CSV'
        if row['partialTreatments']:
            actual += '；含局部保留/补充，精确说明见JSON/CSV'
        text.append(f"| {row['regionId']} | {row['finalClassification']} | {actual} | [前](../../../{row['before']}) / [后](../../../{row['after']}) |")
    (REPORTS / 'final/region-implementation.md').write_text('\n'.join(text) + '\n', encoding='utf-8')
    assets = []
    for aid in sorted({layer['blankDesign']['assetId'] for layer in layers['layers']}):
        asset = prepared[aid]
        for variant in ['raw', 'production', 'web']:
            assert digest(asset[variant]['path']) == asset[variant]['sha256']
        assets.append({'id': aid, **asset, 'usedBy': [layer['id'] for layer in layers['layers'] if layer['blankDesign']['assetId'] == aid]})
    write('reports/blank-design/final/asset-and-object-delivery.json', {'status': 'verified', 'canonicalSha256': sha, 'assets': assets, 'worldObjects': layers['layers'], 'blender': blender})
    print(json.dumps({'status': report['status'], 'canonicalSha256': sha, 'regions': len(rows), 'views': len(static), 'layers': report['newWorldLayers'], 'assets': report['newAssets']}, ensure_ascii=False))


if __name__ == '__main__':
    main()

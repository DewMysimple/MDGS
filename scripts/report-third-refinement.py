"""Assemble the third-scroll delivery from current verified evidence."""
from pathlib import Path
import hashlib
import json
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports/chapter-3-refinement'


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    manifest = ROOT / 'public/assets/reconstruction/manifest.json'
    canonical, canonical_hash = read(manifest), digest(manifest)
    baseline = read(REPORTS / 'before/manifest.json')
    require(digest(REPORTS / 'final/manifest.json') == canonical_hash, 'Frozen final manifest differs.')
    for chapter in ['1', '2', '4']:
        require(canonical['chapters'][chapter] == baseline['chapters'][chapter], 'An unrelated chapter changed.')
    requirements = read(REPORTS / 'requirements.json')
    for source in requirements['sourceBlends']:
        require(digest(ROOT / source['path']) == source['sha256'], 'Original Blender source changed.')
    prepared = read(REPORTS / 'prepared-assets.json')['entries']
    require(len(prepared) == 3, 'All three targeted repairs must be delivered.')
    for asset in prepared.values():
        for key in ['raw', 'production', 'web']:
            require(digest(ROOT / asset[key]['path']) == asset[key]['sha256'], 'Asset bytes differ from packing evidence.')
    wide = read(REPORTS / 'final/visual-review.json')
    require(wide['passed'] and wide['parentCanonicalSha256'] == canonical_hash and len(wide['views']) == 33, 'Final wide review is missing or stale.')
    for view in wide['views']:
        require(view['status'] == 'passed' and not view['openIssues'], 'A wide view still needs repair.')
        require(digest(REPORTS / 'final' / view['screenshot']) == view['screenshotSha256'], 'Reviewed wide pixels changed.')
    typography = read(REPORTS / 'text-layout-accepted/capture.json')
    type_review = read(REPORTS / 'text-layout-accepted/visual-review.json')
    require(typography['canonicalSha256'] == canonical_hash and typography['sourceFilesUnchanged'] and typography['ownedServerClosed'], 'Final typography capture is stale or incomplete.')
    require(type_review.get('passed') is True and type_review['canonicalSha256'] == canonical_hash and type_review['issueCount'] == 0, 'Final typography visual review has not passed.')
    samples = [sample for viewport in typography['viewports'] for sample in viewport['samples']]
    require(len(samples) == 48, 'Require opening plus 15 groups at all three windows.')
    for sample in samples:
        for path_key, hash_key in [('screenshot', 'screenshotSha256'), ('underlay', 'underlaySha256')]:
            require(digest(REPORTS / 'text-layout-accepted' / sample[path_key]) == sample[hash_key], 'Final typography pixels changed.')
    short_capture = read(REPORTS / 'text-short-window-v3/capture.json')
    short_review = read(REPORTS / 'text-short-window-v3/visual-review.json')
    require(short_capture['canonicalSha256'] == canonical_hash and short_capture['sourceFilesUnchanged'] and short_capture['ownedServerClosed'] and short_review.get('passed') is True and short_review['canonicalSha256'] == canonical_hash and short_review['issueCount'] == 0, 'Short-window verification has not passed.')
    short_samples = [sample for viewport in short_capture['viewports'] for sample in viewport['samples']]
    require(len(short_samples) == 8, 'Require both short windows.')
    for sample in short_samples:
        for path_key, hash_key in [('screenshot', 'screenshotSha256'), ('underlay', 'underlaySha256')]:
            require(digest(REPORTS / 'text-short-window-v3' / sample[path_key]) == sample[hash_key], 'Short-window pixels changed.')
    runtime = read(REPORTS / 'final/runtime/validation.json')
    require(runtime['status'] == 'passed' and runtime['canonicalSha256'] == canonical_hash and runtime['sourceFilesUnchanged'] and runtime['ownedServerClosed'], 'Runtime verification is missing or stale.')
    for source in runtime['sources'] + typography['sources'] + short_capture['sources']:
        require(digest(ROOT / source['path']) == source['sha256'], 'Product code changed after verification.')
    require(sum(len(viewport['samples']) for viewport in runtime['viewports']) == 170 and len(runtime['interactions']) == 5, 'Require final five-window runtime and control checks.')
    short_closure = read(REPORTS / 'final/short-window-review.json')
    require(short_closure['passed'] and short_closure['canonicalSha256'] == canonical_hash and not short_closure['openIssues'] and short_closure['currentRuntimeSourceHashesMatched'], 'Independent short-window closure missing.')
    for path_key, hash_key in [('capture', 'captureSha256'), ('runtimeReport', 'runtimeReportSha256')]:
        require(digest(ROOT / short_closure[path_key]) == short_closure[hash_key], 'Short-window closure evidence changed.')
    blender = read(REPORTS / 'blender/final/delivery-summary.json')
    require(blender['canonicalSha256'] == canonical_hash and blender['originalSourcesUnchanged'] and blender['all8PreviousDeliveriesUnchanged'] and blender['previewInputsUnchanged'], 'Blender delivery provenance differs.')
    require(digest(ROOT / blender['output']) == blender['outputSha256'], 'Saved Blender file changed.')
    for source, expected in blender['previousDeliveriesAfter'].items():
        require(digest(ROOT / source) == expected, 'A previous Blender delivery changed.')
    for path_key, hash_key in [('savedReport', 'savedReportSha256'), ('independentReopenReport', 'independentReopenReportSha256'), ('previewReport', 'previewReportSha256'), ('visualReview', 'visualReviewSha256')]:
        require(digest(ROOT / blender[path_key]) == blender[hash_key], 'Blender evidence changed.')
    for frame in read(ROOT / blender['visualReview'])['frames']:
        require(frame['status'] == 'passed' and digest(ROOT / frame['image']) == frame['sha256'], 'An actual Blender preview changed or failed.')
    require(blender['actualPreviewFrames'] == 8 and blender['savedAndIndependentReopenExitCodes'] == [0, 0] and blender['renderExitCode'] == 0, 'Blender delivery is incomplete.')
    require(digest(ROOT / 'dist/assets/reconstruction/manifest.json') == canonical_hash, 'Production build uses a different scene revision.')
    portable = read(ROOT / 'reports/validation-portable-subpath.json')
    require(portable['status'] == 'pass' and not portable['pageErrors'] and not portable['failedResources'], 'Production nested-path check failed.')
    require([chapter['textLayers'] for chapter in portable['chapters']] == [1, 1, 15, 2], 'Production typography counts differ.')
    comparisons = read(REPORTS / 'final/comparison-evidence.json')
    require(comparisons['canonicalSha256'] == canonical_hash and len(comparisons['comparisons']) == 3, 'Current comparison sheets missing.')
    for comparison in comparisons['comparisons']:
        require(digest(ROOT / comparison['path']) == comparison['sha256'], 'Comparison pixels changed.')
        for view in comparison['views']:
            for source in view['inputs']:
                require(digest(ROOT / source['path']) == source['sha256'], 'Comparison input pixels changed.')
    chapter = canonical['chapters']['3']
    newly_hidden = sorted(set(chapter['hiddenMeshNames']) - set(baseline['chapters']['3']['hiddenMeshNames']))
    layout = read(REPORTS / 'layout-plan.json')
    evidence = {
        'status': 'verified-current-delivery', 'verifiedAt': datetime.now(timezone.utc).isoformat(),
        'canonicalSha256': canonical_hash, 'baselineSha256': digest(REPORTS / 'before/manifest.json'),
        'counts': {'auditedAndAcceptedWideViews': 33, 'typographyViews': 48, 'shortWindowViews': 8,
                   'forwardReverseRuntimeStates': sum(len(viewport['samples']) for viewport in runtime['viewports']),
                   'targetedTransparentRepairs': 3, 'verticalGroups': 15, 'newlyHiddenSourceMeshes': len(newly_hidden),
                   'mainCompositionGroups': 9, 'seamAdjustments': 1, 'uniqueLayoutMeshes': blender['uniqueLayoutTargets'],
                   'blenderActualPreviews': 8, 'blenderNewEditableFonts': blender['addedEditableFontObjects']},
        'otherChapterPayloadsUnchanged': [1, 2, 4], 'originalSourcesVerified': requirements['sourceBlends'],
        'assets': list(prepared.values()), 'compositionGroups': layout['compositionGroups'],
        'detailAdjustments': layout['detailAdjustments'], 'addedLayerAdjustments': layout['addedLayerAdjustments'],
        'retiredSourceMeshes': newly_hidden, 'verticalTextGroups': layout['textGroups'],
        'wideViews': wide['views'], 'blender': blender, 'comparisons': comparisons['comparisons'],
        'scopeLimits': ['Windows/Chromium/Blender5.0 local verification; no deployed-site or physical-device claim.',
                        'Wide Blender world anchors match the scene plan; Web compact reading layout responds to the actual window.',
                        'Short windows expand the content-driven painting height and scroll vertically; source camera poses and story nodes remain unchanged.',
                        'Normal viewport entry/exit and original source paper/font shading are distinguished from internal bitmap damage.']}
    (REPORTS / 'final/implementation.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    lines = ['# 第三卷专项实施与证据', '', f'当前canonical：`{canonical_hash}`。', '',
             '9主景重排、1镜台接缝、3透明修边、31源旁景/辅助层退役、15独立竖题完成。原四源与前两轮8份Blender不变，其他三卷payload逐项相等。', '',
             '## 文字排版留白', '', '|位置|竖题|两列原创短句|印记|', '|---|---|---|---|']
    for text in layout['textGroups']:
        lines.append(f"|{text['kind']} {text['index']:02}|{text['title']}|{' / '.join(text['lines'])}|{text.get('seal', '—')}|")
    lines += ['', '## 逐视点结果', '', '|视点|结果与处理|', '|---|---|']
    for view in wide['views']:
        lines.append(f"|[{view['id']}]({view['screenshot']})|{view['note']}|")
    lines += ['', '## 保留留白与边界', '',
              '顶部纸天、题首外围、凤凰翼尖外纸面、图组间气口与分镜进出边保留。八过渡及第3至9景部分侧白转为文字；第2景不新增正文。没有新增高大场景填纸。', '',
              '新字体、图像与几何在Blender均独立可编辑。网页窄窗以实际字带需求预留纸面并等比收纳原景；短窗口按实际文字需要展开画心并纵向滚动，避免原画成为底部细条。Blender宽锚点不代表该响应排版的逐像素复制。', '',
              '完整矩阵、隐藏对象、素材SHA、字体/副本/渲染证据和每图SHA见同名JSON。']
    (REPORTS / 'final/implementation.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(json.dumps({'status': evidence['status'], 'canonicalSha256': canonical_hash, **evidence['counts']}))


if __name__ == '__main__':
    main()

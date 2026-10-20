"""Inventory every exported mesh and texture without modifying source assets.

Run from any working directory: python scripts/audit-layers.py
Outputs are relative to the repository, or pass --output / --assets-root.
Image statistics identify review candidates; they do not establish visual quality.
Optional visual-review.json entries keyed by stable mesh/texture ID are merged so
human or model visual decisions survive a repeatable measurement pass.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
TITLES = {1: '神都花事', 2: '花入万家', 3: '锦绣花意', 4: '国色倾城'}
THEMES = {
    1: '武周洛阳、牡丹由山野寺院入皇家园林；史实与后世抗旨传说分辨',
    2: '中宗睿宗宫苑宴游、士族私园、百姓踏青静赏；温润清雅',
    3: '牡丹进入婚嫁织物、凤穿牡丹、灯彩年画和日常器物；家国吉愿',
    4: '杨贵妃与牡丹、沉香亭李白题诗；盛美转为马嵬、故国追忆',
}
TYPE_RULES = [
    ('留白层', r'留白|绢本|天幕|底纸|纸面|地形|卷底|卷轴底|背景底'),
    ('连接过渡层', r'接地|接缝|过渡|连接|云桥|衔接|承接|雾带|薄雾'),
    ('动效层', r'云气|云雾|烟雾|雾气|花瓣|飞燕|飞鸟|灯彩|灯笼|流苏|飘带|帷幔|纱帘|柳枝|水波|ribbon|petal|cloud|bird'),
    ('前景遮挡层', r'前景|前层|遮挡|foreground'),
    ('后景连续层', r'远山|远景|后景|后层|背景|山水|群山|宫阙|城景|远岸|backdrop'),
    ('装饰层', r'题字|题签|题跋|金轮|光环|金线|纹样|纹饰|花纹|装饰|边饰|screen|halo|ornament'),
    ('主体叙事层', r'人物|女子|女帝|贵妃|仕女|侍女|女官|武周|李白|文人|百官|侍从|新娘|婚|凤|嫁|器|瓶|镜|亭|建筑|宫|殿|寺|牡丹|peony|head|figure|palace'),
]


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def stable_mesh_id(chapter: int, name: str) -> str:
    return f'c{chapter}-m-' + hashlib.sha1(name.encode('utf-8')).hexdigest()[:12]


def base_image_name(name: str) -> str:
    return re.sub(r'\.(\d{3})$', '', name).casefold()


def classify(name: str, is_text: bool = False) -> tuple[str, str]:
    if is_text:
        return '装饰层', '导出FONT文字；网页主动略过，文化长文移入阅读抽屉'
    for layer_type, expression in TYPE_RULES:
        if re.search(expression, name, re.I):
            return layer_type, '名称语义规则：' + expression
    return '中景承接层', '名称不透明，暂按场景承接处理；需要逐图视觉复核'


def histogram_metrics(path: Path) -> dict:
    with Image.open(path) as source:
        image = source.convert('RGBA')
    data = np.asarray(image)
    alpha = data[:, :, 3]
    h, w = alpha.shape
    occupied = alpha > 8
    opaque = alpha >= 247
    hist = np.bincount(alpha.ravel(), minlength=256)
    ys, xs = np.nonzero(occupied)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1] if len(xs) else None
    edges = {'left': alpha[:, 0], 'right': alpha[:, -1], 'top': alpha[0, :], 'bottom': alpha[-1, :]}
    edge_stats = {}
    for side, values in edges.items():
        nonzero = values > 8
        padded = np.r_[False, nonzero, False].astype(np.int8)
        change = np.diff(padded)
        runs = np.where(change == -1)[0] - np.where(change == 1)[0]
        edge_stats[side] = {
            'occupiedRatio': round(float(np.mean(nonzero)), 6),
            'opaqueRatio': round(float(np.mean(values >= 247)), 6),
            'longestOccupiedRunRatio': round(float(runs.max() / len(values)) if len(runs) else 0, 6),
        }
    contact = [s for s, d in edge_stats.items() if d['occupiedRatio'] > 0.005]
    strong_contact = [s for s, d in edge_stats.items() if d['longestOccupiedRunRatio'] >= 0.15]
    # A flat opaque boundary can also be intentional water/ground overlap. It is
    # evidence of a rectangular crop risk, never an automatic quality verdict.
    rectangular = float(hist[247:].sum() / alpha.size) > 0.97 or sum(v['opaqueRatio'] > 0.8 for v in edge_stats.values()) >= 3
    out = {
        'width': w, 'height': h, 'bytes': path.stat().st_size,
        'alphaMin': int(alpha.min()), 'alphaMax': int(alpha.max()),
        'transparentRatio': round(float(hist[0] / alpha.size), 6),
        'nearTransparentRatio': round(float(hist[:9].sum() / alpha.size), 6),
        'semiTransparentRatio': round(float(hist[1:255].sum() / alpha.size), 6),
        'opaqueRatio': round(float(hist[247:].sum() / alpha.size), 6),
        'alphaBounds': bbox, 'edgeStats': edge_stats, 'edgeContacts': contact,
        'strongEdgeContacts': strong_contact, 'hardRectangleCandidate': bool(rectangular),
        'visibleAreaRatio': round(float(np.mean(occupied)), 6),
        'safeMarginPx': [bbox[0], bbox[1], w - bbox[2], h - bbox[3]] if bbox else [w, h, w, h],
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'method': 'full-resolution RGBA; occupied alpha>8, opaque alpha>=247; boundary runs measured on outermost pixels',
    }
    return out


def interpolate_camera(cameras: list, progress: float) -> list:
    after = next((i for i, c in enumerate(cameras) if c['progress'] >= progress), len(cameras) - 1)
    if after <= 0:
        return cameras[0]['position']
    a, b = cameras[after - 1], cameras[after]
    t = max(0, min(1, (progress - a['progress']) / max(1e-9, b['progress'] - a['progress'])))
    return [a['position'][i] + (b['position'][i] - a['position'][i]) * t for i in range(3)]


def storyboard_relation(mesh: dict, scene: dict) -> dict:
    axis = 0 if scene['travel']['axis'] == 'X' else 1
    bounds = mesh['bounds']
    low, high = bounds['min'][axis], bounds['max'][axis]
    center = (low + high) / 2
    stops = []
    for i, stop in enumerate(scene['stops']):
        position = interpolate_camera(scene['cameras'], stop['progress'])
        stops.append({**stop, 'index': i + 1, 'cameraAxisPosition': round(position[axis], 6)})
    nearest = min(stops, key=lambda s: abs(s['cameraAxisPosition'] - center)) if stops else None
    covered = [s for s in stops if low <= s['cameraAxisPosition'] <= high]
    if not covered and nearest:
        covered = [nearest]
    return {
        'method': 'approximate camera travel-axis overlap; not an exact projected frustum visibility result',
        'axis': scene['travel']['axis'], 'axisBounds': [low, high],
        'nearestStop': nearest,
        'stopRange': [min(s['index'] for s in covered), max(s['index'] for s in covered)] if covered else [],
        'associatedStops': covered,
    }


def preferred_motion(layer_type: str, name: str) -> str:
    if layer_type == '动效层':
        if re.search(r'云|雾|烟|cloud', name, re.I):
            return '云气低频缓移；完整主体保持静止，避免整幅贴片漂浮'
        if re.search(r'花瓣|petal|鸟|燕|bird', name, re.I):
            return '仅独立花瓣/飞鸟轻移；按分镜控制可见量'
        return '围绕挂点的极轻摆动；不让包含人物/地台的整张合层平移'
    if layer_type == '前景遮挡层' or re.search(r'花枝|柳|花丛|枝叶', name):
        return '待确认主体完整及挂点后局部轻摆，可用轻微视差'
    return '静态；不对叙事主体和完整建筑施加整层呼吸缩放'


def read_review(path: Path) -> dict:
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    return data.get('entries', data)


def merge_review(item: dict, review: dict) -> None:
    if item['id'] not in review:
        return
    override = review[item['id']]
    allowed = {'type', 'use', 'problems', 'narrativeMatch', 'treatment', 'dynamic', 'notes', 'pendingVisualReview', 'visualReview', 'treatmentProvisional'}
    for key in allowed & override.keys():
        item[key] = override[key]


def write_csv(path: Path, rows: list) -> None:
    fields = ['id', 'name', 'chapter', 'type', 'use', 'problems', 'narrativeMatch', 'treatment', 'dynamic', 'notes', 'sourceName', 'textureId', 'texturePath', 'sourceImagePath', 'material', 'bounds', 'webRenderEligible', 'isText', 'storyboard', 'pendingVisualReview', 'treatmentProvisional']
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fields, extrasaction='ignore')
        writer.writeheader()
        for row in rows:
            writer.writerow({key: json.dumps(row.get(key), ensure_ascii=False) if isinstance(row.get(key), (dict, list)) else row.get(key) for key in fields})


def get_fonts() -> tuple:
    font_root = Path(os.environ.get('WINDIR', '')) / 'Fonts'
    for candidate in ('msyh.ttc', 'simhei.ttf', 'arial.ttf'):
        path = font_root / candidate
        if path.is_file():
            return ImageFont.truetype(str(path), 18), ImageFont.truetype(str(path), 13)
    return ImageFont.load_default(size=18), ImageFont.load_default(size=13)


def sheet_text(draw: ImageDraw.ImageDraw, xy: tuple, text: str, font: ImageFont.FreeTypeFont, fill: str, max_width: int) -> None:
    while text and draw.textbbox((0, 0), text, font=font)[2] > max_width:
        text = text[:-2] + '…' if not text.endswith('…') else text[:-2] + '…'
    draw.text(xy, text, font=font, fill=fill)


def contact_sheets(chapter: int, textures: list, output: Path) -> list:
    title_font, label_font = get_fonts()
    cell_w, cell_h, columns, rows = 420, 276, 4, 6
    per_page = columns * rows
    paths = []
    for page in range(math.ceil(len(textures) / per_page)):
        subset = textures[page * per_page:(page + 1) * per_page]
        sheet = Image.new('RGB', (cell_w * columns, cell_h * rows + 48), '#f6f0e5')
        draw = ImageDraw.Draw(sheet)
        draw.text((14, 10), f'Chapter {chapter} / {TITLES[chapter]} — texture review {page + 1}/{math.ceil(len(textures) / per_page)}', font=title_font, fill='#30291f')
        for i, texture in enumerate(subset):
            x, y = (i % columns) * cell_w, (i // columns) * cell_h + 48
            panel = Image.new('RGBA', (cell_w - 16, 208), '#d9d3c7')
            pd = ImageDraw.Draw(panel)
            for cy in range(0, 208, 16):
                for cx in range(0, cell_w - 16, 16):
                    if (cx // 16 + cy // 16) % 2:
                        pd.rectangle((cx, cy, cx + 15, cy + 15), fill='#ece6da')
            with Image.open(ROOT / texture['texturePath']) as source:
                image = source.convert('RGBA')
                image.thumbnail((cell_w - 28, 200), Image.Resampling.LANCZOS)
                panel.alpha_composite(image, ((panel.width - image.width) // 2, (panel.height - image.height) // 2))
            sheet.paste(panel.convert('RGB'), (x + 8, y + 4))
            metrics = texture['machineEvidence']['alpha']
            sheet_text(draw, (x + 10, y + 215), f"{texture['label']} {texture['imageId'][:8]} {texture['sourceName']}", label_font, '#211e18', cell_w - 20)
            edges = '/'.join(s[0].upper() for s in metrics['strongEdgeContacts']) or '-'
            draw.text((x + 10, y + 236), f"{metrics['width']}x{metrics['height']} | edge:{edges} | semi:{metrics['semiTransparentRatio']:.1%}", font=label_font, fill='#665b49')
            draw.text((x + 10, y + 254), f"{texture['treatment']} (candidate) | {len(texture['meshIds'])} mesh | rectangular:{metrics['hardRectangleCandidate']}", font=label_font, fill='#7b362d' if metrics['hardRectangleCandidate'] else '#665b49')
            texture['contactSheet'] = rel(output / f'chapter-{chapter}-textures-{page + 1:02d}.jpg')
            texture['contactSheetCell'] = i + 1
        path = output / f'chapter-{chapter}-textures-{page + 1:02d}.jpg'
        sheet.save(path, quality=91, optimize=True)
        paths.append(rel(path))
    return paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets-root', type=Path, default=ROOT / 'public/assets')
    parser.add_argument('--output', type=Path, default=ROOT / 'reports/reconstruction')
    parser.add_argument('--no-sheets', action='store_true')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    reviews = read_review(output / 'visual-review.json')
    source_audit_path = output / 'source-audit.json'
    current_sources = {}
    if source_audit_path.is_file():
        source_audit = json.loads(source_audit_path.read_text(encoding='utf-8-sig'))
        if source_audit.get('status') == 'verified':
            current_sources = {chapter['id']: chapter for chapter in source_audit.get('chapters', [])}
    baseline_audit = ROOT / 'reports/assets-audit.json'
    audits = {d['id']: d for d in json.loads(baseline_audit.read_text(encoding='utf-8'))} if baseline_audit.is_file() else {}
    inventory = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat(), 'sourceAssetsModified': False, 'reviewStatus': 'machine inventory plus explicit visual overrides; unreviewed entries remain provisional', 'scope': 'all manifest meshes, including FONT skipped by web renderer, and every manifest texture', 'typeSystem': ['主体叙事层', '前景遮挡层', '中景承接层', '后景连续层', '留白层', '连接过渡层', '动效层', '装饰层'], 'chapters': [], 'meshes': [], 'textures': []}
    for chapter in range(1, 5):
        scene_path = args.assets_root / f'chapter-{chapter}/scene.json'
        scene = json.loads(scene_path.read_text(encoding='utf-8'))
        audit = audits.get(f'chapter-{chapter}', {})
        source_images = {d['name'].casefold(): d for d in audit.get('images', [])}
        source_image_fallbacks = {}
        for source_image in audit.get('images', []):
            source_image_fallbacks.setdefault(base_image_name(source_image['name']), []).append(source_image)
        current_source = current_sources.get(f'chapter-{chapter}', {})
        current_source_objects = {obj['name']: obj for obj in current_source.get('objects', [])}
        meshes, textures = [], []
        texture_by_path = {}
        for index, image in enumerate(scene['images']):
            path = scene_path.parent / image['src']
            metrics = histogram_metrics(path)
            layer_type, type_basis = classify(image['sourceName'])
            source_image = source_images.get(image['sourceName'].casefold())
            if not source_image:
                candidates = source_image_fallbacks.get(base_image_name(image['sourceName']), [])
                size_matches = [candidate for candidate in candidates if candidate.get('size') == image.get('sourceSize')]
                source_image = (size_matches or candidates or [{}])[0]
            problems = []
            if metrics['strongEdgeContacts']:
                problems.append('主体alpha触及外边界：' + ','.join(metrics['strongEdgeContacts']) + '；须看原图区分合理遮挡与截断')
            if metrics['hardRectangleCandidate']:
                problems.append('高不透明矩形候选；需在场景复核是否保留不自然图框')
            if min(metrics['width'], metrics['height']) < 256:
                problems.append('短边不足256px，近景清晰度待复核')
            treatment = '修复' if problems else '保留'
            texture = {
                'id': f"c{chapter}-t-{image['id']}", 'label': f'C{chapter}-T{index + 1:03d}', 'imageId': image['id'],
                'name': image['sourceName'], 'sourceName': image['sourceName'], 'chapter': chapter, 'chapterTitle': TITLES[chapter],
                'type': layer_type, 'use': f'{TITLES[chapter]}现有图像素材；具体用途需结合实例和分镜复核',
                'texturePath': rel(path), 'textureUrl': f"assets/chapter-{chapter}/{image['src']}",
                'sourceImagePath': source_image.get('path'), 'sourceImageExistsAtRecordedPath': Path(source_image.get('path', '')).is_file() if source_image.get('path') else False,
                'sourceSize': image.get('sourceSize'), 'problems': problems,
                'narrativeMatch': {'status': 'pendingVisualReview', 'chapterTheme': THEMES[chapter], 'basis': 'sourceName and approximate storyboard position only'},
                'treatment': treatment, 'treatmentProvisional': True,
                'dynamic': {'existingSourceAnimation': False, 'recommendation': preferred_motion(layer_type, image['sourceName'])},
                'notes': '测量只用于筛选；透明边界统计不证明风格、完整性、历史/叙事正确性。',
                'pendingVisualReview': True, 'meshIds': [],
                'machineEvidence': {'alpha': metrics, 'typeBasis': type_basis},
            }
            merge_review(texture, reviews)
            texture_by_path[image['src']] = texture
            textures.append(texture)
        for index, mesh in enumerate(scene['meshes']):
            material = scene['materials'][mesh['material']] if 0 <= mesh['material'] < len(scene['materials']) else None
            texture = texture_by_path.get(material.get('texture')) if material else None
            is_text = bool(mesh.get('isText'))
            eligible = not is_text and bool(material) and bool(mesh.get('positions'))
            source_object = current_source_objects.get(mesh['name'], {})
            collection_names = source_object.get('collections', [])
            # Collection roles describe an instance, while a texture can be
            # reused as foreground in one shot and as a subject in another.
            collection_type = next((role for pattern, role in [('前景', '前景遮挡层'), ('后景', '后景连续层'), ('中景', '中景承接层'), ('过渡', '连接过渡层'), ('留白', '留白层')] if any(pattern in str(name) for name in collection_names)), None)
            layer_type, type_basis = classify(mesh['name'] + ' ' + (texture['sourceName'] if texture else ''), is_text)
            if collection_type and not is_text:
                layer_type, type_basis = collection_type, 'source Collection role: ' + ', '.join(collection_names)
            animated = bool(scene.get('animations', {}).get(mesh['name']))
            problems = list(texture['problems']) if texture else []
            if not material:
                problems.append('material index unavailable')
            if not mesh.get('positions'):
                problems.append('empty geometry; web renderer skips')
            if is_text:
                notes = 'FONT几何有导出但网页不直接渲染；当前用阅读抽屉和独立书法层承担文字。'
            else:
                notes = '按manifest判断可创建web mesh；是否具体时刻入镜取决于相机、透明度和纹理流式加载。'
            row = {
                'id': stable_mesh_id(chapter, mesh['name']), 'label': f'C{chapter}-M{index + 1:03d}',
                'name': mesh['name'], 'chapter': chapter, 'chapterTitle': TITLES[chapter], 'sourceType': mesh['type'],
                'type': layer_type, 'use': '文字几何（web略过）' if is_text else f'{TITLES[chapter]}空间实例 / {layer_type}',
                'problems': problems, 'narrativeMatch': dict(texture['narrativeMatch']) if texture else {'status': 'structuralLayer' if layer_type in ('留白层', '连接过渡层') else 'pendingVisualReview', 'chapterTheme': THEMES[chapter], 'basis': 'object name and spatial association'},
                'treatment': texture['treatment'] if texture else '保留', 'treatmentProvisional': True,
                'dynamic': {'existingSourceAnimation': animated, 'existingWebAnimation': animated and eligible, 'recommendation': preferred_motion(layer_type, mesh['name'])},
                'notes': notes, 'sourceName': texture['sourceName'] if texture else None,
                'textureId': texture['id'] if texture else None, 'texturePath': texture['texturePath'] if texture else None,
                'sourceImagePath': texture['sourceImagePath'] if texture else None,
                'sourceBlend': scene.get('source'), 'sourceBlendEvidence': 'recorded export provenance; may refer to an earlier source location',
                'currentSourceBlend': current_source.get('source'), 'currentSourceEvidence': 'reports/reconstruction/source-audit.json' if current_source else None,
                'sourceCollections': collection_names, 'material': material, 'bounds': mesh['bounds'],
                'matrix': mesh['matrix'], 'isText': is_text, 'webRenderEligible': eligible,
                'webRenderReason': 'isText: skip' if is_text else 'eligible if geometry/material valid; texture loaded on demand' if eligible else 'invalid material or empty geometry: skip',
                'storyboard': storyboard_relation(mesh, scene), 'pendingVisualReview': not is_text,
                'machineEvidence': {'typeBasis': type_basis, 'manifestMeshIndex': index, 'positionValues': len(mesh.get('positions', [])), 'uvValues': len(mesh.get('uvs', [])), 'indexCount': len(mesh.get('indices', [])), 'alphaTextureId': texture['id'] if texture else None, 'rendererEvidence': 'src/scene/SceneRenderer.ts: load; source.isText/empty geometry skipped'},
            }
            merge_review(row, reviews)
            if texture:
                texture['meshIds'].append(row['id'])
                texture['dynamic']['existingSourceAnimation'] |= animated
            meshes.append(row)
        # Shared texture reviews propagate to mesh defaults unless there is a
        # more specific review for the mesh itself.
        for mesh in meshes:
            if mesh['id'] not in reviews and mesh['textureId'] in reviews:
                texture = next(t for t in textures if t['id'] == mesh['textureId'])
                for field in ('problems', 'narrativeMatch', 'treatment', 'treatmentProvisional', 'pendingVisualReview', 'visualReview'):
                    if field in texture:
                        mesh[field] = texture[field]
                # Only an explicitly supplied type overrides an instance role.
                if 'type' in reviews[mesh['textureId']]:
                    mesh['type'] = reviews[mesh['textureId']]['type']
                if 'notes' in reviews[mesh['textureId']]:
                    mesh['notes'] += ' 视觉处理：' + str(texture['notes'])
                if 'dynamic' in reviews[mesh['textureId']] and isinstance(texture.get('dynamic'), dict):
                    mesh['dynamic'].update({key: value for key, value in texture['dynamic'].items() if key not in ('existingSourceAnimation', 'existingWebAnimation')})
        sheets = contact_sheets(chapter, textures, output) if not args.no_sheets else []
        write_csv(output / f'chapter-{chapter}-layers.csv', meshes)
        texture_summary = {'count': len(textures), 'hardRectangleCandidates': sum(t['machineEvidence']['alpha']['hardRectangleCandidate'] for t in textures), 'strongBoundaryContactCandidates': sum(bool(t['machineEvidence']['alpha']['strongEdgeContacts']) for t in textures), 'treatments': dict(Counter(t['treatment'] for t in textures)), 'pendingVisualReview': sum(t['pendingVisualReview'] for t in textures)}
        inventory['chapters'].append({'chapter': chapter, 'title': TITLES[chapter], 'theme': THEMES[chapter], 'scenePath': rel(scene_path), 'sourceBlend': scene.get('source'), 'sourceBlendEvidence': 'recorded export provenance; may refer to an earlier source location', 'sourceBlendExistsAtRecordedPath': Path(scene.get('source', '')).is_file(), 'currentSourceBlend': current_source.get('source'), 'currentSourceStatus': current_source.get('status'), 'currentSourceEvidence': 'reports/reconstruction/source-audit.json' if current_source else None, 'meshCount': len(meshes), 'webRenderEligible': sum(m['webRenderEligible'] for m in meshes), 'fontSkipped': sum(m['isText'] for m in meshes), 'meshTypes': dict(Counter(m['type'] for m in meshes)), 'meshTreatments': dict(Counter(m['treatment'] for m in meshes)), 'textureSummary': texture_summary, 'contactSheets': sheets, 'stops': scene['stops']})
        inventory['meshes'].extend(meshes)
        inventory['textures'].extend(textures)
        print(f'chapter-{chapter}: {len(meshes)} meshes, {len(textures)} textures, {len(sheets)} sheets')
    inventory['summary'] = {'meshes': len(inventory['meshes']), 'textures': len(inventory['textures']), 'webRenderEligible': sum(m['webRenderEligible'] for m in inventory['meshes']), 'fontSkipped': sum(m['isText'] for m in inventory['meshes']), 'pendingVisualReviewMeshes': sum(m['pendingVisualReview'] for m in inventory['meshes']), 'pendingVisualReviewTextures': sum(t['pendingVisualReview'] for t in inventory['textures']), 'stableIdDuplicates': len(inventory['meshes']) - len({m['id'] for m in inventory['meshes']})}
    (output / 'layers-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(inventory['summary']))


if __name__ == '__main__':
    main()

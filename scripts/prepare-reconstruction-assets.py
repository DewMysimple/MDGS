"""Pack generated RGBA assets with transparent safety space; never repaint pixels.

Example:
  python scripts/prepare-reconstruction-assets.py --input artwork/reconstruction/raw/example.png --id c1-t021 --chapter 1 --gutter 0.12

Gutter is measured per side against the original content width/height: 0.12
adds about 12% on the left, right, top and bottom. Production PNG content is
preserved byte-for-byte as RGBA, including transparent RGB. Only the WebP
delivery copy may be downsampled, to a maximum edge of 2048 pixels.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1


def project_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def alpha_evidence(image: Image.Image) -> dict:
    alpha = image.getchannel('A')
    bbox = alpha.getbbox()
    visible_bbox = alpha.point(lambda value: 255 if value > 8 else 0).getbbox()
    width, height = image.size
    margins = [bbox[0], bbox[1], width - bbox[2], height - bbox[3]] if bbox else [width, height, width, height]
    histogram = alpha.histogram()
    return {
        'alphaBounds': list(bbox) if bbox else None,
        'visibleAlphaBounds': list(visible_bbox) if visible_bbox else None,
        'alphaBoundsThreshold': 'alpha > 0; visibleAlphaBounds uses alpha > 8',
        'safeOuterMarginPx': dict(zip(('left', 'top', 'right', 'bottom'), margins)),
        'safeOuterMarginPercent': dict(zip(('left', 'top', 'right', 'bottom'), [round(margins[0] / width * 100, 6), round(margins[1] / height * 100, 6), round(margins[2] / width * 100, 6), round(margins[3] / height * 100, 6)])),
        'transparentPixelPercent': round(histogram[0] / (width * height) * 100, 6),
        'alphaMin': next((i for i, count in enumerate(histogram) if count), 0),
        'alphaMax': next((i for i in range(255, -1, -1) if histogram[i]), 0),
    }


def atomic_write_json(path: Path, data: dict) -> None:
    temporary = path.with_name(path.name + f'.{os.getpid()}.tmp')
    try:
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def merge_report(path: Path, entry: dict) -> int:
    # Do not allow two CLI invocations to read the same old manifest and lose
    # each other's IDs. A live/leftover lock is reported, never deleted by a
    # competing invocation; rerunning the same packing operation is harmless.
    lock = path.with_suffix(path.suffix + '.lock')
    try:
        handle = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL)
    except FileExistsError as error:
        raise RuntimeError(f'Prepared-assets report is locked: {project_path(lock)}. Retry after the other report update finishes.') from error
    try:
        with os.fdopen(handle, 'w', encoding='utf-8') as stream:
            stream.write(str(os.getpid()))
        report = json.loads(path.read_text(encoding='utf-8-sig')) if path.is_file() else {'schemaVersion': SCHEMA_VERSION, 'entries': {}}
        if report.get('schemaVersion') != SCHEMA_VERSION or not isinstance(report.get('entries'), dict):
            raise RuntimeError('Unsupported prepared-assets report schema; existing entries were not replaced')
        previous = report['entries'].get(entry['id'])
        # Content-based idempotence retains preparedAt for identical options.
        entry['preparedAtUtc'] = previous.get('preparedAtUtc') if previous and all(previous.get(key) == value for key, value in entry.items()) else datetime.now(timezone.utc).isoformat()
        report['entries'][entry['id']] = entry
        report['count'] = len(report['entries'])
        report['scope'] = 'Technical packing only; originals unchanged; no aesthetic repair is performed by this script'
        atomic_write_json(path, report)
        return report['count']
    finally:
        lock.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True, help='Read-only raw PNG, relative to the caller or absolute')
    parser.add_argument('--id', required=True, help='Stable asset ID; letters, numbers, hyphens and underscores')
    destination = parser.add_mutually_exclusive_group(required=True)
    destination.add_argument('--chapter', type=int, choices=range(1, 5))
    destination.add_argument('--shared', action='store_true')
    parser.add_argument('--gutter', type=float, default=0.12, help='Transparent margin on EACH side, relative to original width/height')
    parser.add_argument('--collection', choices=('reconstruction', 'blank-design', 'chapter-3-refinement'), default='reconstruction', help='Keep a new art pass and its packing evidence separate from the earlier delivery')
    parser.add_argument('--trim-transparent', action='store_true', help='Remove only fully transparent outer rows/columns before adding the production gutter; retain every nonzero-alpha pixel')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', args.id):
        parser.error('--id must be a safe filename identifier')
    if not math.isfinite(args.gutter) or not 0 <= args.gutter <= 1:
        parser.error('--gutter must be finite and between 0 and 1 per side')
    source = args.input.resolve()
    if not source.is_file():
        parser.error(f'Input PNG does not exist: {source}')
    if source.suffix.casefold() != '.png':
        parser.error('--input must be the raw PNG file')
    group = 'shared' if args.shared else f'chapter-{args.chapter}'
    production_path = ROOT / f'artwork/{args.collection}' / group / f'{args.id}.png'
    web_path = ROOT / f'public/assets/{args.collection}' / group / f'{args.id}.webp'
    report_path = ROOT / f'reports/{args.collection}/prepared-assets.json'
    if source == production_path.resolve() or source == web_path.resolve():
        parser.error('Input and output must be distinct; original PNG is read-only')
    original_hash = sha256(source)
    with Image.open(source) as opened:
        if getattr(opened, 'n_frames', 1) != 1:
            parser.error('Animated PNG is outside the packing scope')
        content = opened.convert('RGBA')
        source_mode = opened.mode
    raw_size = content.size
    trim_box = content.getchannel('A').getbbox() if args.trim_transparent else None
    if args.trim_transparent:
        if trim_box is None:
            parser.error('The image is fully transparent; it cannot be an independently placeable layer')
        content = content.crop(trim_box)
    width, height = content.size
    # Ceil the total size, then center with at most one pixel of asymmetry.
    padded_width = math.ceil(width * (1 + 2 * args.gutter))
    padded_height = math.ceil(height * (1 + 2 * args.gutter))
    left, top = (padded_width - width) // 2, (padded_height - height) // 2
    right, bottom = padded_width - width - left, padded_height - height - top
    packed = Image.new('RGBA', (padded_width, padded_height), (0, 0, 0, 0))
    packed.paste(content, (left, top))  # No mask: retain the original alpha exactly.
    production_path.parent.mkdir(parents=True, exist_ok=True)
    web_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    packed.save(production_path, format='PNG', optimize=True)
    with Image.open(production_path) as check:
        restored_content = check.convert('RGBA').crop((left, top, left + width, top + height))
        if restored_content.tobytes() != content.tobytes():
            raise RuntimeError('Production PNG changed the content pixels; packing rejected')
    factor = min(1, 2048 / max(packed.size))
    web_size = (max(1, round(padded_width * factor)), max(1, round(padded_height * factor)))
    web_image = packed if web_size == packed.size else packed.resize(web_size, Image.Resampling.LANCZOS)
    web_image.save(web_path, format='WEBP', quality=90, method=6, exact=True)
    with Image.open(web_path) as reopened:
        delivered = reopened.convert('RGBA')
        if delivered.getchannel('A').tobytes() != web_image.getchannel('A').tobytes():
            raise RuntimeError('WebP alpha differs from the packed delivery image; packing rejected')
    if sha256(source) != original_hash:
        raise RuntimeError('Raw source hash changed unexpectedly')
    entry = {
        'id': args.id, 'chapter': args.chapter if not args.shared else None, 'shared': args.shared,
        'operation': 'center unchanged RGBA content on transparent canvas; delivery resize/WebP compression only',
        'raw': {'path': project_path(source), 'width': raw_size[0], 'height': raw_size[1], 'mode': source_mode, 'bytes': source.stat().st_size, 'sha256': original_hash, 'unchanged': True},
        'transparentOnlyTrim': {'enabled': args.trim_transparent, 'box': list(trim_box) if trim_box else None, 'nonzeroAlphaPixelsRemoved': 0, 'contentSize': [width, height]},
        'contentAspect': width / height,
        'sourceAspectPolicy': 'Original Blender layer aspect is supplied separately by the reconstruction manifest; not inferred here',
        'requestedGutterPerSide': args.gutter,
        'paddingPx': {'left': left, 'top': top, 'right': right, 'bottom': bottom},
        'actualGutterContentPercent': {'left': left / width * 100, 'right': right / width * 100, 'top': top / height * 100, 'bottom': bottom / height * 100},
        'paddingScaleX': padded_width / width, 'paddingScaleY': padded_height / height,
        'production': {'path': project_path(production_path), 'width': padded_width, 'height': padded_height, 'aspect': padded_width / padded_height, 'bytes': production_path.stat().st_size, 'sha256': sha256(production_path), 'contentRgbaSha256': hashlib.sha256(content.tobytes()).hexdigest(), 'contentPixelsPreserved': True, **alpha_evidence(packed)},
        'web': {'path': project_path(web_path), 'url': f'assets/{args.collection}/{group}/{args.id}.webp', 'width': web_size[0], 'height': web_size[1], 'aspect': web_size[0] / web_size[1], 'quality': 90, 'maxEdge': 2048, 'scaleX': web_size[0] / padded_width, 'scaleY': web_size[1] / padded_height, 'bytes': web_path.stat().st_size, 'sha256': sha256(web_path), 'alphaPreservedAgainstDeliveryImage': True, **alpha_evidence(delivered)},
        'scope': 'technical asset packing; no creative repaint, RGB cleanup, edge removal, or original PNG edit',
    }
    count = merge_report(report_path, entry)
    print(json.dumps({'id': args.id, 'production': project_path(production_path), 'web': project_path(web_path), 'contentAspect': entry['contentAspect'], 'paddingScaleX': entry['paddingScaleX'], 'paddingScaleY': entry['paddingScaleY'], 'rawUnchanged': True, 'productionContentPreserved': True, 'webAlphaPreserved': True, 'reportEntries': count}, ensure_ascii=True))


if __name__ == '__main__':
    main()

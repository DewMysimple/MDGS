"""Resize actual WebGL captures and encode exact lossless WebP cover assets.

No image synthesis, color adjustment, crop, retouching or recomposition occurs.
Resampling, when necessary, is Pillow LANCZOS; the result is preserved pixel for
pixel by WebP lossless with exact transparent RGB handling.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, features

ROOT = Path(__file__).resolve().parents[1]
EDITION = 'peony-2.0-2026-10-23'


def sha_bytes(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture-report', type=Path, default=ROOT / 'reports/peony2-fidelity/covers/capture.json')
    parser.add_argument('--max-width', type=int, default=1280)
    args = parser.parse_args()
    if not 256 <= args.max_width <= 4096:
        raise ValueError('--max-width must be between 256 and 4096')
    if not features.check('webp'):
        raise RuntimeError('Pillow was built without WebP support')
    capture_path = args.capture_report.resolve()
    capture = json.loads(capture_path.read_text(encoding='utf8'))
    if capture['status'] != 'pass' or capture['sourceRevision'] != EDITION:
        raise ValueError('Only successful current-edition captures can produce covers')
    for filename, expected in capture['inputHashes'].items():
        if sha_bytes((ROOT / filename).read_bytes()) != expected:
            raise ValueError('Production inputs changed after capture: ' + filename)
    if sorted(item['chapter'] for item in capture['captures']) != [1, 2, 3, 4]:
        raise ValueError('Capture must contain exactly the four chapters')
    assets = []
    for item in capture['captures']:
        chapter = item['chapter']
        png = ROOT / item['png']
        if sha_bytes(png.read_bytes()) != item['pngSha256']:
            raise ValueError('Captured PNG content changed: ' + item['png'])
        with Image.open(png) as original:
            image = original.convert('RGBA')
        if image.size != (item['width'], item['height']):
            raise ValueError('Captured PNG dimensions do not match the camera gate')
        before = image.size
        if image.width > args.max_width:
            image = image.resize((args.max_width, round(image.height * args.max_width / image.width)), Image.Resampling.LANCZOS)
        folder = ROOT / f'public/assets/new-scrolls/chapter-{chapter}'
        target = folder / 'cover.webp'
        image.save(target, format='WEBP', lossless=True, quality=100, method=6, exact=True)
        with Image.open(target) as decoded:
            if decoded.convert('RGBA').tobytes() != image.tobytes():
                raise ValueError('Lossless cover encoding changed decoded RGBA pixels')
        assets.append({'chapter': chapter, 'file': f'chapter-{chapter}/cover.webp',
                       'dimensions': list(image.size), 'capturedDimensions': list(before),
                       'bytes': target.stat().st_size, 'sha256': sha_bytes(target.read_bytes()),
                       'rgbaSha256': sha_bytes(image.tobytes()), 'lossless': True,
                       'sourceRevision': item['sourceRevision'], 'sourceSha256': item['sourceSha256'],
                       'sourceFrame': item['frame'], 'sourceProgress': item['progress'],
                       'capture': item['png'], 'captureSha256': item['pngSha256'],
                       'resampling': 'Pillow LANCZOS' if image.size != before else 'none'})
    report = {'capturedAt': capture['completedAt'], 'encodedAt': datetime.now(timezone.utc).isoformat(),
              'sourceRevision': EDITION, 'method': capture['method'] + ' Optional proportional LANCZOS resizing; WebP lossless exact RGBA re-decode verified.',
              'captureReport': capture_path.relative_to(ROOT).as_posix(), 'inputHashes': capture['inputHashes'],
              'assets': assets}
    output = ROOT / 'reports/peony2-fidelity/cover-provenance.json'
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps({'status': 'pass', 'covers': len(assets), 'provenance': output.relative_to(ROOT).as_posix()}))


if __name__ == '__main__':
    main()

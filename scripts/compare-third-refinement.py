"""Label same-progress browser screenshots; no painting retouching."""
from pathlib import Path
import hashlib
import json
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'reports/chapter-3-refinement'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    before, after = REPORTS / 'before', REPORTS / 'final/views'
    capture = json.loads((after / 'capture.json').read_text(encoding='utf-8'))
    canonical = ROOT / 'public/assets/reconstruction/manifest.json'
    if capture['manifestSha256'] != digest(canonical):
        raise RuntimeError('Final screenshots must match the current canonical manifest.')
    fonts = Path(os.environ.get('WINDIR', '')) / 'Fonts'
    font = ImageFont.truetype(str(fonts / 'arial.ttf'), 20) if (fonts / 'arial.ttf').is_file() else ImageFont.load_default()
    selections = {
        'comparison-top-and-edges.jpg': [('stop', 2), ('stop', 3), ('stop', 5)],
        'comparison-typography-and-composition.jpg': [('gap', 2), ('stop', 7), ('stop', 8)],
        'comparison-transitions.jpg': [('gap', 1), ('gap', 6), ('stop', 9)],
    }
    views = {}
    for folder, prefix in [(before, 'before'), (after, 'after')]:
        for name in ['frames.json', 'transitions.json', 'quarterpoints.json']:
            for view in json.loads((folder / name).read_text(encoding='utf-8')):
                views[prefix, view['kind'], view['index']] = view
    results = []
    for filename, points in selections.items():
        tile_width, row_height, margin = 920, 352, 18
        sheet = Image.new('RGB', (tile_width * 2 + margin * 3, 70 + row_height * len(points)), '#e4dac7')
        draw = ImageDraw.Draw(sheet)
        draw.text((margin, 16), 'Before | frozen previous delivery', font=font, fill='#383229')
        draw.text((tile_width + margin * 2, 16), 'After | same route progress', font=font, fill='#383229')
        records = []
        for row, (kind, index) in enumerate(points):
            old, new = views['before', kind, index], views['after', kind, index]
            if abs(old['progress'] - new['progress']) > 1e-10:
                raise RuntimeError('The comparison route progresses differ.')
            inputs = []
            for column, (folder, view) in enumerate([(before, old), (after, new)]):
                source = folder / view['screenshot']
                with Image.open(source) as image:
                    if image.size != (1850, 618):
                        raise RuntimeError('Comparisons require the matching actual painting viewport.')
                    image = image.convert('RGB')
                    image.thumbnail((tile_width, row_height - 30), Image.Resampling.LANCZOS)
                    x, y = margin + column * (tile_width + margin), 70 + row * row_height
                    sheet.paste(image, (x, y + 26))
                    draw.text((x, y), f'{kind} {index:02} | p={view["progress"]:.5f}', font=font, fill='#383229')
                inputs.append({'path': source.relative_to(ROOT).as_posix(), 'sha256': digest(source)})
            records.append({'kind': kind, 'index': index, 'progress': new['progress'], 'inputs': inputs})
        output = REPORTS / 'final' / filename
        sheet.save(output, quality=93)
        results.append({'path': output.relative_to(ROOT).as_posix(), 'sha256': digest(output), 'views': records})
    evidence = {'canonicalSha256': digest(canonical), 'method': 'Actual same-progress browser images; labels and proportional resampling only, no scene retouch.', 'comparisons': results}
    (REPORTS / 'final/comparison-evidence.json').write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'comparisons': len(results), 'pairedViews': sum(len(result['views']) for result in results)}))


if __name__ == '__main__':
    main()

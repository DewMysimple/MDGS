"""Make labelled evidence comparisons from already captured browser screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib
import json
import os

ROOT = Path(__file__).resolve().parents[1]


def main():
    config = json.loads((ROOT / 'reports/blank-design/final/acceptance-sources.json').read_text(encoding='utf-8'))
    out = ROOT / 'reports/blank-design/final'
    font_path = Path(os.environ.get('WINDIR', '/')) / 'Fonts/arial.ttf'
    font = ImageFont.truetype(str(font_path), 21) if font_path.is_file() else ImageFont.load_default()
    selections = {1: [('gap', 2), ('gap', 8), ('gap', 12)], 2: [('gap', 1), ('gap', 5), ('stop', 7)], 3: [('gap', 2), ('gap', 3), ('gap', 6)], 4: [('gap', 2), ('gap', 5), ('gap', 7)]}
    records = []
    for chapter, points in selections.items():
        review = json.loads((ROOT / config['chapters'][str(chapter)]['review']).read_text(encoding='utf-8'))
        width, padding, row_height = 920, 18, 350
        sheet = Image.new('RGB', (width * 2 + padding * 3, row_height * len(points) + 64), '#e4dac7')
        draw = ImageDraw.Draw(sheet)
        draw.text((padding, 16), f'Chapter {chapter} | frozen baseline', font=font, fill='#383229')
        draw.text((width + padding * 2, 16), 'Final browser capture | same camera progress', font=font, fill='#383229')
        used = []
        for row, (kind, index) in enumerate(points):
            view = next(v for v in review['views'] if v['kind'] == kind and v['index'] == index)
            after = view.get('screenshot', view.get('image'))
            if not after.startswith('reports/'):
                after = str(Path(config['chapters'][str(chapter)]['review']).parent / after).replace('\\', '/')
            before = f'reports/blank-design/before/chapter-{chapter}-{kind}-{index:02}.jpg'
            for column, image_path in enumerate([before, after]):
                with Image.open(ROOT / image_path) as image:
                    image = image.convert('RGB')
                    image.thumbnail((width, row_height - 30), Image.Resampling.LANCZOS)
                    x, y = padding + column * (width + padding), 64 + row * row_height
                    sheet.paste(image, (x, y + 26))
                    draw.text((x, y), f'{kind} {index:02} | p={view["progress"]:.5f}', font=font, fill='#383229')
            used.append({'kind': kind, 'index': index, 'before': before, 'after': after, 'afterSha256': view['sha256']})
        output = out / f'chapter-{chapter}-comparison.jpg'
        sheet.save(output, quality=92)
        records.append({'chapter': chapter, 'path': output.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'inputs': used, 'scope': 'Same-progress browser screenshot comparisons, labels and resampling only; no scene/content retouch.'})
    (out / 'comparison-evidence.json').write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'comparisons': [r['path'] for r in records]}))


if __name__ == '__main__':
    main()

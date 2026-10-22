"""Produce source/browser contacts from actual, source-bound capture artifacts."""
import json
import math
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'reports/peony2-fidelity'


def read(path):
    return json.loads(Path(path).read_text(encoding='utf8'))


def absolute(path):
    candidate = Path(path)
    return candidate if candidate.is_absolute() else ROOT / candidate


def main():
    native = read(OUT / 'validation-native.json')
    web = read(absolute(sys.argv[1]) if len(sys.argv) > 1 else OUT / 'browser-captures.json')
    fidelity = read(OUT / 'validation-fidelity.json')
    references = {(row['chapter'], frame['frame']): frame
                  for row in native['chapters']
                  for frame in read(absolute(row['evidence'])).get('renders', [])}
    metrics = {(row['chapter'], row['frame']): row for row in fidelity.get('pixels', [])}
    files = []
    font = ImageFont.load_default(size=13)
    for chapter in range(1, 5):
        frames = sorted((row for row in web['captures'] if row['chapter'] == chapter), key=lambda row: row['frame'])
        if not frames:
            continue
        columns = min(3, len(frames))
        cell_width, cell_height = 468, 206
        sheet = Image.new('RGB', (columns * cell_width, math.ceil(len(frames) / columns) * cell_height), '#f4f0e7')
        draw = ImageDraw.Draw(sheet)
        for index, frame in enumerate(frames):
            x, y = index % columns * cell_width, index // columns * cell_height
            key = (chapter, frame['frame'])
            result = metrics.get(key)
            label = f'C{chapter}  frame {frame["frame"]}  Native / Browser'
            draw.text((x + 7, y + 5), label, fill='#231f17', font=font)
            reference = references[key]
            for offset, image_path in [(0, reference['path']), (1, frame['path'])]:
                with Image.open(absolute(image_path)) as original:
                    image = original.convert('RGB')
                    image.thumbnail((224, 160), Image.Resampling.LANCZOS)
                    sheet.paste(image, (x + 7 + offset * 230, y + 25))
            if result:
                label = f'MAE {result.get("meanAbsoluteRGB8", 999):.3f}/255  p99 {result.get("p99MaximumChannelError8", 999)}  {"PASS" if result.get("passed") else "FAIL"}'
                draw.text((x + 7, y + 186), label, fill='#216a37' if result.get('passed') else '#9b281c', font=font)
        target = OUT / f'contact-chapter-{chapter}.jpg'
        sheet.save(target, quality=94, subsampling=0)
        files.append(target.relative_to(ROOT).as_posix())
    print(json.dumps({'contacts': files}, separators=(',', ':')))


if __name__ == '__main__':
    main()

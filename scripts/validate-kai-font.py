"""Check actual webfont coverage and unchanged outlines/metrics.

Needs fonttools[woff]. Source/font downloads are not performed by this checker.
The source corpus is a conservative superset of visible interface text.
"""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--font', type=Path, default=ROOT / 'public/fonts/wenkai-web.woff2')
parser.add_argument('--source', type=Path)
parser.add_argument('--previous', type=Path)
parser.add_argument('--report-dir', type=Path, default=ROOT / 'reports/art-renewal/font')
args = parser.parse_args()
sha = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()


def glyph_signature(font, codepoint):
    name = font.getBestCmap()[codepoint]
    glyphs = font.getGlyphSet()
    pen = DecomposingRecordingPen(glyphs)
    glyphs[name].draw(pen)
    return {
        'outline': hashlib.sha256(json.dumps(pen.value, separators=(',', ':')).encode()).hexdigest(),
        'horizontalMetrics': font['hmtx'].metrics[name],
        'verticalMetrics': font['vmtx'].metrics[name] if 'vmtx' in font else None,
    }


def layout_metrics(font):
    fields = {'head': ['unitsPerEm'], 'hhea': ['ascent', 'descent', 'lineGap'],
              'OS/2': ['sTypoAscender', 'sTypoDescender', 'sTypoLineGap', 'usWinAscent', 'usWinDescent']}
    return {f'{table}.{field}': getattr(font[table], field) for table, names in fields.items() for field in names}


files = sorted(p for p in (ROOT / 'src').rglob('*') if p.suffix in {'.ts', '.tsx', '.css'})
corpus = ''.join(p.read_text(encoding='utf-8') for p in files)
han = sorted({ord(c) for c in corpus if 0x3400 <= ord(c) <= 0x9fff})
font = TTFont(args.font)
cmap = font.getBestCmap()
report = {
    'status': 'checking', 'checkedAt': datetime.now(timezone.utc).isoformat(),
    'scope': 'Actual decoded WOFF2 cmap; conservative Han corpus from all src TS/TSX/CSS, including comments. Not every source character is displayed or intended to use this family.',
    'font': {'path': str(args.font), 'sha256': sha(args.font), 'bytes': args.font.stat().st_size,
             'mappedCodepoints': len(cmap)},
    'corpusFiles': len(files), 'corpusSha256': hashlib.sha256(corpus.encode()).hexdigest(),
    'requiredHan': len(han), 'missingHan': [chr(c) for c in han if c not in cmap],
    'layoutMetrics': layout_metrics(font), 'comparisons': [], 'errors': [],
}
if report['missingHan']:
    report['errors'].append('The actual webfont lacks required Han characters.')

for label, reference_path in [('pinned-source', args.source), ('previous-webfont', args.previous)]:
    if not reference_path:
        continue
    reference = TTFont(reference_path)
    reference_cmap = reference.getBestCmap()
    points = sorted(cmap if label == 'pinned-source' else reference_cmap)
    missing = [point for point in points if point not in cmap or point not in reference_cmap]
    changed = [point for point in points if point not in missing
               and glyph_signature(font, point) != glyph_signature(reference, point)]
    comparison = {
        'reference': label, 'path': str(reference_path), 'sha256': sha(reference_path),
        'comparedCodepoints': len(points), 'missingCodepoints': missing,
        'changedOutlinesOrMetrics': changed, 'layoutMetricsUnchanged': layout_metrics(font) == layout_metrics(reference),
    }
    if missing or changed or not comparison['layoutMetricsUnchanged']:
        report['errors'].append(label + ': coverage, outline or layout metric change.')
    report['comparisons'].append(comparison)
    reference.close()

font.close()
report['status'] = 'passed' if not report['errors'] else 'failed'
args.report_dir.mkdir(parents=True, exist_ok=True)
(args.report_dir / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({key: report[key] for key in ['status', 'requiredHan', 'missingHan', 'comparisons', 'errors']}, ensure_ascii=False))
raise SystemExit(0 if report['status'] == 'passed' else 1)

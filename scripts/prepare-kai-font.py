"""Create a self-hosted web subset from the upstream OFL WenKai font.

Run with fonttools[woff] available; only the generated WOFF2 and license ship.
"""
import argparse
import hashlib
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--license', type=Path, required=True)
parser.add_argument('--revision', required=True)
args = parser.parse_args()
corpus = ''.join(p.read_text(encoding='utf-8') for p in (ROOT / 'src').rglob('*') if p.suffix in {'.ts', '.tsx', '.css'})
codepoints = set(map(ord, corpus)) | set(range(32, 256)) | set(range(0x3000, 0x3040))
font = TTFont(args.source)
available = set(font.getBestCmap())
options = subset.Options()
options.flavor = 'woff2'
options.name_IDs = ['*']
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=codepoints)
subsetter.subset(font)
font.flavor = 'woff2'
out = ROOT / 'public' / 'fonts'
out.mkdir(exist_ok=True)
target = out / 'wenkai-web.woff2'
font.save(target)
(out / 'OFL-WenKai.txt').write_bytes(args.license.read_bytes())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
report = {'family': 'MDGS Kai', 'originalFamily': 'LXGW WenKai', 'license': 'SIL OFL 1.1',
          'upstream': 'https://github.com/lxgw/LxgwWenKai', 'upstreamCommit': args.revision,
          'originalSha256': sha(args.source), 'webSha256': sha(target), 'bytes': target.stat().st_size,
          'glyphs': len(font.getBestCmap()), 'requiredCodepoints': len(codepoints),
          'missingHan': [chr(c) for c in sorted(codepoints - available) if 0x3400 <= c <= 0x9fff],
          'transformation': 'Web-only WOFF2 corpus subset; no source outline edits; OFL additional web-subset permission retained.'}
(out / 'provenance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
if report['missingHan']:
    raise SystemExit('Required Han characters missing: ' + ''.join(report['missingHan']))
print(json.dumps(report, ensure_ascii=False))

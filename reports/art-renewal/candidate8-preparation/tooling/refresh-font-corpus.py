"""Prepared, not executed. Update only corpus provenance after coverage is proved."""
from pathlib import Path
import hashlib,json
from fontTools.ttLib import TTFont
root=Path(__file__).resolve().parents[2]
target=root/'public/fonts/provenance.json'
metadata=json.loads(target.read_text(encoding='utf-8'))
font_path=root/'public/fonts/wenkai-web.woff2'
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert digest(font_path)=='c619ddc07c72b9afca0ab20b1e33ed1a67c974ae3a7d1ec44de611895a79f59d'
files=sorted(p for p in (root/'src').rglob('*') if p.suffix in {'.ts','.tsx','.css'})
corpus=''.join(p.read_text(encoding='utf-8') for p in files)
required=set(map(ord,corpus))|set(range(32,256))|set(range(0x3000,0x3040))
with TTFont(font_path) as font:
    cmap=set(font.getBestCmap())
    missing=[chr(c) for c in sorted(required-cmap) if 0x3400<=c<=0x9fff]
assert not missing,repr(missing)
metadata.update(corpusSha256=hashlib.sha256(corpus.encode('utf-8')).hexdigest(),corpusFiles=len(files),requiredCodepoints=len(required),missingHan=[])
target.write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'status':'corpus-only-updated','corpusSha256':metadata['corpusSha256'],'corpusFiles':len(files),'webSha256':digest(font_path),'missingHan':missing}))

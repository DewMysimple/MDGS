"""Encode extracted image bytes as alpha-preserving WebP; requires Pillow."""
from pathlib import Path
from PIL import Image, ImageOps
import json, concurrent.futures, argparse

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--max-size',type=int,default=2048)
parser.add_argument('--quality',type=int,default=88)
args=parser.parse_args()

def optimize(path):
    target=(ROOT/'public'/'assets'/path.parent.name/'textures'/path.with_suffix('.webp').name) if '.asset-cache' in path.parts else path.with_suffix('.webp')
    if target.exists() and target.stat().st_size>0:
        try:
            with Image.open(target) as check:
                check.verify()
            with Image.open(path) as source:
                original=source.size
            with Image.open(target) as encoded:
                size=encoded.size
            return str(path.relative_to(ROOT)),original,size,path.stat().st_size,target.stat().st_size
        except Exception:
            pass
    with Image.open(path) as im:
        im=ImageOps.exif_transpose(im).convert('RGBA')
        original=im.size
        im.thumbnail((args.max_size,args.max_size),Image.Resampling.LANCZOS)
        # Alpha channel remains full precision; no opaque paper replacement.
        im.save(target,format='WEBP',quality=args.quality,method=3,exact=False)
        return str(path.relative_to(ROOT)),original,im.size,path.stat().st_size,target.stat().st_size

paths=list((ROOT/'public'/'assets').glob('chapter-*/textures/*.source'))
if not paths:
    paths=list((ROOT/'.asset-cache').glob('chapter-*/*.source'))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results=list(pool.map(optimize,paths))
report={'images':len(results),'originalBytes':sum(r[3] for r in results),'webpBytes':sum(r[4] for r in results),'maxSize':args.max_size,'quality':args.quality,'alphaPreserved':True,'files':[{'source':r[0],'sourceSize':r[1],'webSize':r[2],'bytes':r[4]} for r in results]}
for manifest in (ROOT/'public'/'assets').glob('chapter-*/scene.json'):
    data=json.loads(manifest.read_text(encoding='utf8'))
    for image in data['images']:
        imgpath=manifest.parent/image['src']
        with Image.open(imgpath) as im:
            image['webSize']=list(im.size)
            image['hasAlpha']=im.mode in ('RGBA','LA')
            image['bytes']=imgpath.stat().st_size
        rawpath=imgpath.with_suffix('.source')
        if not rawpath.exists():rawpath=ROOT/'.asset-cache'/manifest.parent.name/rawpath.name
        if rawpath.exists():
            with Image.open(rawpath) as im:image['sourceSize']=list(im.size)
    # Preserve original bytes outside public so Vite does not ship unoptimized duplicates.
    for rawpath in (manifest.parent/'textures').glob('*.source'):
        cache=ROOT/'.asset-cache'/manifest.parent.name/rawpath.name
        cache.parent.mkdir(parents=True,exist_ok=True)
        rawpath.replace(cache)
    manifest.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
(ROOT/'reports'/'assets-textures.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({k:v for k,v in report.items() if k!='files'}))

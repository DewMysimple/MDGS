"""Back up the previous four local originals, then replace their active folder."""
import hashlib,json,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CURRENT=(ROOT/'牡丹').resolve();NEW=(ROOT/'牡丹2.0').resolve();BACKUP=(ROOT/'.asset-cache/peony-pre-2.0').resolve()
REPORT=ROOT/'reports/peony-2.0';REPORT.mkdir(parents=True,exist_ok=True)
for folder in (CURRENT,NEW,BACKUP):
    if not folder.is_relative_to(ROOT):raise RuntimeError('Path escaped project')
expected=['画卷一_灼烧入场版.blend','画卷二_街市建筑完整补全版.blend','画卷三_分镜构图版_图层补全.blend','画卷四_画卷一节奏运镜版.blend']
def sha(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):digest.update(block)
    return digest.hexdigest()
if sorted(p.name for p in NEW.glob('*.blend'))!=sorted(expected):raise RuntimeError('Unexpected new input set')
BACKUP.mkdir(parents=True,exist_ok=True)
before=[]
for old in CURRENT.glob('*.blend'):
    target=BACKUP/old.name;digest=sha(old)
    if target.exists() and sha(target)!=digest:raise RuntimeError('Existing backup disagrees: '+old.name)
    if not target.exists():shutil.copy2(old,target)
    if sha(target)!=digest:raise RuntimeError('Backup bytes disagree')
    before.append({'file':old.name,'sha256':digest,'bytes':old.stat().st_size,'backup':target.relative_to(ROOT).as_posix()})
after=[]
for name in expected:
    original=NEW/name;target=CURRENT/name;digest=sha(original)
    shutil.copy2(original,target)
    if sha(target)!=digest:raise RuntimeError('Copied active input disagrees')
    after.append({'file':name,'input':original.relative_to(ROOT).as_posix(),'activeCopy':target.relative_to(ROOT).as_posix(),'sha256':digest,'bytes':target.stat().st_size,'inputUntouched':True})
for item in before:
    if item['file'] not in expected:
        old=CURRENT/item['file'];backup=BACKUP/item['file']
        if old.parent!=CURRENT or sha(old)!=sha(backup):raise RuntimeError('Unsafe obsolete input removal')
        old.unlink()
report={'status':'pass','scope':'User-authorized replacement of active 牡丹 originals from 牡丹2.0; prior four inputs backed up with matching bytes first','before':before,'after':after}
(REPORT/'input-replacement.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False),flush=True)

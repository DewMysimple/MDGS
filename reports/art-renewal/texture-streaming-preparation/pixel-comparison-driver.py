from pathlib import Path
import json
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[2]
directory=root/'tmp/manual-drag-ab-v2/pixels/2026-10-23T02-31-49-272Z'
report=json.loads((directory/'validation.json').read_text(encoding='utf-8'))
rows=[]
for base in [c for c in report['captures'] if c['variant']=='base']:
    prepared=next(c for c in report['captures'] if c['variant']=='prepared' and c['chapter']==base['chapter'] and c['progress']==base['progress'])
    a=np.array(Image.open(root/base['file']).convert('RGBA')).astype(np.int16)
    b=np.array(Image.open(root/prepared['file']).convert('RGBA')).astype(np.int16)
    d=np.abs(a-b)
    rows.append(dict(chapter=base['chapter'],progress=base['progress'],shape=list(a.shape),mae=float(d[:,:,:3].mean()),p99=float(np.percentile(d[:,:,:3],99)),maximum=int(d.max()),above20=float((d[:,:,:3]>20).any(axis=2).mean()),alphaMax=int(d[:,:,3].max()),exact=bool(np.array_equal(a,b))))
output=dict(status='pass' if all(r['mae']<=2 and r['p99']<=12 and r['above20']<=.005 and r['alphaMax']==0 for r in rows) else 'fail',scope='Six representative same-source-aspect A/B comparisons; original strict pixel thresholds unchanged, not the full 59 native frame suite.',checks=rows)
(directory/'comparison.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(output,ensure_ascii=False))

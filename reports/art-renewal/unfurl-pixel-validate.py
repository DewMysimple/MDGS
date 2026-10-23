from PIL import Image, ImageChops
from pathlib import Path
import json, statistics
root=Path.cwd(); directory=root/'reports/art-renewal'
captures=json.loads((directory/'unfurl-pixel-captures.json').read_text(encoding='utf-8'))
checks=[]
for case in captures:
    cover=Image.open(root/case['source']).convert('RGB'); size=(256, round(256*cover.height/cover.width)); expected=cover.resize(size,Image.Resampling.LANCZOS)
    for kind in ['physical','native']:
        info=case[kind]; rect=info['rect']; actual=Image.open(directory/info['file']).convert('RGB').crop((round(rect['left']),round(rect['top']),round(rect['left']+rect['width']),round(rect['top']+rect['height']))).resize(size,Image.Resampling.LANCZOS)
        dif=ImageChops.difference(expected,actual); values=[sum(pixel)/3 for pixel in dif.getdata()]; values.sort(); mae=sum(values)/len(values); p95=values[int(len(values)*.95)]; maximum=max(values)
        checks.append({'chapter':case['chapter'],'comparison':kind+'-versus-current-cover','meanAbsoluteRGBDifference':mae,'p95AbsoluteRGBDifference':p95,'maxAbsoluteRGBDifference':maximum,'downsampledSize':size,'passed':mae<5 and p95<15})
report={'status':'passed' if all(c['passed'] for c in checks) else 'failed','scope':'1920x1080 real Chrome screenshots sampled inside actual projected print / sourceViewport; rounded crop and common256px Lanczos comparison. This detects broad depth artifacts and colour/composition jumps, not pixel-identical source rendering. No artwork pixels were edited.','checks':checks}
(directory/'unfurl-pixel-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))

"""Compare the same frozen repaired scene before and after actual GPU recovery."""
import json
import pathlib

from PIL import Image, ImageChops

root=pathlib.Path(__file__).resolve().parents[1]
directory=root/'reports/reconstruction/after-motion'
report=json.loads((directory/'validation-motion-corners.json').read_text(encoding='utf-8'))
first,second=[Image.open(root/path).convert('RGB') for path in report['contextRecovery']['images']]
delta=ImageChops.difference(first,second)
pixels=list(delta.get_flattened_data() if hasattr(delta,'get_flattened_data') else delta.getdata())
maximum=max(max(pixel) for pixel in pixels)
changed=sum(max(pixel)>0 for pixel in pixels)
above_one=sum(max(pixel)>1 for pixel in pixels)
above_five=sum(max(pixel)>5 for pixel in pixels)
assert maximum<=1 and changed/len(pixels)<.0001,'The frozen scene may only differ by one RGB code unit in fewer than 0.01% of pixels after GPU restore'
result={
    'passed':True,'canonicalSha256':report['canonicalSha256'],
    'contextRecovery':{'exactlyIdentical':delta.getbbox() is None,'size':list(first.size),'differenceBounds':delta.getbbox(),'maxRGBDelta':maximum,'changedPixels':changed,'changedRatio':changed/len(pixels),'changedPixelsAbove1RGB':above_one,'changedPixelsAbove5RGB':above_five,'images':report['contextRecovery']['images']},
    'method':'PIL comparison of the actual reduced-motion eighth-scene viewport before and after WEBGL_lose_context recovery. Tolerance is at most one 8-bit RGB code unit in fewer than 0.01% of pixels; exact equality is reported separately.',
    'limitations':'This verifies retained scene rendering after recovery. The four targeted static images still require visual seam/composition review.',
}
(directory/'motion-corners-pixels.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Repaired eighth scene: {changed} pixels differ, max RGB delta {maximum}, {above_one} pixels exceed one code unit after real GPU recovery.')

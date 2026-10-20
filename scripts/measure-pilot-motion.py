"""Measure rendered screenshot differences; never modify source art or scene assets."""
import collections
import json
import pathlib

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'reports/reconstruction/pilot-motion'
report = json.loads((DIRECTORY / 'validation.json').read_text(encoding='utf-8'))
results = []
try:
    font = ImageFont.load_default(size=18)
except TypeError:
    font = ImageFont.load_default()
for result in report['results']:
    comparisons = {}
    active_images = None
    for state in ['active', 'off', 'reduced']:
        first, second = [Image.open(ROOT / name).convert('RGB') for name in result[state]['images']]
        delta = ImageChops.difference(first, second)
        pixels = list(delta.get_flattened_data() if hasattr(delta, 'get_flattened_data') else delta.getdata())
        changed = sum(max(pixel) > 5 for pixel in pixels)
        comparisons[state] = {
            'size': list(first.size), 'changedPixelsAbove5RGB': changed,
            'changedRatio': changed / len(pixels), 'differenceBounds': delta.getbbox(),
            'meanRGBDelta': ImageStat.Stat(delta).mean,
        }
        if state in ['off', 'reduced']:
            assert delta.getbbox() is None, f'{result["scene"]}/{state} should render identical frozen images'
        else:
            assert changed > 0, f'{result["scene"]} needs an actual rendered pixel difference'
            active_images = first, second, delta
    first, second, delta = active_images
    # These image-space rectangles were checked against the two saved viewpoints;
    # they sample painted architectural interiors/stonework away from falling petals.
    fixed_rois = {
        'opening': [('painted-column-interior', [150,80,250,180]), ('foreground-stone-balustrade', [500,330,650,390])],
        'palace': [('palace-roof-and-beams', [700,100,820,180]), ('palace-stone-stair', [650,250,760,300])],
    }
    fixed_subjects = []
    for label, bounds in fixed_rois[result['scene']]:
        roi_delta = delta.crop(bounds)
        roi_pixels = list(roi_delta.get_flattened_data() if hasattr(roi_delta, 'get_flattened_data') else roi_delta.getdata())
        above5 = sum(max(pixel)>5 for pixel in roi_pixels)
        assert above5 == 0, f'Unexpected visible change in fixed structural region {result["scene"]}/{label}'
        fixed_subjects.append({'label': label, 'bounds': bounds, 'changedPixelsAbove5RGB': above5, 'exactDifferenceBounds': roi_delta.getbbox()})
    width, height = first.size
    mask = {(index % width, index // width) for index, pixel in enumerate(delta.get_flattened_data() if hasattr(delta, 'get_flattened_data') else delta.getdata()) if max(pixel) > 12}
    components = []
    while mask:
        seed = mask.pop()
        pending = collections.deque([seed])
        points = [seed]
        while pending:
            x, y = pending.popleft()
            for nx, ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1),(x-1,y-1),(x+1,y+1),(x-1,y+1),(x+1,y-1)]:
                if (nx, ny) in mask:
                    mask.remove((nx, ny)); pending.append((nx, ny)); points.append((nx, ny))
        if len(points) >= 5:
            xs, ys = zip(*points)
            components.append({'pixels': len(points), 'bounds': [min(xs), min(ys), max(xs)+1, max(ys)+1]})
    components.sort(key=lambda component: component['pixels'], reverse=True)
    crops = []
    for index, component in enumerate(components[:2]):
        left, top, right, bottom = component['bounds']
        cx, cy = (left+right)/2, (top+bottom)/2
        crop_width = max(140, right-left+80); crop_height = max(100, bottom-top+60)
        bounds = [max(0, int(cx-crop_width/2)), max(0, int(cy-crop_height/2)), min(width, int(cx+crop_width/2)), min(height, int(cy+crop_height/2))]
        images = [image.crop(bounds).resize(((bounds[2]-bounds[0])*3, (bounds[3]-bounds[1])*3), Image.Resampling.LANCZOS) for image in [first, second]]
        panel = Image.new('RGB', (images[0].width*2+30, images[0].height+35), '#f8f5ed')
        drawer = ImageDraw.Draw(panel)
        for j, image in enumerate(images):
            x = j*(image.width+10)
            panel.paste(image, (x,35)); drawer.text((x+10,8), 'A' if j==0 else 'B: +3.4 seconds', fill='#574334', font=font)
        name = f'{result["scene"]}-motion-detail-{index+1}.jpg'
        panel.save(DIRECTORY/name, quality=95)
        crops.append({'file': f'reports/reconstruction/pilot-motion/{name}', 'sourceCrop': bounds, 'component': component})
    results.append({'scene': result['scene'], 'name': result['name'], 'comparisons': comparisons, 'fixedSubjectRegions': fixed_subjects, 'detailCrops': crops})
output = {
    'passed': True, 'results': results,
    'method': 'PIL pixel difference of actual Playwright viewport screenshots. Above-5 RGB threshold describes the extent of visible local change; pause/reduced compare exactly.',
    'limitations': 'Pixel deltas and crops do not alone certify every asset seam or all fixed subjects. They accompany stable progress telemetry, explicit movement bindings and direct screenshot review.'
}
(DIRECTORY/'frame-differences.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({r['scene']: {state: r['comparisons'][state]['changedPixelsAbove5RGB'] for state in ['active','off','reduced']} for r in results},ensure_ascii=False))

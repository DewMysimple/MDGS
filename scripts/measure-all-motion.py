"""Measure saved browser evidence without changing artwork or scene assets."""
import collections
import json
import pathlib

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

ROOT = pathlib.Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'reports/reconstruction/after-motion'
browser = json.loads((DIRECTORY / 'validation-all-motion-browser.json').read_text(encoding='utf-8'))
fourth = json.loads((DIRECTORY / 'fourth-sheng-shuai.json').read_text(encoding='utf-8'))
try:
    font = ImageFont.load_default(size=18)
except TypeError:
    font = ImageFont.load_default()


def compare(images, name, frozen=False, details=False):
    first, second = [Image.open(ROOT / path).convert('RGB') for path in images]
    delta = ImageChops.difference(first, second)
    pixels = list(delta.get_flattened_data() if hasattr(delta, 'get_flattened_data') else delta.getdata())
    changed = sum(max(pixel) > 5 for pixel in pixels)
    if frozen:
        assert delta.getbbox() is None, f'{name} must remain exactly frozen'
    else:
        assert delta.getbbox() is not None, f'{name} needs an actual rendered difference'
    result = {
        'size': list(first.size), 'changedPixelsAbove5RGB': changed,
        'changedRatio': changed / len(pixels), 'differenceBounds': delta.getbbox(),
        'meanRGBDelta': ImageStat.Stat(delta).mean,
    }
    if not details:
        return result
    width, height = first.size
    mask = {(index % width, index // width) for index, pixel in enumerate(pixels) if max(pixel) > 8}
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
        if len(points) >= 4:
            xs, ys = zip(*points)
            components.append({'pixels': len(points), 'bounds': [min(xs), min(ys), max(xs)+1, max(ys)+1]})
    components.sort(key=lambda component: component['pixels'], reverse=True)
    crops = []
    for index, component in enumerate(components[:2]):
        left, top, right, bottom = component['bounds']
        cx, cy = (left+right)/2, (top+bottom)/2
        crop_width, crop_height = max(120,right-left+60), max(90,bottom-top+45)
        bounds = [max(0,int(cx-crop_width/2)),max(0,int(cy-crop_height/2)),min(width,int(cx+crop_width/2)),min(height,int(cy+crop_height/2))]
        frames = [image.crop(bounds).resize(((bounds[2]-bounds[0])*3,(bounds[3]-bounds[1])*3),Image.Resampling.LANCZOS) for image in [first,second]]
        panel = Image.new('RGB',(frames[0].width*2+20,frames[0].height+35),'#f8f5ed')
        drawer = ImageDraw.Draw(panel)
        for frame_index, frame in enumerate(frames):
            x=frame_index*(frame.width+10);panel.paste(frame,(x,35))
            drawer.text((x+8,8),'A' if frame_index==0 else 'B: later, same reading position',fill='#574334',font=font)
        filename=f'{name}-detail-{index+1}.jpg';panel.save(DIRECTORY / filename,quality=95)
        crops.append({'file':'reports/reconstruction/after-motion/'+filename,'sourceCrop':bounds,'component':component})
    result['detailCrops']=crops
    return result


results=[]
fixed_regions={
    1:[('stone-balustrade',[500,330,650,390]),('column-interior',[150,80,250,180])],
    2:[('scholar-desk',[620,320,810,380]),('pavilion-beams',[560,120,620,190])],
    3:[('temple-wooden-beam',[300,100,350,130]),('decorated-boxes',[300,350,420,420])],
    4:[('poet-upper-body',[1010,70,1100,200]),('stone-desk-and-scroll',[1050,290,1150,370])],
}
for probe in browser['probes']:
    chapter=probe['chapter'];lifecycle=next(item for item in browser['lifecycles'] if item['chapter']==chapter)
    first,second=[Image.open(ROOT / path).convert('RGB') for path in probe['images']]
    delta=ImageChops.difference(first,second)
    fixed=[]
    for label,bounds in fixed_regions[chapter]:
        roi=delta.crop(bounds)
        pixels=roi.get_flattened_data() if hasattr(roi,'get_flattened_data') else roi.getdata()
        visible=sum(max(pixel)>5 for pixel in pixels)
        assert visible==0,f'Unexpected visible change in {chapter}/{label}'
        fixed.append({'label':label,'bounds':bounds,'changedPixelsAbove5RGB':visible,'exactDifferenceBounds':roi.getbbox()})
    result={
        'chapter':chapter,'stop':probe['stop'],
        'active':compare(probe['images'],f'chapter-{chapter}-source-motion',details=True),
        'off':compare(lifecycle['off']['images'],f'chapter-{chapter}-off',frozen=True),
        'reduced':compare(lifecycle['reduced']['images'],f'chapter-{chapter}-reduced',frozen=True),
        'fixedSubjectRegions':fixed,
    }
    if chapter==3:
        bounds=[520,20,585,135];roi=delta.crop(bounds)
        pixels=roi.get_flattened_data() if hasattr(roi,'get_flattened_data') else roi.getdata()
        visible=sum(max(pixel)>5 for pixel in pixels)
        assert visible>0,'The independently bound single lamp must visibly move'
        frames=[frame.crop(bounds).resize((260,460),Image.Resampling.LANCZOS) for frame in [first,second]]
        panel=Image.new('RGB',(540,495),'#f8f5ed');drawer=ImageDraw.Draw(panel)
        for index,frame in enumerate(frames):
            panel.paste(frame,(index*275,35));drawer.text((index*275+8,8),'A' if index==0 else 'B: same stop, +2 seconds',fill='#574334',font=font)
        filename='chapter-3-independent-lamp-detail.jpg';panel.save(DIRECTORY / filename,quality=95)
        result['independentLamp']={'mesh':'SC06_16_红色灯笼','bounds':bounds,'changedPixelsAbove5RGB':visible,'file':'reports/reconstruction/after-motion/'+filename}
    results.append(result)
fourth_results=[{'label':entry['label'],'stop':entry['stop'],'comparison':compare(entry['images'],'fourth-'+entry['label'],details=True)} for entry in fourth['evidence']]
report={
    'passed':True,'sourceProbes':results,'fourthNarrative':fourth_results,
    'method':'PIL pixel difference of actual browser viewport screenshots; paused/reduced states compare exactly. Dynamic frames hold their reading position, with independent time advancing.',
    'limitations':'Image deltas measure local rendered differences. They accompany geometry/matrix tests and explicit bindings; they do not independently certify every static subject or every GPU.',
}
(DIRECTORY / 'frame-differences.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'sourceProbes':{entry['chapter']:entry['active']['changedPixelsAbove5RGB'] for entry in results},'fourth':{entry['label']:entry['comparison']['changedPixelsAbove5RGB'] for entry in fourth_results}},ensure_ascii=False))

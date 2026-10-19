"""Translate original radial transparent material graphs to small RGBA textures.

Source node evidence is saved in reports/assets-procedural.json. Paper ramps
retain their original average colors. Source painting image pixels are untouched.
"""
import json,math,hashlib
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]

def linear_to_srgb(c):
    return 12.92*c if c<=0.0031308 else 1.055*c**(1/2.4)-0.055

SPECS={
 '淡墨接地影':([.22,.22,.16],.02,.52,.15),
 '过渡_云气留白':([.83,.81,.72],.02,.52,.38),
 '云气 · 绢白透明边':([.8549926281,.7758222222,.6307571530],.05,.5,.325),
 '远山淡墨 · 暖青':([.2501582801,.2874408364,.2307400554],.05,.5,.06),
 '远山淡墨 · 冷青':([.0998987257,.1589608341,.1620293707],.05,.5,.075),
 '题字留白 · 绢本':([.8468732238,.7529422045,.5647115111],.05,.5,.5),
}
PAPER={
 '宣纸 温润纤维':[(.8468732238+.8879231215)/2,(.7681511641+.8148465753)/2,(.6104955673+.6724431515)/2],
 '通幅宣纸｜轻微纤维':[(.8549926281+.9215818644)/2,(.7605245113+.8468732238)/2,(.6038273573+.7230551243)/2],
 '绢本 · 连续纸纹底色':[(.6938717365+.8631572127)/2,(.5972017646+.7835378051)/2,(.4341536462+.6307571530)/2],
}
for path in (ROOT/'public'/'assets').glob('chapter-*/scene.json'):
    data=json.loads(path.read_text(encoding='utf8'))
    for material in data['materials']:
        if material['name'] in PAPER:
            material['color']=PAPER[material['name']]
        if material['name'] not in SPECS:continue
        color,inner,outer,strength=SPECS[material['name']]
        srgb=[round(linear_to_srgb(c)*255) for c in color]
        dim=256;pixels=[]
        for y in range(dim):
            for x in range(dim):
                r=math.hypot((x+.5)/dim-.5,(y+.5)/dim-.5)
                alpha=max(0,min(1,(outer-r)/(outer-inner)))*strength
                pixels.append(tuple(srgb+[round(alpha*255)]))
        img=Image.new('RGBA',(dim,dim));img.putdata(pixels)
        name='procedural-'+hashlib.sha1(material['name'].encode()).hexdigest()[:12]+'.webp'
        imgpath=path.parent/'textures'/name
        img.save(imgpath,format='WEBP',lossless=True,method=3)
        src='textures/'+name
        material.update({'texture':src,'color':[1,1,1],'opacity':1,'transparent':True,'depthWrite':False,'alphaTest':.001,'proceduralApproximation':True,'sourceTransparentShader':True,'proceduralSource':'Original UV radial alpha ramp; fourth-scroll noise replaced by its mean.'})
        if not any(i['src']==src for i in data['images']):
            data['images'].append({'id':name[:-5],'src':src,'sourceName':material['name']+' (Blender procedural)','sourceSize':[dim,dim],'webSize':[dim,dim],'hasAlpha':True,'bytes':imgpath.stat().st_size})
    for mesh in data['meshes']:
        name=data['materials'][mesh['material']]['name']
        if name=='题字留白 · 绢本':mesh['role']='annotation-background'
        elif name=='淡墨接地影':mesh['role']='ground-shadow'
        elif name in SPECS:mesh['role']='atmosphere'
    # Fail fast if a source transparent graph has not been translated.
    graphs=json.loads((ROOT/'reports'/'assets-procedural.json').read_text(encoding='utf8'))
    transparent_names={g['name'] for g in graphs if any(n['type']=='BSDF_TRANSPARENT' for n in g['nodes'])}
    for material in data['materials']:
        if material['name'] in transparent_names and not material['texture']:
            raise RuntimeError('Untranslated transparent procedural material: '+material['name'])
    data['audit']['proceduralMaterialApproximation']='Unlit original paintings; all source radial transparent clouds, distant ink, annotation backing and ground shadows baked to 256px alpha textures. Paper shader color ramps use original average color. Fourth-scroll procedural noise uses its mean.'
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print('Restored original radial transparency and warm paper ramp colors.')

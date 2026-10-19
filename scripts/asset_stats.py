from pathlib import Path
import json,math,itertools
ROOT=Path(__file__).resolve().parents[1]
out=[]

def rotate(v,q):
    x,y,z,w=q;vx,vy,vz=v
    # Quaternion-vector rotation.
    tx=2*(y*vz-z*vy);ty=2*(z*vx-x*vz);tz=2*(x*vy-y*vx)
    return [vx+w*tx+y*tz-z*ty,vy+w*ty+z*tx-x*tz,vz+w*tz+x*ty-y*tx]

for path in (ROOT/'public'/'assets').glob('chapter-*/scene.json'):
    d=json.loads(path.read_text(encoding='utf8'))
    imgs={i['src']:i for i in d['images']}
    image_bytes=sum((path.parent/i['src']).stat().st_size for i in imgs.values())
    gpu=lambda key:math.ceil(imgs[key]['webSize'][0]*imgs[key]['webSize'][1]*4*4/3)
    reading=[]
    for stop in d['stops']:
        c=next(c for c in d['cameras'] if c['frame']==stop['frame'])
        q=c['quaternion'];iq=[-q[0],-q[1],-q[2],q[3]]
        tan=math.tan(math.radians(c['fov']/2));aspect=d['render']['width']/d['render']['height']
        visible=set()
        for m in d['meshes']:
            tex=d['materials'][m['material']]['texture']
            if not tex:continue
            bounds=m['bounds'];lo=bounds['min'];hi=bounds['max']
            center=[(a+b)/2 for a,b in zip(lo,hi)]
            radius=math.sqrt(sum(((b-a)/2)**2 for a,b in zip(lo,hi)))
            v=rotate([a-b for a,b in zip(center,c['position'])],iq)
            depth=-v[2]
            if depth+radius<=0:continue
            if abs(v[0])-radius>(depth+radius)*tan*aspect*1.45:continue
            if abs(v[1])-radius>(depth+radius)*tan*1.45:continue
            visible.add(tex)
        reading.append({'frame':stop['frame'],'textures':len(visible),'conservativeMipmappedRGBABytes':sum(gpu(t) for t in visible)})
    out.append({'id':d['id'],'textures':len(imgs),'webpBytes':image_bytes,'manifestBytes':path.stat().st_size,'meshes':len(d['meshes']),'triangles':sum(len(m['indices'])//3 for m in d['meshes']),'vertices':sum(len(m['positions'])//3 for m in d['meshes']),'allTexturesMipmappedRGBABytes':sum(gpu(t) for t in imgs),'maxDimension':max(max(i['webSize']) for i in imgs.values()),'readingVisibilityConservative':reading})
(ROOT/'reports'/'assets-stats.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps([{k:v for k,v in item.items() if k!='readingVisibilityConservative'} for item in out]))

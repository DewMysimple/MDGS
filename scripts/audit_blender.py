"""Audit configured source scenes without saving the original Blender files."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import ROOT, load_pipeline
CONFIG = load_pipeline()
import bpy
SOURCES = CONFIG.sources
out=[]
for cid,path in SOURCES:
    bpy.ops.wm.open_mainfile(filepath=path)
    s=bpy.context.scene
    objects=[]
    for o in s.objects:
        d={'name':o.name,'type':o.type,'location':list(o.location),'dimensions':list(o.dimensions),'hidden':o.hide_render, 'materials':[m.name for m in o.data.materials] if hasattr(o.data,'materials') else [], 'animation':bool(o.animation_data),'constraints':[c.type for c in o.constraints]}
        if o.type=='MESH':
            d['vertices']=len(o.data.vertices);d['polygons']=len(o.data.polygons)
        if o.type=='FONT':d['text']=o.data.body
        if o.type=='CAMERA':d['camera']={'type':o.data.type,'lens':o.data.lens,'orthoScale':o.data.ortho_scale}
        objects.append(d)
    imgs=[{'name':i.name,'path':bpy.path.abspath(i.filepath),'size':list(i.size),'packed':bool(i.packed_file),'channels':i.channels} for i in bpy.data.images]
    cams=[]
    for frame in [s.frame_start, round((s.frame_start+s.frame_end)/2),s.frame_end]:
        s.frame_set(frame)
        c=s.camera
        cams.append({'frame':frame,'name':c.name if c else None,'matrix':list(sum(([v for v in r] for r in c.matrix_world),[])) if c else None})
    d={'id':cid,'source':path,'frames':[s.frame_start,s.frame_end],'fps':s.render.fps,'render':[s.render.resolution_x,s.render.resolution_y],'camera':s.camera.name if s.camera else None,'cameraSamples':cams,'markers':[{'name':m.name,'frame':m.frame,'camera':m.camera.name if m.camera else None} for m in s.timeline_markers], 'objects':objects,'images':imgs}
    out.append(d)
    print('AUDIT',cid,'objects',len(objects),'images',len(imgs),'camera',d['camera'], flush=True)
report = ROOT / 'reports' / 'assets-audit.json'
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf8')

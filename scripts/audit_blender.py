import bpy, json, os
from mathutils import Vector
SOURCES = [
('chapter-1', r'F:\牡丹\场景blender搭建\一\牡丹与女帝_叙事复合运镜.blend'),
('chapter-2', r'F:\牡丹\场景blender搭建\二\画卷二_长卷叙事.blend'),
('chapter-3', r'F:\牡丹\场景blender搭建\三\画卷三_中国长卷_复合运镜_v07.blend'),
('chapter-4', r'F:\牡丹\场景blender搭建\四\Fourth_Scroll.blend')]
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
with open(r'C:\Users\16033\Desktop\MDGS\reports\assets-audit.json','w',encoding='utf8') as f:json.dump(out,f,ensure_ascii=False,indent=2)

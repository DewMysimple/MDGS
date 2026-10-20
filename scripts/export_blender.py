r"""Export the four source scrolls without modifying any .blend file.

Run: blender --background --python scripts/export_blender.py -- --source-root <folder>
Then run optimize_textures.py with Pillow to create browser WebP textures.
"""
import json, math, hashlib, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import ROOT, load_pipeline, image_index, resolve_image, ImageResolutionError

CONFIG = load_pipeline()
import bpy
from mathutils import Vector
ASSETS = ROOT / 'public' / 'assets'
SOURCES = CONFIG.sources
file_index = image_index(CONFIG.materials_root)

def nums(values):
    return [round(float(x), 7) for x in values]

def matrix(m):
    return nums(m[r][c] for c in range(4) for r in range(4))

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')

def extract_image(image, dest, cid, repairs, missing):
    if not image or image.source not in ('FILE','GENERATED'):
        return None
    raw = None
    repaired = False
    if image.packed_file:
        raw = bytes(image.packed_file.data)
    else:
        original_path = bpy.path.abspath(image.filepath)
        p = resolve_image(original_path, image.name, file_index)
        repaired = bool(p) and not Path(original_path).is_file()
        if p and p.is_file():
            raw = p.read_bytes()
            if repaired:
                repairs.append({'image':image.name,'oldPath':image.filepath,'resolvedPath':str(p)})
        elif image.source=='GENERATED' and image.size[0]:
            target = dest / ('generated-' + hashlib.sha1(image.name.encode()).hexdigest()[:12] + '.png')
            image.save_render(str(target))
            raw=target.read_bytes()
        else:
            missing.append({'image':image.name,'path':image.filepath})
            return None
    digest=hashlib.sha1(raw).hexdigest()[:16]
    raw_path=dest / (digest+'.source')
    if not raw_path.exists():raw_path.write_bytes(raw)
    return {'id':digest,'src':'textures/'+digest+'.webp','sourceName':image.name,'sourceSize':list(image.size),'hasAlpha':image.channels==4}

def export_chapter(cid, source):
    bpy.ops.wm.open_mainfile(filepath=source)
    s=bpy.context.scene
    s.frame_set(s.frame_start)
    dest=ASSETS/cid
    textures=dest/'textures'
    textures.mkdir(parents=True,exist_ok=True)
    repairs=[];missing=[];image_map={};image_list=[]
    materials=[];material_index={}
    geometry=[];texts=[];skipped=[];animated=[]
    dg=bpy.context.evaluated_depsgraph_get()

    def material_id(mat):
        key=mat.name if mat else '__default'
        if key in material_index:return material_index[key]
        tex=None;rgba=[0.72,0.65,0.53,1];alpha_link=False;procedural=False
        if mat:
            rgba=list(mat.diffuse_color)
            if mat.use_nodes and mat.node_tree:
                ns=list(mat.node_tree.nodes)
                tex_nodes=[n for n in ns if n.type=='TEX_IMAGE' and n.image]
                if tex_nodes:
                    img=tex_nodes[0].image
                    if img.name not in image_map:
                        record=extract_image(img,textures,cid,repairs,missing)
                        image_map[img.name]=record
                        if record and not any(r['id']==record['id'] for r in image_list):image_list.append(record)
                    tex=image_map[img.name]
                    # Texture RGB is emitted unlit, preserving the painted source colors.
                    rgba=[1,1,1,1]
                    alpha_link=any(l.from_node==tex_nodes[0] and l.from_socket.name=='Alpha' for l in mat.node_tree.links)
                else:
                    shader=next((n for n in ns if n.type in ('EMISSION','BSDF_PRINCIPLED')),None)
                    if shader:
                        inp=shader.inputs.get('Color') or shader.inputs.get('Base Color')
                        if inp and not inp.is_linked:rgba=list(inp.default_value)
                        elif inp and inp.is_linked:
                            procedural=True
                            ramps=[n for n in ns if n.type=='VALTORGB']
                            if ramps:
                                colors=[list(e.color) for e in ramps[0].color_ramp.elements]
                                rgba=[sum(c[i] for c in colors)/len(colors) for i in range(4)]
        idx=len(materials);material_index[key]=idx
        materials.append({'id':idx,'name':key,'texture':tex['src'] if tex else None,'color':nums(rgba[:3]),'opacity':round(float(rgba[3]),5),'transparent':bool(tex or rgba[3]<1),'alphaTest':0.012 if tex else 0,'side':'double','depthWrite':not bool(tex),'sourceAlphaLinked':alpha_link,'proceduralApproximation':procedural})
        return idx

    for obj in s.objects:
        if obj.hide_render or obj.type not in ('MESH','CURVE','FONT','SURFACE','META'):continue
        if obj.type=='FONT':
            texts.append({'name':obj.name,'body':obj.data.body,'matrix':matrix(obj.matrix_world),'size':obj.data.size})
        try:
            ev=obj.evaluated_get(dg)
            mesh=ev.to_mesh(preserve_all_data_layers=True,depsgraph=dg)
            if not mesh or not mesh.polygons:
                if mesh:ev.to_mesh_clear()
                continue
            mesh.calc_loop_triangles()
            uv=mesh.uv_layers.active.data if mesh.uv_layers.active else None
            groups={}
            for tri in mesh.loop_triangles:
                idx=tri.material_index
                group=groups.setdefault(idx,{'positions':[],'uvs':[]})
                for loop_idx,vert_idx in zip(tri.loops,tri.vertices):
                    group['positions'].extend(nums(mesh.vertices[vert_idx].co))
                    group['uvs'].extend(nums(uv[loop_idx].uv) if uv else [0,0])
            bounds=[ev.matrix_world@Vector(c) for c in obj.bound_box]
            for slot,g in groups.items():
                mat=mesh.materials[slot] if slot<len(mesh.materials) else None
                mid=material_id(mat)
                geometry.append({'name':obj.name,'type':obj.type,'matrix':matrix(ev.matrix_world),'positions':g['positions'],'uvs':g['uvs'],'material':mid,'bounds':{'min':nums(min(v[i] for v in bounds) for i in range(3)),'max':nums(max(v[i] for v in bounds) for i in range(3))},'animated':bool(obj.animation_data),'isText':obj.type=='FONT'})
            if obj.animation_data and obj.type=='MESH':animated.append(obj)
            ev.to_mesh_clear()
        except ImageResolutionError:
            # Ambiguous artwork must stop the pipeline, never become a skipped
            # layer in an apparently successful partial scene export.
            raise
        except Exception as e:
            skipped.append({'name':obj.name,'reason':str(e)})

    # Exact projection-derived vertical FOV, independent of Blender sensor fit.
    cam=s.camera
    sample_frames=set(range(s.frame_start,s.frame_end+1,max(1,round((s.frame_end-s.frame_start)/300))))
    sample_frames.update([s.frame_start,s.frame_end])
    sample_frames.update(m.frame for m in s.timeline_markers)
    cameras=[];animation_samples={o.name:[] for o in animated}
    for frame in sorted(sample_frames):
        s.frame_set(frame)
        dg=bpy.context.evaluated_depsgraph_get()
        ce=cam.evaluated_get(dg)
        mat=ce.matrix_world
        q=mat.to_quaternion()
        proj=ce.calc_matrix_camera(dg,x=s.render.resolution_x,y=s.render.resolution_y,scale_x=s.render.pixel_aspect_x,scale_y=s.render.pixel_aspect_y)
        cameras.append({'frame':frame,'progress':round((frame-s.frame_start)/(s.frame_end-s.frame_start),7),'position':nums(mat.translation),'quaternion':nums((q.x,q.y,q.z,q.w)),'fov':round(math.degrees(2*math.atan(1/proj[1][1])),7),'type':ce.data.type,'orthoScale':ce.data.ortho_scale,'lens':ce.data.lens,'shift':[ce.data.shift_x,ce.data.shift_y]})
        for o in animated:
            animation_samples[o.name].append({'progress':round((frame-s.frame_start)/(s.frame_end-s.frame_start),7),'matrix':matrix(o.evaluated_get(dg).matrix_world)})

    markers=[{'name':m.name,'frame':m.frame,'progress':round((m.frame-s.frame_start)/(s.frame_end-s.frame_start),7)} for m in s.timeline_markers]
    # Reading stops are authored markers, never guessed narrative points.
    stops=[m for m in markers if '稳定阅读' in m['name'] or '阅读' in m['name']]
    if not stops:stops=markers
    camera_by_frame={c['frame']:c for c in cameras}
    reading_first=camera_by_frame[stops[0]['frame']]
    reading_last=camera_by_frame[stops[-1]['frame']]
    # An authored end-of-scroll crane/pullback must not redefine the reading axis.
    direction=Vector(reading_last['position'])-Vector(reading_first['position'])
    axis=max(range(3),key=lambda i:abs(direction[i]))
    axis_name='XYZ'[axis]
    axis_sign=1 if direction[axis]>=0 else -1
    data={'version':1,'id':cid,'source':source,'coordinateSystem':'BLENDER_WORLD_UNCHANGED','matrixOrder':'column-major','quaternionOrder':'xyzw','frameRange':[s.frame_start,s.frame_end],'fps':s.render.fps,'render':{'width':s.render.resolution_x,'height':s.render.resolution_y,'pixelAspectX':s.render.pixel_aspect_x,'pixelAspectY':s.render.pixel_aspect_y},'travel':{'axis':axis_name,'sign':axis_sign,'range':[cameras[0]['position'][axis],cameras[-1]['position'][axis]]},'camera':{'name':cam.name,'near':0.01,'far':5000,'sensorFit':cam.data.sensor_fit,'sensorWidth':cam.data.sensor_width,'sensorHeight':cam.data.sensor_height},'cameras':cameras,'markers':markers,'stops':stops,'meshes':geometry,'materials':materials,'images':image_list,'textObjects':texts,'animations':animation_samples,'audit':{'repairs':repairs,'missingImages':missing,'skippedObjects':skipped,'proceduralMaterialApproximation':'Procedural paper, ground and line materials retain base colors; Blender lighting and shader noise are replaced with unlit painted surfaces.'}}
    write_json(dest/'scene.json',data)
    summary={'id':cid,'meshes':len(geometry),'materials':len(materials),'textures':len(image_list),'stops':len(stops),'repairs':len(repairs),'missingImages':missing,'skippedObjects':skipped,'axis':axis_name,'sign':axis_sign,'cameraFovRange':[min(c['fov'] for c in cameras),max(c['fov'] for c in cameras)],'cameraPositionStart':cameras[0]['position'],'cameraPositionEnd':cameras[-1]['position']}
    print('EXPORTED',json.dumps(summary,ensure_ascii=False),flush=True)
    return summary

summaries=[export_chapter(cid,path) for cid,path in SOURCES]
write_json(ROOT/'reports'/'assets-export.json',summaries)

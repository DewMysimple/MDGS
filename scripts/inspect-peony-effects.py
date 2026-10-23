"""Expose authored 2.0 material nodes, drivers and evaluated scalar tracks."""
import bpy,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from asset_config import load_pipeline
CONFIG=load_pipeline(['--config',os.environ.get('MDGS_SCROLL_CONFIG',str(ROOT/'scripts/peony-2.0-sources.json'))])
OUT=Path(os.environ.get('MDGS_SCROLL_REPORT',ROOT/'reports/peony-2.0'));OUT.mkdir(parents=True,exist_ok=True)
def curves(block):
    ad=getattr(block,'animation_data',None);action=ad.action if ad else None
    result=list(getattr(action,'fcurves',[])) if action else []
    for layer in getattr(action,'layers',[]) if action else []:
        for strip in layer.strips:
            for bag in getattr(strip,'channelbags',[]):result.extend(bag.fcurves)
    return result
def value(v):
    if isinstance(v,(bool,int,float,str)):return v
    if hasattr(v,'__iter__'):
        try:return list(v)
        except:return None
    return None
def drivers(block):
    ad=getattr(block,'animation_data',None)
    return [{'path':c.data_path,'index':c.array_index,'expression':c.driver.expression,'type':c.driver.type,
        'variables':[{'name':v.name,'type':v.type,'targets':[{'id':t.id.name if t.id else None,
            'dataPath':getattr(t,'data_path',None),'transformType':getattr(t,'transform_type',None),
            'transformSpace':getattr(t,'transform_space',None)} for t in v.targets]} for v in c.driver.variables]} for c in ad.drivers] if ad else []
def group_graph(tree):
    nodes=[]
    for node in tree.nodes:
        n={'name':node.name,'type':node.type,'label':node.label,
           'inputs':[{'index':i,'name':s.name,'linked':s.is_linked,'value':value(s.default_value) if hasattr(s,'default_value') else None} for i,s in enumerate(node.inputs)],
           'outputs':[{'index':i,'name':s.name,'value':value(s.default_value) if hasattr(s,'default_value') else None} for i,s in enumerate(node.outputs)]}
        for attr in ['operation','blend_type','noise_dimensions','normalize','use_clamp','data_type','vector_type','interpolation','interpolation_type','clamp','feature','distance','voronoi_dimensions','projection','extension']:
            if hasattr(node,attr):n[attr]=getattr(node,attr)
        if node.type=='VALTORGB':n['ramp']={'interpolation':node.color_ramp.interpolation,'elements':[{'position':e.position,'color':list(e.color)} for e in node.color_ramp.elements]}
        if node.type=='GROUP':n['group']=node.node_tree.name if node.node_tree else None
        nodes.append(n)
    return {'name':tree.name,'nodes':nodes,'links':[{'from':l.from_node.name,'outIndex':list(l.from_node.outputs).index(l.from_socket),'out':l.from_socket.name,
        'to':l.to_node.name,'inIndex':list(l.to_node.inputs).index(l.to_socket),'in':l.to_socket.name} for l in tree.links]}
summary=[]
for cid,file in CONFIG.sources:
    bpy.ops.wm.open_mainfile(filepath=file,load_ui=False,use_scripts=False)
    scene=bpy.context.scene;scene.frame_set(scene.frame_start)
    mats=[];sockets={};frames=set([scene.frame_start,scene.frame_end])
    for mat in bpy.data.materials:
        tree=mat.node_tree
        if not tree:continue
        action=curves(tree);driven=drivers(tree)
        if not action and not driven:continue
        paths=set(c.data_path for c in action)|set(d['path'] for d in driven)
        for c in action:frames.update(round(p.co[0]) for p in c.keyframe_points)
        nodes=[]
        for node in tree.nodes:
            record={'name':node.name,'type':node.type,'label':node.label,
                'inputs':[{'index':i,'name':s.name,'linked':s.is_linked,'value':value(s.default_value) if hasattr(s,'default_value') else None} for i,s in enumerate(node.inputs)],
                'outputs':[{'index':i,'name':s.name,'value':value(s.default_value) if hasattr(s,'default_value') else None} for i,s in enumerate(node.outputs)]}
            for attr in ['operation','blend_type','noise_dimensions','normalize','use_clamp','data_type','vector_type','interpolation','interpolation_type','clamp','feature','distance','voronoi_dimensions','projection','extension']:
                if hasattr(node,attr):record[attr]=getattr(node,attr)
            if hasattr(node,'image'):record['image']=node.image.name if node.image else None
            if hasattr(node,'object'):record['object']=node.object.name if node.object else None
            if node.type=='GROUP':record['group']=node.node_tree.name if node.node_tree else None
            if node.type=='VALTORGB':record['ramp']={'interpolation':node.color_ramp.interpolation,'elements':[{'position':e.position,'color':list(e.color)} for e in node.color_ramp.elements]}
            nodes.append(record)
            for kind,collection in [('inputs',node.inputs),('outputs',node.outputs)]:
                for i,socket in enumerate(collection):
                    path=socket.path_from_id()+'.default_value'
                    if path in paths and hasattr(socket,'default_value'):
                        sockets[(mat.name,path)]=socket
        mats.append({'name':mat.name,'users':[o.name for o in scene.objects if mat in list(getattr(o.data,'materials',[]))],
            'animationPaths':sorted(paths),'drivers':driven,'nodes':nodes,
            'links':[{'from':l.from_node.name,'outIndex':list(l.from_node.outputs).index(l.from_socket),'out':l.from_socket.name,
                'to':l.to_node.name,'inIndex':list(l.to_node.inputs).index(l.to_socket),'in':l.to_socket.name} for l in tree.links]})
    objects=[]
    for obj in scene.objects:
        cs=curves(obj)
        if obj.type=='EMPTY' or obj.modifiers or getattr(obj.data,'shape_keys',None):
            objects.append({'name':obj.name,'type':obj.type,'properties':{k:value(obj[k]) for k in obj.keys()},
                'matrix':[float(obj.matrix_world[r][c]) for c in range(4) for r in range(4)],
                'channels':[{'path':c.data_path,'index':c.array_index,'keys':[{'frame':p.co[0],'value':p.co[1],'interpolation':p.interpolation} for p in c.keyframe_points]} for c in cs],
                'drivers':drivers(obj),'modifiers':[{'name':m.name,'type':m.type} for m in obj.modifiers]})
            for c in cs:frames.update(round(p.co[0]) for p in c.keyframe_points)
    if os.environ.get('MDGS_EFFECT_STATIC_ONLY'):
        previous=json.loads((OUT/f'{cid}-source-effects.json').read_text(encoding='utf8'))
        previous.update(materials=mats,objects=objects,nodeGroups=[group_graph(tree) for tree in bpy.data.node_groups if tree.bl_idname=='ShaderNodeTree'])
        (OUT/f'{cid}-source-effects.json').write_text(json.dumps(previous,ensure_ascii=False,indent=2),encoding='utf8')
        print('STATIC_EFFECT_METADATA',cid,flush=True)
        continue
    frames={f for f in frames if scene.frame_start<=f<=scene.frame_end}
    # A per-frame evaluated scalar track retains the authored shader driver and easing.
    if mats:
        frames=set(range(scene.frame_start,scene.frame_end+1))
    tracks={f'{name}|{path}':[] for name,path in sockets}
    for frame in sorted(frames):
        scene.frame_set(frame);bpy.context.evaluated_depsgraph_get().update()
        for key,socket in sockets.items():
            current=value(socket.default_value);track=tracks[f'{key[0]}|{key[1]}']
            track.append({'frame':frame,'progress':(frame-scene.frame_start)/(scene.frame_end-scene.frame_start),'value':current})
    for name,track in tracks.items():
        tracks[name]=[v for i,v in enumerate(track) if i==0 or i==len(track)-1 or not(track[i-1]['value']==v['value']==track[i+1]['value'])]
    result={'id':cid,'source':Path(file).relative_to(ROOT).as_posix(),'frames':[scene.frame_start,scene.frame_end],
        'materials':mats,'objects':objects,'scalarTracks':tracks,
        'nodeGroups':[group_graph(tree) for tree in bpy.data.node_groups if tree.bl_idname=='ShaderNodeTree']}
    (OUT/f'{cid}-source-effects.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    summary.append({'id':cid,'animatedMaterials':[m['name'] for m in mats],'scalarTracks':{k:len(v) for k,v in tracks.items()},'objects':[o['name'] for o in objects]})
    print(json.dumps(summary[-1],ensure_ascii=False),flush=True)
if not os.environ.get('MDGS_EFFECT_STATIC_ONLY'):
    (OUT/'source-effects-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf8')

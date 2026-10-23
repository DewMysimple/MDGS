"""Add authored relative shape-key deltas and exact frame weights to active web geometry."""
import bpy,json,sys,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from asset_config import load_pipeline
CONFIG=load_pipeline(['--config',str(ROOT/'scripts/peony-2.0-sources.json')])
OUT=ROOT/'reports/peony-2.0';results=[]
for cid,file in CONFIG.sources:
    path=ROOT/'public/assets/new-scrolls'/cid/'scene.json'
    data=json.loads(path.read_text(encoding='utf8'))
    bpy.ops.wm.open_mainfile(filepath=file,load_ui=False,use_scripts=False)
    scene=bpy.context.scene;records=[];users={}
    for web in data['meshes']:
        obj=scene.objects.get(web['name']);shape_keys=getattr(obj.data,'shape_keys',None)
        if not shape_keys:continue
        assert shape_keys.use_relative and not obj.modifiers,'Source requires a general deformer export: '+obj.name
        first=next(k['frame'] for k in data['visibility'][obj.name] if k['visible'])
        scene.frame_set(first);graph=bpy.context.evaluated_depsgraph_get();graph.update()
        evaluated=obj.evaluated_get(graph);mesh=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=graph);mesh.calc_loop_triangles()
        indices=web['indices'];vertex_indices=[vi for tri in mesh.loop_triangles for vi in tri.vertices]
        assert len(indices)==len(vertex_indices)
        targets=[]
        for key in shape_keys.key_blocks[1:]:
            deltas=[None]*(len(web['positions'])//3)
            for web_index,native_index in zip(indices,vertex_indices):
                delta=key.data[native_index].co-key.relative_key.data[native_index].co
                if key.vertex_group:
                    group=obj.vertex_groups.get(key.vertex_group)
                    try:weight=group.weight(native_index) if group else 0
                    except RuntimeError:weight=0
                    delta*=weight
                values=[round(float(v),7) for v in delta]
                if deltas[web_index] is not None:assert deltas[web_index]==values,'Index merge lost a shape seam'
                deltas[web_index]=values
            assert all(v is not None for v in deltas)
            targets.append({'name':key.name,'relativeKey':key.relative_key.name,'positions':[v for xyz in deltas for v in xyz],
                            'baseValue':float(key.value),'sliderMin':key.slider_min,'sliderMax':key.slider_max})
        evaluated.to_mesh_clear()
        web['morphTargets']=targets;web['morphAnimations']={key.name:[] for key in shape_keys.key_blocks[1:]}
        users[obj.name]=(obj,web)
        records.append({'name':obj.name,'targets':[t['name'] for t in targets],'vertices':len(web['positions'])//3,'firstVisibleFrame':first})
    for frame in range(scene.frame_start,scene.frame_end+1) if users else []:
        scene.frame_set(frame);bpy.context.evaluated_depsgraph_get().update()
        for obj,web in users.values():
            for key in obj.data.shape_keys.key_blocks[1:]:
                web['morphAnimations'][key.name].append({'frame':frame,'progress':(frame-scene.frame_start)/(scene.frame_end-scene.frame_start),'value':float(key.value)})
    for obj,web in users.values():
        for name,track in web['morphAnimations'].items():
            web['morphAnimations'][name]=[v for i,v in enumerate(track) if i==0 or i==len(track)-1 or not(track[i-1]['value']==v['value']==track[i+1]['value'])]
    if users:
        data['audit']['nativeShapeKeys']='Relative deltas aligned to indexed UV geometry; influence = source frame weight minus first-visible baseValue. Evaluated every native integer frame.'
        path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')
    results.append({'id':cid,'meshes':records,'manifestSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    print(json.dumps({'id':cid,'morphMeshes':len(records)},ensure_ascii=False),flush=True)
(OUT/'morph-delivery.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')

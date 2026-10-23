"""Read editable source shape-key animation without changing any source."""
import bpy,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from asset_config import load_pipeline
CONFIG=load_pipeline(['--config',str(ROOT/'scripts/peony-2.0-sources.json')])
def curves(block):
    ad=block.animation_data;action=ad.action if ad else None
    result=list(getattr(action,'fcurves',[])) if action else []
    for layer in getattr(action,'layers',[]) if action else []:
        for strip in layer.strips:
            for bag in getattr(strip,'channelbags',[]):result.extend(bag.fcurves)
    return result
results=[]
for cid,file in CONFIG.sources:
    bpy.ops.wm.open_mainfile(filepath=file,load_ui=False,use_scripts=False)
    s=bpy.context.scene;items=[]
    for obj in s.objects:
        keys=getattr(obj.data,'shape_keys',None)
        if not keys:continue
        cs=curves(keys)
        item={'name':obj.name,'relative':keys.use_relative,'vertices':len(obj.data.vertices),
              'modifiers':[m.type for m in obj.modifiers],
              'keyNames':[k.name for k in keys.key_blocks],
              'keyCurves':[{'path':c.data_path,'keys':len(c.keyframe_points)} for c in cs],
              'samples':[]}
        for frame in range(s.frame_start,s.frame_end+1,max(1,(s.frame_end-s.frame_start)//100)):
            s.frame_set(frame);bpy.context.evaluated_depsgraph_get().update()
            item['samples'].append({'frame':frame,'values':{k.name:k.value for k in keys.key_blocks[1:]}})
        items.append(item)
    result={'id':cid,'objects':items};results.append(result)
    print(json.dumps({'id':cid,'shaped':len(items),'animated':[i['name'] for i in items if any(len(set(s['values'][name] for s in i['samples']))>1 for name in i['keyNames'][1:])]},ensure_ascii=False),flush=True)
(ROOT/'reports/peony-2.0/source-shapes.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')

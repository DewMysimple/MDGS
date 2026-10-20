"""Inspect configured procedural materials; source Blender files stay read-only."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import ROOT, load_pipeline
CONFIG = load_pipeline()
import bpy
out=[]
for _, source in CONFIG.sources:
 bpy.ops.wm.open_mainfile(filepath=source)
 for mat in bpy.data.materials:
  if not mat.use_nodes or any(n.type=='TEX_IMAGE' for n in mat.node_tree.nodes):continue
  nodes=[]
  for n in mat.node_tree.nodes:
   inputs=[]
   for i in n.inputs:
    if i.is_linked or not hasattr(i,'default_value'):continue
    try:
     v=i.default_value
     if hasattr(v,'__iter__'):v=list(v)
     if isinstance(v,(str,int,float,list)):inputs.append({'name':i.name,'value':v})
    except:pass
   d={'type':n.type,'name':n.name,'inputs':inputs}
   if hasattr(n,'operation'):d['operation']=n.operation
   if hasattr(n,'interpolation_type'):d['interpolation']=n.interpolation_type
   if n.type=='VALTORGB':d['colorRamp']=[{'position':e.position,'color':list(e.color)} for e in n.color_ramp.elements]
   nodes.append(d)
  out.append({'source':source,'name':mat.name,'nodes':nodes,'links':[{'from':l.from_node.name,'socket':l.from_socket.name,'to':l.to_node.name,'input':l.to_socket.name} for l in mat.node_tree.links]})
report = ROOT / 'reports' / 'assets-procedural.json'
report.parent.mkdir(parents=True, exist_ok=True)
report.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')

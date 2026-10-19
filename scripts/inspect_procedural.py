import bpy,json
from pathlib import Path
sources=[r'F:\牡丹\场景blender搭建\一\牡丹与女帝_叙事复合运镜.blend',r'F:\牡丹\场景blender搭建\二\画卷二_长卷叙事.blend',r'F:\牡丹\场景blender搭建\三\画卷三_中国长卷_复合运镜_v07.blend',r'F:\牡丹\场景blender搭建\四\Fourth_Scroll.blend']
out=[]
for source in sources:
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
Path(r'C:\Users\16033\Desktop\MDGS\reports\assets-procedural.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf8')

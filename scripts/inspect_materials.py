"""Inspect source materials without executing the audit script or saving scenes."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import load_pipeline
CONFIG = load_pipeline()
import bpy
SOURCES = CONFIG.sources
for cid,path in SOURCES:
 bpy.ops.wm.open_mainfile(filepath=path)
 print('CHAPTER',cid,flush=True)
 for mat in list(bpy.data.materials)[:5]:
  print(mat.name, 'diffuse',list(mat.diffuse_color),flush=True)
  if mat.use_nodes:
   for n in mat.node_tree.nodes:
    print(n.type,n.name, n.image.name if n.type=='TEX_IMAGE' and n.image else '', [(i.name, list(i.default_value) if hasattr(i.default_value,'__len__') else i.default_value) for i in n.inputs if hasattr(i,'default_value') and not i.is_linked and i.name in ['Color','Base Color','Alpha','Strength']],flush=True)
   print('LINKS',[(l.from_node.type,l.from_socket.name,l.to_node.type,l.to_socket.name) for l in mat.node_tree.links],flush=True)

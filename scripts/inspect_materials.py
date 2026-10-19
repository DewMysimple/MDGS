exec(open(r'C:\Users\16033\Desktop\MDGS\scripts\audit_blender.py',encoding='utf8').read().split('out=[]')[0])
for cid,path in SOURCES:
 bpy.ops.wm.open_mainfile(filepath=path)
 print('CHAPTER',cid,flush=True)
 for mat in list(bpy.data.materials)[:5]:
  print(mat.name, 'diffuse',list(mat.diffuse_color),flush=True)
  if mat.use_nodes:
   for n in mat.node_tree.nodes:
    print(n.type,n.name, n.image.name if n.type=='TEX_IMAGE' and n.image else '', [(i.name, list(i.default_value) if hasattr(i.default_value,'__len__') else i.default_value) for i in n.inputs if hasattr(i,'default_value') and not i.is_linked and i.name in ['Color','Base Color','Alpha','Strength']],flush=True)
   print('LINKS',[(l.from_node.type,l.from_socket.name,l.to_node.type,l.to_socket.name) for l in mat.node_tree.links],flush=True)

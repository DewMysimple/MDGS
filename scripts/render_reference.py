"""Create an unlit Eevee reference at the first authored reading marker.

Source geometry, texture alpha, original camera and original transforms are kept.
Lighting is replaced by source-color emission, matching the Web renderer.
"""
import bpy, json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCES=[
('chapter-1',r'F:\牡丹\场景blender搭建\一\牡丹与女帝_叙事复合运镜.blend'),
('chapter-2',r'F:\牡丹\场景blender搭建\二\画卷二_长卷叙事.blend'),
('chapter-3',r'F:\牡丹\场景blender搭建\三\画卷三_中国长卷_复合运镜_v07.blend'),
('chapter-4',r'F:\牡丹\场景blender搭建\四\Fourth_Scroll.blend')]
only=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['chapter-1']
for cid,path in SOURCES:
 if cid not in only:continue
 bpy.ops.wm.open_mainfile(filepath=path)
 manifest=json.loads((ROOT/'public'/'assets'/cid/'scene.json').read_text(encoding='utf8'))
 s=bpy.context.scene
 s.frame_set(manifest['stops'][0]['frame'])
 for repair in manifest['audit']['repairs']:
  image=bpy.data.images.get(repair['image'])
  if image:
   image.filepath=repair['resolvedPath'];image.reload()
 # Preserve image alpha, use the exact painted RGB without scene illumination.
 for mat in bpy.data.materials:
  if not mat.use_nodes:continue
  ns=mat.node_tree.nodes
  tex=next((n for n in ns if n.type=='TEX_IMAGE' and n.image),None)
  output=next((n for n in ns if n.type=='OUTPUT_MATERIAL'),None)
  if not output:continue
  if not tex and any(n.type=='EMISSION' for n in ns):
   continue
  emission=ns.new('ShaderNodeEmission')
  if tex:
   mat.node_tree.links.new(tex.outputs['Color'],emission.inputs['Color'])
   transparent=ns.new('ShaderNodeBsdfTransparent')
   mix=ns.new('ShaderNodeMixShader')
   mat.node_tree.links.new(tex.outputs['Alpha'],mix.inputs[0])
   mat.node_tree.links.new(transparent.outputs[0],mix.inputs[1])
   mat.node_tree.links.new(emission.outputs[0],mix.inputs[2])
   mat.node_tree.links.new(mix.outputs[0],output.inputs['Surface'])
  else:
   shader=next((n for n in ns if n.type=='BSDF_PRINCIPLED'),None)
   inp=shader.inputs.get('Base Color') if shader else None
   if inp and inp.is_linked:
    mat.node_tree.links.new(inp.links[0].from_socket,emission.inputs['Color'])
   else:
    record=next((m for m in manifest['materials'] if m['name']==mat.name),None)
    emission.inputs['Color'].default_value=(record['color'] if record else list(mat.diffuse_color[:3]))+[1]
   mat.node_tree.links.new(emission.outputs[0],output.inputs['Surface'])
 s.render.engine='CYCLES'
 s.cycles.samples=8
 s.cycles.use_denoising=True
 s.render.resolution_x=960;s.render.resolution_y=540;s.render.resolution_percentage=100
 s.render.image_settings.media_type='IMAGE'
 s.render.image_settings.file_format='PNG'
 s.render.filepath=str(ROOT/'reports'/('assets-reference-'+cid+'.png'))
 s.view_settings.view_transform='Standard'
 s.view_settings.look='None'
 s.view_settings.exposure=0;s.view_settings.gamma=1
 bpy.ops.render.render(write_still=True)

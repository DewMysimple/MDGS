"""Create an unlit reference at the first authored reading marker.

Source geometry, texture alpha, original camera and original transforms are kept.
Lighting is replaced by source-color emission, matching the Web renderer.
"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import ROOT, load_pipeline, image_index, resolve_image
CONFIG = load_pipeline()
import bpy
SOURCES = CONFIG.sources
file_index = image_index(CONFIG.materials_root)
for cid,path in SOURCES:
 bpy.ops.wm.open_mainfile(filepath=path)
 manifest=json.loads((ROOT/'public'/'assets'/cid/'scene.json').read_text(encoding='utf8'))
 s=bpy.context.scene
 s.frame_set(manifest['stops'][0]['frame'])
 # Resolve relocated files from the current configuration, rather than replaying
 # historical machine paths recorded in the exported manifest.
 # Follow the exporter's first-image-node rule for exported materials. Images
 # are deduplicated by content in the manifest, so sourceName alone can omit a
 # second used image datablock with identical bytes.
 used_image_names=set()
 for record in manifest['materials']:
  material=bpy.data.materials.get(record['name'])
  if not material or not material.use_nodes:continue
  texture=next((node for node in material.node_tree.nodes if node.type=='TEX_IMAGE' and node.image),None)
  if texture:used_image_names.add(texture.image.name)
 for image in bpy.data.images:
  # A .blend can retain unused duplicate images whose files no longer exist.
  # Only the painting images used by the exported scene need to be re-linked.
  if image.name not in used_image_names or image.packed_file or image.source != 'FILE':continue
  resolved = resolve_image(bpy.path.abspath(image.filepath), image.name, file_index)
  if not resolved:
   raise FileNotFoundError(f'Missing source image {image.name}: {image.filepath}. Configure --materials-root / MDGS_MATERIALS_ROOT.')
  image.filepath=str(resolved);image.reload()
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
 # Use authored dimensions by default; a single overridden dimension keeps the
 # source aspect ratio, while two explicit dimensions define the desired output.
 source_width=s.render.resolution_x;source_height=s.render.resolution_y
 if CONFIG.reference_width:
  s.render.resolution_x=CONFIG.reference_width
  s.render.resolution_y=CONFIG.reference_height or max(1, round(CONFIG.reference_width*source_height/source_width))
 elif CONFIG.reference_height:
  s.render.resolution_y=CONFIG.reference_height
  s.render.resolution_x=max(1, round(CONFIG.reference_height*source_width/source_height))
 s.render.resolution_percentage=100
 s.render.image_settings.media_type='IMAGE'
 s.render.image_settings.file_format='PNG'
 s.render.filepath=str(ROOT/'reports'/('assets-reference-'+cid+'.png'))
 (ROOT/'reports').mkdir(parents=True, exist_ok=True)
 s.view_settings.view_transform='Standard'
 s.view_settings.look='None'
 s.view_settings.exposure=0;s.view_settings.gamma=1
 bpy.ops.render.render(write_still=True)

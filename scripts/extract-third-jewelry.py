"""Read the explicitly replaced third-scroll card from the supplied Blender file.

Run with Blender --background --disable-autoexec --python-exit-code 1
--python scripts/extract-third-jewelry.py -- <blend> <output.json>.
The source is opened read-only and is never saved.
"""
import hashlib, json, sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
NAME = '06_首饰与罐盒组合'
SOURCE_SHA = 'b8ca4c4e704f592f336aa46d2902cfaa229b5f06b2c983cd799474b7c248719a'
IMAGE_SHA = 'c4ddbcf69e13e1e41e802f72c3c0e10355dbcbd305eb99caafd8fbbaae9cce54'
args = sys.argv[sys.argv.index('--') + 1:]
if len(args) != 2:
    raise ValueError('Expected source blend and output JSON')
source, output = map(Path, args)
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != SOURCE_SHA:
    raise ValueError('Source revision changed; inspect the replacement before exporting')
bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
scene = bpy.context.scene
obj = scene.objects[NAME]
if obj.type != 'MESH' or obj.parent or obj.constraints or obj.data.shape_keys or obj.animation_data:
    raise ValueError('Object is no longer the reviewed static mesh')
if len(obj.data.materials) != 1:
    raise ValueError('Unexpected material slots')
material = obj.data.materials[0]
image_nodes = [n for n in material.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
if len(image_nodes) != 1 or not image_nodes[0].image.packed_file:
    raise ValueError('Expected exactly one packed image')
image = image_nodes[0].image
raw = bytes(image.packed_file.data)
if hashlib.sha256(raw).hexdigest() != IMAGE_SHA:
    raise ValueError('The reviewed image was replaced')
image_id = hashlib.sha1(raw).hexdigest()[:16]
nums = lambda values: [round(float(x), 7) for x in values]
mat = lambda m: nums(m[r][c] for c in range(4) for r in range(4))
scene.frame_set(scene.frame_start)
graph = bpy.context.evaluated_depsgraph_get()
evaluated = obj.evaluated_get(graph)
mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
try:
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active.data
    positions, uvs, normals = [], [], []
    for tri in mesh.loop_triangles:
        if tri.material_index != 0:
            raise ValueError('Unexpected material slot on triangle')
        for li, vi in zip(tri.loops, tri.vertices):
            positions.extend(nums(mesh.vertices[vi].co))
            uvs.extend(nums(uv[li].uv))
            normals.extend(nums(mesh.corner_normals[li].vector))
    bounds = [evaluated.matrix_world @ Vector(corner) for corner in obj.bound_box]
    record = {'name': NAME, 'type': 'MESH', 'matrix': mat(evaluated.matrix_world),
        'positions': positions, 'uvs': uvs, 'normals': normals, 'material': 0,
        'bounds': {'min': nums(min(p[a] for p in bounds) for a in range(3)),
                   'max': nums(max(p[a] for p in bounds) for a in range(3))},
        'animated': False, 'isText': False}
finally:
    evaluated.to_mesh_clear()
for frame in range(scene.frame_start, scene.frame_end + 1):
    scene.frame_set(frame)
    if obj.hide_render or mat(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world) != record['matrix']:
        raise ValueError('Replacement visibility or transform is animated; review required')

compiler_source = (ROOT / 'scripts/export-source-materials.py').read_text(encoding='utf8')
compiler_source = compiler_source.rsplit("for chapter in map(int,OPTIONS.chapters.split(',')):export_chapter(chapter)", 1)[0]
old_argv = sys.argv
sys.argv = [str(ROOT / 'scripts/export-source-materials.py'), '--', '--source-root', str(source.parent)]
namespace = {'__file__': str(ROOT / 'scripts/export-source-materials.py'), '__name__': 'mdgs_source_material_compiler'}
try:
    exec(compile(compiler_source, namespace['__file__'], 'exec'), namespace)
finally:
    sys.argv = old_argv
manifest = {'images': [{'id': image_id, 'sourceName': image.name,
                        'sourceSha256': IMAGE_SHA, 'src': 'textures/' + image_id + '.webp'}]}
tracks = {}
program = namespace['Compiler'](material, obj, manifest, scene, output.parent, None, {}, tracks).compile()
if tracks or program['coordinates'] or any(f['encoding'] != 'image' for f in program['fields']):
    raise ValueError('Replacement material has unexpected animation or procedural fields')
del program['coordinates']
result = {'sourceSha256': digest, 'sourceImageSha256': IMAGE_SHA, 'imageId': image_id,
          'imageName': image.name, 'record': record, 'program': program,
          'frameRange': [scene.frame_start, scene.frame_end]}
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
    raise ValueError('Source unexpectedly changed')
print('Extracted', NAME, 'frames', result['frameRange'], 'fields', len(program['fields']), flush=True)

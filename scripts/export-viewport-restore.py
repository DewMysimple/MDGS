"""Recover the user-identified viewport-visible scene 8 card from the original.

Read-only: this object is visible in Blender's viewport but deliberately has
hide_render set for every source frame, so the normal render-visibility export
omits it. Run with Blender 5.2 using -- <blend-file> <output-directory>.
The original is never saved. The scene asset merger uses this isolated output.
"""
import hashlib, json, sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = 'e459fad5ca48e209fa63555c5253c7650547036c6be247dd13cd48c1287f1402'
NAME = '主体 · 03_中央花车巡游与曲水'
args = sys.argv[sys.argv.index('--') + 1:]
if len(args) != 2:
    raise ValueError('Expected source .blend and output directory')
source, out = Path(args[0]), Path(args[1])
digest = hashlib.sha256(source.read_bytes()).hexdigest()
if digest != EXPECTED:
    raise ValueError('This one-object override must be reviewed for a different source revision')
out.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
scene = bpy.context.scene
obj = scene.objects[NAME]
if obj.type != 'MESH' or obj.hide_viewport or not obj.visible_get() or obj.data.shape_keys or obj.constraints or obj.parent:
    raise ValueError('Unexpected source object state, requires review')
if len(obj.data.materials) != 1 or obj.data.materials[0].name != '08 · 03_中央花车巡游与曲水':
    raise ValueError('Unexpected source material')
image = bpy.data.images['s08_02.png']
if not image.packed_file:
    raise ValueError('Expected packed source image')
raw = bytes(image.packed_file.data)
image_sha = hashlib.sha256(raw).hexdigest()
image_id = hashlib.sha1(raw).hexdigest()[:16]
(out / (image_id + '.source')).write_bytes(raw)
nums = lambda values: [round(float(x), 7) for x in values]
mat = lambda m: nums(m[r][c] for c in range(4) for r in range(4))
scene.frame_set(scene.frame_start)
graph = bpy.context.evaluated_depsgraph_get()
evaluated = obj.evaluated_get(graph)
mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
try:
    mesh.calc_loop_triangles()
    uv = mesh.uv_layers.active.data
    p, u, n = [], [], []
    for triangle in mesh.loop_triangles:
        if triangle.material_index != 0: raise ValueError('Unexpected material slot')
        for li, vi in zip(triangle.loops, triangle.vertices):
            p.extend(nums(mesh.vertices[vi].co)); u.extend(nums(uv[li].uv)); n.extend(nums(mesh.corner_normals[li].vector))
    bounds = [evaluated.matrix_world @ Vector(corner) for corner in obj.bound_box]
    record = {'name': NAME, 'type': 'MESH', 'matrix': mat(evaluated.matrix_world), 'positions': p, 'uvs': u, 'normals': n,
              'material': 0, 'bounds': {'min': nums(min(point[a] for point in bounds) for a in range(3)),
              'max': nums(max(point[a] for point in bounds) for a in range(3))}, 'animated': True, 'isText': False}
finally:
    evaluated.to_mesh_clear()
initial = record['matrix']
for frame in range(scene.frame_start, scene.frame_end + 1):
    scene.frame_set(frame)
    if not obj.hide_render or obj.hide_viewport:
        raise ValueError('Source visibility changed; review override')
    if mat(obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).matrix_world) != initial:
        raise ValueError('Source transform changes; export authored transform track before recovery')
# Reuse the same native shader compiler as every other source card. Disable its
# command-line runner, not its node compilation or source provenance checks.
compiler_source = (ROOT / 'scripts/export-source-materials.py').read_text(encoding='utf8')
compiler_source = compiler_source.rsplit('for chapter in map(int,OPTIONS.chapters.split(\',\')):export_chapter(chapter)', 1)[0]
old_argv = sys.argv
sys.argv = [str(ROOT / 'scripts/export-source-materials.py'), '--', '--source-root', str(source.parent)]
namespace = {'__file__': str(ROOT / 'scripts/export-source-materials.py'), '__name__': 'mdgs_source_material_compiler'}
try: exec(compile(compiler_source, namespace['__file__'], 'exec'), namespace)
finally: sys.argv = old_argv
manifest = {'images': [{'id': image_id, 'sourceName': image.name, 'sourceSha256': image_sha, 'src': 'textures/' + image_id + '.webp'}]}
tracks = {}
compiler = namespace['Compiler'](obj.data.materials[0], obj, manifest, scene, out, None, {}, tracks)
program = compiler.compile()
if tracks or program['coordinates'] or any(field['encoding'] != 'image' for field in program['fields']):
    raise ValueError('Unexpected dynamic or procedural native material; requires review')
del program['coordinates']
result = {'sourceSha256': digest, 'imageId': image_id, 'sourceImageSha256': image_sha,
          'imageName': image.name, 'sourceSize': list(image.size), 'record': record,
          'program': program, 'frameRange': [scene.frame_start, scene.frame_end],
          'visibilityEvidence': 'Viewport visible, render hidden at every source frame'}
(out / 'recovered.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
if hashlib.sha256(source.read_bytes()).hexdigest() != digest:
    raise ValueError('Source unexpectedly changed during extraction')
print('RECOVERED', json.dumps({'name': NAME, 'sha256': digest, 'imageId': image_id, 'imageSha256': image_sha,
      'vertices': len(p)//3, 'frames': result['frameRange'], 'fields': len(program['fields'])}, ensure_ascii=False), flush=True)

"""Read the replacement .blend files without executing embedded scripts or saving them."""
import bpy, hashlib, json, sys
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'reports/new-scrolls'
OUT.mkdir(parents=True, exist_ok=True)
sources = [
    '画卷一_最终修订.blend',
    '画卷二_街市建筑完整补全版.blend',
    '画卷三_分镜构图版_图层补全.blend',
    '画卷四_转场运镜加快版.blend',
]
results = []
for index, name in enumerate(sources, 1):
    source = ROOT / '牡丹' / name
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    objects = []
    for obj in scene.objects:
        item = {'name': obj.name, 'type': obj.type, 'hidden': obj.hide_render,
                'dimensions': list(obj.dimensions), 'location': list(obj.location),
                'materials': [m.name if m else None for m in getattr(obj.data, 'materials', [])],
                'animated': bool(obj.animation_data), 'constraints': [c.type for c in obj.constraints]}
        if obj.type == 'FONT': item.update(body=obj.data.body, size=obj.data.size)
        if obj.type == 'MESH': item.update(vertices=len(obj.data.vertices), polygons=len(obj.data.polygons))
        objects.append(item)
    images = [{'name': im.name, 'path': im.filepath, 'source': im.source, 'size': list(im.size),
               'packed': bool(im.packed_file), 'packedBytes': len(im.packed_file.data) if im.packed_file else 0,
               'exists': Path(bpy.path.abspath(im.filepath)).is_file() if im.filepath else False,
               'channels': im.channels} for im in bpy.data.images]
    materials = []
    for mat in bpy.data.materials:
        materials.append({'name': mat.name, 'diffuse': list(mat.diffuse_color), 'nodes': [
            {'name': n.name, 'type': n.type, **({'image': n.image.name if n.image else None} if n.type == 'TEX_IMAGE' else {})}
            for n in mat.node_tree.nodes] if mat.use_nodes and mat.node_tree else []})
    samples = []
    frames = {scene.frame_start, scene.frame_end, (scene.frame_start + scene.frame_end)//2}
    frames.update(m.frame for m in scene.timeline_markers)
    for frame in sorted(frames):
        scene.frame_set(frame)
        cam = scene.camera.evaluated_get(bpy.context.evaluated_depsgraph_get())
        q = cam.matrix_world.to_quaternion()
        samples.append({'frame': frame, 'position': list(cam.matrix_world.translation),
                        'quaternion': [q.x,q.y,q.z,q.w], 'type': cam.data.type,
                        'lens': cam.data.lens, 'orthoScale': cam.data.ortho_scale})
    result = {'id': f'chapter-{index}', 'source': f'牡丹/{name}', 'sourceSha256': digest,
              'sourceBytes': source.stat().st_size, 'frames': [scene.frame_start,scene.frame_end],
              'fps': scene.render.fps, 'render': [scene.render.resolution_x, scene.render.resolution_y],
              'camera': scene.camera.name, 'cameraSamples': samples,
              'markers': [{'name': m.name, 'frame':m.frame} for m in scene.timeline_markers],
              'objects': objects, 'images': images, 'materials': materials}
    results.append(result)
    (OUT / f'chapter-{index}-source-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps({'id': result['id'], 'sourceSha256':digest, 'frames':result['frames'],
        'render':result['render'], 'camera':result['camera'], 'objects':dict(Counter(o['type'] for o in objects)),
        'images':len(images), 'packed':sum(i['packed'] for i in images),
        'missing': [i['name'] for i in images if i['source']=='FILE' and not i['packed'] and not i['exists']],
        'markers':result['markers']}, ensure_ascii=False), flush=True)
(OUT/'source-audit.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')

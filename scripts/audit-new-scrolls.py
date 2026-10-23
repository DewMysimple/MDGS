"""Read the replacement .blend files without executing embedded scripts or saving them."""
import bpy, hashlib, json, sys, os
from pathlib import Path
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from asset_config import load_pipeline
CONFIG=load_pipeline(['--config',os.environ.get('MDGS_SCROLL_CONFIG',str(ROOT/'scripts/peony-2.0-sources.json'))])
OUT = Path(os.environ.get('MDGS_SCROLL_REPORT',ROOT / 'reports/peony-2.0'))
OUT.mkdir(parents=True, exist_ok=True)
sources = CONFIG.sources
def curves(obj):
    action=obj.animation_data.action if obj.animation_data else None
    if not action:return []
    result=list(getattr(action,'fcurves',[]))
    for layer in getattr(action,'layers',[]):
        for strip in layer.strips:
            for bag in getattr(strip,'channelbags',[]):result.extend(bag.fcurves)
    return result
results = []
for cid, source_file in sources:
    index=int(cid.split('-')[-1]);source=Path(source_file)
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    objects = []
    for obj in scene.objects:
        item = {'name': obj.name, 'type': obj.type, 'hidden': obj.hide_render,
                'dimensions': list(obj.dimensions), 'location': list(obj.location),
                'materials': [m.name if m else None for m in getattr(obj.data, 'materials', [])],
                'animated': bool(obj.animation_data), 'constraints': [c.type for c in obj.constraints],
                'animationChannels':sorted(set(c.data_path for c in curves(obj)))}
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
    result = {'id': f'chapter-{index}', 'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': digest,
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

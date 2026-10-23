"""Read-only independent Blender verification of the revised source and deliveries.

blender --background --disable-autoexec --python scripts/validate-new-scroll-native.py
No source or delivery is saved. All integer source frames are checked for visibility;
every exported camera/transform sample and every exported triangle/UV is recomputed.
"""
import bpy
import hashlib
import json
import math
import time,os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT=Path(os.environ.get('MDGS_SCROLL_REPORT',ROOT/'reports/peony-2.0'))
OUT = REPORT/'validation-native-new.json'
SOURCE_AUDITS=json.loads((REPORT/'source-audit.json').read_text(encoding='utf8'))
report = {'status': 'running', 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
          'scope': 'Independent Blender 5.2 reopen; all integer-frame visibility, every exported camera and object transform sample, all triangulated coordinates/UVs, packed image provenance. No renders or saves.', 'chapters': []}
OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for part in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(part)
    return h.hexdigest()


def close(actual, expected, name, tolerance=2e-6):
    if len(actual) != len(expected) or any(abs(float(a) - float(b)) > tolerance for a, b in zip(actual, expected)):
        raise AssertionError(name + ': values differ')


def column_matrix(matrix):
    return [float(matrix[row][column]) for column in range(4) for row in range(4)]


def inspect(path, data, chapter, role):
    digest_before = sha(path)
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    start, end = data['frameRange']
    assert [scene.frame_start, scene.frame_end] == [start, end]
    assert scene.render.fps == data['fps']
    assert [scene.render.resolution_x, scene.render.resolution_y] == [data['render']['width'], data['render']['height']]
    assert scene.camera.name == data['camera']['name']
    assert [(m.name, m.frame) for m in scene.timeline_markers] == [(m['name'], m['frame']) for m in data['markers']]
    objects = {o.name: o for o in scene.objects}
    renderables = {name: obj for name, obj in objects.items() if obj.type in ('MESH', 'CURVE', 'FONT', 'SURFACE', 'META')}
    camera_by_frame = {c['frame']: c for c in data['cameras']}
    animation_by_frame = {}
    for name, track in data.get('animations', {}).items():
        assert name in objects, 'Animated object missing: ' + name
        for key in track:
            frame = round(start + key['progress'] * (end - start))
            animation_by_frame.setdefault(frame, []).append((name, key['matrix']))
    tracks = {name: [] for name in renderables}
    first_visible = {}
    fingerprints = hashlib.sha256()
    transform_checks = 0
    effect_resolvers={}
    for key,track in data.get('sourceEffects',{}).get('scalarTracks',{}).items():
        material,socket_path=key.split('|',1)
        tree=bpy.data.materials[material].node_tree
        effect_resolvers[key]={'tree':tree,'path':socket_path,'track':track,'index':0}
    effect_checks=0
    morph_resolvers=[]
    for web in data['meshes']:
        for target in web.get('morphTargets',[]):
            key=objects[web['name']].data.shape_keys.key_blocks[target['name']]
            morph_resolvers.append({'key':key,'track':web['morphAnimations'][target['name']],'index':0})
    morph_checks=0
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.evaluated_depsgraph_get().update()
        for entry in morph_resolvers:
            track=entry['track'];i=entry['index']
            while i+1<len(track) and track[i+1]['frame']<=frame:i+=1
            entry['index']=i;a=track[i];b=track[min(i+1,len(track)-1)]
            mix=(frame-a['frame'])/max(1,b['frame']-a['frame'])
            expected=a['value']+(b['value']-a['value'])*mix
            assert abs(entry['key'].value-expected)<2e-6,f'{role} morph weight frame {frame}'
            morph_checks+=1
        for key,entry in effect_resolvers.items():
            track=entry['track'];i=entry['index']
            while i+1<len(track) and track[i+1]['frame']<=frame:i+=1
            entry['index']=i;a=track[i];b=track[min(i+1,len(track)-1)]
            mix=(frame-a['frame'])/max(1,b['frame']-a['frame'])
            actual=entry['tree'].path_resolve(entry['path'])
            if isinstance(a['value'],list):
                expected=[v+(b['value'][axis]-v)*mix for axis,v in enumerate(a['value'])]
                close(actual,expected,f'{role} shader {key} frame {frame}')
            else:
                expected=a['value']+(b['value']-a['value'])*mix
                assert abs(actual-expected)<2e-6,f'{role} shader {key} frame {frame}'
            effect_checks+=1
        for name, obj in renderables.items():
            visible = not obj.hide_render
            if not tracks[name] or tracks[name][-1]['visible'] != visible:
                tracks[name].append({'frame': frame, 'visible': visible})
            if visible:
                first_visible.setdefault(name, frame)
        if frame not in camera_by_frame and frame not in animation_by_frame:
            continue
        graph = bpy.context.evaluated_depsgraph_get()
        if frame in camera_by_frame:
            expected = camera_by_frame[frame]
            cam = scene.camera.evaluated_get(graph)
            q = cam.matrix_world.to_quaternion()
            close(cam.matrix_world.translation, expected['position'], f'{role} camera position frame {frame}')
            close((q.x, q.y, q.z, q.w), expected['quaternion'], f'{role} camera quaternion frame {frame}')
            projection = cam.calc_matrix_camera(graph, x=scene.render.resolution_x, y=scene.render.resolution_y,
                scale_x=scene.render.pixel_aspect_x, scale_y=scene.render.pixel_aspect_y)
            fov = math.degrees(2 * math.atan(1 / projection[1][1]))
            assert abs(fov - expected['fov']) < 2e-6
            # Include every object, including non-exported lights and authoring empties,
            # so a delivery equivalence claim is broader than the web mesh subset.
            sample = [(name, obj.type, obj.hide_render, [round(v, 6) for v in column_matrix(obj.evaluated_get(graph).matrix_world)])
                      for name, obj in sorted(objects.items())]
            fingerprints.update(json.dumps((frame, sample), ensure_ascii=False, separators=(',', ':')).encode())
        for name, expected in animation_by_frame.get(frame, []):
            close(column_matrix(objects[name].evaluated_get(graph).matrix_world), expected, f'{role} object {name} frame {frame}')
            transform_checks += 1
    for name, keys in data['visibility'].items():
        assert name in renderables
        actual = tracks[name]
        assert actual == [{'frame': k['frame'], 'visible': k['visible']} for k in keys], f'{role} visibility mismatch: {name}'
        for key in keys:
            assert abs(key['progress'] - (key['frame'] - start) / (end - start)) < 5.01e-8
    fingerprints.update(json.dumps(tracks, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode())
    # Reconstruct the actual triangles independently, then expand the web index.
    source_geometry_names = set()
    geometry_checks = 0
    expected_meshes = {m['name']: m for m in data['meshes']}
    assert len(expected_meshes) == len(data['meshes']), 'Validator requires explicit per-object material grouping if names repeat'
    skipped = []
    for name, obj in sorted(renderables.items()):
        if name not in first_visible:
            skipped.append({'name': name, 'type': obj.type, 'reason': 'never render-visible in any source integer frame'})
            continue
        scene.frame_set(first_visible[name]); graph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
        if not mesh or not mesh.polygons:
            skipped.append({'name': name, 'type': obj.type, 'reason': 'no renderable polygons'})
            if mesh:
                evaluated.to_mesh_clear()
            continue
        source_geometry_names.add(name)
        assert name in expected_meshes, f'{role} future-visible geometry omitted: {name}'
        web = expected_meshes[name]
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers.active.data if mesh.uv_layers.active else None
        actual_positions, actual_uv = [], []
        slots = set()
        for tri in mesh.loop_triangles:
            slots.add(tri.material_index)
            for li, vi in zip(tri.loops, tri.vertices):
                actual_positions.extend(mesh.vertices[vi].co)
                actual_uv.extend(uv[li].uv if uv else [0, 0])
        assert len(slots) == 1, f'{role} multiple material slots require grouped validation: {name}'
        indices = web.get('indices', list(range(len(web['positions']) // 3)))
        expanded_p = [web['positions'][index * 3 + axis] for index in indices for axis in range(3)]
        expanded_uv = [web['uvs'][index * 2 + axis] for index in indices for axis in range(2)]
        close(actual_positions, expanded_p, f'{role} geometry {name}')
        close(actual_uv, expanded_uv, f'{role} UV {name}')
        for target in web.get('morphTargets',[]):
            keys=obj.data.shape_keys
            assert keys.use_relative and not obj.modifiers,'Nonlinear deformer needs another export'
            key=keys.key_blocks[target['name']]
            assert abs(key.value-target['baseValue'])<2e-6,'Morph base weight mismatch'
            actual_delta=[]
            for tri in mesh.loop_triangles:
                for vi in tri.vertices:
                    delta=key.data[vi].co-key.relative_key.data[vi].co
                    if key.vertex_group:
                        group=obj.vertex_groups.get(key.vertex_group)
                        try:weight=group.weight(vi) if group else 0
                        except RuntimeError:weight=0
                        delta*=weight
                    actual_delta.extend(delta)
            expanded_delta=[target['positions'][index*3+axis] for index in indices for axis in range(3)]
            close(actual_delta,expanded_delta,f'{role} morph relative deltas {name}')
        geometry_checks += len(indices)
        evaluated.to_mesh_clear()
    assert source_geometry_names == set(expected_meshes), f'{role} geometry set mismatch'
    scene.frame_set(start); graph = bpy.context.evaluated_depsgraph_get()
    for name, mesh in expected_meshes.items():
        close(column_matrix(objects[name].evaluated_get(graph).matrix_world), mesh['matrix'], f'{role} base matrix {name}')
    missing = [im.name for im in bpy.data.images if im.source == 'FILE' and not im.packed_file and not Path(bpy.path.abspath(im.filepath)).is_file()]
    if role == 'delivery':
        assert not missing, f'{role} missing images: {missing}'
        for image in data['images']:
            native = bpy.data.images.get(image['sourceName'])
            assert native and native.packed_file, 'Web source not packed: ' + image['sourceName']
            raw = bytes(native.packed_file.data)
            assert hashlib.sha256(raw).hexdigest() == image['sourceSha256'], 'Web pigment not from current delivery: ' + image['sourceName']
            assert hashlib.sha1(raw).hexdigest()[:16] == image['id']
    assert digest_before == sha(path), 'Read-only validation changed file: ' + str(path)
    return {'sha256': digest_before, 'allIntegerVisibilityFrames': end - start + 1,
            'cameraSamplesRecomputed': len(camera_by_frame), 'animationMatricesRecomputed': transform_checks,
            'nativeMaterialScalarFramesRecomputed':effect_checks,
            'nativeMorphWeightFramesRecomputed':morph_checks,'relativeMorphMeshes':len({m['name'] for m in data['meshes'] if m.get('morphTargets')}),
            'expandedTriangleVerticesRecomputed': geometry_checks, 'sceneFingerprint': fingerprints.hexdigest(),
            'exportedGeometryObjects': len(source_geometry_names),
            'visibleGeometryAtStart': sum(not objects[n].hide_render for n in source_geometry_names),
            'futureVisibleGeometry': sum(tracks[n][0]['visible'] is False for n in source_geometry_names),
            'intentionallyNotExported': skipped, 'unpackedMissingImages': missing,
            'webPackedSourceImagesVerified': len(data['images']) if role == 'delivery' else 0,
            'fileUnchanged': True}


try:
    for audit in SOURCE_AUDITS:
        chapter=int(audit['id'].split('-')[-1])
        manifest_path = ROOT / f'public/assets/new-scrolls/chapter-{chapter}/scene.json'
        manifest_digest = sha(manifest_path)
        data = json.loads(manifest_path.read_text(encoding='utf8'))
        source = inspect(ROOT / audit['source'], data, chapter, 'input')
        delivery = inspect(ROOT / f'artwork/blender-reconstructed/chapter-{chapter}_reconstructed.blend', data, chapter, 'delivery')
        assert source['sha256'] == data['sourceSha256']
        assert source['sceneFingerprint'] == delivery['sceneFingerprint'], 'Source/delivery fingerprint differs'
        assert sha(manifest_path) == manifest_digest, 'Manifest changed during verification'
        item = {'chapter': chapter, 'manifestSha256': manifest_digest, 'source': source, 'delivery': delivery, 'sourceAndDeliveryEquivalent': True, 'passed': True}
        report['chapters'].append(item)
        OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
        print(json.dumps({'chapter': chapter, 'passed': True, 'meshCount': delivery['exportedGeometryObjects'],
                          'futureGeometry': delivery['futureVisibleGeometry']}, ensure_ascii=False), flush=True)
    report['status'] = 'pass'
except Exception as error:
    report.update(status='fail', failure=repr(error))
    raise
finally:
    report['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')

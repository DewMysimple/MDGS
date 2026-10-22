r"""Export native scroll geometry and clocks without modifying a source .blend.

Blender --background --disable-autoexec --python scripts/export-new-scrolls.py
Set MDGS_SOURCE_ROOT to the local folder containing the configured originals.
"""
import hashlib, json, math, os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import ROOT, load_pipeline, image_index, resolve_image, ImageResolutionError
from export_scroll_geometry import relative_shape_geometry, shape_weights
import bpy
from mathutils import Vector

CONFIG = load_pipeline()
ASSETS = Path(os.environ.get('MDGS_EXPORT_ASSETS', ROOT / 'public/assets')).resolve()
SOURCES = CONFIG.sources
file_index = image_index(CONFIG.materials_root)
SOURCE_REVISION = os.environ.get('MDGS_SOURCE_REVISION')
SOURCE_LABEL = os.environ.get('MDGS_SOURCE_LABEL_ROOT', '牡丹2.0')

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(8 * 1024 * 1024), b''): digest.update(part)
    return digest.hexdigest()

def nums(values): return [round(float(value), 7) for value in values]
def matrix(value): return nums(value[row][column] for column in range(4) for row in range(4))
def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')

def append_held(track, item, field):
    """Keep both ends of exact constant holds, including the movement boundary."""
    if len(track) >= 2 and track[-2][field] == track[-1][field] == item[field]: track[-1] = item
    else: track.append(item)

def extract_image(image, dest, cid, repairs, missing):
    if not image or image.source not in ('FILE', 'GENERATED'): return None
    raw = None
    if image.packed_file: raw = bytes(image.packed_file.data)
    else:
        original_path = bpy.path.abspath(image.filepath)
        resolved = resolve_image(original_path, image.name, file_index)
        if resolved and resolved.is_file():
            raw = resolved.read_bytes()
            if not Path(original_path).is_file():
                repairs.append({'image': image.name, 'oldPath': image.filepath, 'resolvedPath': str(resolved)})
        elif image.source == 'GENERATED' and image.size[0]:
            target = dest / ('generated-' + hashlib.sha1(image.name.encode()).hexdigest()[:12] + '.png')
            image.save_render(str(target)); raw = target.read_bytes()
        else:
            missing.append({'image': image.name, 'path': image.filepath}); return None
    digest = hashlib.sha1(raw).hexdigest()[:16]
    raw_path = dest / (digest + '.source')
    if not raw_path.exists() or raw_path.read_bytes() != raw: raw_path.write_bytes(raw)
    return {'id': digest, 'src': 'textures/' + digest + '.webp', 'sourceName': image.name,
            'sourceSize': list(image.size), 'hasAlpha': image.channels == 4,
            'sourceSha256': hashlib.sha256(raw).hexdigest()}

def camera_dof(camera, graph):
    dof = camera.data.dof
    focus = dof.focus_object.evaluated_get(graph) if dof.focus_object else None
    # Blender focuses along the camera optical axis, rather than Euclidean range.
    distance = abs((camera.matrix_world.inverted() @ focus.matrix_world.translation).z) if focus else dof.focus_distance
    return {'enabled': dof.use_dof, 'focusDistance': float(distance),
            'focusObject': dof.focus_object.name if dof.focus_object else None,
            'fstop': dof.aperture_fstop, 'blades': dof.aperture_blades,
            'rotation': dof.aperture_rotation, 'ratio': dof.aperture_ratio}

def export_chapter(cid, source):
    source_hash = sha(source)
    bpy.ops.wm.open_mainfile(filepath=source, load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    start, end = scene.frame_start, scene.frame_end
    span = max(1, end - start)
    scene.frame_set(start)
    textures = ASSETS / cid / 'textures'; textures.mkdir(parents=True, exist_ok=True)
    repairs, missing, skipped = [], [], []
    image_map, image_list, materials, material_index = {}, [], [], {}
    geometry, texts, morph_objects = [], [], {}
    graph = bpy.context.evaluated_depsgraph_get()
    candidates = [obj for obj in scene.objects if obj.type in ('MESH', 'CURVE', 'FONT', 'SURFACE', 'META')]
    initial_matrices = {obj.name: matrix(obj.evaluated_get(graph).matrix_world) for obj in candidates}
    initially_visible = sum(obj.type == 'MESH' and not obj.hide_render for obj in candidates)
    visibility, first_visible = {obj.name: [] for obj in candidates}, {}
    # Every authored integer frame preserves visibility and the native clock.
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        for obj in candidates:
            visible = not obj.hide_render; keys = visibility[obj.name]
            if not keys or keys[-1]['visible'] != visible:
                keys.append({'progress': round((frame - start) / span, 10), 'visible': visible, 'frame': frame})
            if visible: first_visible.setdefault(obj.name, frame)

    def material_id(material):
        key = material.name if material else '__default'
        if key in material_index: return material_index[key]
        texture, rgba, alpha_link, procedural = None, [.72, .65, .53, 1], False, False
        if material:
            rgba = list(material.diffuse_color)
            if material.use_nodes and material.node_tree:
                nodes = list(material.node_tree.nodes)
                image_nodes = [node for node in nodes if node.type == 'TEX_IMAGE' and node.image]
                if image_nodes:
                    image = image_nodes[0].image
                    if image.name not in image_map:
                        record = extract_image(image, textures, cid, repairs, missing); image_map[image.name] = record
                        if record and not any(item['id'] == record['id'] for item in image_list): image_list.append(record)
                    texture = image_map[image.name]; rgba = [1, 1, 1, 1]
                    alpha_link = any(link.from_node == image_nodes[0] and link.from_socket.name == 'Alpha' for link in material.node_tree.links)
                else:
                    shader = next((node for node in nodes if node.type in ('EMISSION', 'BSDF_PRINCIPLED')), None)
                    if shader:
                        color = shader.inputs.get('Color') or shader.inputs.get('Base Color')
                        if color and not color.is_linked: rgba = list(color.default_value)
                        elif color and color.is_linked:
                            procedural = True; ramps = [node for node in nodes if node.type == 'VALTORGB']
                            if ramps:
                                colors = [list(element.color) for element in ramps[0].color_ramp.elements]
                                rgba = [sum(color[axis] for color in colors) / len(colors) for axis in range(4)]
        index = len(materials); material_index[key] = index
        materials.append({'id': index, 'name': key, 'texture': texture['src'] if texture else None,
                          'color': nums(rgba[:3]), 'opacity': round(float(rgba[3]), 7),
                          'transparent': bool(texture or rgba[3] < 1), 'alphaTest': .012 if texture else 0,
                          'side': 'double', 'depthWrite': not bool(texture), 'sourceAlphaLinked': alpha_link,
                          'proceduralApproximation': procedural})
        return index

    source_objects = {}
    for obj in candidates:
        if obj.name not in first_visible: continue
        scene.frame_set(first_visible[obj.name]); graph = bpy.context.evaluated_depsgraph_get()
        evaluated = obj.evaluated_get(graph); mesh = None
        try:
            mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
            if not mesh or not mesh.polygons: continue
            mesh.calc_loop_triangles(); uv = mesh.uv_layers.active.data if mesh.uv_layers.active else None
            morph = relative_shape_geometry(obj, mesh, graph)
            base_positions = morph['positions'] if morph else [tuple(vertex.co) for vertex in mesh.vertices]
            base_normals = morph['normals'] if morph else [tuple(item.vector) for item in mesh.corner_normals]
            groups = {}
            for triangle in mesh.loop_triangles:
                group = groups.setdefault(triangle.material_index, {'positions': [], 'uvs': [], 'normals': [],
                    'morphTargets': [{'name': target['name'], 'positions': [], 'normals': []} for target in morph['targets']] if morph else []})
                for loop_index, vertex_index in zip(triangle.loops, triangle.vertices):
                    group['positions'].extend(nums(base_positions[vertex_index]))
                    group['uvs'].extend(nums(uv[loop_index].uv) if uv else [0, 0])
                    group['normals'].extend(nums(base_normals[loop_index]))
                    if morph:
                        for target, output in zip(morph['targets'], group['morphTargets']):
                            output['positions'].extend(nums(target['positions'][vertex_index]))
                            output['normals'].extend(nums(target['normals'][loop_index]))
            bounds = [evaluated.matrix_world @ Vector(corner) for corner in obj.bound_box]
            for slot, group in groups.items():
                material = mesh.materials[slot] if slot < len(mesh.materials) else None
                record = {'name': obj.name, 'type': obj.type, 'matrix': initial_matrices[obj.name],
                          'positions': group['positions'], 'uvs': group['uvs'], 'normals': group['normals'],
                          'material': material_id(material),
                          'bounds': {'min': nums(min(point[axis] for point in bounds) for axis in range(3)),
                                     'max': nums(max(point[axis] for point in bounds) for axis in range(3))},
                          'animated': bool(obj.animation_data or morph or obj.constraints or obj.parent), 'isText': obj.type == 'FONT'}
                if morph:
                    record.update(morphTargetsRelative=True, morphTargets=group['morphTargets'], morphWeights=[])
                    record['morphBasisVerificationMaximumError'] = morph['verifiedFirstVisibleMaximumError']
                    morph_objects.setdefault(obj.name, {'object': obj, 'names': [target['name'] for target in morph['targets']], 'records': []})['records'].append(record)
                geometry.append(record)
            source_objects[obj.name] = obj
            if obj.type == 'FONT': texts.append({'name': obj.name, 'body': obj.data.body, 'matrix': initial_matrices[obj.name], 'size': obj.data.size})
        except ImageResolutionError: raise
        except Exception as error: skipped.append({'name': obj.name, 'reason': str(error)})
        finally:
            if mesh: evaluated.to_mesh_clear()
    if missing or skipped:
        raise RuntimeError('Incomplete native export: ' + json.dumps({'missing': missing, 'skipped': skipped}, ensure_ascii=False))

    camera = scene.camera
    cameras, animation_samples = [], {name: [] for name in source_objects}
    morph_samples = {name: [] for name in morph_objects}
    for frame in range(start, end + 1):
        scene.frame_set(frame); graph = bpy.context.evaluated_depsgraph_get()
        progress = round((frame - start) / span, 10)
        evaluated = camera.evaluated_get(graph); transform = evaluated.matrix_world; quaternion = transform.to_quaternion()
        projection = evaluated.calc_matrix_camera(graph, x=scene.render.resolution_x, y=scene.render.resolution_y,
            scale_x=scene.render.pixel_aspect_x, scale_y=scene.render.pixel_aspect_y)
        cameras.append({'frame': frame, 'progress': progress, 'position': nums(transform.translation),
                        'quaternion': nums((quaternion.x, quaternion.y, quaternion.z, quaternion.w)),
                        'fov': round(math.degrees(2 * math.atan(1 / projection[1][1])), 7),
                        'type': evaluated.data.type, 'orthoScale': evaluated.data.ortho_scale, 'lens': evaluated.data.lens,
                        'shift': [evaluated.data.shift_x, evaluated.data.shift_y], 'dof': camera_dof(evaluated, graph)})
        for name, obj in source_objects.items():
            append_held(animation_samples[name], {'frame': frame, 'progress': progress, 'matrix': matrix(obj.evaluated_get(graph).matrix_world)}, 'matrix')
        for name, item in morph_objects.items():
            append_held(morph_samples[name], {'frame': frame, 'progress': progress, 'weights': nums(shape_weights(item['object'], item['names'], graph))}, 'weights')
    animation_samples = {name: track for name, track in animation_samples.items() if any(key['matrix'] != initial_matrices[name] for key in track)}
    for name, item in morph_objects.items():
        for record in item['records']: record['morphWeights'] = morph_samples[name]
    markers = [{'name': marker.name, 'frame': marker.frame, 'progress': round((marker.frame - start) / span, 10)} for marker in scene.timeline_markers]
    # Keep all authored markers; effect boundaries are not prose reading stops.
    stops = [dict(marker) for marker in markers if '参考全景' not in marker['name']
             and not (marker['name'].startswith('出场 ·') or '灼烧入场开始' in marker['name'] or '灼烧完成' in marker['name'])]
    camera_by_frame = {item['frame']: item for item in cameras}
    first_camera = camera_by_frame.get(stops[0]['frame'], cameras[0]) if stops else cameras[0]
    last_camera = camera_by_frame.get(stops[-1]['frame'], cameras[-1]) if stops else cameras[-1]
    direction = Vector(last_camera['position']) - Vector(first_camera['position'])
    axis = max(range(3), key=lambda index: abs(direction[index]))
    portable_source = SOURCE_LABEL.rstrip('/\\') + '/' + Path(source).name
    data = {'version': 1, 'id': cid, 'source': portable_source, 'sourceSha256': source_hash, 'sourceRevision': SOURCE_REVISION,
            'coordinateSystem': 'BLENDER_WORLD_UNCHANGED', 'matrixOrder': 'column-major', 'quaternionOrder': 'xyzw',
            'frameRange': [start, end], 'fps': scene.render.fps, 'fpsBase': scene.render.fps_base,
            'sourceDurationSeconds': (end - start) * scene.render.fps_base / scene.render.fps,
            'render': {'width': scene.render.resolution_x, 'height': scene.render.resolution_y,
                       'pixelAspectX': scene.render.pixel_aspect_x, 'pixelAspectY': scene.render.pixel_aspect_y},
            'travel': {'axis': 'XYZ'[axis], 'sign': 1 if direction[axis] >= 0 else -1, 'range': [cameras[0]['position'][axis], cameras[-1]['position'][axis]]},
            'camera': {'name': camera.name, 'near': camera.data.clip_start, 'far': camera.data.clip_end,
                       'sensorFit': camera.data.sensor_fit, 'sensorWidth': camera.data.sensor_width,
                       'sensorHeight': camera.data.sensor_height, 'dof': cameras[0]['dof']},
            'cameras': cameras, 'markers': markers, 'stops': stops, 'meshes': geometry, 'materials': materials,
            'images': image_list, 'textObjects': texts, 'animations': animation_samples,
            'visibility': {name: keys for name, keys in visibility.items() if name in source_objects},
            'audit': {'repairs': repairs, 'missingImages': missing, 'skippedObjects': skipped,
                      'nativeSourceSha256': source_hash, 'visibleNativeMeshesAtStart': initially_visible,
                      'exportedEverVisibleMeshes': len(geometry), 'sourceVisibilityScanned': True,
                      'sourceVisibilityScannedFrames': end - start + 1, 'cameraSampling': 'every authored integer frame',
                      'matrixSampling': 'every integer frame; exact constant holds compressed',
                      'morphSampling': 'native relative Basis/targets; evaluated weights every integer frame',
                      'neverVisibleGeometry': [obj.name for obj in candidates if obj.name not in first_visible],
                      'proceduralMaterialApproximation': 'Source material graph is exported by export-source-materials.py after texture preparation.'}}
    if source_hash != sha(source): raise RuntimeError('Read-only export changed source: ' + portable_source)
    write_json(ASSETS / cid / 'scene.json', data)
    summary = {'id': cid, 'source': portable_source, 'sourceSha256': source_hash, 'sourceUnchanged': True,
               'meshes': len(geometry), 'materials': len(materials), 'textures': len(image_list),
               'morphObjects': len(morph_objects), 'morphTargets': sum(len(item['names']) for item in morph_objects.values()),
               'cameraSamples': len(cameras), 'stops': len(stops), 'repairs': len(repairs), 'missingImages': missing,
               'skippedObjects': skipped, 'axis': 'XYZ'[axis], 'sign': 1 if direction[axis] >= 0 else -1}
    print('EXPORTED', json.dumps(summary, ensure_ascii=False), flush=True)
    return summary

summaries = [export_chapter(chapter, source) for chapter, source in SOURCES]
write_json(Path(os.environ.get('MDGS_EXPORT_REPORT', ROOT / 'reports/assets-export.json')), summaries)

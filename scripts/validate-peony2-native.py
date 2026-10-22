"""Independently inspect the four Peony 2.0 originals without saving them.

Run with Blender 5.2 or later, for example::

  blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
    --python scripts/validate-peony2-native.py -- --source-root <Peony-2.0-folder> \
    --capture-only --render-keyframes

Omit --capture-only after export to verify the current web manifests. Captures
and verification are deliberately separate statuses. Historical new-scrolls
reports are never used or overwritten. No .blend file is saved by this tool.
"""

import argparse
import bisect
import hashlib
import json
import math
import os
import re
import sys
import time
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[1]
NAMES = {
    1: '画卷一_灼烧入场版.blend',
    2: '画卷二_街市建筑完整补全版.blend',
    3: '画卷三_分镜构图版_图层补全.blend',
    4: '画卷四_画卷一节奏运镜版.blend',
}
EXPECTED_OBJECT_COUNTS = {1: 149, 2: 58, 3: 79, 4: 52}
EXPECTED_RAW_IMAGE_COUNTS = {1: 99, 2: 35, 3: 66, 4: 43}
RENDER_FRAMES = {
    1: [2540, 2568, 2596],
    2: [350, 656, 955],
    3: [1, 31, 61, 471, 951, 1206, 1236, 1627, 1671, 1926, 1956],
    4: [1, 45, 90, 195, 218, 1407, 1575, 1596],
}
TOLERANCE = 2e-6


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            digest.update(part)
    return digest.hexdigest()


def write(path, data, compact=False):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, ensure_ascii=False,
                                   indent=None if compact else 2,
                                   separators=(',', ':') if compact else None), encoding='utf8')


def matrix(value):
    return [float(value[row][column]) for column in range(4) for row in range(4)]


def numbers(value):
    if isinstance(value, (str, bool, int, float)) or value is None:
        return value
    try:
        return [numbers(item) for item in value]
    except TypeError:
        return str(value)


def curves(holder):
    animation = getattr(holder, 'animation_data', None)
    action = animation.action if animation else None
    result = list(getattr(action, 'fcurves', [])) if action else []
    if action:
        for layer in getattr(action, 'layers', []):
            for strip in layer.strips:
                for bag in getattr(strip, 'channelbags', []):
                    result.extend(bag.fcurves)
    return list({id(curve): curve for curve in result}.values())


def animation(holder):
    data = getattr(holder, 'animation_data', None)
    return {
        'curves': [{'path': curve.data_path, 'index': curve.array_index,
                    'keys': [[float(point.co[0]), float(point.co[1]), point.interpolation]
                             for point in curve.keyframe_points]}
                   for curve in curves(holder)],
        'drivers': [{'path': driver.data_path, 'index': driver.array_index,
                     'expression': driver.driver.expression}
                    for driver in data.drivers] if data else [],
    }


def node_graph(tree):
    if tree is None:
        return None
    result = {'nodes': [], 'links': [], 'animation': animation(tree)}
    for node in tree.nodes:
        record = {'name': node.name, 'label': node.label, 'type': node.type,
                  'blIdname': node.bl_idname,
                  'inputs': [{'index': i, 'name': socket.name,
                              'value': numbers(getattr(socket, 'default_value', None))}
                             for i, socket in enumerate(node.inputs)],
                  'outputs': [{'index': i, 'name': socket.name,
                               'value': numbers(getattr(socket, 'default_value', None))}
                              for i, socket in enumerate(node.outputs)]}
        for attribute in ('operation', 'blend_type', 'data_type', 'interpolation',
                          'projection', 'extension', 'noise_dimensions', 'normalize',
                          'invert', 'distribution', 'use_clamp', 'clamp', 'space',
                          'glare_type', 'quality', 'threshold', 'size', 'mix',
                          'streaks', 'angle_offset', 'fade', 'iterations', 'use_alpha',
                          'premul', 'blur_type', 'filter_type', 'factor_x', 'factor_y'):
            if hasattr(node, attribute):
                record[attribute] = numbers(getattr(node, attribute))
        if node.type == 'TEX_IMAGE':
            record['image'] = node.image.name if node.image else None
        if hasattr(node, 'color_ramp'):
            record['colorRamp'] = {
                'interpolation': node.color_ramp.interpolation,
                'colorMode': node.color_ramp.color_mode,
                'hueInterpolation': node.color_ramp.hue_interpolation,
                'elements': [[element.position, list(element.color)]
                             for element in node.color_ramp.elements],
            }
        if getattr(node, 'node_tree', None) is not None:
            record['group'] = node_graph(node.node_tree)
        result['nodes'].append(record)
    result['links'] = [[link.from_node.name, list(link.from_node.outputs).index(link.from_socket),
                        link.to_node.name, list(link.to_node.inputs).index(link.to_socket)]
                       for link in tree.links]
    return result


def raw_image(image, image_index):
    if image.packed_file:
        return bytes(image.packed_file.data), 'packed', None
    absolute = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
    if absolute and absolute.is_file():
        return absolute.read_bytes(), 'external', absolute
    candidates = []
    for name in (Path(image.filepath).name, image.name,
                 re.sub(r'\.\d{3}$', '', image.name)):
        candidates.extend(image_index.get(name.casefold(), []))
    candidates = sorted(set(candidates))
    hashes = {sha(candidate) for candidate in candidates}
    if len(hashes) > 1:
        raise ValueError('Ambiguous recovery candidates for source image: ' + image.name)
    if candidates:
        recovered = candidates[0]
        return recovered.read_bytes(), 'recovered-exact-file', recovered
    return None, 'unresolved', None


def expanded_geometry(obj, graph):
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=graph)
    if mesh is None:
        return None
    try:
        mesh.calc_loop_triangles()
        uv = mesh.uv_layers.active.data if mesh.uv_layers.active else None
        positions, uvs, slots = [], [], set()
        for triangle in mesh.loop_triangles:
            slots.add(triangle.material_index)
            for loop_index, vertex_index in zip(triangle.loops, triangle.vertices):
                positions.extend(mesh.vertices[vertex_index].co)
                uvs.extend(uv[loop_index].uv if uv else (0, 0))
        return {'positions': positions, 'uvs': uvs, 'materialSlots': sorted(slots),
                'vertices': len(mesh.vertices), 'polygons': len(mesh.polygons)}
    finally:
        evaluated.to_mesh_clear()


def expand_web(mesh, field, width):
    values = mesh[field]
    return [values[index * width + axis]
            for index in mesh.get('indices', range(len(mesh['positions']) // 3))
            for axis in range(width)]


def compare_values(actual, expected, label, errors, tolerance=TOLERANCE):
    if len(actual) != len(expected):
        errors.append(f'{label}: length {len(actual)} != {len(expected)}')
        return False
    maximum = max((abs(float(a) - float(b)) for a, b in zip(actual, expected)), default=0)
    if maximum > tolerance:
        errors.append(f'{label}: maximum error {maximum:.9g} > {tolerance}')
        return False
    return True


def camera_sample(scene, graph, frame):
    camera = scene.camera.evaluated_get(graph)
    quaternion = camera.matrix_world.to_quaternion()
    projection = camera.calc_matrix_camera(
        graph, x=scene.render.resolution_x, y=scene.render.resolution_y,
        scale_x=scene.render.pixel_aspect_x, scale_y=scene.render.pixel_aspect_y)
    dof = camera.data.dof
    focus = dof.focus_object.evaluated_get(graph) if dof.focus_object else None
    focus_distance = (abs((camera.matrix_world.inverted() @ focus.matrix_world.translation).z)
                      if focus else dof.focus_distance)
    return {'frame': frame, 'position': list(camera.matrix_world.translation),
            'quaternion': [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
            'fov': math.degrees(2 * math.atan(1 / projection[1][1])),
            'projectionMatrix': matrix(projection), 'type': camera.data.type,
            'lens': camera.data.lens, 'orthoScale': camera.data.ortho_scale,
            'shift': [camera.data.shift_x, camera.data.shift_y],
            'clipStart': camera.data.clip_start, 'clipEnd': camera.data.clip_end,
            'dof': {'enabled': dof.use_dof, 'focusDistance': focus_distance,
                    'authoredFallbackFocusDistance': dof.focus_distance,
                    'focusObject': dof.focus_object.name if dof.focus_object else None,
                    'fstop': dof.aperture_fstop, 'blades': dof.aperture_blades,
                    'rotation': dof.aperture_rotation, 'ratio': dof.aperture_ratio}}


def render_frames(scene, chapter, source_hash, frames, output, scale):
    records = []
    original_percentage = scene.render.resolution_percentage
    image_settings = scene.render.image_settings
    scene.render.resolution_percentage = scale
    if hasattr(image_settings, 'media_type'):
        image_settings.media_type = 'IMAGE'
    image_settings.file_format = 'PNG'
    image_settings.color_mode = 'RGBA'
    scene.render.use_file_extension = True
    for frame in sorted(frames):
        if frame < scene.frame_start or frame > scene.frame_end:
            continue
        scene.frame_set(frame)
        target = output / 'renders' / f'chapter-{chapter}-frame-{frame:04d}.png'
        target.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(target)
        started = time.monotonic()
        bpy.ops.render.render(write_still=True)
        records.append({'chapter': chapter, 'frame': frame,
                        'sourceSha256': source_hash,
                        'path': target.relative_to(ROOT).as_posix() if target.is_relative_to(ROOT) else str(target),
                        'sha256': sha(target),
                        'renderSeconds': time.monotonic() - started,
                        'scalePercent': scale, 'engine': scene.render.engine,
                        'sourceRenderResolution': [scene.render.resolution_x, scene.render.resolution_y],
                        'sourceResolutionPercentage': original_percentage,
                        'nativeMaterialsLightingDepthOfFieldAndCompositing': True})
    scene.render.resolution_percentage = original_percentage
    return records


def pixel_difference(first_path, second_path):
    """Decode the rendered PNGs, rather than treating file hashes as pixels."""
    import numpy as np
    loaded = []
    try:
        for path in (first_path, second_path):
            image = bpy.data.images.load(str(path), check_existing=False)
            values = np.empty(len(image.pixels), dtype=np.float32)
            image.pixels.foreach_get(values)
            loaded.append((image, values))
        if loaded[0][0].size[:] != loaded[1][0].size[:]:
            raise ValueError('Ablation images have different dimensions')
        delta = np.abs(loaded[0][1] - loaded[1][1])
        return {'decodedPixelSize': list(loaded[0][0].size),
                'normalizedDecodedRGBA_meanAbsoluteError': float(np.mean(delta)),
                'normalizedDecodedRGBA_rootMeanSquareError': float(np.sqrt(np.mean(delta * delta))),
                'normalizedDecodedRGBA_maximumError': float(np.max(delta)),
                'channelsDifferingAbove1eMinus6': int(np.count_nonzero(delta > 1e-6)),
                'totalChannels': int(delta.size)}
    finally:
        for image, _ in loaded:
            bpy.data.images.remove(image)


def render_ablations(scene, chapter, source_hash, output, scale, features=None):
    """Measure whether source lights, DOF and compositing affect actual pixels."""
    frame = RENDER_FRAMES[chapter][-1]
    scene.frame_set(frame)
    directory = output / 'ablations'
    directory.mkdir(parents=True, exist_ok=True)
    settings = scene.render.image_settings
    if hasattr(settings, 'media_type'):
        settings.media_type = 'IMAGE'
    settings.file_format = 'PNG'
    settings.color_mode = 'RGBA'
    original_percentage = scene.render.resolution_percentage
    scene.render.resolution_percentage = scale
    suffix = '-for-' + '-'.join(features) if features else ''
    baseline = directory / f'chapter-{chapter}-frame-{frame:04d}-authored{suffix}.png'
    scene.render.filepath = str(baseline)
    bpy.ops.render.render(write_still=True)
    lights = [(obj, obj.hide_render) for obj in scene.objects if obj.type == 'LIGHT']
    shadows = [(obj.data, obj.data.use_shadow) for obj in scene.objects if obj.type == 'LIGHT']
    backgrounds = [(node.inputs['Strength'], node.inputs['Strength'].default_value)
                   for node in scene.world.node_tree.nodes if node.type == 'BACKGROUND'] \
        if scene.world and scene.world.node_tree else []
    dof = scene.camera.data.dof.use_dof
    compositing = scene.render.use_compositing
    result = []
    selected = features or ('source-light-objects', 'world-background-strength', 'depth-of-field', 'compositing')
    for feature in selected:
        target = directory / f'chapter-{chapter}-frame-{frame:04d}-without-{feature}.png'
        try:
            if feature == 'source-light-objects':
                for obj, _ in lights:
                    obj.hide_render = True
            elif feature == 'source-light-shadows':
                for light, _ in shadows:
                    light.use_shadow = False
            elif feature == 'depth-of-field':
                scene.camera.data.dof.use_dof = False
            elif feature == 'compositing':
                scene.render.use_compositing = False
            else:
                for socket, _ in backgrounds:
                    socket.default_value = 0
            scene.render.filepath = str(target)
            bpy.ops.render.render(write_still=True)
            result.append({'chapter': chapter, 'frame': frame, 'sourceSha256': source_hash,
                           'featureDisabled': feature,
                           'authoredPath': baseline.relative_to(ROOT).as_posix() if baseline.is_relative_to(ROOT) else str(baseline),
                           'variantPath': target.relative_to(ROOT).as_posix() if target.is_relative_to(ROOT) else str(target),
                           'authoredSha256': sha(baseline), 'variantSha256': sha(target),
                           **pixel_difference(baseline, target)})
        finally:
            for obj, hidden in lights:
                obj.hide_render = hidden
            for light, shadows_enabled in shadows:
                light.use_shadow = shadows_enabled
            for socket, strength in backgrounds:
                socket.default_value = strength
            scene.camera.data.dof.use_dof = dof
            scene.render.use_compositing = compositing
    scene.render.resolution_percentage = original_percentage
    return result


def inspect(chapter, args, image_index):
    source = args.source_root / NAMES[chapter]
    source_digest = sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    start, end = scene.frame_start, scene.frame_end
    manifest_path = ROOT / f'public/assets/new-scrolls/chapter-{chapter}/scene.json'
    web = json.loads(manifest_path.read_text(encoding='utf8')) if not args.capture_only else None
    errors = []
    objects = {obj.name: obj for obj in scene.objects}
    candidates = {name: obj for name, obj in objects.items()
                  if obj.type in ('MESH', 'CURVE', 'FONT', 'SURFACE', 'META')}
    scene.frame_set(start)
    graph = bpy.context.evaluated_depsgraph_get()
    previous = args.output_dir / f'chapter-{chapter}-native.json'
    if not previous.is_file():
        previous = args.output_dir / f'chapter-{chapter}-capture.json'
    preserved_renders = []
    preserved_ablations = []
    if previous.is_file():
        old = json.loads(previous.read_text(encoding='utf8'))
        if old.get('sourceSha256') == source_digest:
            for record in old.get('renders', []):
                path = Path(record['path'])
                path = path if path.is_absolute() else ROOT / path
                if path.is_file() and sha(path) == record['sha256']:
                    preserved_renders.append(record)
            for record in old.get('ablations', []):
                path = Path(record['variantPath'])
                path = path if path.is_absolute() else ROOT / path
                if path.is_file() and sha(path) == record['variantSha256']:
                    preserved_ablations.append(record)
    report = {
        'chapter': chapter, 'source': '牡丹2.0/' + NAMES[chapter],
        'sourceSha256': source_digest, 'sourceBytes': source.stat().st_size,
        'blenderVersion': bpy.app.version_string,
        'frameRange': [start, end], 'fps': scene.render.fps,
        'fpsBase': scene.render.fps_base,
        'sourceDurationSeconds': (end - start) * scene.render.fps_base / scene.render.fps,
        'sourceInclusiveFrameDurationSeconds': (end - start + 1) * scene.render.fps_base / scene.render.fps,
        'render': {'width': scene.render.resolution_x, 'height': scene.render.resolution_y,
                   'pixelAspectX': scene.render.pixel_aspect_x, 'pixelAspectY': scene.render.pixel_aspect_y,
                   'resolutionPercentage': scene.render.resolution_percentage},
        'colorManagement': {'viewTransform': scene.view_settings.view_transform,
                            'look': scene.view_settings.look, 'exposure': scene.view_settings.exposure,
                            'gamma': scene.view_settings.gamma},
        'engine': scene.render.engine, 'cameraName': scene.camera.name,
        'markers': [{'name': marker.name, 'frame': marker.frame} for marker in scene.timeline_markers],
        'objects': [], 'materials': [], 'images': [], 'geometry': [],
        'cameras': [], 'visibility': {}, 'morphs': {}, 'materialParameterTracks': [],
        'effectProgressFrames': [], 'renders': preserved_renders,
        'ablations': preserved_ablations, 'errors': errors,
    }
    for obj in objects.values():
        report['objects'].append({'name': obj.name, 'type': obj.type,
                                  'parent': obj.parent.name if obj.parent else None,
                                  'matrixAtStart': matrix(obj.evaluated_get(graph).matrix_world),
                                  'materials': [material.name if material else None
                                                for material in getattr(obj.data, 'materials', [])],
                                  'animation': animation(obj),
                                  'dataAnimation': animation(obj.data) if obj.data else None,
                                  'modifiers': [{'name': modifier.name, 'type': modifier.type,
                                                 'render': modifier.show_render}
                                                for modifier in obj.modifiers]})
    for image in bpy.data.images:
        raw, origin, recovered = raw_image(image, image_index)
        report['images'].append({'name': image.name, 'sourceType': image.source,
                                 'sourceSize': list(image.size), 'origin': origin,
                                 'sourceSha256': hashlib.sha256(raw).hexdigest() if raw else None,
                                 'id': hashlib.sha1(raw).hexdigest()[:16] if raw else None,
                                 'bytes': len(raw) if raw else None})
        if recovered and origin == 'recovered-exact-file':
            image.filepath = str(recovered)
            image.reload()
    parameter_holders = []
    for material in bpy.data.materials:
        report['materials'].append({'name': material.name, 'graph': node_graph(material.node_tree),
                                    'diffuseColor': list(material.diffuse_color),
                                    'surfaceRenderMethod': getattr(material, 'surface_render_method', None)})
        driver_curves = (list(material.node_tree.animation_data.drivers)
                         if material.node_tree and material.node_tree.animation_data else [])
        parameter_curves = {(curve.data_path, curve.array_index): curve
                            for curve in curves(material.node_tree) + driver_curves}
        for curve in parameter_curves.values():
            track = {'material': material.name, 'path': curve.data_path,
                     'index': curve.array_index, 'samples': []}
            report['materialParameterTracks'].append(track)
            parameter_holders.append((material.node_tree, curve, track))
    report['worldGraph'] = node_graph(scene.world.node_tree) if scene.world else None
    compositor = getattr(scene, 'compositing_node_group', None) or getattr(scene, 'node_tree', None)
    report['compositorGraph'] = node_graph(compositor)
    report['lights'] = []
    for obj in objects.values():
        if obj.type != 'LIGHT':
            continue
        record = {'name': obj.name, 'type': obj.data.type, 'color': list(obj.data.color),
                  'energy': obj.data.energy, 'matrix': matrix(obj.matrix_world),
                  'animation': animation(obj), 'dataAnimation': animation(obj.data)}
        for attribute in ('angle', 'size', 'size_y', 'shape', 'shadow_soft_size',
                          'normalize', 'use_shadow', 'diffuse_factor', 'specular_factor',
                          'volume_factor', 'spread'):
            if hasattr(obj.data, attribute):
                record[attribute] = numbers(getattr(obj.data, attribute))
        report['lights'].append(record)
    web_meshes = {mesh['name']: mesh for mesh in web['meshes']} if web else {}
    web_cameras = {camera['frame']: camera for camera in web['cameras']} if web else {}
    web_animation = {}
    object_tracks = {}
    if web:
        for name, track in web.get('animations', {}).items():
            object_tracks[name] = []
            for key in track:
                frame = key.get('frame', round(start + key['progress'] * (end - start)))
                web_animation.setdefault(frame, []).append((name, key['matrix']))
                object_tracks[name].append((frame, key['matrix']))
    coordinate_objects = {}

    def find_coordinate_objects(tree):
        if tree is None:
            return
        for node in tree.nodes:
            if node.type == 'TEX_COORD' and node.object:
                coordinate_objects[node.object.name] = node.object
            if getattr(node, 'node_tree', None):
                find_coordinate_objects(node.node_tree)

    for material in bpy.data.materials:
        find_coordinate_objects(material.node_tree)
    report['coordinateObjectInverseMatrices'] = {name: [] for name in coordinate_objects}
    shape_objects = {name: obj for name, obj in candidates.items()
                     if obj.type == 'MESH' and obj.data.shape_keys and len(obj.data.shape_keys.key_blocks) > 1}
    web_morph_tracks = {name: [(key['frame'], key['weights']) for key in mesh.get('morphWeights', [])]
                        for name, mesh in web_meshes.items()}
    for name, obj in shape_objects.items():
        keys = obj.data.shape_keys.key_blocks
        report['morphs'][name] = {'relative': obj.data.shape_keys.use_relative,
                                 'names': [key.name for key in keys][1:],
                                 'relativeKeys': [key.relative_key.name for key in keys][1:],
                                 'animation': animation(obj.data.shape_keys),
                                 'weights': [], 'evaluatedFrames': []}
    first_visible = {}
    tracks = {name: [] for name in candidates}
    effect_nearest = {}
    animation_checks = camera_checks = morph_weight_checks = 0
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        graph = bpy.context.evaluated_depsgraph_get()
        camera = camera_sample(scene, graph, frame)
        report['cameras'].append(camera)
        if web:
            expected = web_cameras.get(frame)
            if expected is None:
                errors.append(f'Missing exact integer-frame camera sample: {frame}')
            else:
                for field in ('position', 'quaternion', 'shift'):
                    compare_values(camera[field], expected[field], f'camera {field} frame {frame}', errors)
                compare_values([camera['fov'], camera['lens'], camera['orthoScale']],
                               [expected['fov'], expected['lens'], expected['orthoScale']],
                               f'camera projection frame {frame}', errors)
                if camera['type'] != expected['type']:
                    errors.append(f'Camera projection type differs at frame {frame}')
                expected_dof = expected.get('dof')
                if not expected_dof:
                    errors.append(f'Camera depth-of-field parameters missing at frame {frame}')
                else:
                    for field in ('enabled', 'focusObject'):
                        if expected_dof.get(field) != camera['dof'][field]:
                            errors.append(f'Camera DOF {field} differs at frame {frame}')
                    compare_values([camera['dof'][field] for field in
                                    ('focusDistance', 'fstop', 'blades', 'rotation', 'ratio')],
                                   [expected_dof[field] for field in
                                    ('focusDistance', 'fstop', 'blades', 'rotation', 'ratio')],
                                   f'camera evaluated DOF frame {frame}', errors)
                camera_checks += 1
        for name, obj in candidates.items():
            visible = not obj.hide_render
            if not tracks[name] or tracks[name][-1]['visible'] != visible:
                tracks[name].append({'frame': frame, 'visible': visible})
            if visible:
                first_visible.setdefault(name, frame)
        for name, obj in coordinate_objects.items():
            report['coordinateObjectInverseMatrices'][name].append(
                matrix(obj.evaluated_get(graph).matrix_world.inverted()))
        if web:
            # Check every source integer frame even when the export removed a
            # redundant hold. This also detects omitted parent-driven motion.
            for name, mesh in web_meshes.items():
                if name not in objects:
                    continue
                expected = mesh['matrix']
                track = object_tracks.get(name)
                if track:
                    index = bisect.bisect_left(track, (frame,))
                    if index < len(track) and track[index][0] == frame:
                        expected = track[index][1]
                    elif index == 0:
                        expected = track[0][1]
                    elif index == len(track):
                        expected = track[-1][1]
                    elif track[index - 1][1] == track[index][1]:
                        expected = track[index][1]
                    else:
                        errors.append(f'Non-hold object frame omitted: {name} frame {frame}')
                        continue
                compare_values(matrix(objects[name].evaluated_get(graph).matrix_world), expected,
                               f'object matrix {name} frame {frame}', errors)
                animation_checks += 1
        for name, obj in shape_objects.items():
            weights = [float(key.value) for key in obj.data.shape_keys.key_blocks][1:]
            report['morphs'][name]['weights'].append(weights)
            if web and name in web_meshes:
                track = web_morph_tracks[name]
                index = bisect.bisect_left(track, (frame,))
                expected_weights = None
                if index < len(track) and track[index][0] == frame:
                    expected_weights = track[index][1]
                elif 0 < index < len(track) and track[index - 1][1] == track[index][1]:
                    expected_weights = track[index][1]
                if expected_weights is None:
                    errors.append(f'Non-hold morph weights omitted: {name} frame {frame}')
                else:
                    compare_values(weights, expected_weights, f'morph weights {name} frame {frame}', errors)
                    morph_weight_checks += 1
        for holder, curve, track in parameter_holders:
            value = holder.path_resolve(curve.data_path)
            value = float(value[curve.array_index]) if hasattr(value, '__iter__') else float(value)
            track['samples'].append(value)
            if any(word in curve.data_path for word in ('特效进度', '选择性出场', '灰度溶解')):
                for target in (0.1, 0.5, 0.9):
                    identity = (track['material'], track['path'], target)
                    distance = abs(value - target)
                    if identity not in effect_nearest or distance < effect_nearest[identity]['distance']:
                        effect_nearest[identity] = {'material': track['material'], 'path': track['path'],
                                                    'target': target, 'frame': frame,
                                                    'actual': value, 'distance': distance}
    report['visibility'] = tracks
    report['effectProgressFrames'] = list(effect_nearest.values())
    selected_frames = set(RENDER_FRAMES[chapter])
    selected_frames.update(row['frame'] for row in effect_nearest.values()
                           if row['distance'] < 0.12)
    source_geometry_names = set()
    geometry_checks = morph_geometry_checks = 0
    for name, obj in sorted(candidates.items()):
        if name not in first_visible:
            continue
        scene.frame_set(first_visible[name])
        graph = bpy.context.evaluated_depsgraph_get()
        geometry = expanded_geometry(obj, graph)
        if not geometry or not geometry['polygons']:
            continue
        source_geometry_names.add(name)
        report['geometry'].append({'name': name, 'firstVisibleFrame': first_visible[name], **geometry})
        if not web:
            continue
        if name not in web_meshes:
            errors.append('Visible source geometry absent from web: ' + name)
            continue
        expected = web_meshes[name]
        if name not in shape_objects:
            compare_values(geometry['positions'], expand_web(expected, 'positions', 3),
                           'triangle positions ' + name, errors)
        compare_values(geometry['uvs'], expand_web(expected, 'uvs', 2), 'triangle UVs ' + name, errors)
        geometry_checks += 1
    for name, obj in shape_objects.items():
        if name not in source_geometry_names:
            continue
        keys = obj.data.shape_keys.key_blocks
        # A raw Basis/relative-key expansion is independent of the exporter.
        raw = obj.data
        raw.calc_loop_triangles()
        source_vertices = [vertex_index for triangle in raw.loop_triangles for vertex_index in triangle.vertices]
        basis = [value for vertex_index in source_vertices for value in keys[0].data[vertex_index].co]
        record = report['morphs'][name]
        record['basisTrianglePositions'] = basis
        record['targetTriangleDeltas'] = []
        for key in list(keys)[1:]:
            delta = [value for vertex_index in source_vertices
                     for value in key.data[vertex_index].co - key.relative_key.data[vertex_index].co]
            record['targetTriangleDeltas'].append(delta)
        if web and name in web_meshes:
            mesh = web_meshes[name]
            compare_values(basis, expand_web(mesh, 'positions', 3), 'morph Basis ' + name, errors)
            targets = mesh.get('morphTargets', [])
            if [target['name'] for target in targets] != record['names'] or not mesh.get('morphTargetsRelative'):
                errors.append('Relative shape-key names/semantics differ: ' + name)
            else:
                for i, target in enumerate(targets):
                    pseudo = {'positions': target['positions'], 'indices': mesh.get('indices')}
                    if pseudo['indices'] is None:
                        pseudo.pop('indices')
                    compare_values(record['targetTriangleDeltas'][i], expand_web(pseudo, 'positions', 3),
                                   f'morph delta {name}/{target["name"]}', errors)
        frames = selected_frames | {start, end, first_visible[name]}
        for curve in curves(obj.data.shape_keys):
            frames.update(round(point.co[0]) for point in curve.keyframe_points)
        for frame in sorted(frames):
            if not start <= frame <= end:
                continue
            scene.frame_set(frame)
            evaluated = expanded_geometry(obj, bpy.context.evaluated_depsgraph_get())
            if not evaluated:
                continue
            weights = record['weights'][frame - start]
            reconstructed = [value + sum(delta[axis] * weight
                                          for delta, weight in zip(record['targetTriangleDeltas'], weights))
                             for axis, value in enumerate(basis)]
            compare_values(evaluated['positions'], reconstructed,
                           f'Blender evaluated relative shape {name} frame {frame}', errors)
            record['evaluatedFrames'].append({'frame': frame,
                                              'positions': evaluated['positions'], 'weights': weights})
            morph_geometry_checks += 1
    used_materials = {material.name for name in source_geometry_names
                      for material in getattr(objects[name].data, 'materials', []) if material}
    used_image_names = set()

    def collect_images(tree):
        if not tree:
            return
        for node in tree.nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                used_image_names.add(node.image.name)
            if getattr(node, 'node_tree', None):
                collect_images(node.node_tree)

    for material in bpy.data.materials:
        if material.name in used_materials:
            collect_images(material.node_tree)
    used_original_hashes = {image['sourceSha256'] for image in report['images']
                            if image['name'] in used_image_names and image['sourceSha256']}
    report['sourceImageUsage'] = {
        'usedImageDatablocks': sorted(used_image_names),
        'usedUniqueOriginalImageCount': len(used_original_hashes),
        'usedOriginalSha256': sorted(used_original_hashes),
        'unusedDatablocks': [image['name'] for image in report['images']
                            if image['name'] not in used_image_names],
    }
    if web:
        if web.get('sourceRevision') != 'peony-2.0-2026-10-23':
            errors.append('Wrong source revision')
        if web.get('sourceSha256') != source_digest:
            errors.append('Manifest source SHA does not match the supplied original')
        if web['frameRange'] != [start, end]:
            errors.append('Source frame range differs')
        if web.get('fps') != scene.render.fps or web.get('fpsBase', 1) != scene.render.fps_base:
            errors.append('Source frame rate differs')
        compare_values([scene.camera.data.clip_start, scene.camera.data.clip_end],
                       [web['camera']['near'], web['camera']['far']], 'Source near/far clip planes', errors)
        if abs(web.get('sourceDurationSeconds', -1) - report['sourceDurationSeconds']) > 1e-6:
            errors.append('Source first-frame to final-frame duration differs')
        if set(web_meshes) != source_geometry_names:
            errors.append('Web geometry set is not exactly the visible source geometry set')
        if [(marker['name'], marker['frame']) for marker in web['markers']] != [
                (marker.name, marker.frame) for marker in scene.timeline_markers]:
            errors.append('Authored markers differ')
        for name in source_geometry_names:
            expected = [{'frame': key['frame'], 'visible': key['visible']}
                        for key in web.get('visibility', {}).get(name, [])]
            if expected != tracks[name]:
                errors.append('All-integer-frame visibility differs: ' + name)
        scene.frame_set(start)
        graph = bpy.context.evaluated_depsgraph_get()
        for name in source_geometry_names & set(web_meshes):
            compare_values(matrix(objects[name].evaluated_get(graph).matrix_world), web_meshes[name]['matrix'],
                           'base world matrix ' + name, errors)
        web_images = {image.get('sourceSha256') for image in web['images']}
        if used_original_hashes != web_images:
            errors.append('Used source raw image SHA sets differ in one or both directions')
    if len(used_original_hashes) != EXPECTED_RAW_IMAGE_COUNTS[chapter]:
        errors.append('Unexpected number of independent images used by visible source geometry')
    if len(source_geometry_names) != EXPECTED_OBJECT_COUNTS[chapter]:
        errors.append('Unexpected number of renderable source objects')
    report['counts'] = {'objects': len(objects), 'exportableGeometry': len(source_geometry_names),
                        'imageDatablocks': len(report['images']),
                        'uniqueOriginalImageBytes': len({image['sourceSha256'] for image in report['images']
                                                         if image['sourceSha256']}),
                        'usedUniqueOriginalImageBytes': len(used_original_hashes),
                        'integerVisibilityFrames': end - start + 1,
                        'exactCameraSamplesCompared': camera_checks,
                        'objectMatrixSamplesCompared': animation_checks,
                        'geometryObjectsCompared': geometry_checks,
                        'morphObjects': sum(name in source_geometry_names for name in shape_objects),
                        'integerMorphWeightSamplesCompared': morph_weight_checks,
                        'blenderEvaluatedMorphGeometryChecks': morph_geometry_checks}
    if args.render_keyframes:
        report['renders'] = render_frames(scene, chapter, source_digest, selected_frames,
                                          args.output_dir, args.render_scale)
    if args.render_ablations:
        additional = render_ablations(scene, chapter, source_digest,
                                      args.output_dir, args.render_scale, args.ablation_features)
        features = {row['featureDisabled'] for row in additional}
        report['ablations'] = [row for row in report['ablations'] if row['featureDisabled'] not in features] + additional
    report['sourceUnchanged'] = source_digest == sha(source)
    if not report['sourceUnchanged']:
        errors.append('Source bytes changed during read-only inspection')
    report['manifestSha256'] = sha(manifest_path) if web else None
    report['status'] = 'captured' if args.capture_only and not errors else 'pass' if not errors else 'fail'
    report['scope'] = ('Fresh Blender source reopen; all integer-frame cameras/visibility/morph weights, '
                       'every exported matrix sample, independently triangulated geometry/UV/relative shapes, '
                       'symmetric raw image provenance, original shader graphs/parameter traces. '
                       'Native renders retain authored lighting/DOF/compositing. Browser pixel acceptance is separate.')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path,
                        default=os.environ.get('MDGS_PEONY2_SOURCE_ROOT'))
    parser.add_argument('--image-root', action='append', type=Path, default=[])
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'reports/peony2-fidelity')
    parser.add_argument('--chapters', nargs='+', type=int, choices=[1, 2, 3, 4], default=[1, 2, 3, 4])
    parser.add_argument('--capture-only', action='store_true')
    parser.add_argument('--render-keyframes', action='store_true')
    parser.add_argument('--render-ablations', action='store_true')
    parser.add_argument('--ablation-features', nargs='+', choices=[
        'source-light-objects', 'source-light-shadows', 'world-background-strength',
        'depth-of-field', 'compositing'])
    parser.add_argument('--render-scale', type=int, choices=range(1, 101), default=50)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if not args.source_root:
        parser.error('--source-root or MDGS_PEONY2_SOURCE_ROOT is required')
    args.source_root = Path(args.source_root).resolve()
    args.output_dir = args.output_dir.resolve()
    image_index = {}
    for directory in args.image_root:
        for path in directory.rglob('*'):
            if path.is_file():
                image_index.setdefault(path.name.casefold(), []).append(path)
    report = {'status': 'running', 'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'mode': 'capture-only' if args.capture_only else 'independent-source-verification',
              'chapters': [], 'errors': []}
    target = args.output_dir / ('native-capture.json' if args.capture_only else 'validation-native.json')
    write(target, report)
    try:
        for chapter in args.chapters:
            item = inspect(chapter, args, image_index)
            suffix = 'capture' if args.capture_only else 'native'
            chapter_file = args.output_dir / f'chapter-{chapter}-{suffix}.json'
            write(chapter_file, item, compact=True)
            report['chapters'].append({'chapter': chapter, 'status': item['status'],
                                        'sourceSha256': item['sourceSha256'],
                                        'manifestSha256': item['manifestSha256'],
                                        'counts': item['counts'], 'errors': item['errors'],
                                        'evidence': chapter_file.relative_to(ROOT).as_posix()
                                        if chapter_file.is_relative_to(ROOT) else str(chapter_file),
                                        'evidenceSha256': sha(chapter_file), 'renders': item['renders'],
                                        'ablations': item.get('ablations', [])})
            write(target, report)
            print(json.dumps({'chapter': chapter, 'status': item['status'],
                              'counts': item['counts'], 'renders': len(item['renders']),
                              'ablations': len(item.get('ablations', [])),
                              'errors': item['errors'][:10]}, ensure_ascii=True), flush=True)
        report['status'] = ('fail' if any(item['status'] == 'fail' for item in report['chapters'])
                            else 'captured' if args.capture_only else 'pass')
    except Exception as error:
        report['status'] = 'fail'
        report['errors'].append(repr(error))
        raise
    finally:
        report['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        write(target, report)
    if report['status'] == 'fail':
        raise RuntimeError('Peony 2.0 native verification failed; inspect ' + str(target))


if __name__ == '__main__':
    main()

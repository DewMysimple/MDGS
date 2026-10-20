"""Create a verified, self-contained Blender reconstruction copy.

Run with Blender --background --factory-startup --disable-autoexec --python
scripts/reconstruct-blender.py -- --source-config <JSON> --manifest <JSON>
--chapter 1 [--output-dir artwork/blender-reconstructed]
[--report-dir reports/reconstruction].

CLI paths are relative to the project root. Source file mappings are relative
to their configuration file. Original .blend files are never saved.
"""
import argparse
import hashlib
import json
import math
import os
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import image_index, resolve_image

ROLES = ('主体叙事层', '前景遮挡层', '中景承接层', '后景连续层',
         '留白层', '连接过渡层', '动效层', '装饰层')


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def resolve_path(value, base=ROOT):
    path = Path(value)
    return (path if path.is_absolute() else base / path).resolve()


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def relative_path(path):
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def load_sources(config):
    values = read_json(config)
    if not isinstance(values, dict) or not values:
        raise ValueError('Source config must map chapter-N keys to original .blend files.')
    sources = {key: resolve_path(value, config.parent) for key, value in values.items()}
    for key, path in sources.items():
        if not path.is_file() or path.suffix.casefold() != '.blend':
            raise FileNotFoundError(f'Original Blender source is missing for {key}: {path}')
    return sources


def validate_output_path(output, sources):
    """Reject overwriting originals, including through symlinks or source folders."""
    destination = output.resolve()
    for source in sources.values():
        original = source.resolve()
        if destination == original or original.parent in destination.parents:
            raise ValueError('Reconstruction output must be outside the original source directory: ' + str(destination))
    if (ROOT / 'source').resolve() in destination.parents:
        raise ValueError('Reconstruction copies must be written outside the project source tree.')
    return destination


def validate_delivery_paths(output, report_dir, chapter, sources, manifest_path, protected_inputs=()):
    """Allow rerunning one delivery, but never overwrite a different art pass."""
    output = validate_output_path(output, sources)
    report_dir = resolve_path(report_dir)
    if report_dir.exists() and not report_dir.is_dir():
        raise ValueError('Reconstruction report directory is not a directory: ' + str(report_dir))
    reports = {
        'saved': report_dir / f'blender-reconstruction-chapter-{chapter}.json',
        'dry_run': report_dir / f'blender-dry-run-chapter-{chapter}.json',
    }
    protected = {resolve_path(value) for value in protected_inputs}
    protected.add(resolve_path(manifest_path))
    for report in reports.values():
        validate_output_path(report, sources)
        if report.resolve() in protected:
            raise ValueError('Reconstruction evidence cannot overwrite an input file: ' + str(report))
        if not report.exists():
            continue
        previous = read_json(report)
        if (not isinstance(previous, dict) or not previous.get('manifest') or not previous.get('output')
                or resolve_path(previous['manifest']) != resolve_path(manifest_path)
                or resolve_path(previous['output']) != output):
            raise ValueError('Existing reconstruction evidence belongs to another delivery; '
                             'choose a separate --report-dir and --output-dir: ' + str(report))
    if output.exists() and not reports['saved'].is_file():
        raise ValueError('Existing reconstruction output has no matching delivery evidence; '
                         'choose another --output-dir: ' + str(output))
    return {'output': output, 'report_dir': report_dir, **reports}


def matrix(value):
    return [round(float(value[row][column]), 7)
            for column in range(4) for row in range(4)]


def original_scene_snapshot(bpy, names=None, collection_names=None):
    # A viewport-disabled FONT can retain an identity matrix cache on reopen.
    # Briefly evaluate retired prose for auditing, then restore its saved flag.
    hidden = [obj for obj in bpy.context.scene.objects if obj.get('blender_text_retired') and obj.hide_viewport]
    for obj in hidden:
        obj.hide_viewport = False
    bpy.context.view_layer.update()
    try:
        return _original_scene_snapshot(bpy, names, collection_names)
    finally:
        for obj in hidden:
            obj.hide_viewport = True


def _original_scene_snapshot(bpy, names=None, collection_names=None):
    """Capture authored transforms, parent links, Collection links and cameras."""
    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    names = set(names) if names is not None else {obj.name for obj in scene.objects}
    collection_names = set(collection_names) if collection_names is not None else {c.name for c in bpy.data.collections}
    objects = {}
    for name in sorted(names):
        obj = scene.objects.get(name)
        if not obj:
            raise AssertionError('Original object missing from reconstruction: ' + name)
        objects[name] = {
            'type': obj.type, 'parent': obj.parent.name if obj.parent else None,
            'hiddenRender': obj.hide_render,
            'matrixWorldAtStart': matrix(obj.matrix_world),
            'originalCollections': sorted(c.name for c in obj.users_collection if c.name in collection_names),
            'animationAction': getattr(getattr(obj.animation_data, 'action', None), 'name', None),
        }
    markers = sorted([{'name': marker.name, 'frame': marker.frame,
                       'camera': marker.camera.name if marker.camera else None}
                      for marker in scene.timeline_markers], key=lambda marker: (marker['frame'], marker['name']))
    frames = sorted({scene.frame_start, scene.frame_end, *[marker['frame'] for marker in markers]})
    cameras = {}
    animated_objects = {}
    for frame in frames:
        scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for name in sorted(names):
            obj = scene.objects[name]
            if obj.animation_data and obj.type != 'CAMERA':
                evaluated = obj.evaluated_get(depsgraph)
                animated_objects.setdefault(name, []).append({'frame': frame, 'matrixWorld': matrix(evaluated.matrix_world)})
            if obj.type != 'CAMERA':
                continue
            evaluated = obj.evaluated_get(depsgraph)
            cameras.setdefault(name, []).append({
                'frame': frame, 'matrixWorld': matrix(evaluated.matrix_world),
                'type': evaluated.data.type, 'lens': round(evaluated.data.lens, 7),
                'orthoScale': round(evaluated.data.ortho_scale, 7),
                'shift': [round(evaluated.data.shift_x, 7), round(evaluated.data.shift_y, 7)],
                'sensorFit': evaluated.data.sensor_fit,
            })
    scene.frame_set(scene.frame_start)
    return {'frameRange': [scene.frame_start, scene.frame_end],
            'fps': scene.render.fps, 'activeCamera': scene.camera.name if scene.camera else None,
            'render': [scene.render.resolution_x, scene.render.resolution_y],
            'objects': objects, 'cameras': cameras, 'markers': markers,
            'animatedObjectSamples': animated_objects,
            'rootCollections': sorted(c.name for c in scene.collection.children if c.name in collection_names),
            'collectionHierarchy': {c.name: sorted(child.name for child in c.children if child.name in collection_names)
                                    for c in bpy.data.collections if c.name in collection_names},
            'collectionNames': sorted(collection_names)}


def assert_original_scene_unchanged(bpy, baseline, allowed_hidden=()):
    current = original_scene_snapshot(bpy, baseline['objects'], baseline['collectionNames'])
    for name in allowed_hidden:
        if name not in baseline['objects'] or not current['objects'][name]['hiddenRender']:
            raise AssertionError('Declared render-hide exception was not applied: ' + name)
        current['objects'][name]['hiddenRender'] = baseline['objects'][name]['hiddenRender']
    if current != baseline:
        differing = [key for key in baseline if baseline[key] != current[key]]
        raise AssertionError('Original scene invariants changed: ' + ', '.join(differing))
    return current


def create_role_collections(bpy, chapter):
    root_name = f'RECON_CH{chapter:02d}_角色图层'
    if bpy.data.collections.get(root_name):
        raise ValueError('Selected source already contains a reconstruction Collection: ' + root_name)
    root = bpy.data.collections.new(root_name)
    bpy.context.scene.collection.children.link(root)
    roles = {}
    for index, role in enumerate(ROLES, start=1):
        collection = bpy.data.collections.new(f'CH{chapter:02d}_{index:02d}_{role}')
        root.children.link(collection)
        roles[role] = collection
    return roles


def annotate_original_objects(bpy, chapter, inventory, roles, motion_roles):
    layers = {entry['name']: entry for entry in inventory['meshes'] if entry['chapter'] == chapter}
    annotated = []
    for obj in bpy.context.scene.objects:
        layer = layers.get(obj.name)
        stable = layer['id'] if layer else f'c{chapter}-source-' + hashlib.sha256(obj.name.encode('utf-8')).hexdigest()[:12]
        obj['stable_id'] = stable
        obj['original_name'] = obj.name
        obj['narrative'] = layer['narrativeMatch']['basis'] if layer else '保留原作者相机、焦点、路径或辅助结构'
        obj['treatment'] = layer['treatment'] if layer else '保留'
        obj['motion_role'] = motion_roles.get(obj.name, 'source-animation' if obj.animation_data and obj.type == 'MESH' else 'static')
        if layer:
            role = layer['type']
            if role not in roles:
                raise ValueError('Unsupported inventory role for ' + obj.name + ': ' + role)
            roles[role].objects.link(obj)
            if obj['motion_role'] != 'static' and role != '动效层':
                roles['动效层'].objects.link(obj)
            obj['layer_role'] = role
        annotated.append(stable)
    if len(annotated) != len(set(annotated)):
        raise ValueError('Stable object IDs must be unique.')
    return len(annotated)


def relink_and_pack_used_images(bpy, materials_root, explicit_paths=None):
    """Touch image paths only in the in-memory reconstruction; pack used images."""
    index = image_index(materials_root)
    used = {}
    for obj in bpy.context.scene.objects:
        if obj.hide_render or not getattr(obj.data, 'materials', None):
            continue
        for material in obj.data.materials:
            if not material or not material.use_nodes or not material.node_tree:
                continue
            for node in material.node_tree.nodes:
                if node.type == 'TEX_IMAGE' and node.image:
                    used[node.image.name] = node.image
    linked = []
    for name, image in sorted(used.items()):
        if image.source != 'FILE':
            continue
        was_packed = bool(image.packed_file)
        candidate = None
        if not was_packed:
            candidate = resolve_image(bpy.path.abspath(image.filepath), image.name, index, explicit_paths=explicit_paths)
            if not candidate:
                raise FileNotFoundError('Cannot create a self-contained reconstruction; missing image: ' + image.name)
            image.filepath = str(candidate)
            image.reload()
            image.pack()
        if not image.packed_file:
            raise AssertionError('Used image was not packed: ' + name)
        linked.append({'name': name, 'alreadyPacked': was_packed,
                       'resolved': relative_path(candidate) if candidate else None,
                       'packedSha256': hashlib.sha256(bytes(image.packed_file.data)).hexdigest()})
    return linked


def load_revision(manifest_path, chapter):
    manifest = read_json(manifest_path)
    if manifest.get('schemaVersion') != 1:
        raise ValueError('Unsupported reconstruction manifest schema.')
    if chapter not in manifest.get('activeChapters', []):
        raise ValueError(f'Chapter {chapter} is not active in the reconstruction manifest.')
    revision = manifest['chapters'][str(chapter)]
    validate_world_paper(revision.get('worldPaper'))
    ids = []
    resources = []
    for kind in ('replacements', 'edgeRepairs', 'addedLayers', 'geometryRepairs', 'layoutAdjustments'):
        for entry in revision.get(kind, []):
            ids.append(entry['id'])
            if entry['role'] not in ROLES:
                raise ValueError('Unknown layer role: ' + entry['role'])
            if not entry.get('narrative'):
                raise ValueError('Every revision needs narrative ownership: ' + entry['id'])
            if kind in ('replacements', 'addedLayers'):
                for field in ('asset', 'productionPng'):
                    value = entry[field]
                    path = resolve_path(value, ROOT / 'public' if field == 'asset' else ROOT)
                    if not path.is_file():
                        raise FileNotFoundError(f"Reconstruction is incomplete; {entry['id']} {field} missing: {path}")
                    resources.append({'id': entry['id'], 'field': field,
                                      'path': relative_path(path), 'sha256': sha256(path)})
            if kind == 'replacements':
                if any(not isinstance(entry.get(key, 1), (int, float)) or entry.get(key, 1) <= 0
                       for key in ('contentAspect', 'sourceAspect', 'paddingScale', 'paddingScaleX', 'paddingScaleY')):
                    raise ValueError('Replacement aspect and padding values must be positive: ' + entry['id'])
                policy = entry.get('geometryPolicy', 'full-uv-affine')
                if policy not in ('full-uv-affine', 'preserve-region', 'explicit-corners'):
                    raise ValueError('Unsupported replacement geometry policy: ' + entry['id'])
                if policy == 'preserve-region':
                    validate_uv_rect(entry.get('uvInsetRect'), 'preserve-region uvInsetRect: ' + entry['id'])
                elif policy == 'explicit-corners':
                    padded_explicit_corners(entry)
                if 'meshNames' in entry and (not isinstance(entry['meshNames'], list) or not entry['meshNames']
                                            or len(entry['meshNames']) != len(set(entry['meshNames']))):
                    raise ValueError('Replacement meshNames must explicitly list unique target meshes: ' + entry['id'])
            elif kind == 'edgeRepairs':
                if not entry.get('meshNames') or any(not 0 <= value <= .5 for value in entry['fades'].values()):
                    raise ValueError('Edge repair needs target meshes and UV fades in [0,.5]: ' + entry['id'])
                if 'uvRect' in entry:
                    validate_uv_rect(entry['uvRect'], 'Edge uvRect: ' + entry['id'])
            elif kind == 'geometryRepairs':
                if not entry.get('meshNames') or entry.get('geometryPolicy') != 'full-uv-affine':
                    raise ValueError('Geometry repair requires explicit meshNames and full-uv-affine policy: ' + entry['id'])
            elif kind == 'layoutAdjustments':
                validate_layout_adjustment(entry)
            else:
                if len(entry['matrix']) != 16 or any(not math.isfinite(value) for value in entry['matrix']):
                    raise ValueError('Added layer requires a finite column-major 4x4 matrix: ' + entry['id'])
                if not 0 <= entry.get('opacity', 1) <= 1:
                    raise ValueError('Layer opacity must be in [0,1]: ' + entry['id'])
                if 'uvRect' in entry and (len(entry['uvRect']) != 4 or any(not 0 <= value <= 1 for value in entry['uvRect'])
                                         or entry['uvRect'][0] >= entry['uvRect'][2] or entry['uvRect'][1] >= entry['uvRect'][3]):
                    raise ValueError('Layer uvRect must be a positive normalized rectangle: ' + entry['id'])
    for entry in revision.get('textLayers', []):
        ids.append(entry['id'])
        if len(entry['matrix']) != 16 or any(not math.isfinite(value) for value in entry['matrix']):
            raise ValueError('Text layer requires a finite column-major 4x4 matrix: ' + entry['id'])
        if (not entry.get('title') or not entry.get('narrative') or not isinstance(entry.get('lines'), list)
                or (not entry['lines'] and entry.get('variant') != 'seal')
                or not all(isinstance(line, str) for line in entry['lines'])):
            raise ValueError('Text layer requires editable title, lines and narrative: ' + entry['id'])
        if 'layout' in entry and entry['layout'] != 'vertical':
            raise ValueError('Explicit text layout must be vertical: ' + entry['id'])
        if entry.get('layout') == 'vertical':
            vertical_text_parts(entry)
        if 'range' in entry:
            start, end = entry['range'] if isinstance(entry['range'], (list, tuple)) and len(entry['range']) == 2 else (None, None)
            if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in (start, end)) or not 0 <= start < end <= 1:
                raise ValueError('Text range requires increasing normalized progress: ' + entry['id'])
        if 'fade' in entry and (not isinstance(entry['fade'], (int, float)) or not math.isfinite(entry['fade']) or not 0 <= entry['fade'] <= .5):
            raise ValueError('Text fade requires a normalized progress width in [0,.5]: ' + entry['id'])
        if 'seal' in entry and (not isinstance(entry['seal'], str) or not 1 <= len(entry['seal']) <= 4):
            raise ValueError('Text seal requires one to four editable characters: ' + entry['id'])
    hidden_text = revision.get('hiddenBlenderTextNames', [])
    if not isinstance(hidden_text, list) or any(not isinstance(name, str) or not name for name in hidden_text) or len(hidden_text) != len(set(hidden_text)):
        raise ValueError('hiddenBlenderTextNames must explicitly list unique original FONT object names.')
    if len(ids) != len(set(ids)):
        raise ValueError('Revision IDs must be unique within a chapter.')
    return manifest, revision, resources


def validate_layout_adjustment(entry):
    names, values = entry.get('meshNames'), entry.get('worldMatrix')
    if not isinstance(names, list) or not names or any(not isinstance(name, str) or not name for name in names) or len(names) != len(set(names)):
        raise ValueError('Layout adjustment requires unique explicit meshNames: ' + entry['id'])
    if (not isinstance(values, (list, tuple)) or len(values) != 16
            or any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in values)
            or any(abs(values[index] - expected) > 1e-9 for index, expected in ((3, 0), (7, 0), (11, 0), (15, 1)))):
        raise ValueError('Layout worldMatrix must be a finite column-major affine delta: ' + entry['id'])
    a, b, c, d, e, f, g, h, i = (values[index] for index in (0, 4, 8, 1, 5, 9, 2, 6, 10))
    if abs(a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)) < 1e-10:
        raise ValueError('Layout worldMatrix cannot collapse painting geometry: ' + entry['id'])
    return values


def validate_export_targets(revision, exported):
    """Catch object-name/image-name confusion before opening the real .blend."""
    images = {item['src']: item for item in exported.get('images', [])}
    meshes = {item['name']: item for item in exported.get('meshes', []) if not item.get('isText')}
    fonts = {item['name'] for item in exported.get('textObjects', [])}
    for entry in revision.get('replacements', []):
        image = images.get(entry.get('sourceTexture'))
        if not image or image.get('sourceName') != entry.get('sourceName'):
            expected = image.get('sourceName') if image else None
            raise ValueError(f"Replacement sourceName must name the exported image datablock, not its object: {entry['id']} expected={expected!r} actual={entry.get('sourceName')!r}")
    for entry in revision.get('layoutAdjustments', []):
        missing = set(entry['meshNames']) - meshes.keys()
        if missing:
            raise ValueError('Layout targets must be exported original painted meshes: ' + ', '.join(sorted(missing)))
    missing_fonts = set(revision.get('hiddenBlenderTextNames', [])) - fonts
    if missing_fonts:
        raise ValueError('Retired Blender text must name exported original FONT: ' + ', '.join(sorted(missing_fonts)))


def reading_route(source, chapter):
    """Match prepareScene spatial reparameterization, including film holds."""
    first = source['stops'][0]['progress'] if source['stops'] else 0
    end_frame = {1: 13474, 2: 5521}.get(chapter)
    end = ((end_frame - source['frameRange'][0]) / (source['frameRange'][1] - source['frameRange'][0])
           if end_frame else min(1, (source['stops'][-1]['progress'] if source['stops'] else 1) + .03))
    def sample(progress):
        index = next((index for index, item in enumerate(source['cameras']) if item['progress'] >= progress), -1)
        if index <= 0:
            return {**source['cameras'][0], 'sourceProgress': progress}
        a, b = source['cameras'][index - 1:index + 1]
        mix = (progress - a['progress']) / max(.000001, b['progress'] - a['progress'])
        return {'sourceProgress': progress, 'frame': a['frame'] + (b['frame'] - a['frame']) * mix,
                'position': [x + (y - x) * mix for x, y in zip(a['position'], b['position'])]}
    samples = [sample(first), *[{**item, 'sourceProgress': item['progress']} for item in source['cameras'] if first < item['progress'] < end], sample(end)]
    axis, distances = (0 if source['travel']['axis'] == 'X' else 1), [0.0]
    for a, b in zip(samples, samples[1:]):
        delta = [y - x for x, y in zip(a['position'], b['position'])]
        distance = abs(delta[axis]) + .08 * math.sqrt(sum(value * value for value in delta))
        distances.append(distances[-1] + max(.00001, distance))
    total = distances[-1] or 1
    return [{**item, 'progress': distance / total} for item, distance in zip(samples, distances)]


def route_interpolate(route, value, source_key, target_key):
    if value <= route[0][source_key]:
        return route[0][target_key]
    if value >= route[-1][source_key]:
        return route[-1][target_key]
    index = next(index for index, item in enumerate(route) if item[source_key] >= value)
    a, b = route[index - 1:index + 1]
    mix = (value - a[source_key]) / max(1e-12, b[source_key] - a[source_key])
    return a[target_key] + (b[target_key] - a[target_key]) * mix


def text_opacity(entry, progress):
    start, end = entry.get('range', [0, 1])
    if progress < start or progress > end:
        return 0.0
    fade = entry.get('fade', 0)
    def smooth(value):
        value = max(0.0, min(1.0, value))
        return value * value * (3 - 2 * value)
    enter = smooth((progress - start) / fade) if fade and start > 0 else 1.0
    leave = smooth((end - progress) / fade) if fade and end < 1 else 1.0
    return min(enter, leave)


def vertical_text_parts(entry):
    """Return editable vertical columns in DOM pixel units, right to left."""
    width, height = entry.get('domWidth', 640), entry.get('domHeight', 250)
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0 for value in (width, height)):
        raise ValueError('Vertical text needs positive domWidth/domHeight: ' + entry['id'])
    if len(entry['lines']) > 2:
        raise ValueError('Vertical captions support at most two short body columns: ' + entry['id'])
    title, body = entry.get('titleSize', height * .13), entry.get('bodySize', height * .09)
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0 for value in (title, body)):
        raise ValueError('Vertical titleSize/bodySize must be positive: ' + entry['id'])
    parts = [{'part': 'title', 'body': '\n'.join(entry['title']), 'fontPixels': title,
              'width': title * 1.12, 'height': len(entry['title']) * title * 1.08,
              'lineSpacing': 1.08, 'color': entry.get('color', '#73533d')}]
    for index, line in enumerate(entry['lines']):
        parts.append({'part': f'column-{index + 1}', 'body': '\n'.join(line), 'fontPixels': body,
                      'width': body * 1.2, 'height': len(line) * body * 1.04,
                      'lineSpacing': 1.04, 'color': entry.get('bodyColor', entry.get('color', '#73533d'))})
    if entry.get('seal'):
        parts.append({'part': 'seal', 'body': '\n'.join(entry['seal']), 'fontPixels': body * .72,
                      'width': body * .95, 'height': max(body * .72 * 1.3, len(entry['seal']) * body * .72 * 1.08 + body * .72 * .44),
                      'lineSpacing': 1.08, 'color': '#9b402f'})
    gap = body * .65
    band_width = sum(part['width'] for part in parts) + gap * (len(parts) - 1)
    band_height = max(part['height'] for part in parts)
    right = (width + band_width) / 2
    for part in parts:
        right -= part['width']
        part['x'], part['y'] = right, (height - band_height) / 2
        if part['part'] == 'seal':
            part['y'] += band_height - part['height']
        part['bandWidth'], part['bandHeight'] = band_width, band_height
        right -= gap
    return parts


def validate_uv_rect(rect, label):
    if (not isinstance(rect, (list, tuple)) or len(rect) != 4
            or any(not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 <= value <= 1 for value in rect)
            or rect[0] >= rect[2] or rect[1] >= rect[3]):
        raise ValueError(label + ' requires a positive normalized rectangle.')
    return rect


def remap_region_uv(uvs, rect):
    """Embed an authored atlas selection in the padded replacement without resizing it."""
    validate_uv_rect(rect, 'preserve-region uvInsetRect')
    if not uvs or len(uvs) % 2:
        raise ValueError('Region UV remapping requires complete UV pairs.')
    return [rect[axis] + value * (rect[axis + 2] - rect[axis])
            for index, value in enumerate(uvs) for axis in (index % 2,)]


def mesh_positions_sha(mesh):
    payload = [[float(value) for value in vertex.co] for vertex in mesh.vertices]
    return hashlib.sha256(json.dumps(payload, separators=(',', ':')).encode()).hexdigest()


def source_mesh_geometry_snapshot(bpy, names=None):
    """Record source topology/positions/UVs independently of derived save fingerprints."""
    records = {}
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH' or (names is not None and obj.name not in names):
            continue
        topology = [list(polygon.vertices) for polygon in obj.data.polygons]
        uv_layers = {layer.name: [[float(value) for value in loop.uv] for loop in layer.data]
                     for layer in obj.data.uv_layers}
        records[obj.name] = {
            'positionsSha256': mesh_positions_sha(obj.data),
            'topologySha256': hashlib.sha256(json.dumps(topology, separators=(',', ':')).encode()).hexdigest(),
            'uvLayersSha256': hashlib.sha256(json.dumps(uv_layers, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
        }
    return records


def assert_original_geometry_policy(baseline, current, permitted):
    if baseline.keys() != current.keys():
        raise AssertionError('Original mesh objects changed while auditing source geometry.')
    for name, original in baseline.items():
        if name not in permitted and original != current[name]:
            raise AssertionError('Undeclared original geometry or UV mutation: ' + name)


def fit_preserved_region(obj, entry):
    """Keep topology and every local position; remap only the active authored UVs."""
    copy_object_mesh(obj)
    if not obj.data.uv_layers.active:
        raise ValueError('Preserved region has no authored UV map: ' + obj.name)
    before = mesh_positions_sha(obj.data)
    original_uvs = [float(value) for loop in obj.data.uv_layers.active.data for value in loop.uv]
    mapped = remap_region_uv(original_uvs, entry['uvInsetRect'])
    for index, loop in enumerate(obj.data.uv_layers.active.data):
        loop.uv = mapped[index * 2:index * 2 + 2]
    obj.data.update()
    after = mesh_positions_sha(obj.data)
    if before != after:
        raise AssertionError('Preserved-region geometry positions changed: ' + obj.name)
    obj['geometry_policy'] = 'preserve-region'
    obj['region_uv_inset'] = entry['uvInsetRect']
    return {'name': obj.name, 'geometryPolicy': 'preserve-region', 'fullUvCarrier': False,
            'positionsSha256Before': before, 'positionsSha256After': after,
            'vertexCount': len(obj.data.vertices), 'polygonCount': len(obj.data.polygons),
            'originalLoopUvs': original_uvs, 'uvInsetRect': entry['uvInsetRect'],
            'mappedUvBounds': [min(mapped[::2]), min(mapped[1::2]), max(mapped[::2]), max(mapped[1::2])]}


def padded_explicit_corners(entry):
    corners = entry.get('geometryCorners')
    if (not isinstance(corners, (list, tuple)) or len(corners) != 4
            or any(not isinstance(point, (list, tuple)) or len(point) != 3
                   or any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in point) for point in corners)):
        raise ValueError('Explicit geometryCorners require four finite local 3D points.')
    direction_u = [corners[1][axis] - corners[0][axis] for axis in range(3)]
    direction_v = [corners[3][axis] - corners[0][axis] for axis in range(3)]
    cross = [direction_u[1] * direction_v[2] - direction_u[2] * direction_v[1],
             direction_u[2] * direction_v[0] - direction_u[0] * direction_v[2],
             direction_u[0] * direction_v[1] - direction_u[1] * direction_v[0]]
    if sum(value * value for value in cross) < 1e-16:
        raise ValueError('Explicit geometryCorners must span a painting plane.')
    extent = max(math.sqrt(sum(value * value for value in direction)) for direction in (direction_u, direction_v))
    if any(abs(corners[2][axis] - corners[0][axis] - direction_u[axis] - direction_v[axis]) > extent * 1e-6 + 1e-8
           for axis in range(3)):
        raise ValueError('Explicit geometryCorners must form a consistently ordered parallelogram.')
    center = [sum(point[axis] for point in corners) / 4 for axis in range(3)]
    padding = entry.get('paddingScale', 1)
    scale_u, scale_v = entry.get('paddingScaleX', padding), entry.get('paddingScaleY', padding)
    return [[center[axis] + (u - .5) * direction_u[axis] * scale_u + (v - .5) * direction_v[axis] * scale_v
             for axis in range(3)] for u, v in ((0, 0), (1, 0), (1, 1), (0, 1))]


def fit_explicit_geometry(bpy, obj, entry):
    if obj.type != 'MESH' or len({polygon.material_index for polygon in obj.data.polygons}) > 1:
        raise ValueError('Explicit painting carrier requires one original material: ' + obj.name)
    corners = padded_explicit_corners(entry)
    materials = list(obj.data.materials)
    slot = obj.data.polygons[0].material_index if obj.data.polygons else 0
    complete = bpy.data.meshes.new('RECON_EXPLICIT_CORNERS_' + obj.name)
    complete.from_pydata(corners, [], [(0, 1, 2, 3)])
    complete.polygons[0].material_index = slot
    for material in materials:
        complete.materials.append(material)
    uv = complete.uv_layers.new(name='UVMap')
    for index, coordinate in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[index].uv = coordinate
    obj.data = complete
    obj['reconstruction_mesh_copy'] = True
    obj['geometry_policy'] = 'explicit-corners'
    obj['full_uv_carrier'] = True
    return {'name': obj.name, 'geometryPolicy': 'explicit-corners', 'fullUvCarrier': True,
            'rawContentCorners': entry['geometryCorners'], 'paddedCorners': corners,
            'paddingScaleX': entry.get('paddingScaleX', entry.get('paddingScale', 1)),
            'paddingScaleY': entry.get('paddingScaleY', entry.get('paddingScale', 1)),
            'aspectCorrectionApplied': False}


def copy_object_mesh(obj):
    if obj.type != 'MESH':
        raise ValueError('Texture reconstruction requires a mesh object: ' + obj.name)
    if not obj.get('reconstruction_mesh_copy'):
        obj.data = obj.data.copy()
        obj.data.name = 'RECON_' + obj.name
        obj['reconstruction_mesh_copy'] = True


def apply_layout_adjustments(bpy, revision, roles, geometry_records=()):
    """Bake a reviewed world-space deformation into copied local vertices.

    worldMatrix is a delta acting on world points, not an object transform.
    The original matrix, parent, actions, topology and UVs remain authored.
    """
    from mathutils import Matrix, Vector
    changes = []
    for entry in revision.get('layoutAdjustments', []):
        validate_layout_adjustment(entry)
        world_delta = Matrix([[entry['worldMatrix'][column * 4 + row] for column in range(4)] for row in range(4)])
        targets = []
        for name in entry['meshNames']:
            obj = bpy.context.scene.objects.get(name)
            if obj is None or obj.type != 'MESH':
                raise ValueError('Layout target must be an existing painted MESH: ' + name)
            before_matrix = matrix(obj.matrix_world)
            copy_object_mesh(obj)
            before = source_mesh_geometry_snapshot(bpy, {name})[name]
            local_delta = obj.matrix_world.inverted() @ world_delta @ obj.matrix_world
            for vertex in obj.data.vertices:
                vertex.co = local_delta @ vertex.co
            obj.data.update()
            after = source_mesh_geometry_snapshot(bpy, {name})[name]
            if before['topologySha256'] != after['topologySha256'] or before['uvLayersSha256'] != after['uvLayersSha256']:
                raise AssertionError('Layout adjustment modified topology or UVs: ' + name)
            if matrix(obj.matrix_world) != before_matrix:
                raise AssertionError('Layout adjustment changed the original world matrix: ' + name)
            obj['layout_adjustment_ids'] = [*list(obj.get('layout_adjustment_ids', [])), entry['id']]
            obj['layout_narrative'] = entry['narrative']
            target = {'name': name, 'matrixWorldBefore': before_matrix, 'matrixWorldAfter': matrix(obj.matrix_world),
                      'localDeltaColumnMajor': matrix(local_delta), 'geometryBefore': before, 'geometryAfter': after,
                      'vertexCount': len(obj.data.vertices), 'polygonCount': len(obj.data.polygons)}
            targets.append(target)
            # A carrier can be repaired and then re-composed. Preserve its raw
            # corner evidence while validating the final deformed coordinates.
            for record in geometry_records:
                for carrier in record.get('targets', []):
                    if carrier['name'] == name:
                        carrier['layoutAdjustedPositionsSha256'] = after['positionsSha256']
                        if carrier.get('geometryPolicy') == 'explicit-corners':
                            corners = carrier.get('layoutAdjustedPaddedCorners', carrier['paddedCorners'])
                            carrier['layoutAdjustedPaddedCorners'] = [list(local_delta @ Vector(point)) for point in corners]
        changes.append({'id': entry['id'], 'role': entry['role'], 'narrative': entry['narrative'],
                        'worldMatrix': entry['worldMatrix'], 'targets': targets})
    return changes


def uv_axes(obj):
    mesh = obj.data
    if not mesh.uv_layers.active:
        raise ValueError('Reconstructed layer has no active UV map: ' + obj.name)
    samples = [(mesh.vertices[loop.vertex_index].co, mesh.uv_layers.active.data[loop.index].uv)
               for loop in mesh.loops]
    if not samples:
        raise ValueError('Reconstructed layer has no geometry loops: ' + obj.name)
    def correlation(axis, uv_axis):
        average_position = sum(co[axis] for co, uv in samples) / len(samples)
        average_uv = sum(uv[uv_axis] for co, uv in samples) / len(samples)
        numerator = sum((co[axis] - average_position) * (uv[uv_axis] - average_uv) for co, uv in samples)
        denominator = math.sqrt(sum((co[axis] - average_position) ** 2 for co, uv in samples)
                                * sum((uv[uv_axis] - average_uv) ** 2 for co, uv in samples))
        return abs(numerator / denominator) if denominator else 0
    return max(((horizontal, vertical) for horizontal in range(3) for vertical in range(3)
                if horizontal != vertical),
               key=lambda axes: correlation(axes[0], 0) + correlation(axes[1], 1))


def affine_plane_from_uv(positions, uvs):
    """Fit P=a+b*u+c*v with the exact exported samples shared with the Web."""
    if len(positions) % 3 or len(uvs) % 2 or len(positions) // 3 != len(uvs) // 2 or len(uvs) < 6:
        raise ValueError('Full-UV reconstruction requires matching positions and UV samples.')
    samples = [(uvs[index * 2], uvs[index * 2 + 1], positions[index * 3:index * 3 + 3])
               for index in range(len(uvs) // 2)]
    if any(not math.isfinite(value) for value in positions + uvs):
        raise ValueError('Full-UV reconstruction requires finite samples.')
    mean_u = sum(u for u, v, point in samples) / len(samples)
    mean_v = sum(v for u, v, point in samples) / len(samples)
    mean_position = [sum(point[axis] for u, v, point in samples) / len(samples) for axis in range(3)]
    uu = uv = vv = 0.0
    up = [0.0] * 3
    vp = [0.0] * 3
    for u, v, point in samples:
        du, dv = u - mean_u, v - mean_v
        uu += du * du
        uv += du * dv
        vv += dv * dv
        for axis in range(3):
            up[axis] += du * (point[axis] - mean_position[axis])
            vp[axis] += dv * (point[axis] - mean_position[axis])
    determinant = uu * vv - uv * uv
    if abs(determinant) < 1e-12:
        raise ValueError('UV samples are collinear; a complete image carrier cannot be fitted.')
    derivative_u = [(up[axis] * vv - vp[axis] * uv) / determinant for axis in range(3)]
    derivative_v = [(vp[axis] * uu - up[axis] * uv) / determinant for axis in range(3)]
    origin = [mean_position[axis] - derivative_u[axis] * mean_u - derivative_v[axis] * mean_v for axis in range(3)]
    coefficients = [origin, derivative_u, derivative_v]
    def evaluate(u, v):
        return [coefficients[0][axis] + coefficients[1][axis] * u + coefficients[2][axis] * v for axis in range(3)]
    errors = [math.sqrt(sum((actual - fitted) ** 2 for actual, fitted in zip(point, evaluate(u, v))))
              for u, v, point in samples]
    plane_normal = [derivative_u[1] * derivative_v[2] - derivative_u[2] * derivative_v[1],
                    derivative_u[2] * derivative_v[0] - derivative_u[0] * derivative_v[2],
                    derivative_u[0] * derivative_v[1] - derivative_u[1] * derivative_v[0]]
    normal_length = math.sqrt(sum(value * value for value in plane_normal))
    if normal_length < 1e-12:
        raise ValueError('Fitted image carrier has no plane area.')
    plane_normal = [value / normal_length for value in plane_normal]
    normal_errors = [abs(sum((actual - fitted) * direction for actual, fitted, direction in zip(point, evaluate(u, v), plane_normal)))
                     for u, v, point in samples]
    tangential_errors = [math.sqrt(max(0, error ** 2 - normal_error ** 2)) for error, normal_error in zip(errors, normal_errors)]
    extent = max(math.sqrt(sum(value * value for value in direction)) for direction in (derivative_u, derivative_v))
    tangential_tolerance, normal_tolerance = extent * .001 + 1e-6, extent * .02 + 1e-6
    if max(tangential_errors) > tangential_tolerance or max(normal_errors) > normal_tolerance:
        raise ValueError('Source UV geometry exceeds the permitted affine carrier fit: '
                         f'in-plane {max(tangential_errors)} / {tangential_tolerance}, '
                         f'normal {max(normal_errors)} / {normal_tolerance}.')
    return {'corners': [evaluate(u, v) for u, v in ((0, 0), (1, 0), (1, 1), (0, 1))],
            'coefficients': coefficients, 'sampleCount': len(samples),
            'rmsResidual': math.sqrt(sum(error * error for error in errors) / len(errors)),
            'maxResidual': max(errors), 'maxNormalResidual': max(normal_errors),
            'maxInPlaneResidual': max(tangential_errors),
            'normalTolerance': normal_tolerance, 'inPlaneTolerance': tangential_tolerance,
            'uvBounds': [0, 0, 1, 1]}


def fit_replacement_geometry(bpy, obj, entry, exported_geometry):
    if obj.type != 'MESH' or len({polygon.material_index for polygon in obj.data.polygons}) > 1:
        raise ValueError('Full-UV reconstruction requires a single painting material: ' + obj.name)
    fitted = affine_plane_from_uv(exported_geometry['positions'], exported_geometry['uvs'])
    materials = list(obj.data.materials)
    material_index = obj.data.polygons[0].material_index if obj.data.polygons else 0
    complete = bpy.data.meshes.new('RECON_FULL_UV_' + obj.name)
    complete.from_pydata(fitted['corners'], [], [(0, 1, 2, 3)])
    complete.polygons[0].material_index = material_index
    for material in materials:
        complete.materials.append(material)
    uv = complete.uv_layers.new(name='UVMap')
    for index, coordinate in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[index].uv = coordinate
    obj.data = complete
    obj['reconstruction_mesh_copy'] = True
    horizontal, vertical = uv_axes(obj)
    center = [(min(vertex.co[axis] for vertex in obj.data.vertices)
               + max(vertex.co[axis] for vertex in obj.data.vertices)) / 2 for axis in range(3)]
    padding = entry.get('paddingScale', 1)
    horizontal_scale = entry.get('paddingScaleX', padding) * entry.get('contentAspect', 1) / entry.get('sourceAspect', 1)
    vertical_scale = entry.get('paddingScaleY', padding)
    for vertex in obj.data.vertices:
        vertex.co[horizontal] = center[horizontal] + (vertex.co[horizontal] - center[horizontal]) * horizontal_scale
        vertex.co[vertical] = center[vertical] + (vertex.co[vertical] - center[vertical]) * vertical_scale
    obj.data.update()
    obj['full_uv_rebuild_id'] = entry['id']
    obj['padding_scale'] = padding
    obj['padding_scale_x'] = entry.get('paddingScaleX', padding)
    obj['padding_scale_y'] = vertical_scale
    obj['content_aspect'] = entry.get('contentAspect', 1)
    obj['source_aspect'] = entry.get('sourceAspect', 1)
    obj['uv_horizontal_axis'] = horizontal
    obj['uv_vertical_axis'] = vertical
    obj['full_uv_carrier'] = True
    obj['uv_affine_rms_residual'] = fitted['rmsResidual']
    return {'name': obj.name, 'horizontalAxis': horizontal, 'verticalAxis': vertical,
            'horizontalScale': horizontal_scale, 'verticalScale': vertical_scale,
            'localBoundsCenter': center, 'fullUvCarrier': True, 'affineFit': fitted}


def load_packed_image(bpy, entry, chapter):
    path = resolve_path(entry['productionPng'])
    production_path = relative_path(path)
    for existing in bpy.data.images:
        if existing.get('reconstruction_production_path') == production_path:
            if not existing.packed_file or hashlib.sha256(bytes(existing.packed_file.data)).hexdigest() != sha256(path):
                raise AssertionError('Shared production image bytes changed during reconstruction: ' + entry['id'])
            return existing
    image = bpy.data.images.load(str(path), check_existing=False)
    image.name = f"RECON_CH{chapter:02d}_{entry['id']}"
    image['reconstruction_production_path'] = production_path
    image.alpha_mode = 'STRAIGHT'
    image.pack()
    if hashlib.sha256(bytes(image.packed_file.data)).hexdigest() != sha256(path):
        raise AssertionError('Packed production image differs from source PNG: ' + entry['id'])
    return image


def set_revision_role(obj, role, roles):
    for candidate_role, collection in roles.items():
        keep = candidate_role == role or (candidate_role == '动效层' and obj.get('motion_role') != 'static')
        if not keep and obj.name in collection.objects:
            collection.objects.unlink(obj)
    if obj.name not in roles[role].objects:
        roles[role].objects.link(obj)
    obj['layer_role'] = role


def apply_replacements(bpy, chapter, revision, exported, roles):
    changes = []
    for entry in revision.get('replacements', []):
        mesh_records = [mesh for mesh in exported['meshes']
                        if exported['materials'][mesh['material']]['texture'] == entry['sourceTexture']
                        and ('meshNames' not in entry or mesh['name'] in entry['meshNames'])]
        if not mesh_records:
            raise ValueError('Replacement does not match any original exported layer: ' + entry['id'])
        if 'meshNames' in entry and {mesh['name'] for mesh in mesh_records} != set(entry['meshNames']):
            raise ValueError('Replacement meshNames contains a missing or differently textured source layer: ' + entry['id'])
        image = load_packed_image(bpy, entry, chapter)
        changed_objects = set()
        targets = []
        for record in mesh_records:
            obj = bpy.context.scene.objects.get(record['name'])
            if not obj:
                raise ValueError('Replacement original object not found: ' + record['name'])
            copy_object_mesh(obj)
            material_name = exported['materials'][record['material']]['name']
            matches = 0
            for slot, material in enumerate(obj.data.materials):
                if not material or material.name != material_name:
                    continue
                copied = material.copy()
                copied.name = f"RECON_{entry['id']}_{obj.name}"
                obj.data.materials[slot] = copied
                for node in copied.node_tree.nodes:
                    if node.type == 'TEX_IMAGE' and node.image and node.image.name == entry['sourceName']:
                        node.image = image
                        matches += 1
            if not matches:
                raise ValueError('Replacement image did not match the intended material/sourceName: ' + obj.name)
            if obj.name not in changed_objects:
                if entry.get('geometryPolicy') == 'preserve-region':
                    targets.append(fit_preserved_region(obj, entry))
                elif entry.get('geometryPolicy') == 'explicit-corners':
                    targets.append(fit_explicit_geometry(bpy, obj, entry))
                else:
                    targets.append(fit_replacement_geometry(bpy, obj, entry, record))
                changed_objects.add(obj.name)
            obj['treatment'] = entry.get('treatment', '重生成')
            obj['replacement_id'] = entry['id']
            obj['narrative'] = entry['narrative']
            set_revision_role(obj, entry['role'], roles)
        changes.append({'id': entry['id'], 'treatment': entry.get('treatment', '重生成'),
                        'geometryPolicy': entry.get('geometryPolicy', 'full-uv-affine'),
                        'imageName': image.name, 'targets': targets,
                        'packedSha256': hashlib.sha256(bytes(image.packed_file.data)).hexdigest()})
    return changes


def apply_geometry_repairs(bpy, revision, exported, roles):
    changes = []
    for entry in revision.get('geometryRepairs', []):
        targets = []
        for name in entry['meshNames']:
            obj = bpy.context.scene.objects.get(name)
            geometry = next((mesh for mesh in exported['meshes'] if mesh['name'] == name), None)
            if not obj or not geometry:
                raise ValueError('Declared geometry-only repair target is missing: ' + name)
            if obj.get('full_uv_carrier'):
                raise ValueError('The same object is assigned multiple complete-UV operations: ' + name)
            if obj.modifiers:
                raise ValueError('Geometry-only full-UV repair requires an explicit evaluated-modifier policy: ' + name)
            targets.append(fit_replacement_geometry(bpy, obj, {'id': entry['id']}, geometry))
            obj['geometry_repair_id'] = entry['id']
            obj['treatment'] = entry.get('treatment', '修复')
            obj['narrative'] = entry['narrative']
            set_revision_role(obj, entry['role'], roles)
        changes.append({'id': entry['id'], 'geometryPolicy': entry['geometryPolicy'],
                        'textureChanged': False, 'gutterExpansion': False,
                        'treatment': entry.get('treatment', '修复'), 'targets': targets})
    return changes


def add_edge_alpha(material, fades, entry_id, uv_rect=(0, 0, 1, 1)):
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    output = next((node for node in nodes if node.type == 'OUTPUT_MATERIAL' and node.is_active_output), None)
    if not output or not output.inputs['Surface'].is_linked:
        raise ValueError('Cannot preserve an unconnected original surface for edge repair: ' + material.name)
    original_surface = output.inputs['Surface'].links[0].from_socket
    texcoord = nodes.new('ShaderNodeTexCoord')
    separate = nodes.new('ShaderNodeSeparateXYZ')
    links.new(texcoord.outputs['UV'], separate.inputs[0])
    coordinates = {}
    for axis, socket in enumerate(('X', 'Y')):
        normalize = nodes.new('ShaderNodeMapRange')
        normalize.clamp = False
        normalize.inputs['From Min'].default_value = uv_rect[axis]
        normalize.inputs['From Max'].default_value = uv_rect[axis + 2]
        normalize.inputs['To Min'].default_value = 0
        normalize.inputs['To Max'].default_value = 1
        links.new(separate.outputs[socket], normalize.inputs['Value'])
        coordinates[socket] = normalize.outputs['Result']
    factor = None
    for edge in ('left', 'right', 'top', 'bottom'):
        width = fades.get(edge, 0)
        if width <= 0:
            continue
        coordinate = coordinates['X' if edge in ('left', 'right') else 'Y']
        if edge in ('right', 'top'):
            inverse = nodes.new('ShaderNodeMath')
            inverse.operation = 'SUBTRACT'
            inverse.inputs[0].default_value = 1
            links.new(coordinate, inverse.inputs[1])
            coordinate = inverse.outputs[0]
        ramp = nodes.new('ShaderNodeMapRange')
        ramp.interpolation_type = 'SMOOTHSTEP'
        ramp.clamp = True
        ramp.inputs['From Min'].default_value = 0
        ramp.inputs['From Max'].default_value = width
        ramp.inputs['To Min'].default_value = 0
        ramp.inputs['To Max'].default_value = 1
        links.new(coordinate, ramp.inputs['Value'])
        if factor is None:
            factor = ramp.outputs['Result']
        else:
            multiply = nodes.new('ShaderNodeMath')
            multiply.operation = 'MULTIPLY'
            links.new(factor, multiply.inputs[0])
            links.new(ramp.outputs['Result'], multiply.inputs[1])
            factor = multiply.outputs[0]
    if factor is None:
        raise ValueError('Edge repair contains no positive fades: ' + entry_id)
    transparent = nodes.new('ShaderNodeBsdfTransparent')
    mix = nodes.new('ShaderNodeMixShader')
    mix.name = 'RECON_EDGE_' + entry_id
    links.new(factor, mix.inputs[0])
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(original_surface, mix.inputs[2])
    links.new(mix.outputs[0], output.inputs['Surface'])


def apply_edge_repairs(bpy, revision, roles):
    changes = []
    for entry in revision.get('edgeRepairs', []):
        for name in entry['meshNames']:
            obj = bpy.context.scene.objects.get(name)
            if not obj:
                raise ValueError('Edge repair target missing: ' + name)
            copy_object_mesh(obj)
            for slot, material in enumerate(obj.data.materials):
                if not material:
                    continue
                if not material.use_nodes or not material.node_tree:
                    raise ValueError('Edge repair target has no shader graph: ' + name)
                copied = material.copy()
                copied.name = f"RECON_EDGE_{entry['id']}_{material.name}"
                add_edge_alpha(copied, entry['fades'], entry['id'], entry.get('uvRect', (0, 0, 1, 1)))
                obj.data.materials[slot] = copied
            obj['edge_fades'] = json.dumps(entry['fades'], sort_keys=True)
            obj['treatment'] = '修复'
            obj['narrative'] = entry['narrative']
            set_revision_role(obj, entry['role'], roles)
            changes.append({'id': entry['id'], 'name': name, 'fades': entry['fades'],
                            'uvRect': entry.get('uvRect', [0, 0, 1, 1])})
    return changes


def add_layers(bpy, chapter, revision, roles):
    from mathutils import Matrix
    changes = []
    for entry in revision.get('addedLayers', []):
        name = f"CH{chapter:02d}_NEW_{entry['id']}_{entry['name']}"
        if bpy.data.objects.get(name):
            raise ValueError('Added layer name already exists: ' + name)
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([(-.5, -.5, 0), (.5, -.5, 0), (.5, .5, 0), (-.5, .5, 0)], [], [(0, 1, 2, 3)])
        uv = mesh.uv_layers.new(name='UVMap')
        u0, v0, u1, v1 = entry.get('uvRect', (0, 0, 1, 1))
        for index, coordinate in enumerate(((u0, v0), (u1, v0), (u1, v1), (u0, v1))):
            uv.data[index].uv = coordinate
        obj = bpy.data.objects.new(name, mesh)
        roles[entry['role']].objects.link(obj)
        if entry.get('motionName') and entry['role'] != '动效层':
            roles['动效层'].objects.link(obj)
        obj.matrix_world = Matrix([[entry['matrix'][column * 4 + row] for column in range(4)] for row in range(4)])
        for key, value in {'stable_id': entry['id'], 'original_name': entry['name'],
                           'narrative': entry['narrative'], 'treatment': '新增',
                           'motion_role': entry.get('motionName', 'static'),
                           'layer_role': entry['role'],
                           'reconstruction_asset': entry['asset'],
                           'reconstruction_production_png': entry['productionPng'],
                           'reconstruction_opacity': entry.get('opacity', 1),
                           'reconstruction_uv_rect': list(entry.get('uvRect', (0, 0, 1, 1)))}.items():
            obj[key] = value
        # Three.js draw order is descriptive metadata, not a Blender render override.
        for source_key, property_key in (('renderOrder', 'web_render_order'),
                                         ('depthTest', 'web_depth_test'),
                                         ('depthWrite', 'web_depth_write')):
            if source_key in entry:
                obj[property_key] = entry[source_key]
        image = load_packed_image(bpy, entry, chapter)
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        links = material.node_tree.links
        output = nodes.new('ShaderNodeOutputMaterial')
        emission = nodes.new('ShaderNodeEmission')
        transparent = nodes.new('ShaderNodeBsdfTransparent')
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = image
        texture.extension = 'CLIP'
        alpha = nodes.new('ShaderNodeMath')
        alpha.operation = 'MULTIPLY'
        alpha.inputs[1].default_value = entry.get('opacity', 1)
        mix = nodes.new('ShaderNodeMixShader')
        links.new(texture.outputs['Color'], emission.inputs['Color'])
        links.new(texture.outputs['Alpha'], alpha.inputs[0])
        links.new(alpha.outputs[0], mix.inputs[0])
        links.new(transparent.outputs[0], mix.inputs[1])
        links.new(emission.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], output.inputs['Surface'])
        obj.data.materials.append(material)
        changes.append({'id': entry['id'], 'name': name, 'role': entry['role'],
                        'imageName': image.name, 'matrix': matrix(obj.matrix_world),
                        'asset': entry['asset'], 'productionPng': entry['productionPng'],
                        'narrative': entry['narrative'], 'opacity': entry.get('opacity', 1),
                        'uvRect': list(entry.get('uvRect', (0, 0, 1, 1))),
                        'motionRole': entry.get('motionName', 'static'),
                        'webPresentation': {key: entry[key] for key in ('renderOrder', 'depthTest', 'depthWrite') if key in entry},
                        'packedSha256': hashlib.sha256(bytes(image.packed_file.data)).hexdigest()})
    return changes


def choose_chinese_font(bpy):
    hints = ('simsun', 'simfang', 'simkai', 'msyh', 'notoserifcjk', 'notosanscjk',
             'sourcehans', 'sourcehanserif', 'kaiti', 'stxingka', 'fangsong',
             'simhei', 'dengxian', 'stfangso', '宋', '楷', '仿宋', '思源')
    for font in bpy.data.fonts:
        if font.name != 'Bfont' and any(hint in (font.name + ' ' + font.filepath).casefold() for hint in hints):
            source = Path(bpy.path.abspath(font.filepath)) if font.filepath else None
            if font.packed_file or (source and source.is_file()):
                if not font.packed_file:
                    font.pack()
                return font, {'name': font.name, 'reusedOriginal': True,
                              'source': relative_path(source) if source and source.is_file() else None,
                              'packedSha256': hashlib.sha256(bytes(font.packed_file.data)).hexdigest()}
    explicit = os.environ.get('MDGS_CJK_FONT')
    candidates = [resolve_path(explicit)] if explicit else []
    if not explicit and os.environ.get('WINDIR'):
        font_dir = Path(os.environ['WINDIR']) / 'Fonts'
        if font_dir.is_dir():
            installed = {path.name.casefold(): path for path in font_dir.iterdir() if path.is_file()}
            candidates = [installed[name] for name in ('simsun.ttc', 'simfang.ttf', 'simkai.ttf', 'msyh.ttc') if name in installed]
    for source in candidates:
        if not source.is_file():
            continue
        try:
            font = bpy.data.fonts.load(str(source))
            font.pack()
        except RuntimeError:
            if explicit:
                raise
            continue
        return font, {'name': font.name, 'reusedOriginal': False, 'source': relative_path(source),
                      'sourceSha256': sha256(source),
                      'packedSha256': hashlib.sha256(bytes(font.packed_file.data)).hexdigest()}
    raise FileNotFoundError('No usable Chinese font found in the original scene or WINDIR/Fonts. Set MDGS_CJK_FONT to an available CJK font file before saving the reconstruction.')


def apply_hidden_layers(bpy, revision):
    hidden = []
    for name in revision.get('hiddenMeshNames', []):
        obj = bpy.context.scene.objects.get(name)
        if not obj:
            raise ValueError('Declared retired layer does not exist: ' + name)
        obj.hide_render = True
        obj['treatment'] = '退休显示，原对象保留'
        hidden.append(name)
    return hidden


def apply_hidden_blender_text(bpy, revision):
    hidden = []
    for name in revision.get('hiddenBlenderTextNames', []):
        obj = bpy.context.scene.objects.get(name)
        if obj is None or obj.type != 'FONT':
            raise ValueError('hiddenBlenderTextNames must identify an original FONT: ' + name)
        obj.hide_render = obj.hide_viewport = True
        obj['blender_text_retired'] = True
        hidden.append(name)
    return hidden


def action_fcurves(datablock):
    animation = datablock.animation_data
    if not animation or not animation.action:
        return []
    action = animation.action
    curves = list(getattr(action, 'fcurves', []))
    for layer in getattr(action, 'layers', []):
        for strip in layer.strips:
            for bag in getattr(strip, 'channelbags', []):
                curves.extend(bag.fcurves)
    return curves


def set_keyframe_interpolation(datablock, interpolation):
    curves = action_fcurves(datablock)
    for curve in curves:
        for point in curve.keyframe_points:
            point.interpolation = interpolation


def sampled_alpha_keyframes(socket, samples):
    # Create the slot/channel once through RNA, then fill points directly.
    # Repeated keyframe_insert merges nearby subframes, which would corrupt
    # short fades in an authored film hold.
    socket.default_value = samples[0]['opacity']
    socket.keyframe_insert(data_path='default_value', frame=samples[0]['frame'])
    path = socket.path_from_id('default_value')
    curves = [curve for curve in action_fcurves(socket.id_data) if curve.data_path == path]
    if len(curves) != 1:
        raise AssertionError('Editable text alpha requires one explicit animation channel.')
    curve = curves[0]
    curve.keyframe_points.clear()
    curve.keyframe_points.add(len(samples))
    for point, sample in zip(curve.keyframe_points, samples):
        point.co = (sample['frame'], sample['opacity'])
        point.interpolation = 'LINEAR'
    # Points are already ordered and LINEAR. FCurve.update() deduplicates
    # nearby subframe keys, so keep the explicit dense fade samples intact.
    socket.id_data.update_tag()


def animate_text_visibility(bpy, entry, objects, alpha_sockets, route):
    """Bake Web reading-progress visibility onto the original source frames."""
    start, end = entry.get('range', [0, 1])
    fade = entry.get('fade', 0)
    knots = {0.0, 1.0, start, end, min(end, start + fade), max(start, end - fade),
             *[sample['progress'] for sample in route if start <= sample['progress'] <= end]}
    if fade:
        for index in range(65):
            fraction = index / 64
            knots.add(min(end, start + fade * fraction))
            knots.add(max(start, end - fade * fraction))
    if end - start < 2 * fade:
        knots.add((start + end) / 2)
    samples = [{'progress': progress, 'frame': route_interpolate(route, progress, 'progress', 'frame'),
                'opacity': text_opacity(entry, progress)} for progress in sorted(knots)]
    first_frame = route_interpolate(route, start, 'progress', 'frame')
    last_frame = route_interpolate(route, end, 'progress', 'frame')
    # Blender merges inserted keys within roughly 0.01 frame. A 0.05-frame
    # outer sentinel keeps inclusive endpoints intact; alpha is already zero
    # beyond the exact range so this subframe margin never paints extra text.
    epsilon = .05
    visibility = [(float(bpy.context.scene.frame_start), not (first_frame <= bpy.context.scene.frame_start <= last_frame)),
                  (first_frame - epsilon, True), (first_frame, False),
                  (last_frame, False), (last_frame + epsilon, True),
                  (float(bpy.context.scene.frame_end), not (first_frame <= bpy.context.scene.frame_end <= last_frame))]
    # If a declared range starts before the original timeline, avoid an outer
    # sentinel overwriting the intended first visible key at that same frame.
    for obj in objects:
        for frame, hidden in sorted(dict(visibility).items()):
            obj.hide_render = obj.hide_viewport = hidden
            obj.keyframe_insert(data_path='hide_render', frame=frame)
            obj.keyframe_insert(data_path='hide_viewport', frame=frame)
        obj['text_source_frame_range'] = [first_frame, last_frame]
        obj['text_range_mapping'] = 'prepareScene spatial distance, not source timeline fraction'
        set_keyframe_interpolation(obj, 'CONSTANT')
    for material, socket in alpha_sockets:
        sampled_alpha_keyframes(socket, samples)
        # Node-tree animation in Blender 5 uses action slots. Iterate through
        # all available channels instead of relying on the legacy fcurves API.
        set_keyframe_interpolation(socket.id_data, 'LINEAR')
    bpy.context.scene.frame_set(bpy.context.scene.frame_start)
    return {'progressRange': [start, end], 'sourceFrameRange': [first_frame, last_frame], 'fade': fade,
            'hiddenSentinelMarginFrames': epsilon,
            'opacityInterpolation': '64 uniform progress samples per smoothstep fade plus every prepared route breakpoint; linear FCurve segments',
            'opacityApproximationErrorBound': 3 / (4 * 64 * 64) if fade else 0,
            'mapping': 'prepareScene spatial distance', 'opacitySamples': samples,
            'visibleObjectNames': [obj.name for obj in objects],
            'alphaSockets': [{'material': material.name, 'node': socket.node.name, 'input': socket.name} for material, socket in alpha_sockets]}


def add_vertical_text_layer(bpy, chapter, entry, roles, font, route):
    from mathutils import Matrix
    base_name = f"CH{chapter:02d}_TEXT_{entry['id']}_{entry['name']}"
    anchor = bpy.data.objects.new(base_name, None)
    roles['装饰层'].objects.link(anchor)
    anchor.matrix_world = Matrix([[entry['matrix'][column * 4 + row] for column in range(4)] for row in range(4)])
    metadata = {'stable_id': entry['id'] + '-anchor', 'original_name': entry['name'], 'narrative': entry['narrative'],
                'treatment': '新增可编辑竖排文字', 'motion_role': 'static', 'layer_role': '装饰层'}
    for key, value in metadata.items():
        anchor[key] = value
    anchor['progress_range'] = entry.get('range', [0, 1])
    anchor['text_layout'] = 'vertical'
    anchor['text_fade'] = entry.get('fade', 0)
    width, height = entry.get('domWidth', 640), entry.get('domHeight', 250)
    objects, created, sockets = [], [], []
    for part in vertical_text_parts(entry):
        material = bpy.data.materials.new(base_name + '_' + part['part'] + '_墨色')
        material.use_nodes = True
        nodes, links = material.node_tree.nodes, material.node_tree.links
        nodes.clear()
        output, emission = nodes.new('ShaderNodeOutputMaterial'), nodes.new('ShaderNodeEmission')
        transparent, mix = nodes.new('ShaderNodeBsdfTransparent'), nodes.new('ShaderNodeMixShader')
        mix.name = 'TEXT_ReadingProgress_Opacity'
        color = part['color'].lstrip('#')
        if not re.fullmatch(r'[0-9a-fA-F]{6}', color):
            raise ValueError('Editable text needs a six-digit color: ' + entry['id'])
        srgb = [int(color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
        emission.inputs['Color'].default_value = (*[value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in srgb], 1)
        links.new(transparent.outputs[0], mix.inputs[1])
        links.new(emission.outputs[0], mix.inputs[2])
        links.new(mix.outputs[0], output.inputs['Surface'])
        sockets.append((material, mix.inputs[0]))
        curve = bpy.data.curves.new(base_name + '_' + part['part'], type='FONT')
        curve.body, curve.font, curve.size = part['body'], font, 1
        curve.space_line = part['lineSpacing']
        curve.align_x, curve.align_y = 'CENTER', 'TOP_BASELINE'
        obj = bpy.data.objects.new(base_name + '_' + part['part'], curve)
        roles['装饰层'].objects.link(obj)
        obj.parent = anchor
        curve.materials.append(material)
        bpy.context.view_layer.update()
        min_x, max_x = min(point[0] for point in obj.bound_box), max(point[0] for point in obj.bound_box)
        max_y = max(point[1] for point in obj.bound_box)
        font_pixels = part['fontPixels']
        scale_x, scale_y = font_pixels / width, font_pixels / height
        obj.scale = (scale_x, scale_y, scale_y)
        obj.location = ((part['x'] + part['width'] / 2) / width - .5 - (min_x + max_x) / 2 * scale_x,
                        .5 - part['y'] / height - max_y * scale_y, .002)
        for key, value in metadata.items():
            obj[key] = entry['id'] + '-' + part['part'] if key == 'stable_id' else value
        obj['progress_range'] = entry.get('range', [0, 1])
        obj['text_layout'] = 'vertical'
        objects.append(obj)
        created.append({'name': obj.name, 'part': part['part'], 'body': part['body'], 'font': font.name, 'domLayout': part})
        if part['part'] == 'seal':
            # A real transparent rectangular border, not a rasterized text tile.
            x0, x1 = part['x'] / width - .5, (part['x'] + part['width']) / width - .5
            y0, y1 = .5 - (part['y'] + part['height']) / height, .5 - part['y'] / height
            tx, ty = font_pixels * .055 / width, font_pixels * .055 / height
            vertices, faces = [], []
            for left, bottom, right, top in ((x0, y0, x1, y0 + ty), (x0, y1 - ty, x1, y1),
                                              (x0, y0, x0 + tx, y1), (x1 - tx, y0, x1, y1)):
                offset = len(vertices)
                vertices.extend([(left, bottom, .001), (right, bottom, .001), (right, top, .001), (left, top, .001)])
                faces.append(tuple(range(offset, offset + 4)))
            mesh = bpy.data.meshes.new(base_name + '_seal_border')
            mesh.from_pydata(vertices, [], faces)
            border = bpy.data.objects.new(base_name + '_seal_border', mesh)
            roles['装饰层'].objects.link(border)
            border.parent = anchor
            mesh.materials.append(material)
            for key, value in metadata.items():
                border[key] = entry['id'] + '-seal-border' if key == 'stable_id' else value
            border['text_layout'] = 'vertical'
            objects.append(border)
    visibility = animate_text_visibility(bpy, entry, objects, sockets, route)
    return {'id': entry['id'], 'anchor': anchor.name, 'editableObjects': created,
            'matrix': matrix(anchor.matrix_world), 'range': entry.get('range', [0, 1]),
            'layout': 'vertical', 'visibility': visibility, 'sealBorderNames': [obj.name for obj in objects if obj.type == 'MESH'],
            'responsivePresentationBoundary': 'This editable Blender text uses the reviewed wide world anchor. Web compact paper-caption bands and viewport-specific protection reflow in CSS3D; they do not alter source camera poses or Blender source geometry.',
            **({'webNarrowPlacement': entry['narrowPlacement']} if entry.get('narrowPlacement') else {})}


def add_text_layers(bpy, chapter, revision, roles, exported=None):
    """Keep title and body editable inside a unit frame shared with CSS3D."""
    if not revision.get('textLayers'):
        return [], []
    from mathutils import Matrix
    font, font_record = choose_chinese_font(bpy)
    changes = []
    for entry in revision['textLayers']:
        if entry.get('layout') == 'vertical':
            if exported is None:
                raise ValueError('Vertical reading-range text needs the original scene route.')
            changes.append(add_vertical_text_layer(bpy, chapter, entry, roles, font, reading_route(exported, chapter)))
            continue
        base_name = f"CH{chapter:02d}_TEXT_{entry['id']}_{entry['name']}"
        anchor = bpy.data.objects.new(base_name, None)
        roles['装饰层'].objects.link(anchor)
        anchor.matrix_world = Matrix([[entry['matrix'][column * 4 + row] for column in range(4)] for row in range(4)])
        metadata = {'stable_id': entry['id'] + '-anchor', 'original_name': entry['name'],
                    'narrative': entry['narrative'], 'treatment': '新增可编辑文字',
                    'motion_role': 'static', 'layer_role': '装饰层'}
        for key, value in metadata.items():
            anchor[key] = value
        anchor['progress_range'] = entry.get('range', [0, 1])
        anchor['text_variant'] = entry.get('variant', 'caption')
        color = entry.get('color', '#73533d').lstrip('#')
        if len(color) != 6:
            raise ValueError('Editable text color must be a six-digit RGB hex value: ' + entry['id'])
        srgb = [int(color[index:index + 2], 16) / 255 for index in (0, 2, 4)]
        linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in srgb]
        material = bpy.data.materials.new(base_name + '_墨色')
        material.use_nodes = True
        nodes = material.node_tree.nodes
        nodes.clear()
        output = nodes.new('ShaderNodeOutputMaterial')
        emission = nodes.new('ShaderNodeEmission')
        emission.inputs['Color'].default_value = (*linear, 1)
        material.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
        created = []
        text_parts = [('title', entry['title'], (-.46, .44, .92, .25)),
                      ('body', '\n'.join(entry['lines']), (-.46, .08, .92, .50))]
        if entry.get('variant') == 'seal':
            text_parts = [('seal', '\n'.join(entry['title']), (-.42, .44, .84, .88))]
        for part, body, box in text_parts:
            curve = bpy.data.curves.new(base_name + '_' + part, type='FONT')
            curve.body = body
            curve.font = font
            curve.size = 1
            curve.space_line = 1.25
            curve.align_x = 'LEFT'
            curve.align_y = 'TOP_BASELINE'
            obj = bpy.data.objects.new(base_name + '_' + part, curve)
            roles['装饰层'].objects.link(obj)
            obj.parent = anchor
            curve.materials.append(material)
            bpy.context.view_layer.update()
            min_x, max_x = min(point[0] for point in obj.bound_box), max(point[0] for point in obj.bound_box)
            min_y, max_y = min(point[1] for point in obj.bound_box), max(point[1] for point in obj.bound_box)
            dom_width, dom_height = entry.get('domWidth', 640), entry.get('domHeight', 250)
            width, height = max(max_x - min_x, 1e-6), max(max_y - min_y, 1e-6)
            font_pixels = min(box[2] * dom_width / width, box[3] * dom_height / height)
            scale_x, scale_y = font_pixels / dom_width, font_pixels / dom_height
            obj.scale = (scale_x, scale_y, scale_y)
            obj.location = (box[0] - min_x * scale_x, box[1] - max_y * scale_y, .002)
            for key, value in metadata.items():
                obj[key] = entry['id'] + '-' + part if key == 'stable_id' else value
            obj['progress_range'] = entry.get('range', [0, 1])
            created.append({'name': obj.name, 'part': part, 'body': body, 'font': font.name})
        changes.append({'id': entry['id'], 'anchor': anchor.name, 'editableObjects': created,
                        'matrix': matrix(anchor.matrix_world), 'range': entry.get('range', [0, 1])})
    return changes, [font_record]


def validate_world_paper(config):
    """An explicit derived World replaces retired paper geometry, never the source file."""
    if config is None:
        return None
    if (not isinstance(config, dict) or not isinstance(config.get('color'), str)
            or not re.fullmatch(r'#[0-9a-fA-F]{6}', config['color'])):
        raise ValueError('worldPaper.color requires an explicit six-digit sRGB hex color.')
    strength = config.get('strength', 1)
    if isinstance(strength, bool) or not isinstance(strength, (int, float)) or not math.isfinite(strength) or strength <= 0:
        raise ValueError('worldPaper.strength must be finite and positive.')
    if not isinstance(config.get('narrative'), str) or not config['narrative'].strip():
        raise ValueError('worldPaper requires explicit narrative ownership.')
    srgb = [int(config['color'][index:index + 2], 16) / 255 for index in (1, 3, 5)]
    return {'color': config['color'].lower(), 'strength': strength, 'narrative': config['narrative'],
            'colorLinear': [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in srgb]}


def world_shader_state(world):
    """Capture a World's visible shader state without changing its source datablock."""
    if world is None:
        return None
    state = {'name': world.name, 'useNodes': world.use_nodes,
             'color': [round(float(value), 7) for value in world.color], 'nodes': [], 'links': []}
    if not world.use_nodes or not world.node_tree:
        return state
    for node in world.node_tree.nodes:
        record = {'name': node.name, 'type': node.type, 'inputs': [],
                  'parameters': {key: getattr(node, key) for key in ('is_active_output', 'target') if hasattr(node, key)}}
        for socket in node.inputs:
            if not hasattr(socket, 'default_value'):
                continue
            value = socket.default_value
            if isinstance(value, float):
                value = round(value, 7)
            elif not isinstance(value, (int, str, bool)):
                try:
                    value = [round(float(item), 7) for item in value]
                except (TypeError, ValueError):
                    continue
            record['inputs'].append([socket.name, value])
        state['nodes'].append(record)
    state['nodes'].sort(key=lambda item: item['name'])
    state['links'] = sorted([link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name]
                            for link in world.node_tree.links)
    return state


def apply_world_paper(bpy, chapter, config):
    settings = validate_world_paper(config)
    if settings is None:
        return None
    scene = bpy.context.scene
    source_world = scene.world
    before = world_shader_state(source_world)
    source_fake_user = bool(source_world.use_fake_user) if source_world else None
    name = f'RECON_CH{chapter:02d}_PAPER_WORLD'
    if bpy.data.worlds.get(name):
        raise ValueError('Derived paper World already exists; select the original source: ' + name)
    world = bpy.data.worlds.new(name)
    world.use_nodes = True
    world.color = settings['colorLinear']
    world['reconstruction_paper_color'] = settings['color']
    world['narrative'] = settings['narrative']
    nodes = world.node_tree.nodes
    nodes.clear()
    background = nodes.new('ShaderNodeBackground')
    background.inputs['Color'].default_value = (*settings['colorLinear'], 1)
    background.inputs['Strength'].default_value = settings['strength']
    output = nodes.new('ShaderNodeOutputWorld')
    world.node_tree.links.new(background.outputs['Background'], output.inputs['Surface'])
    film_before = bool(scene.render.film_transparent)
    if source_world:
        # Keep the detached original shader available in this derived copy.
        source_world.use_fake_user = True
    scene.world = world
    scene.render.film_transparent = False
    return {'requested': settings, 'sourceWorld': before, 'derivedWorld': world_shader_state(world),
            'sourceWorldFakeUserBefore': source_fake_user,
            'sourceWorldRetainedWithFakeUser': bool(source_world.use_fake_user) if source_world else None,
            'sourceFilmTransparent': film_before, 'derivedFilmTransparent': False,
            'policy': 'Dedicated visible paper-color World; original World shader retained; only the derived scene changes.'}


def verify_world_paper(bpy, background):
    paper = background.get('worldPaper')
    if paper is None:
        if background.get('worldModified'):
            raise AssertionError('Modified World requires explicit paper-background evidence.')
        return 'legacy-or-unmodified'
    if (not background.get('worldModified') or world_shader_state(bpy.context.scene.world) != paper['derivedWorld']
            or bool(bpy.context.scene.render.film_transparent) != paper['derivedFilmTransparent']):
        raise AssertionError('Paper World shader or visible-background setting changed after reopen.')
    source = paper['sourceWorld']
    if source:
        retained = bpy.data.worlds.get(source['name'])
        if not retained or retained == bpy.context.scene.world or world_shader_state(retained) != source or not retained.use_fake_user:
            raise AssertionError('Original World shader was not retained separately in the derived copy.')
    return 'dedicated-visible-world-and-retained-source-shader-matched'


def apply_paper_background_policy(bpy, revision, exported, chapter=0):
    """Keep a distant paper backdrop; let flat paper ground stop clipping cards."""
    records = []
    hidden_ground = []
    for name in revision.get('backgroundMeshNames', []):
        obj = bpy.context.scene.objects.get(name)
        geometry = next((mesh for mesh in exported['meshes'] if mesh['name'] == name), None)
        if not obj or not geometry:
            raise ValueError('Declared paper-background object is missing: ' + name)
        material = exported['materials'][geometry['material']]
        if material.get('texture'):
            raise ValueError('Only explicitly declared untextured paper may change background presentation: ' + name)
        spans = [geometry['bounds']['max'][axis] - geometry['bounds']['min'][axis] for axis in range(3)]
        is_ground = min(range(3), key=lambda axis: spans[axis]) == 2
        was_hidden = obj.hide_render
        if is_ground:
            obj.hide_render = True
            obj['paper_background_policy'] = 'hide-ground-render-to-prevent-card-intersection'
            hidden_ground.append(name)
        else:
            obj['paper_background_policy'] = 'retain-distant-paper-backdrop'
        records.append({'name': name, 'sourceHiddenRender': was_hidden, 'derivedHiddenRender': obj.hide_render,
                        'worldAxisSpans': spans, 'mode': obj['paper_background_policy'],
                        'sourceMaterial': material['name'], 'sourceColorLinear': material['color']})
    world_paper = apply_world_paper(bpy, chapter, revision.get('worldPaper'))
    if records and not any(not record['derivedHiddenRender'] for record in records) and world_paper is None:
        raise ValueError('No visible paper backdrop remains; configure an explicit background before saving.')
    return {'mode': 'dedicated-paper-world-with-explicit-source-paper-retirement' if world_paper else
                    ('retain-paper-backdrop-hide-only-horizontal-ground' if records else 'original-paper-background-unchanged'),
            'objects': records, 'hiddenGroundPaperNames': hidden_ground,
            'worldModified': world_paper is not None, 'sourceMatricesModified': False,
            **({'worldPaper': world_paper} if world_paper else {})}


def derived_state(bpy, original_names):
    hidden = [obj for obj in bpy.context.scene.objects
              if obj.hide_viewport and (obj.get('text_layout') == 'vertical' or obj.get('blender_text_retired'))]
    for obj in hidden:
        obj.hide_viewport = False
    bpy.context.view_layer.update()
    try:
        return _derived_state(bpy, original_names)
    finally:
        for obj in hidden:
            obj.hide_viewport = True


def _derived_state(bpy, original_names):
    bpy.context.view_layer.update()
    def shader_graph(material):
        if not material:
            return None
        graph = {'name': material.name, 'nodes': [], 'links': []}
        if not material.use_nodes or not material.node_tree:
            return graph
        for node in material.node_tree.nodes:
            record = {'name': node.name, 'type': node.type,
                      'image': node.image.name if node.type == 'TEX_IMAGE' and node.image else None,
                      'parameters': {key: getattr(node, key) for key in
                                     ('operation', 'interpolation_type', 'extension', 'interpolation', 'use_clamp', 'clamp')
                                     if hasattr(node, key)}, 'defaults': []}
            for socket in node.inputs:
                if not hasattr(socket, 'default_value'):
                    continue
                value = socket.default_value
                if not isinstance(value, (float, int, str, bool)):
                    try:
                        value = [round(float(item), 7) for item in value]
                    except (TypeError, ValueError):
                        continue
                elif isinstance(value, float):
                    value = round(value, 7)
                record['defaults'].append([socket.name, value])
            graph['nodes'].append(record)
        graph['links'] = sorted([link.from_node.name, link.from_socket.name,
                                 link.to_node.name, link.to_socket.name] for link in material.node_tree.links)
        return graph
    objects = {}
    for obj in bpy.context.scene.objects:
        objects[obj.name] = {'stable_id': obj.get('stable_id'), 'original_name': obj.get('original_name'),
                             'narrative': obj.get('narrative'), 'treatment': obj.get('treatment'),
                             'motion_role': obj.get('motion_role'), 'hiddenRender': obj.hide_render,
                             'matrixWorldAtStart': matrix(obj.matrix_world),
                             'collections': sorted(collection.name for collection in obj.users_collection)}
        provenance = {key: obj[key] for key in ('reconstruction_asset', 'reconstruction_production_png',
                                               'reconstruction_opacity', 'web_render_order',
                                               'web_depth_test', 'web_depth_write') if key in obj}
        if 'reconstruction_uv_rect' in obj:
            provenance['reconstruction_uv_rect'] = list(obj['reconstruction_uv_rect'])
        if provenance:
            objects[obj.name]['addedLayerProvenance'] = provenance
        if obj.type == 'MESH':
            payload = {'vertices': [[round(value, 7) for value in vertex.co] for vertex in obj.data.vertices],
                       'uvs': [[round(value, 7) for value in loop.uv] for loop in obj.data.uv_layers.active.data]
                       if obj.data.uv_layers.active else []}
            objects[obj.name]['geometrySha256'] = hashlib.sha256(json.dumps(payload, separators=(',', ':')).encode()).hexdigest()
        elif obj.type == 'FONT':
            objects[obj.name]['editableText'] = obj.data.body
            objects[obj.name]['font'] = obj.data.font.name
        if getattr(obj.data, 'materials', None):
            payload = [shader_graph(material) for material in obj.data.materials]
            objects[obj.name]['materialsSha256'] = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    ids = [item['stable_id'] for item in objects.values()]
    if any(not value for value in ids) or len(ids) != len(set(ids)):
        raise AssertionError('All derived scene objects require unique stable IDs.')
    return objects


def verify_derived(bpy, evidence):
    allowed_hidden = evidence.get('hiddenMeshNames', []) + evidence.get('hiddenBlenderTextNames', []) + evidence.get('backgroundPresentation', {}).get('hiddenGroundPaperNames', [])
    assert_original_scene_unchanged(bpy, evidence['originalScene'], allowed_hidden)
    world_verification = verify_world_paper(bpy, evidence.get('backgroundPresentation', {}))
    actual = derived_state(bpy, evidence['originalScene']['objects'])
    if actual != evidence['derivedObjects']:
        raise AssertionError('Reopened reconstruction object metadata, geometry, or Collection links differ.')
    for record in evidence['packedImages']:
        image = bpy.data.images.get(record['name'])
        if not image or not image.packed_file:
            raise AssertionError('Self-contained packed image missing after reopen: ' + record['name'])
        digest = hashlib.sha256(bytes(image.packed_file.data)).hexdigest()
        if digest != record['packedSha256']:
            raise AssertionError('Packed image bytes changed after reopen: ' + record['name'])
    for record in evidence.get('packedFonts', []):
        font = bpy.data.fonts.get(record['name'])
        if not font or not font.packed_file or hashlib.sha256(bytes(font.packed_file.data)).hexdigest() != record['packedSha256']:
            raise AssertionError('Editable Chinese font was not preserved in the reconstruction: ' + record['name'])
    full_uv_carriers = []
    preserved_regions = []
    permitted_geometry = {target['name'] for replacement in evidence['replacements'] + evidence.get('geometryRepairs', [])
                          for target in replacement['targets']}
    layout_final = {}
    for adjustment in evidence.get('layoutAdjustments', []):
        for target in adjustment['targets']:
            if target['matrixWorldBefore'] != target['matrixWorldAfter']:
                raise AssertionError('Layout evidence declares a changed source matrix: ' + target['name'])
            if (target['geometryBefore']['topologySha256'] != target['geometryAfter']['topologySha256']
                    or target['geometryBefore']['uvLayersSha256'] != target['geometryAfter']['uvLayersSha256']):
                raise AssertionError('Layout evidence declares changed source topology/UV: ' + target['name'])
            if target['name'] in layout_final and layout_final[target['name']]['geometryAfter'] != target['geometryBefore']:
                raise AssertionError('Sequential layout geometry evidence is discontinuous: ' + target['name'])
            layout_final[target['name']] = target
    permitted_geometry.update(layout_final)
    if layout_final:
        final_geometry = source_mesh_geometry_snapshot(bpy, layout_final)
        for name, target in layout_final.items():
            if final_geometry[name] != target['geometryAfter'] or matrix(bpy.context.scene.objects[name].matrix_world) != target['matrixWorldBefore']:
                raise AssertionError('Reopened layout vertices or source world matrix differ: ' + name)
    for name in evidence.get('hiddenBlenderTextNames', []):
        obj = bpy.context.scene.objects.get(name)
        if obj is None or obj.type != 'FONT' or not obj.hide_render or not obj.hide_viewport:
            raise AssertionError('Retired source text is not hidden in render and viewport: ' + name)
    if 'originalMeshGeometry' in evidence:
        assert_original_geometry_policy(evidence['originalMeshGeometry'],
                                        source_mesh_geometry_snapshot(bpy, evidence['originalMeshGeometry']), permitted_geometry)
    for replacement in evidence['replacements'] + evidence.get('geometryRepairs', []):
        for target in replacement['targets']:
            if target.get('geometryPolicy') == 'preserve-region':
                obj = bpy.context.scene.objects.get(target['name'])
                expected_positions = target.get('layoutAdjustedPositionsSha256', target['positionsSha256Before'])
                if (not obj or obj.type != 'MESH' or mesh_positions_sha(obj.data) != expected_positions
                        or target['positionsSha256Before'] != target['positionsSha256After']
                        or len(obj.data.vertices) != target['vertexCount'] or len(obj.data.polygons) != target['polygonCount']):
                    raise AssertionError('Preserved-region topology or source positions changed: ' + target['name'])
                expected_uvs = remap_region_uv(target['originalLoopUvs'], target['uvInsetRect'])
                actual_uvs = [float(value) for loop in obj.data.uv_layers.active.data for value in loop.uv]
                if len(expected_uvs) != len(actual_uvs) or any(abs(a - b) > 1e-7 for a, b in zip(expected_uvs, actual_uvs)):
                    raise AssertionError('Preserved-region UV registration changed: ' + target['name'])
                preserved_regions.append(target['name'])
                continue
            if not target.get('fullUvCarrier'):
                raise AssertionError('A replacement retained the clipped source UV geometry: ' + target['name'])
            obj = bpy.context.scene.objects.get(target['name'])
            if not obj or obj.type != 'MESH' or len(obj.data.vertices) != 4 or len(obj.data.polygons) != 1:
                raise AssertionError('Replacement is not a complete four-corner image carrier: ' + target['name'])
            coordinates = {(round(loop.uv.x, 7), round(loop.uv.y, 7)) for loop in obj.data.uv_layers.active.data}
            if coordinates != {(0, 0), (1, 0), (1, 1), (0, 1)}:
                raise AssertionError('Replacement does not cover the entire image UV domain: ' + target['name'])
            if target.get('geometryPolicy') == 'explicit-corners':
                corners = target.get('layoutAdjustedPaddedCorners', target['paddedCorners'])
                if any(abs(value - desired) > 1e-6 for vertex, expected in zip(obj.data.vertices, corners)
                       for value, desired in zip(vertex.co, expected)):
                    raise AssertionError('Explicit local painting corners changed after reopen: ' + target['name'])
            full_uv_carriers.append(target['name'])
    text_visibility = verify_text_visibility(bpy, evidence.get('editableTextLayers', []))
    role_counts = {}
    for role in ROLES:
        collection = bpy.data.collections.get(f"CH{evidence['chapter']:02d}_{ROLES.index(role) + 1:02d}_{role}")
        if not collection:
            raise AssertionError('Required role Collection missing: ' + role)
        role_counts[role] = len(collection.objects)
    result = {'originalObjectWorldMatrices': 'unchanged', 'originalCameraSamples': 'unchanged',
            'originalAnimatedObjectSamples': 'unchanged',
            'originalMarkers': 'unchanged', 'originalHierarchyAndCollections': 'unchanged',
            'explicitRenderHideExceptions': allowed_hidden,
            'paperBackgroundPolicy': evidence.get('backgroundPresentation', {}).get('mode'),
            'paperWorld': world_verification,
            'worldModified': evidence.get('backgroundPresentation', {}).get('worldModified', False),
            'derivedGeometryAndMetadata': 'reopened-and-matched',
            'packedImagesVerified': len(evidence['packedImages']),
            'packedFontsVerified': len(evidence.get('packedFonts', [])),
            'editableTextObjectCount': sum('editableText' in item for item in actual.values()),
            'completeReplacementUvCarriersVerified': full_uv_carriers,
            'preservedGeometryRegionUvMappingsVerified': preserved_regions,
            'originalMeshGeometryOutsideDeclaredTargets': 'unchanged' if 'originalMeshGeometry' in evidence else 'legacy-evidence-no-separate-baseline',
            'explicitGeometryChangeTargets': sorted(permitted_geometry),
            'roleCollectionCounts': role_counts}
    if layout_final:
        result['layoutAdjustedGeometryVerified'] = sorted(layout_final)
    if text_visibility:
        result['readingRangeTextVisibilityVerified'] = text_visibility
    return result


def verify_text_visibility(bpy, text_records):
    verified = []
    try:
        for record in text_records:
            visibility = record.get('visibility')
            if not visibility:
                continue
            start, end = visibility['sourceFrameRange']
            samples = visibility['opacitySamples']
            # Inspect every saved curve sample and intervening midpoint without
            # repeatedly re-evaluating a full authored scene for invisible text.
            tests = [*samples]
            tests.extend({'progress': (a['progress'] + b['progress']) / 2,
                          'frame': (a['frame'] + b['frame']) / 2}
                         for a, b in zip(samples, samples[1:]))
            config = {'range': visibility['progressRange'], 'fade': visibility['fade']}
            largest_error = 0.0
            for node_record in visibility['alphaSockets']:
                material = bpy.data.materials.get(node_record['material'])
                node = material.node_tree.nodes.get(node_record['node']) if material else None
                if node is None:
                    raise AssertionError('Saved editable text alpha node is missing: ' + record['id'])
                path = node.inputs[0].path_from_id('default_value')
                curves = [curve for curve in action_fcurves(material.node_tree) if curve.data_path == path]
                if len(curves) != 1:
                    raise AssertionError('Saved editable text alpha animation channel differs: ' + record['id'])
                for sample in tests:
                    expected = text_opacity(config, sample['progress'])
                    error = abs(curves[0].evaluate(sample['frame']) - expected)
                    largest_error = max(largest_error, error)
                    if error > visibility.get('opacityApproximationErrorBound', 0) + 2e-4:
                        raise AssertionError('Saved text smoothstep fade exceeds its recorded error bound: ' + record['id'])
            # Also exercise the actual animated object/node properties through
            # the depsgraph at both edges, mid-fades, centre and outside ranges.
            wanted = {0.0, 1.0, *visibility['progressRange'], sum(visibility['progressRange']) / 2,
                      min(visibility['progressRange'][1], visibility['progressRange'][0] + visibility['fade'] / 2),
                      max(visibility['progressRange'][0], visibility['progressRange'][1] - visibility['fade'] / 2)}
            probes = [min(samples, key=lambda sample: abs(sample['progress'] - progress)) for progress in sorted(wanted)]
            for sample in probes:
                frame = sample['frame']
                bpy.context.scene.frame_set(math.floor(frame), subframe=frame - math.floor(frame))
                bpy.context.view_layer.update()
                expected_hidden = frame < start - 1e-6 or frame > end + 1e-6
                for name in visibility['visibleObjectNames']:
                    obj = bpy.context.scene.objects.get(name)
                    if obj is None or bool(obj.hide_render) != expected_hidden or bool(obj.hide_viewport) != expected_hidden:
                        actual = [obj.hide_render, obj.hide_viewport] if obj else None
                        raise AssertionError(f'Text reading range did not survive source-frame evaluation: {name} frame={frame} range={[start, end]} expected_hidden={expected_hidden} actual={actual}')
                for node_record in visibility['alphaSockets']:
                    material = bpy.data.materials.get(node_record['material'])
                    node = material.node_tree.nodes.get(node_record['node']) if material else None
                    if node is None or abs(node.inputs[0].default_value - sample['opacity']) > 2e-4:
                        actual = node.inputs[0].default_value if node else None
                        raise AssertionError(f"Text fade did not survive source-frame evaluation: {record['id']} frame={frame} expected={sample['opacity']} actual={actual}")
            verified.append({'id': record['id'], 'samples': len(samples), 'savedCurveSamplesAndMidpoints': len(tests),
                             'actualDepsgraphProbes': len(probes), 'largestMeasuredAlphaError': largest_error,
                             'sourceFrameRange': [start, end]})
    finally:
        bpy.context.scene.frame_set(bpy.context.scene.frame_start)
    return verified


def main():
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-config', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--chapter', type=int, choices=(1, 2, 3, 4), required=True)
    parser.add_argument('--output-dir', default='artwork/blender-reconstructed')
    parser.add_argument('--report-dir', default='reports/reconstruction', help='Keep a subsequent art pass evidence separate from earlier delivered copies')
    parser.add_argument('--inventory', default='reports/reconstruction/layers-inventory.json')
    parser.add_argument('--materials-root', default='source/牡丹/素材')
    parser.add_argument('--check-only', action='store_true', help='Verify paths and manifest resources; do not load or save Blender scenes.')
    parser.add_argument('--dry-run', action='store_true', help='Apply and verify the complete reconstruction in memory; never save a .blend.')
    options = parser.parse_args(args)
    source_config = resolve_path(options.source_config)
    sources = load_sources(source_config)
    key = f'chapter-{options.chapter}'
    if key not in sources:
        parser.error('Source config does not include ' + key)
    manifest_path = resolve_path(options.manifest)
    manifest, revision, resources = load_revision(manifest_path, options.chapter)
    exported = read_json(ROOT / 'public' / 'assets' / key / 'scene.json')
    validate_export_targets(revision, exported)
    inventory_path = resolve_path(options.inventory)
    inventory = read_json(inventory_path)
    delivery = validate_delivery_paths(
        resolve_path(options.output_dir) / f'chapter-{options.chapter}_reconstructed.blend',
        options.report_dir, options.chapter, sources, manifest_path,
        [source_config, inventory_path, *[resolve_path(resource['path']) for resource in resources]])
    output = delivery['output']
    if options.check_only:
        print('RECONSTRUCTION_PREFLIGHT_OK', key, 'resources', len(resources),
              'output', output, 'report', delivery['saved'], flush=True)
        return
    import bpy
    hashes_before = {name: sha256(path) for name, path in sources.items()}
    temporary = output.parent / ('.' + output.stem + '-' + uuid.uuid4().hex + '.blend')
    saved = False
    try:
        bpy.ops.wm.open_mainfile(filepath=str(sources[key]), load_ui=False, use_scripts=False)
        baseline = original_scene_snapshot(bpy)
        original_geometry = source_mesh_geometry_snapshot(bpy)
        roles = create_role_collections(bpy, options.chapter)
        motion_roles = revision.get('motionRoles', {})
        annotate_original_objects(bpy, options.chapter, inventory, roles, motion_roles)
        replacements = apply_replacements(bpy, options.chapter, revision, exported, roles)
        geometry_repairs = apply_geometry_repairs(bpy, revision, exported, roles)
        layout_adjustments = apply_layout_adjustments(bpy, revision, roles, replacements + geometry_repairs)
        repairs = apply_edge_repairs(bpy, revision, roles)
        added = add_layers(bpy, options.chapter, revision, roles)
        hidden = apply_hidden_layers(bpy, revision)
        hidden_text = apply_hidden_blender_text(bpy, revision)
        background = apply_paper_background_policy(bpy, revision, exported, options.chapter)
        texts, fonts = add_text_layers(bpy, options.chapter, revision, roles, exported)
        packed = relink_and_pack_used_images(bpy, resolve_path(options.materials_root))
        assert_original_scene_unchanged(bpy, baseline, hidden + hidden_text + background['hiddenGroundPaperNames'])
        evidence = {'schemaVersion': 1, 'chapter': options.chapter, 'status': 'verifying',
                    'original': relative_path(sources[key]), 'output': relative_path(output),
                    'sourceHashesBefore': hashes_before, 'manifest': relative_path(manifest_path),
                    'manifestSha256': sha256(manifest_path), 'inputResources': resources,
                    'originalScene': baseline, 'replacements': replacements, 'edgeRepairs': repairs,
                    'originalMeshGeometry': original_geometry,
                    'geometryRepairs': geometry_repairs,
                    'addedLayers': added, 'packedImages': packed,
                    'hiddenMeshNames': hidden, 'editableTextLayers': texts, 'packedFonts': fonts,
                    'backgroundPresentation': background,
                    'derivedObjects': derived_state(bpy, baseline['objects'])}
        if layout_adjustments:
            evidence['layoutAdjustments'] = layout_adjustments
        if hidden_text:
            evidence['hiddenBlenderTextNames'] = hidden_text
        if options.dry_run:
            evidence['verification'] = verify_derived(bpy, evidence)
            evidence['sourceHashesAfter'] = {name: sha256(path) for name, path in sources.items()}
            if evidence['sourceHashesAfter'] != hashes_before:
                raise AssertionError('An original source checksum changed during the memory-only dry run.')
            evidence['status'] = 'dry-run-verified'
            evidence['savedBlendFiles'] = 0
            evidence['originalFilesUnchanged'] = True
            report = delivery['dry_run']
            write_json(report, evidence)
            print('RECONSTRUCTION_DRY_RUN_VERIFIED', key, 'report', relative_path(report), flush=True)
            return
        bpy.context.scene['reconstruction_chapter'] = options.chapter
        bpy.context.scene['reconstruction_manifest'] = relative_path(manifest_path)
        bpy.context.scene['original_source_sha256'] = hashes_before[key]
        output.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(temporary), check_existing=False, compress=True)
        saved = True
        bpy.ops.wm.open_mainfile(filepath=str(temporary), load_ui=False, use_scripts=False)
        verify_derived(bpy, evidence)
        hashes_after = {name: sha256(path) for name, path in sources.items()}
        if hashes_after != hashes_before:
            raise AssertionError('An original source checksum changed while reconstructing.')
        os.replace(temporary, output)
        saved = False
        bpy.ops.wm.open_mainfile(filepath=str(output), load_ui=False, use_scripts=False)
        evidence['verification'] = verify_derived(bpy, evidence)
        evidence['sourceHashesAfter'] = {name: sha256(path) for name, path in sources.items()}
        if evidence['sourceHashesAfter'] != hashes_before:
            raise AssertionError('An original source checksum changed after reconstruction reopen.')
        evidence['originalFilesUnchanged'] = True
        evidence['outputSha256'] = sha256(output)
        evidence['status'] = 'verified'
        report = delivery['saved']
        write_json(report, evidence)
        print('RECONSTRUCTION_VERIFIED', relative_path(output), 'report', relative_path(report), flush=True)
    finally:
        if saved and temporary.is_file():
            temporary.unlink()


if __name__ == '__main__':
    main()

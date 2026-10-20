"""Read source .blend files without saving them; write reconstruction evidence only.

Run in Blender (disable embedded Python auto-execution):
  blender --background --factory-startup --disable-autoexec --python source-audit.py
  blender ... --python source-audit.py -- --sources-json source-paths.local.json

The optional JSON maps chapter-1 through chapter-4 to .blend paths. Relative
paths are resolved against that JSON. Without it, the last recorded source
locations are checked and any missing files are reported explicitly.
"""
import argparse
import collections
import datetime
import hashlib
import json
import sys
from pathlib import Path

import bpy

REPORT_DIR = Path(__file__).resolve().parent
ROOT = REPORT_DIR.parents[1]


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def numbers(values):
    return [round(float(value), 7) for value in values]


def matrix(value):
    return numbers(value[row][column] for column in range(4) for row in range(4))


def inspect_source(chapter, path, image_index):
    before = digest(path)
    source_stat = path.stat()
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    saved_frame = scene.frame_current
    scene.frame_set(scene.frame_start)
    objects = []
    for obj in scene.objects:
        item = {
            'name': obj.name, 'type': obj.type,
            'parent': obj.parent.name if obj.parent else None,
            'children': [child.name for child in obj.children],
            'collections': [collection.name for collection in obj.users_collection],
            'matrixWorld': matrix(obj.matrix_world),
            'dimensions': numbers(obj.dimensions), 'hiddenRender': obj.hide_render,
            'constraints': [{'name': con.name, 'type': con.type,
                             'target': getattr(getattr(con, 'target', None), 'name', None)}
                            for con in obj.constraints],
            'modifiers': [{'name': mod.name, 'type': mod.type} for mod in obj.modifiers],
            'animation': {
                'action': getattr(getattr(obj.animation_data, 'action', None), 'name', None),
                'drivers': len(obj.animation_data.drivers) if obj.animation_data else 0,
                'nlaTracks': len(obj.animation_data.nla_tracks) if obj.animation_data else 0,
            },
            'materials': [mat.name if mat else None for mat in obj.data.materials]
            if getattr(obj.data, 'materials', None) is not None else [],
        }
        if obj.type == 'EMPTY':
            item['emptyDisplayType'] = obj.empty_display_type
        elif obj.type == 'MESH':
            item['mesh'] = {'dataName': obj.data.name,
                            'vertices': len(obj.data.vertices),
                            'polygons': len(obj.data.polygons),
                            'uvLayers': [uv.name for uv in obj.data.uv_layers]}
        elif obj.type == 'CAMERA':
            item['camera'] = {'type': obj.data.type, 'lens': obj.data.lens,
                              'orthoScale': obj.data.ortho_scale,
                              'sensorFit': obj.data.sensor_fit,
                              'clipStart': obj.data.clip_start, 'clipEnd': obj.data.clip_end}
        elif obj.type == 'FONT':
            item['text'] = obj.data.body
        objects.append(item)

    def collection_tree(collection):
        return {
            'name': collection.name, 'hiddenRender': collection.hide_render,
            'objects': [obj.name for obj in collection.objects],
            'children': [collection_tree(child) for child in collection.children],
        }

    image_use = collections.defaultdict(list)
    materials = []
    for material in bpy.data.materials:
        nodes = material.node_tree.nodes if material.use_nodes and material.node_tree else []
        images = []
        for node in nodes:
            if node.type == 'TEX_IMAGE' and node.image:
                images.append(node.image.name)
                image_use[node.image.name].append(material.name)
        materials.append({'name': material.name, 'users': material.users,
                          'images': images, 'nodeTypes': [node.type for node in nodes]})
    images = []
    for image in bpy.data.images:
        resolved = Path(bpy.path.abspath(image.filepath)) if image.filepath else None
        original_name = str(image.filepath).replace('\\', '/').rsplit('/', 1)[-1]
        candidates = image_index.get(original_name.casefold(), [])
        original_parts = [part.casefold() for part in str(image.filepath).replace('\\', '/').split('/') if part not in ('', '.', '..')]
        def suffix_score(candidate):
            score = 0
            for left, right in zip(reversed(original_parts), reversed(candidate.parts)):
                if left != right.casefold():
                    break
                score += 1
            return score
        highest_suffix = max((suffix_score(candidate) for candidate in candidates), default=0)
        preferred = [candidate for candidate in candidates if suffix_score(candidate) == highest_suffix]
        choices = preferred or candidates
        direct = resolved if resolved and resolved.is_file() else None
        replacement = direct or (choices[0] if len(choices) == 1 else None)
        images.append({
            'name': image.name, 'source': image.source, 'users': image.users,
            'path': image.filepath, 'resolvedPath': str(resolved) if resolved else None,
            'fileExists': resolved.is_file() if resolved else False,
            'packed': bool(image.packed_file),
            'packedSha256': hashlib.sha256(bytes(image.packed_file.data)).hexdigest()
            if image.packed_file else None,
            'size': list(image.size), 'channels': image.channels,
            'materials': image_use[image.name],
            'relink': {
                'required': bool(image.users and image.source == 'FILE' and not image.packed_file and not direct),
                'resolvedCandidate': str(replacement) if replacement else None,
                'resolvedCandidateSha256': digest(replacement) if replacement and not image.packed_file else None,
                'candidateCount': len(candidates), 'preferredCandidateCount': len(preferred),
                'matchedPathSuffixSegments': highest_suffix,
                'ambiguous': len(choices) > 1 and not direct,
                'candidates': [str(candidate) for candidate in choices],
                'method': 'existing-path' if direct else 'unique-longest-source-path-suffix' if replacement and highest_suffix > 1
                else 'unique-basename' if replacement else None,
                'applied': False,
            },
        })
    markers = [{'name': marker.name, 'frame': marker.frame,
                'camera': marker.camera.name if marker.camera else None}
               for marker in scene.timeline_markers]
    sample_frames = sorted({scene.frame_start, scene.frame_end,
                            *[marker.frame for marker in scene.timeline_markers]})
    camera_samples = []
    for frame in sample_frames:
        scene.frame_set(frame)
        camera = scene.camera
        if camera:
            evaluated = camera.evaluated_get(bpy.context.evaluated_depsgraph_get())
            camera_samples.append({'frame': frame, 'name': camera.name,
                                   'matrixWorld': matrix(evaluated.matrix_world),
                                   'lens': evaluated.data.lens})
    after = digest(path)
    if before != after:
        raise RuntimeError('Source checksum changed while being audited: ' + str(path))
    return {
        'id': chapter, 'status': 'source-read-verified', 'source': str(path),
        'sourceSha256Before': before, 'sourceSha256After': after,
        'sourceBytes': source_stat.st_size, 'originalUnchanged': before == after,
        'scene': scene.name, 'sourceSavedFrame': saved_frame, 'objectSampleFrame': scene.frame_start,
        'frameRange': [scene.frame_start, scene.frame_end],
        'fps': scene.render.fps, 'render': [scene.render.resolution_x, scene.render.resolution_y],
        'activeCamera': scene.camera.name if scene.camera else None,
        'collections': collection_tree(scene.collection), 'objects': objects,
        'materials': materials, 'images': images, 'markers': markers,
        'cameraSamples': camera_samples,
    }


args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--sources-json', type=Path)
parser.add_argument('--materials-root', type=Path)
options = parser.parse_args(args)
history_path = ROOT / 'reports' / 'assets-audit.json'
history = json.loads(history_path.read_text(encoding='utf-8-sig'))
history_by_id = {entry['id']: entry for entry in history}
source_map = {entry['id']: entry['source'] for entry in history}
if options.sources_json:
    config_path = options.sources_json.resolve()
    values = json.loads(config_path.read_text(encoding='utf-8-sig'))
    if not isinstance(values, dict) or set(values) - set(source_map):
        parser.error('Source JSON must map chapter-1 through chapter-4 to file paths.')
    for key, value in values.items():
        path = Path(value)
        source_map[key] = str((config_path.parent / path).resolve() if not path.is_absolute() else path.resolve())

image_index = collections.defaultdict(list)
if options.materials_root:
    for image_path in sorted(options.materials_root.resolve().rglob('*')):
        if image_path.is_file() and image_path.suffix.casefold() in {'.png', '.jpg', '.jpeg', '.tif', '.tiff', '.webp'}:
            image_index[image_path.name.casefold()].append(image_path)

chapters = []
for chapter, source in source_map.items():
    source_path = Path(source)
    manifest = ROOT / 'public' / 'assets' / chapter / 'scene.json'
    exported = json.loads(manifest.read_text(encoding='utf-8-sig'))
    previous = history_by_id[chapter]
    base = {
        'id': chapter, 'source': str(source_path),
        'historicalEvidence': {
            'path': str(history_path.relative_to(ROOT)).replace('\\', '/'),
            'sourceReadThisRun': False,
            'objectTypes': dict(collections.Counter(obj['type'] for obj in previous['objects'])),
            'objectCount': len(previous['objects']), 'imageCount': len(previous['images']),
            'packedImageCount': sum(image['packed'] for image in previous['images']),
            'camera': previous['camera'], 'markerCount': len(previous['markers']),
            'limitations': ['No Collection tree recorded', 'No object parent-child links recorded',
                            'No original .blend checksum recorded', 'Historical paths may have moved'],
        },
        'currentWebManifest': {
            'path': str(manifest.relative_to(ROOT)).replace('\\', '/'),
            'sha256': digest(manifest), 'meshCount': len(exported['meshes']),
            'materialCount': len(exported['materials']), 'textureCount': len(exported['images']),
            'readingStops': len(exported['stops']), 'cameraSamples': len(exported['cameras']),
            'animations': list(exported['animations']),
        },
    }
    if source_path.is_file():
        base.update(inspect_source(chapter, source_path, image_index))
        base['historicalEvidence']['sourceReadThisRun'] = True
        web_image_names = {image['sourceName'] for image in exported['images']}
        for image in base['images']:
            image['usedByCurrentWeb'] = image['name'] in web_image_names
        external = [image for image in base['images'] if image['relink']['required']]
        def collection_count(node):
            return 1 + sum(collection_count(child) for child in node['children'])
        base['summary'] = {
            'collectionCountExcludingRoot': collection_count(base['collections']) - 1,
            'objectTypes': dict(collections.Counter(obj['type'] for obj in base['objects'])),
            'parentedObjectCount': sum(bool(obj['parent']) for obj in base['objects']),
            'externalImagesNeedingRelink': len(external),
            'webImagesNeedingRelink': sum(image['usedByCurrentWeb'] for image in external),
            'relinkCandidatesResolved': sum(bool(image['relink']['resolvedCandidate']) for image in external),
            'relinkCandidatesUnresolved': sum(not image['relink']['resolvedCandidate'] for image in external),
            'relinksApplied': 0,
        }
        print('SOURCE_AUDIT_CHAPTER', chapter, 'objects', len(base['objects']),
              'images', len(base['images']), 'unchanged', base['originalUnchanged'], flush=True)
    else:
        base.update({'status': 'source-missing', 'sourceSha256Before': None,
                     'sourceSha256After': None, 'originalUnchanged': None,
                     'unverified': ['Current Collection / Empty hierarchy', 'Current source camera and markers',
                                    'Current source image links', 'Original .blend checksum',
                                    'Ability to save a reconstruction copy from the source']})
    chapters.append(base)

report = {
    'schemaVersion': 1, 'generatedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'scope': 'Read-only original source audit; reconstruction evidence only',
    'blender': {'binary': bpy.app.binary_path, 'version': bpy.app.version_string,
                'background': bpy.app.background, 'embeddedAutoExecution': bpy.context.preferences.filepaths.use_scripts_auto_execute},
    'originalSaveOperations': 0, 'historicalAuditSha256': digest(history_path),
    'materialsRoot': str(options.materials_root.resolve()) if options.materials_root else None,
    'materialImageFilesIndexed': sum(len(paths) for paths in image_index.values()),
    'status': 'verified' if all(chapter['status'] == 'source-read-verified' for chapter in chapters)
    else 'source-location-required',
    'chapters': chapters,
}
output = REPORT_DIR / 'source-audit.json'
output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print('SOURCE_AUDIT', report['status'], str(output), flush=True)

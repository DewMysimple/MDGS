"""Render read-only Blender previews of designed blank-region connections.

Run with Blender --background --factory-startup --disable-autoexec --python
scripts/render-blank-blender.py -- --blend <derived.blend> --manifest <frozen.json>
--chapter 4 --gaps 2 5 7 --output-dir <preview-directory> --width 1388 --height 476.

The original active camera is evaluated, never changed. A temporary camera uses
the exported vertical FOV at each layer's anchorFrame and the requested aspect.
Only Principled shader leaves are converted to source-color emission in memory;
existing image alpha, edge fades, opacity and outer shader mixes are retained.
No Blender file is saved. Input .blend and manifest hashes are checked on exit.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
_spec = importlib.util.spec_from_file_location('reconstruction_preview_helpers', Path(__file__).with_name('reconstruct-blender.py'))
_reconstruction = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_reconstruction)


def resolve_path(value):
    path = Path(value)
    return (path if path.is_absolute() else ROOT / path).resolve()


def relative_path(path):
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def sha256(path):
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def write_report(path, report):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, path)


def choose_anchors(manifest, chapter, gaps, reconstruction_report, stops=None, source_scene=None):
    entries = manifest['chapters'][str(chapter)]['addedLayers']
    by_gap = {}
    by_stop = {}
    names = {item['id']: item['name'] for item in reconstruction_report.get('addedLayers', [])}
    for item in entries:
        blank = item.get('blankDesign', {})
        gap = blank.get('gap')
        stop = blank.get('stop')
        if (gap is None and stop is None) or 'anchorFrame' not in item:
            continue
        frame = float(item['anchorFrame'])
        if not math.isfinite(frame):
            raise ValueError('Non-finite anchorFrame: ' + item['id'])
        kind, index, groups = ('gap', gap, by_gap) if gap is not None else ('stop', stop, by_stop)
        if index in groups and abs(frame - groups[index]['anchorFrame']) > 0.001:
            raise ValueError('Layers in one ' + kind + ' have conflicting anchor frames: ' + str(index))
        group = groups.setdefault(index, {kind: index, 'anchorFrame': frame,
                                       'progress': blank.get('progress'), 'newLayers': []})
        group['newLayers'].append({'id': item['id'], 'name': names.get(item['id']),
                                   'asset': item.get('asset'), 'opacity': item.get('opacity', 1)})
    # With neither selector, retain the original all-gap default. A stop-only
    # request must not silently append every gap or infer raw source progress:
    # the Web reading route reparameterizes source frames.
    requested = gaps if gaps is not None else ([] if stops else sorted(by_gap))
    missing = [gap for gap in requested if gap not in by_gap]
    if missing:
        raise ValueError('No frozen-manifest anchorFrame for gap(s): ' + str(missing))
    if source_scene is not None and stops:
        route = _reconstruction.reading_route(source_scene, chapter)
        for stop in stops:
            if not 1 <= stop <= len(source_scene['stops']):
                continue
            authored = source_scene['stops'][stop - 1]
            by_stop[stop] = {'stop': stop, 'anchorFrame': authored['frame'],
                             'progress': _reconstruction.route_interpolate(route, authored['frame'], 'frame', 'progress'),
                             'sourceStopName': authored['name'], 'anchorSource': 'actual source scene stop.frame',
                             'newLayers': by_stop.get(stop, {}).get('newLayers', [])}
    missing_stops = [stop for stop in (stops or []) if stop not in by_stop]
    if missing_stops:
        raise ValueError('No frozen-manifest anchorFrame for stop(s): ' + str(missing_stops))
    return [by_gap[gap] for gap in requested] + [by_stop[stop] for stop in (stops or [])]


def fov_at_frame(source_scene, frame):
    samples = source_scene['cameras']
    if frame <= samples[0]['frame']:
        return float(samples[0]['fov'])
    for first, second in zip(samples, samples[1:]):
        if frame <= second['frame']:
            span = second['frame'] - first['frame']
            fraction = (frame - first['frame']) / span if span else 0
            return first['fov'] + (second['fov'] - first['fov']) * fraction
    return float(samples[-1]['fov'])


def link_key(link):
    return (link.from_node.name, link.from_socket.identifier,
            link.to_node.name, link.to_socket.identifier)


def convert_principled_leaves(bpy):
    """Keep all pre-existing links except outgoing Principled BSDF connections."""
    visited = set()
    converted = []
    defaults_to_refresh = []
    graph_checks = []

    def visit(tree, owner):
        pointer = tree.as_pointer()
        if pointer in visited:
            return
        visited.add(pointer)
        original_nodes = list(tree.nodes)
        retained_links = {link_key(link) for link in tree.links
                          if link.from_node.type != 'BSDF_PRINCIPLED'}
        for node in original_nodes:
            if node.type == 'GROUP' and node.node_tree:
                visit(node.node_tree, owner + '/' + node.name)
            if node.type != 'BSDF_PRINCIPLED':
                continue
            output = node.outputs.get('BSDF')
            outgoing = list(output.links) if output else []
            if not outgoing:
                continue
            color = node.inputs.get('Base Color')
            alpha = node.inputs.get('Alpha')
            if color is None or alpha is None:
                raise ValueError('Principled leaf lacks Color/Alpha: ' + owner + '/' + node.name)
            emission = tree.nodes.new('ShaderNodeEmission')
            emission.name = 'PREVIEW_SourceColor_' + node.name
            emission.inputs['Strength'].default_value = 1
            transparent = tree.nodes.new('ShaderNodeBsdfTransparent')
            transparent.name = 'PREVIEW_OriginalAlphaTransparent_' + node.name
            transparent.inputs['Color'].default_value = (1, 1, 1, 1)
            mix = tree.nodes.new('ShaderNodeMixShader')
            mix.name = 'PREVIEW_OriginalPrincipledAlpha_' + node.name
            tree.links.new(transparent.outputs[0], mix.inputs[1])
            tree.links.new(emission.outputs[0], mix.inputs[2])
            if color.is_linked:
                tree.links.new(color.links[0].from_socket, emission.inputs['Color'])
            else:
                emission.inputs['Color'].default_value = color.default_value[:]
            if alpha.is_linked:
                tree.links.new(alpha.links[0].from_socket, mix.inputs[0])
            else:
                mix.inputs[0].default_value = alpha.default_value
            defaults_to_refresh.append((color, alpha, emission, mix))
            for old in outgoing:
                destination = old.to_socket
                tree.links.remove(old)
                tree.links.new(mix.outputs[0], destination)
            converted.append({'materialOrGroup': owner, 'originalNode': node.name,
                              'colorSource': 'original-link' if color.is_linked else 'animated-default-refreshed-per-frame',
                              'alphaSource': 'original-link' if alpha.is_linked else 'animated-default-refreshed-per-frame',
                              'outgoingShaderDestinationsPreserved': len(outgoing)})
        current_links = {link_key(link) for link in tree.links}
        missing = retained_links - current_links
        if missing:
            raise AssertionError('Preview changed non-Principled links: ' + repr(sorted(missing)))
        graph_checks.append({'materialOrGroup': owner, 'retainedOriginalLinks': len(retained_links),
                             'missingOriginalNonPrincipledLinks': 0})

    for material in bpy.data.materials:
        if material.use_nodes and material.node_tree:
            visit(material.node_tree, material.name)
    return converted, defaults_to_refresh, graph_checks


def refresh_shader_defaults(references):
    # Defaults may be animated/driven. Linked inputs stay connected to their
    # original sources and are not baked at the first preview frame.
    for color, alpha, emission, mix in references:
        if not color.is_linked:
            emission.inputs['Color'].default_value = color.default_value[:]
        if not alpha.is_linked:
            mix.inputs[0].default_value = alpha.default_value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blend', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--chapter', type=int, required=True, choices=range(1, 5))
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--reconstruction-report', required=True,
                        help='Saved reconstruction report: verifies blend/hash and maps stable IDs to Blender object names')
    parser.add_argument('--scene-json', help='Original exported scene.json; defaults to the project chapter asset')
    parser.add_argument('--gaps', type=int, nargs='+', help='Blank-design gap IDs; defaults to all available anchored gaps')
    parser.add_argument('--stops', type=int, nargs='+', help='Render actual source scene stop.frame with the matching prepared Web reading progress; stop-only requests render only those stops')
    parser.add_argument('--width', type=int, required=True)
    parser.add_argument('--height', type=int, required=True)
    parser.add_argument('--samples', type=int, default=8)
    parser.add_argument('--transparent-bounces', type=int, default=128)
    parser.add_argument('--threads', type=int, default=max(1, min(8, os.cpu_count() or 1)))
    options = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if min(options.width, options.height, options.samples, options.transparent_bounces, options.threads) < 1:
        parser.error('Render dimensions, samples, transparent bounces and threads must be positive')
    blend = resolve_path(options.blend)
    manifest_path = resolve_path(options.manifest)
    reconstruction_path = resolve_path(options.reconstruction_report)
    scene_json = resolve_path(options.scene_json or f'public/assets/chapter-{options.chapter}/scene.json')
    output = resolve_path(options.output_dir)
    for input_path in (blend, manifest_path, reconstruction_path, scene_json):
        if not input_path.is_file():
            raise FileNotFoundError(input_path)
    if blend.suffix.lower() != '.blend':
        raise ValueError('--blend must name a .blend file')
    if (ROOT / 'source').resolve() in output.parents or output == (ROOT / 'source').resolve():
        raise ValueError('Preview outputs must stay outside original source assets')
    output.mkdir(parents=True, exist_ok=True)
    before = {'blend': sha256(blend), 'manifest': sha256(manifest_path)}
    manifest = read_json(manifest_path)
    reconstruction = read_json(reconstruction_path)
    if reconstruction.get('outputSha256') != before['blend']:
        raise AssertionError('Saved Blender hash does not match its reconstruction report')
    if reconstruction.get('manifestSha256') != before['manifest']:
        raise AssertionError('Manifest hash does not match the saved Blender reconstruction')
    if reconstruction.get('chapter') != options.chapter:
        raise ValueError('Reconstruction report chapter differs')
    source_scene = read_json(scene_json)
    anchors = choose_anchors(manifest, options.chapter, options.gaps, reconstruction, options.stops, source_scene)
    report_path = output / 'preview-report.json'
    report = {'schemaVersion': 1, 'status': 'rendering', 'chapter': options.chapter,
              'blend': relative_path(blend), 'manifest': relative_path(manifest_path),
              'reconstructionReport': relative_path(reconstruction_path),
              'sourceSceneJson': relative_path(scene_json), 'inputHashesBefore': before,
              'startedAt': datetime.now(timezone.utc).isoformat(),
              'settings': {'width': options.width, 'height': options.height,
                           'engine': 'CYCLES', 'device': 'CPU', 'samples': options.samples,
                           'transparentMaxBounces': options.transparent_bounces, 'threads': options.threads},
              'anchorSource': 'Gaps: frozen addedLayers[].anchorFrame; stops: actual source scene stop.frame. Progress is mapped through prepareScene spatial distance. Raw source timeline fractions are not substituted for Web progress.',
              'frames': [], 'blendSaved': False,
              'comparisonBoundary': 'Actual read-only Blender renders, not pixel-identical Web screenshots. Original camera evaluated pose is preserved; original Principled leaves are unlit in memory, procedural materials and depth handling may differ.'}
    write_report(report_path, report)
    import bpy
    try:
        bpy.ops.wm.open_mainfile(filepath=str(blend), load_ui=False)
        scene = bpy.context.scene
        source_camera = bpy.data.objects.get(source_scene['camera']['name'])
        if source_camera is None or source_camera.type != 'CAMERA':
            raise ValueError('Original main camera is missing: ' + source_scene['camera']['name'])
        report['blenderVersion'] = bpy.app.version_string
        report['sourceCamera'] = source_camera.name
        original_camera_data = {'lens': source_camera.data.lens, 'sensorFit': source_camera.data.sensor_fit,
                                'sensorWidth': source_camera.data.sensor_width,
                                'sensorHeight': source_camera.data.sensor_height}
        camera_data = source_camera.data.copy()
        camera_data.name = 'PREVIEW_Only_TemporaryVerticalCameraData'
        camera_data.animation_data_clear()
        preview_camera = bpy.data.objects.new('PREVIEW_Only_TemporaryVerticalCamera', camera_data)
        scene.collection.objects.link(preview_camera)
        camera_data.sensor_fit = 'VERTICAL'
        camera_data.sensor_height = source_scene['camera'].get('sensorHeight') or 24
        camera_data.shift_x = 0
        camera_data.shift_y = 0
        camera_data.clip_start = source_scene['camera'].get('near') or 0.01
        camera_data.clip_end = source_scene['camera'].get('far') or 5000
        camera_data.dof.use_dof = False
        converted, refresh, checks = convert_principled_leaves(bpy)
        report['temporaryUnlitConversion'] = {'convertedPrincipledLeaves': converted,
                                              'originalLinkChecks': checks,
                                              'alreadyEmissionChainsRewritten': False,
                                              'outerAlphaEdgeAndOpacityChainsPreserved': True}
        scene.render.engine = 'CYCLES'
        scene.cycles.device = 'CPU'
        scene.cycles.samples = options.samples
        scene.cycles.use_denoising = True
        scene.cycles.transparent_max_bounces = options.transparent_bounces
        scene.cycles.max_bounces = 4
        scene.render.threads_mode = 'FIXED'
        scene.render.threads = options.threads
        scene.render.resolution_x = options.width
        scene.render.resolution_y = options.height
        scene.render.resolution_percentage = 100
        scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
        scene.render.use_border = False
        scene.render.film_transparent = False
        # Blender 5 separates video/image media. A source configured for film
        # otherwise exposes only FFMPEG and rejects PNG. This is preview-only.
        if hasattr(scene.render.image_settings, 'media_type'):
            scene.render.image_settings.media_type = 'IMAGE'
        scene.render.image_settings.file_format = 'PNG'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.view_settings.view_transform = 'Standard'
        scene.view_settings.look = 'None'
        scene.view_settings.exposure = 0
        scene.view_settings.gamma = 1
        for anchor in anchors:
            frame = anchor['anchorFrame']
            scene.frame_set(math.floor(frame), subframe=frame - math.floor(frame))
            depsgraph = bpy.context.evaluated_depsgraph_get()
            depsgraph.update()
            evaluated = source_camera.evaluated_get(depsgraph)
            preview_camera.matrix_world = evaluated.matrix_world.copy()
            fov = fov_at_frame(source_scene, frame)
            camera_data.type = 'PERSP'
            camera_data.lens = camera_data.sensor_height / (2 * math.tan(math.radians(fov) / 2))
            refresh_shader_defaults(refresh)
            scene.camera = preview_camera
            depsgraph.update()
            projection = preview_camera.calc_matrix_camera(depsgraph, x=options.width,
                                                            y=options.height, scale_x=1, scale_y=1)
            wanted = 1 / math.tan(math.radians(fov) / 2)
            if abs(projection[1][1] - wanted) > 0.0001:
                raise AssertionError('Temporary camera does not preserve the exported vertical FOV')
            for item in anchor['newLayers']:
                obj = bpy.data.objects.get(item['name']) if item.get('name') else None
                if obj is None or obj.hide_render:
                    raise AssertionError('Required saved new layer is missing or hidden: ' + str(item))
            kind = 'gap' if 'gap' in anchor else 'stop'
            destination = output / f'chapter-{options.chapter}-{kind}-{anchor[kind]:02d}.png'
            scene.render.filepath = str(destination)
            started = time.monotonic()
            print('MDGS_PREVIEW_START ' + json.dumps(anchor, ensure_ascii=True), flush=True)
            bpy.ops.render.render(write_still=True)
            entry = {**anchor, 'image': relative_path(destination), 'sha256': sha256(destination),
                     'renderSeconds': round(time.monotonic() - started, 3),
                     'camera': {'evaluatedOriginalFrame': frame, 'position': list(evaluated.matrix_world.translation),
                                'quaternionWxyz': list(evaluated.matrix_world.to_quaternion()),
                                'fovYDegrees': fov, 'projectionY': projection[1][1],
                                'sourcePoseCopiedWithoutConstraints': True},
                     'visualReview': 'pending-human-agent-view-image'}
            vertical_records = [item for item in reconstruction.get('editableTextLayers', []) if item.get('layout') == 'vertical']
            if vertical_records:
                entry['textVisibility'] = []
                for text in vertical_records:
                    objects = [bpy.data.objects.get(name) for name in text['visibility']['visibleObjectNames']]
                    start, end = text['visibility']['sourceFrameRange']
                    hidden = frame < start - 1e-6 or frame > end + 1e-6
                    if any(obj is None or obj.hide_render != hidden or obj.hide_viewport != hidden for obj in objects):
                        raise AssertionError('Saved text range differs at actual preview frame: ' + text['id'])
                    entry['textVisibility'].append({'id': text['id'], 'hiddenRender': hidden,
                                                    'sourceFrameRange': [start, end]})
            report['frames'].append(entry)
            write_report(report_path, report)
            print('MDGS_PREVIEW_FINISHED ' + json.dumps(entry, ensure_ascii=True), flush=True)
        current_camera_data = {'lens': source_camera.data.lens, 'sensorFit': source_camera.data.sensor_fit,
                               'sensorWidth': source_camera.data.sensor_width,
                               'sensorHeight': source_camera.data.sensor_height}
        report['temporaryCameraOnly'] = True
        # Lens can be animated by the authored source, so only unchanged data
        # settings independent of frame are compared here. The saved file hash
        # below proves no original camera edits were persisted.
        report['sourceCameraSensorUnchangedInMemory'] = all(
            current_camera_data[key] == original_camera_data[key]
            for key in ('sensorFit', 'sensorWidth', 'sensorHeight'))
        report['status'] = 'rendered-awaiting-visual-review'
    except Exception as error:
        report['status'] = 'failed'
        report['error'] = repr(error)
        raise
    finally:
        after = {'blend': sha256(blend), 'manifest': sha256(manifest_path)}
        report['inputHashesAfter'] = after
        report['inputsUnchanged'] = before == after
        report['finishedAt'] = datetime.now(timezone.utc).isoformat()
        write_report(report_path, report)
        if before != after:
            raise AssertionError('Read-only preview unexpectedly changed an input file')


if __name__ == '__main__':
    main()

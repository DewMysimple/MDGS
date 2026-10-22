"""Bake only the author's native AOV Fog Glow contribution, never a painting.

blender --background --factory-startup --disable-autoexec --python-exit-code 1
  --python scripts/bake-source-glare.py -- --source <chapter-1-original.blend>

The original is read only. In memory the compositor output is connected to its
existing Glare-only socket multiplied by the existing RGBA ADD mix factor.
OpenEXR 32-bit scene-linear output is reopened before float16 extraction; display
PNGs are never used as linear data. Frame order/origin matches WebGL textures.
"""

import argparse
import gzip
import hashlib
import json
import math
import os
import sys
import time
from pathlib import Path

import bpy
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
REVISION = 'peony-2.0-2026-10-23'


def sha(path):
    result = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def write(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')


def scalar(value):
    if isinstance(value, (str, float, int, bool)):
        return value
    try:
        return list(value)
    except TypeError:
        return str(value)


def load_linear_exr(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        if image.file_format != 'OPEN_EXR' or 'linear' not in image.colorspace_settings.name.casefold():
            raise ValueError('Reconstruction verification requires actual linear OpenEXR')
        pixels = np.empty(len(image.pixels), dtype=np.float32)
        image.pixels.foreach_get(pixels)
        return pixels.reshape(-1, 4)[:, :3].copy()
    finally:
        bpy.data.images.remove(image)


def verify_reconstruction(source, frames, cache, assets):
    """Check full native output = native Image + the emitted half-float glow."""
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    tree = getattr(scene, 'compositing_node_group', None) or getattr(scene, 'node_tree', None)
    output = next(node for node in tree.nodes if node.type == 'GROUP_OUTPUT' and node.is_active_output)
    original_socket = output.inputs[0].links[0].from_socket
    layers = next(node for node in tree.nodes if node.type == 'R_LAYERS')
    scene.render.resolution_percentage = 100
    scene.render.use_compositing = True
    settings = scene.render.image_settings
    if hasattr(settings, 'media_type'):
        settings.media_type = 'IMAGE'
    settings.file_format = 'OPEN_EXR'
    settings.color_mode = 'RGBA'
    settings.color_depth = '32'
    settings.exr_codec = 'ZIP'
    result = []
    nonzero = [row for row in frames if not row['zero']]
    if not nonzero:
        raise ValueError('There is no nonzero native glow to verify')
    probes = [nonzero[0], nonzero[len(nonzero) // 2], nonzero[-1]]
    for row in probes:
        scene.frame_set(row['frame'])
        paths = {}
        for mode, socket in [('authored', original_socket), ('base-image', layers.outputs['Image'])]:
            for link in list(output.inputs[0].links):
                tree.links.remove(link)
            tree.links.new(socket, output.inputs[0])
            target = cache / f'verify-{row["frame"]:04d}-{mode}.exr'
            scene.render.filepath = str(target)
            bpy.ops.render.render(write_still=True)
            paths[mode] = target
        full = load_linear_exr(paths['authored'])
        base = load_linear_exr(paths['base-image'])
        encoded = assets / row['url']
        if sha(encoded) != row['sha256']:
            raise ValueError('The encoded glow changed before reconstruction verification')
        field = np.frombuffer(gzip.decompress(encoded.read_bytes()), dtype='<f2').astype(np.float32).reshape(-1, 3)
        difference = np.abs(full - base - field)
        maximum = float(np.max(difference))
        tolerance = max(5e-6, float(np.max(np.abs(field))) * 0.001)
        item = {'frame': row['frame'], 'scope': 'Full native linear RGB minus direct native Render Layers Image equals baked native Glare-only contribution including source Mix Factor.',
                'maximumLinearError': maximum, 'meanLinearError': float(np.mean(difference)),
                'rootMeanSquareLinearError': float(np.sqrt(np.mean(difference * difference))),
                'float16QuantizationTolerance': tolerance, 'passed': maximum <= tolerance,
                'fullEXRSha256': sha(paths['authored']), 'baseEXRSha256': sha(paths['base-image']),
                'fieldSha256': row['sha256']}
        result.append(item)
        if not item['passed']:
            raise ValueError('Native glow reconstruction is not equivalent at frame ' + str(row['frame'])
                             + ': ' + str(item))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--assets', type=Path, default=ROOT / 'public/assets/new-scrolls/chapter-1')
    parser.add_argument('--cache', type=Path, default=ROOT / '.asset-cache/new-scrolls/peony-2.0-2026-10-23/post-glare')
    parser.add_argument('--report', type=Path, default=ROOT / 'reports/peony2-fidelity/native-glare.json')
    parser.add_argument('--compression', type=int, choices=range(1, 10), default=6)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    source = args.source.resolve()
    source_hash = sha(source)
    settings_path = args.assets / 'render-settings.json'
    settings = json.loads(settings_path.read_text(encoding='utf8'))
    if settings['sourceSha256'] != source_hash or settings['sourceRevision'] != REVISION:
        raise ValueError('Render settings do not belong to the supplied Peony 2.0 original')
    previous = json.loads(args.report.read_text(encoding='utf8')) if args.report.is_file() else None
    report = {'status': 'running', 'source': '牡丹2.0/' + source.name,
              'sourceSha256': source_hash, 'sourceBytes': source.stat().st_size,
              'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
              'frames': [], 'errors': []}
    write(args.report, report)
    try:
        bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
        scene = bpy.context.scene
        tree = getattr(scene, 'compositing_node_group', None) or getattr(scene, 'node_tree', None)
        if tree is None:
            raise ValueError('The source has no native compositor')
        glare = next(node for node in tree.nodes if node.type == 'GLARE')
        output = next(node for node in tree.nodes if node.type == 'GROUP_OUTPUT' and node.is_active_output)
        mix = next(node for node in tree.nodes if node.type == 'MIX' and node.data_type == 'RGBA')
        if mix.blend_type != 'ADD' or mix.inputs[0].is_linked:
            raise ValueError('The source RGBA glow contribution is not an unlinked scalar-factor ADD mix')
        factor = float(mix.inputs[0].default_value)
        glare_link = next(link for link in tree.links if link.to_node == glare and link.to_socket.name == 'Image')
        if glare_link.from_node.type != 'R_LAYERS':
            raise ValueError('Glare is not driven directly by the authored render AOV')
        aov_name = glare_link.from_socket.name
        if aov_name == 'Image':
            raise ValueError('Refusing to bake an entire-image replacement as a glow field')
        if not any(link.from_node == glare and link.from_socket.name == 'Glare'
                   and link.to_node == mix and list(mix.inputs).index(link.to_socket) == 7
                   for link in tree.links):
            raise ValueError('The authored Mix B is not the native Glare-only output')
        report.update(blenderVersion=bpy.app.version_string,
                      sourceFrameRange=[scene.frame_start, scene.frame_end],
                      sourceRenderResolution=[scene.render.resolution_x, scene.render.resolution_y])
        progress_nodes = []
        for material in bpy.data.materials:
            if not material.node_tree:
                continue
            aovs = [node for node in material.node_tree.nodes if node.type == 'OUTPUT_AOV'
                    and getattr(node, 'aov_name', node.name) == aov_name]
            if not aovs:
                continue
            node = material.node_tree.nodes.get('灼烧入场')
            if node is None:
                raise ValueError('Cannot prove the native AOV active window: ' + material.name)
            progress_nodes.append((material.name, node.inputs[1]))
        if not progress_nodes:
            raise ValueError('No material writes the authored AOV: ' + aov_name)
        progress = {name: [] for name, _ in progress_nodes}
        candidate_frames = set()
        for frame in range(scene.frame_start, scene.frame_end + 1):
            scene.frame_set(frame)
            for name, socket in progress_nodes:
                value = float(socket.default_value)
                progress[name].append(value)
                if 0 < value < 1:
                    candidate_frames.add(frame)
        if not candidate_frames:
            raise ValueError('No changing source AOV progress exists')
        first, last = min(candidate_frames), max(candidate_frames)
        probes = {scene.frame_start, scene.frame_end, first - 2, first - 1, last + 1, last + 2}
        frames = sorted(candidate_frames | probes)
        frames = [frame for frame in frames if scene.frame_start <= frame <= scene.frame_end]
        recipe = {'version': 1, 'sourceSha256': source_hash, 'nativeVersion': bpy.app.version_string,
                  'aov': aov_name, 'glareOutput': 'Glare', 'mix': 'ADD',
                  'mixFactorSocketIndex': 0, 'mixFactor': factor,
                  'glareNode': {'type': glare.bl_idname, 'inputs': [
                      {'index': index, 'name': socket.name, 'value': scalar(socket.default_value)}
                      for index, socket in enumerate(glare.inputs) if hasattr(socket, 'default_value')]},
                  'width': scene.render.resolution_x, 'height': scene.render.resolution_y,
                  'scalePercent': 100, 'channels': 3, 'origin': 'bottom-left',
                  'colorSpace': 'scene-linear-rec709', 'intermediate': 'OPEN_EXR_RGBA_32_ZIP',
                  'encoding': 'gzip-float16-le', 'includesMixFactor': True,
                  'changingProgressWindow': [first, last], 'boundaryProbeFrames': sorted(probes),
                  'progressMaterialWindows': {name: {
                      'firstFractionalFrame': next((scene.frame_start + i for i, v in enumerate(values) if 0 < v < 1), None),
                      'lastFractionalFrame': next((scene.frame_start + i for i in range(len(values) - 1, -1, -1)
                                                   if 0 < values[i] < 1), None),
                      'progressSha256': hashlib.sha256(np.asarray(values, dtype='<f4').tobytes()).hexdigest(),
                      'beforeWindowValues': sorted(set(values[:first - scene.frame_start])),
                      'afterWindowValues': sorted(set(values[last - scene.frame_start + 1:])),
                  } for name, values in progress.items()}}
        recipe_hash = hashlib.sha256(json.dumps(recipe, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        report.update(recipe=recipe, recipeSha256=recipe_hash)
        resumed = {item['frame']: item for item in previous.get('frames', [])} \
            if previous and previous.get('recipeSha256') == recipe_hash else {}
        # Create a color multiply. Using socket name alone would accidentally
        # select the unrelated float/vector sockets on Blender's universal Mix.
        multiply = tree.nodes.new('ShaderNodeMix')
        multiply.data_type = 'RGBA'
        multiply.blend_type = 'MULTIPLY'
        multiply.inputs[0].default_value = 1.0
        multiply.inputs[7].default_value = (factor, factor, factor, 1.0)
        multiply.clamp_factor = True
        multiply.clamp_result = False
        tree.links.new(glare.outputs['Glare'], multiply.inputs[6])
        for link in list(output.inputs[0].links):
            tree.links.remove(link)
        tree.links.new(multiply.outputs[2], output.inputs[0])
        scene.render.resolution_percentage = 100
        scene.render.use_compositing = True
        if hasattr(scene.render.image_settings, 'media_type'):
            scene.render.image_settings.media_type = 'IMAGE'
        scene.render.image_settings.file_format = 'OPEN_EXR'
        scene.render.image_settings.color_mode = 'RGBA'
        scene.render.image_settings.color_depth = '32'
        scene.render.image_settings.exr_codec = 'ZIP'
        scene.render.use_file_extension = True
        args.cache.mkdir(parents=True, exist_ok=True)
        field_dir = args.assets / 'post-glare'
        field_dir.mkdir(parents=True, exist_ok=True)
        write(args.report, report)
        # Boundary probes run first. Unexpected nonzero values outside the
        # changing progress window must expand the investigation, not vanish.
        ordered = [frame for frame in frames if frame in probes] + [frame for frame in frames if frame not in probes]
        for frame in ordered:
            old = resumed.get(frame)
            if old and (old.get('zero') or ((args.assets / old['url']).is_file()
                                           and sha(args.assets / old['url']) == old['sha256'])):
                report['frames'].append(old)
                continue
            scene.frame_set(frame)
            exr = args.cache / f'frame-{frame:04d}.exr'
            scene.render.filepath = str(exr)
            started = time.monotonic()
            bpy.ops.render.render(write_still=True)
            image = bpy.data.images.load(str(exr), check_existing=False)
            try:
                if image.file_format != 'OPEN_EXR':
                    raise ValueError('Linear intermediate is not OpenEXR')
                color_space = image.colorspace_settings.name
                if not ('Linear' in color_space or 'linear' in color_space):
                    raise ValueError('EXR was not reopened as scene-linear data: ' + color_space)
                width, height = image.size
                if [width, height] != report['sourceRenderResolution']:
                    raise ValueError('The glare-only output was resized')
                pixels = np.empty(len(image.pixels), dtype=np.float32)
                image.pixels.foreach_get(pixels)
                rgb = pixels.reshape(-1, 4)[:, :3].copy()
                if not np.isfinite(rgb).all() or float(np.max(np.abs(rgb))) > np.finfo(np.float16).max:
                    raise ValueError('Native glare cannot be represented as finite float16')
                half = rgb.astype('<f2')
                nonzero = int(np.count_nonzero(half))
                record = {'frame': frame, 'width': width, 'height': height,
                          'channels': 3, 'encoding': 'gzip-float16-le',
                          'origin': 'bottom-left', 'colorSpace': 'scene-linear-rec709',
                          'zero': nonzero == 0, 'nonzeroHalfChannels': nonzero,
                          'float32Maximum': float(np.max(rgb)), 'float32Minimum': float(np.min(rgb)),
                          'float16Maximum': float(np.max(half)),
                          'nativeEXRColorSpace': color_space,
                          'nativeEXRSha256': sha(exr), 'seconds': time.monotonic() - started}
                if nonzero == 0:
                    record.update(url=None, sha256=None, bytes=0)
                else:
                    target = field_dir / f'frame-{frame:04d}.f16.gz'
                    raw = half.tobytes(order='C')
                    encoded = gzip.compress(raw, compresslevel=args.compression, mtime=0)
                    target.write_bytes(encoded)
                    record.update(url='post-glare/' + target.name, sha256=sha(target),
                                  bytes=len(encoded), decodedBytes=len(raw))
                report['frames'].append(record)
                report['frames'].sort(key=lambda item: item['frame'])
                write(args.report, report)
                print(json.dumps({'frame': frame, 'zero': record['zero'], 'bytes': record['bytes'],
                                  'maximum': record['float32Maximum'],
                                  'seconds': record['seconds']}, ensure_ascii=True), flush=True)
                if frame in probes and nonzero:
                    raise ValueError(f'Native glare is nonzero outside the fractional-progress window at frame {frame}; extend the verified bake window.')
            finally:
                bpy.data.images.remove(image)
        report['reconstructionChecks'] = verify_reconstruction(
            source, sorted(report['frames'], key=lambda item: item['frame']), args.cache, args.assets)
        report['sourceUnchanged'] = sha(source) == source_hash
        if not report['sourceUnchanged']:
            raise ValueError('The read-only source changed')
        # Re-read immediately before mutation to preserve lighting/post metadata
        # produced concurrently by the independent render-settings exporter.
        settings = json.loads(settings_path.read_text(encoding='utf8'))
        if settings['sourceSha256'] != source_hash:
            raise ValueError('Source render settings changed source during the bake')
        settings['nativeGlareFrames'] = sorted(report['frames'], key=lambda item: item['frame'])
        settings['nativeGlareIncludesMixFactor'] = True
        settings['nativeGlareSourceSha256'] = source_hash
        settings['nativeGlareRecipe'] = {**recipe, 'sha256': recipe_hash}
        settings_path.write_text(json.dumps(settings, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
        report.update(status='pass', frameCount=len(report['frames']),
                      nonzeroFrames=sum(not item['zero'] for item in report['frames']),
                      fieldBytes=sum(item['bytes'] for item in report['frames']),
                      settingsSha256=sha(settings_path))
    except Exception as error:
        report['status'] = 'fail'
        report['errors'].append(repr(error))
        raise
    finally:
        report['completedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        write(args.report, report)


if __name__ == '__main__':
    main()

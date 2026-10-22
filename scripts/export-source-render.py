"""Extract the original camera environment, lamps and compositor without saving inputs."""
import argparse, hashlib, json, os, sys
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
parser = argparse.ArgumentParser()
parser.add_argument('--source-root', default=os.environ.get('MDGS_PEONY2_SOURCE_ROOT') or os.environ.get('MDGS_SOURCE_ROOT'))
parser.add_argument('--config', default=str(ROOT / 'scripts/new-scroll-sources.json'))
parser.add_argument('--sampling-only', action='store_true', help='Merge only native sampling metadata into the existing render settings; preserve compositor bakes and all other fields.')
options = parser.parse_args(arguments)
config_path = Path(options.config)
config = json.loads(config_path.read_text(encoding='utf8'))
source_root = Path(options.source_root) if options.source_root else (config_path.parent / config['sourceRoot']).resolve()

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def scalar(socket):
    value = getattr(socket, 'default_value', None)
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    try:
        return list(value)
    except TypeError:
        return str(value)

def graph(tree):
    if tree is None:
        return None
    nodes = []
    for node in tree.nodes:
        inputs = {}
        for socket in node.inputs:
            inputs.setdefault(socket.name, scalar(socket))
        item = {'name': node.name, 'type': node.type, 'inputs': inputs,
                'inputSockets': [{'index': index, 'name': socket.name, 'value': scalar(socket)}
                                 for index, socket in enumerate(node.inputs)]}
        for name in ('blend_type', 'data_type', 'clamp_factor', 'clamp_result'):
            if hasattr(node, name):
                item[name] = getattr(node, name)
        nodes.append(item)
    return {'nodes': nodes, 'links': [
        [link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name]
        for link in tree.links]}

def sampling_settings(scene, used_materials):
    """Read native AA and image-node sampling; never infer them from pixels."""
    image_nodes = []
    def walk(material_name, tree, prefix, ancestors):
        if not tree or tree.as_pointer() in ancestors:
            return
        ancestors = ancestors | {tree.as_pointer()}
        for node in tree.nodes:
            node_path = prefix + [node.name]
            if node.type == 'GROUP':
                walk(material_name, node.node_tree, node_path, ancestors)
            elif node.type == 'TEX_IMAGE':
                image_nodes.append({'material': material_name, 'tree': tree.name, 'nodePath': node_path,
                                    'image': node.image.name if node.image else None,
                                    'interpolation': node.interpolation, 'extension': node.extension,
                                    'projection': node.projection, 'projectionBlend': node.projection_blend})
    for material in bpy.data.materials:
        if material.name in used_materials and material.use_nodes:
            walk(material.name, material.node_tree, [], set())
    eevee = {name: getattr(scene.eevee, name) for name in
             ('taa_render_samples', 'taa_samples', 'use_taa_reprojection', 'use_shadow_jitter_viewport')
             if hasattr(scene.eevee, name)}
    render = scene.render
    return {'blenderVersion': bpy.app.version_string, 'blenderBuildHash': bpy.app.build_hash.decode('ascii'),
            'filterSize': render.filter_size, 'eevee': eevee,
            'resolutionPercentage': render.resolution_percentage,
            'motionBlur': {name: getattr(render, name) for name in
                           ('use_motion_blur', 'motion_blur_shutter', 'motion_blur_position')
                           if hasattr(render, name)},
            'filmReconstruction': {
                'kernel': 'Gaussian fit to Blackman-Harris', 'sigmaPerFilterRadius': 0.284,
                'linearColor': True, 'projectionJitter': True,
                'disableForSingleSample': True, 'textureLodFootprintScale': 1 / 1.5,
                'reference': 'https://raw.githubusercontent.com/blender/blender/blender-v5.2-release/source/blender/draw/engines/eevee/eevee_film_shared.hh',
                'samplingReference': 'https://raw.githubusercontent.com/blender/blender/blender-v5.2-release/source/blender/draw/engines/eevee/eevee_film.cc'},
            'imageTextures': image_nodes}

def merge_settings(path, updates, source_sha):
    # Independent native compositor bakes add nativeGlare* metadata to this file.
    # Re-read immediately before writing and retain every independently owned key.
    existing = json.loads(path.read_text(encoding='utf8')) if path.exists() else {}
    if existing and existing.get('sourceSha256') != source_sha:
        raise ValueError('Existing render metadata belongs to another source: ' + path.parent.name)
    existing.update(updates)
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(existing, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
    os.replace(temporary, path)

for chapter, filename in config['sources'].items():
    source = source_root / filename
    before = sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    scene.frame_set(scene.frame_start)
    manifest_path = ROOT / 'public/assets/new-scrolls' / chapter / 'scene.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf8'))
    if manifest['sourceSha256'] != before:
        raise ValueError('Manifest belongs to another source: ' + chapter)
    used_materials = {material['name'] for material in manifest['materials']}
    sampling = sampling_settings(scene, used_materials)
    render_path = manifest_path.parent / 'render-settings.json'
    if options.sampling_only:
        if not render_path.exists():
            raise ValueError('--sampling-only needs existing render-settings.json: ' + chapter)
        if before != sha(source):
            raise ValueError('Input file changed during read-only sampling extraction')
        merge_settings(render_path, {'sampling': sampling}, before)
        print(json.dumps({'chapter': chapter, 'samplingOnly': True, 'filterSize': sampling['filterSize'],
                          'eevee': sampling['eevee'], 'imageNodes': len(sampling['imageTextures']),
                          'sourceUnchanged': True}, ensure_ascii=False), flush=True)
        continue
    closures = []
    for material in bpy.data.materials:
        if material.name not in used_materials or not material.node_tree:
            continue
        for node in material.node_tree.nodes:
            if node.type not in ('BSDF_DIFFUSE', 'BSDF_PRINCIPLED'):
                continue
            item = {'material': material.name, 'node': node.name, 'type': node.type,
                    'inputs': {socket.name: scalar(socket) for socket in node.inputs}}
            if node.type == 'BSDF_PRINCIPLED':
                item['distribution'] = node.distribution
                if node.distribution != 'MULTI_GGX':
                    raise ValueError('Principled distribution needs explicit renderer support: ' + node.distribution)
            closures.append(item)
    lamps = []
    for obj in scene.objects:
        if obj.type != 'LIGHT' or obj.hide_render:
            continue
        rotation = obj.matrix_world.to_quaternion()
        lamp = {'name': obj.name, 'type': obj.data.type, 'color': list(obj.data.color),
                'energy': obj.data.energy, 'position': list(obj.matrix_world.translation),
                'direction': list(rotation @ Vector((0, 0, -1))),
                'axisX': list(rotation @ Vector((1, 0, 0))),
                'axisY': list(rotation @ Vector((0, 1, 0)))}
        for name in ('size', 'size_y', 'shape', 'angle', 'spread', 'shadow_soft_size',
                     'use_shadow', 'diffuse_factor', 'specular_factor', 'normalize'):
            if hasattr(obj.data, name):
                lamp[name] = getattr(obj.data, name)
        lamps.append(lamp)
    eevee = {}
    for name in ('use_raytracing', 'ray_tracing_method', 'taa_render_samples', 'shadow_ray_count',
                 'shadow_step_count', 'use_shadow_jitter_viewport'):
        if hasattr(scene.eevee, name):
            eevee[name] = getattr(scene.eevee, name)
    world = {'color': [0, 0, 0], 'strength': 0}
    if scene.world and scene.world.use_nodes:
        output = next((node for node in scene.world.node_tree.nodes if node.type == 'OUTPUT_WORLD' and node.is_active_output), None)
        if output and output.inputs['Surface'].is_linked:
            background = output.inputs['Surface'].links[0].from_node
            if background.type != 'BACKGROUND':
                raise ValueError('World shader requires explicit translation: ' + background.type)
            if background.inputs['Color'].is_linked or background.inputs['Strength'].is_linked:
                raise ValueError('World background contains a linked procedural input')
            world = {'color': list(background.inputs['Color'].default_value)[:3],
                     'strength': background.inputs['Strength'].default_value}
    compositor = getattr(scene, 'compositing_node_group', None) or getattr(scene, 'node_tree', None)
    result = {'version': 1, 'sourceRevision': 'peony-2.0-2026-10-23', 'sourceSha256': before,
              'unitScaleMeters': scene.unit_settings.scale_length, 'engine': scene.render.engine,
              'filmTransparent': scene.render.film_transparent,
              'colorManagement': {'viewTransform': scene.view_settings.view_transform,
                                  'look': scene.view_settings.look,
                                  'exposure': scene.view_settings.exposure,
                                  'gamma': scene.view_settings.gamma},
              'world': world, 'lights': lamps, 'eevee': eevee, 'surfaceClosures': closures, 'sampling': sampling,
              'compositor': graph(compositor) if scene.use_nodes else None}
    if before != sha(source):
        raise ValueError('Input file changed during read-only render extraction')
    merge_settings(render_path, result, before)
    print(json.dumps({'chapter': chapter, 'lights': len(lamps), 'world': world,
                      'hasCompositor': result['compositor'] is not None, 'sourceUnchanged': True}, ensure_ascii=False), flush=True)

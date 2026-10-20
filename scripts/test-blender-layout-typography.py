"""Exercise layout, editable vertical typography and frame ranges in real Blender.

This creates only a factory fixture in a temporary directory, saves it, reopens
it and verifies the recorded geometry/visibility. No project .blend is opened.
"""
import importlib.util
import json
import math
from pathlib import Path
import sys
import tempfile

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
spec = importlib.util.spec_from_file_location('reconstruction_fixture', Path(__file__).with_name('reconstruct-blender.py'))
reconstruction = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reconstruction)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, 101
    mesh = bpy.data.meshes.new('OriginalPaintData')
    mesh.from_pydata([(0, -2, -1), (0, 2, -1), (0, 2, 1), (0, -2, 1)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new(name='UVMap')
    for loop, point in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        loop.uv = point
    original = bpy.data.objects.new('OriginalPaint', mesh)
    scene.collection.objects.link(original)
    original.matrix_world = Matrix.Translation((4, 6, 3)) @ Matrix.Rotation(.3, 4, 'Z')
    font_curve = bpy.data.curves.new('OriginalProseData', 'FONT')
    font_curve.body = 'Original authored prose'
    original_font = bpy.data.objects.new('OriginalProse', font_curve)
    scene.collection.objects.link(original_font)
    bpy.context.view_layer.update()
    baseline = reconstruction.original_scene_snapshot(bpy)
    geometry = reconstruction.source_mesh_geometry_snapshot(bpy)
    roles = reconstruction.create_role_collections(bpy, 3)
    reconstruction.annotate_original_objects(bpy, 3, {'meshes': []}, roles, {})
    carrier = reconstruction.fit_explicit_geometry(bpy, original, {
        'geometryCorners': [[0, -3, -1], [0, 3, -1], [0, 3, 2], [0, -3, 2]],
        'paddingScaleX': 1.2, 'paddingScaleY': 1.1})
    carrier_record = {'id': 'fixture-explicit-carrier', 'targets': [carrier]}
    world_delta = Matrix.Translation((0, 10, -2)) @ Matrix.Diagonal((1, .8, .8, 1))
    before_world = [original.matrix_world @ vertex.co for vertex in original.data.vertices]
    delta = reconstruction.matrix(world_delta)
    layout = reconstruction.apply_layout_adjustments(bpy, {'layoutAdjustments': [{
        'id': 'fixture-layout', 'meshNames': ['OriginalPaint'], 'worldMatrix': delta,
        'role': '主体叙事层', 'narrative': 'Factory fixture shifts the image below top air'}]}, roles, [carrier_record])
    for point, vertex in zip(before_world, original.data.vertices):
        if (world_delta @ point - original.matrix_world @ vertex.co).length > 2e-6:
            raise AssertionError('World delta and copied local vertex deformation disagree')
    if mesh == original.data or reconstruction.mesh_positions_sha(mesh) != geometry['OriginalPaint']['positionsSha256']:
        raise AssertionError('Original mesh datablock was not protected')
    source = {'frameRange': [1, 101], 'travel': {'axis': 'Y'},
              'stops': [{'name': 'SC01_阅读', 'frame': 11, 'progress': .1}, {'name': 'SC02_阅读', 'frame': 91, 'progress': .9}],
              'cameras': [{'progress': p, 'frame': 1 + p * 100, 'position': [0, y, 0]}
                          for p, y in ((0, 0), (.1, 0), (.4, 0), (.5, 50), (.9, 100), (1, 100))]}
    entry = {'id': 'fixture-vertical', 'name': '花意入器', 'title': '花意入器',
             'lines': ['吉纹寓美满', '花开祝安宁'], 'layout': 'vertical', 'seal': '吉庆',
             'matrix': reconstruction.matrix(Matrix.Identity(4)), 'domWidth': 200, 'domHeight': 360,
             'titleSize': 50, 'bodySize': 34, 'range': [.2, .6], 'fade': .03,
             'narrative': 'Editable vertical CJK fixture with source-frame visibility'}
    texts, fonts = reconstruction.add_text_layers(bpy, 3, {'textLayers': [entry]}, roles, source)
    hidden = reconstruction.apply_hidden_blender_text(bpy, {'hiddenBlenderTextNames': ['OriginalProse']})
    scene.frame_set(scene.frame_start)
    evidence = {'chapter': 3, 'originalScene': baseline, 'originalMeshGeometry': geometry,
                'replacements': [carrier_record], 'geometryRepairs': [], 'layoutAdjustments': layout,
                'hiddenMeshNames': [], 'hiddenBlenderTextNames': hidden,
                'backgroundPresentation': {}, 'packedImages': [], 'packedFonts': fonts,
                'editableTextLayers': texts, 'derivedObjects': reconstruction.derived_state(bpy, baseline['objects'])}
    try:
        initial = reconstruction.verify_derived(bpy, evidence)
    except Exception:
        obj = bpy.data.objects.get(texts[0]['editableObjects'][0]['name'])
        action = obj.animation_data.action
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        print('FIXTURE_FCURVE', curve.data_path, [(list(point.co), point.interpolation) for point in curve.keyframe_points], flush=True)
        raise
    with tempfile.TemporaryDirectory(prefix='mdgs-blender-layout-fixture-') as directory:
        target = Path(directory) / 'factory-fixture.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(target), check_existing=False)
        bpy.ops.wm.open_mainfile(filepath=str(target), load_ui=False, use_scripts=False)
        try:
            reopened = reconstruction.verify_derived(bpy, evidence)
        except Exception:
            actual = reconstruction.derived_state(bpy, baseline['objects'])
            for name, expected in evidence['derivedObjects'].items():
                if actual.get(name) != expected:
                    print('FIXTURE_REOPEN_DIFF', name, json.dumps({'expected': expected, 'actual': actual.get(name)}, ensure_ascii=True), flush=True)
            raise
        if reopened != initial:
            raise AssertionError('Save/reopen fixture verification differs')
    print('BLENDER_LAYOUT_TYPOGRAPHY_FIXTURE_VERIFIED ' + json.dumps(reopened, ensure_ascii=True), flush=True)


if __name__ == '__main__':
    main()

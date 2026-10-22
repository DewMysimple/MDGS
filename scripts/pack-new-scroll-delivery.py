"""Deliver complete packed copies; never save or rewrite an original .blend."""
import bpy, hashlib, json, os, shutil, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from asset_config import ROOT, load_pipeline, script_arguments

arguments = script_arguments()
if '--config' not in arguments: arguments = ['--config', str(ROOT/'scripts/new-scroll-sources.json'), *arguments]
CONFIG = load_pipeline(arguments)
OUTPUT = Path(os.environ.get('MDGS_DELIVERY_OUTPUT', ROOT/'artwork/blender-reconstructed'))
REPORT = Path(os.environ.get('MDGS_DELIVERY_REPORT', ROOT/'reports/peony2-fidelity/native-delivery.json'))
OUTPUT.mkdir(parents=True, exist_ok=True); REPORT.parent.mkdir(parents=True, exist_ok=True)

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for part in iter(lambda: stream.read(8*1024*1024), b''): digest.update(part)
    return digest.hexdigest()

def image_provenance():
    return {image.name: hashlib.sha256(bytes(image.packed_file.data)).hexdigest()
            for image in bpy.data.images if image.source == 'FILE' and image.packed_file}

def missing_images():
    return [image.name for image in bpy.data.images if image.source == 'FILE'
            and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).is_file()]

def fingerprint():
    scene = bpy.context.scene; original = scene.frame_current
    frames = {scene.frame_start, scene.frame_end, (scene.frame_start+scene.frame_end)//2}
    frames.update(marker.frame for marker in scene.timeline_markers if scene.frame_start <= marker.frame <= scene.frame_end)
    samples = []
    for frame in sorted(frames):
        scene.frame_set(frame); graph = bpy.context.evaluated_depsgraph_get()
        samples.append({'frame': frame, 'objects': [{'name': obj.name, 'type': obj.type,
            'hidden': obj.hide_render, 'matrix': [round(float(value), 6) for row in obj.evaluated_get(graph).matrix_world for value in row],
            'shapeWeights': [float(key.value) for key in obj.data.shape_keys.key_blocks]
                if obj.type == 'MESH' and obj.data.shape_keys else None}
            for obj in sorted(scene.objects, key=lambda obj: obj.name)]})
    scene.frame_set(original)
    data = {'frames': [scene.frame_start, scene.frame_end], 'fps': scene.render.fps, 'fpsBase': scene.render.fps_base,
            'camera': scene.camera.name, 'render': [scene.render.resolution_x, scene.render.resolution_y],
            'markers': [(marker.name, marker.frame) for marker in scene.timeline_markers], 'samples': samples,
            'materialNames': sorted(material.name for material in bpy.data.materials),
            'nodeGroups': sorted(group.name for group in bpy.data.node_groups)}
    return hashlib.sha256(json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest(), len(samples)

results = []; bpy.context.preferences.filepaths.save_version = 0
for cid, source_name in CONFIG.sources:
    source = Path(source_name); chapter = int(cid.split('-')[-1]); target = OUTPUT/f'chapter-{chapter}_reconstructed.blend'
    if target.resolve() == source.resolve(): raise RuntimeError('Delivery must differ from read-only original')
    source_hash = sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    before, sample_count = fingerprint(); pigments_before = image_provenance()
    if missing_images(): raise RuntimeError('Source has unresolved images: '+repr(missing_images()))
    unpacked = [image.name for image in bpy.data.images if image.source == 'FILE' and not image.packed_file]
    external_fonts = [font.name for font in bpy.data.fonts if font.filepath not in ('<builtin>', '')
                      and not getattr(font, 'packed_file', None)]
    external_sounds = [sound.name for sound in bpy.data.sounds if not sound.packed_file]
    if not unpacked and not external_fonts and not external_sounds:
        # The current four inputs are already packed. Copying all bytes also
        # preserves every material graph, driver, shape curve and compositor.
        shutil.copyfile(source, target); method = 'byte-identical packed source copy'
        if sha(target) != source_hash: raise RuntimeError('Native source copy differs: '+cid)
    else:
        bpy.ops.file.pack_all()
        bpy.ops.wm.save_as_mainfile(filepath=str(target), compress=True, check_existing=False)
        method = 'pack dependencies in memory and save only the delivery copy'
    bpy.ops.wm.open_mainfile(filepath=str(target), load_ui=False, use_scripts=False)
    after, _ = fingerprint(); missing = missing_images()
    if before != after or missing or source_hash != sha(source):
        raise RuntimeError('Native delivery differs or original changed: '+cid)
    pigments_after = image_provenance()
    if any(pigments_after.get(name) != digest for name, digest in pigments_before.items()):
        raise RuntimeError('Packed original pigment changed: '+cid)
    item = {'id': cid, 'sourceRevision': 'peony-2.0-2026-10-23', 'input': '牡丹2.0/'+source.name,
            'inputSha256': source_hash, 'delivery': 'artwork/blender-reconstructed/'+target.name,
            'deliverySha256': sha(target), 'deliveryBytes': target.stat().st_size, 'deliveryMethod': method,
            'nativeReopened': True, 'nativeSceneFingerprint': after, 'sourceAndDeliveryEquivalent': True,
            'sampledCameraAndObjectMatrixFrames': sample_count, 'missingImages': missing,
            'packedFileImages': len(image_provenance()), 'inputUnchanged': True,
            'intentionalChange': 'Complete native copy preserving source geometry, cameras, clocks, shape keys, shader drivers, lighting, depth of field and compositor.'}
    results.append(item); REPORT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(item, ensure_ascii=False), flush=True)

"""Audit the existing pilot's retained mesh data without saving either Blender file."""
import importlib.util
from pathlib import Path
import bpy

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('reconstruction', root / 'scripts/reconstruct-blender.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)
evidence = pipeline.read_json(root / 'reports/reconstruction/blender-reconstruction-chapter-1.json')
sources = pipeline.load_sources(root / 'reports/reconstruction/source-paths.local.json')
hashes = {key: pipeline.sha256(path) for key, path in sources.items()}
assert hashes == evidence['sourceHashesBefore']
bpy.ops.wm.open_mainfile(filepath=str(sources['chapter-1']), load_ui=False, use_scripts=False)
original = pipeline.source_mesh_geometry_snapshot(bpy)
bpy.ops.wm.open_mainfile(filepath=str(root / evidence['output']), load_ui=False, use_scripts=False)
current = pipeline.source_mesh_geometry_snapshot(bpy, original)
permitted = {target['name'] for operation in evidence['replacements'] + evidence.get('geometryRepairs', [])
             for target in operation['targets']}
pipeline.assert_original_geometry_policy(original, current, permitted)
assert hashes == {key: pipeline.sha256(path) for key, path in sources.items()}
assert pipeline.sha256(root / evidence['output']) == evidence['outputSha256']
pipeline.write_json(root / 'reports/reconstruction/blender-original-geometry-chapter-1.json', {
    'chapter': 1, 'status': 'verified', 'savedBlendFiles': 0,
    'sourceHashesBefore': hashes, 'sourceHashesAfter': hashes,
    'output': evidence['output'], 'outputSha256': evidence['outputSha256'],
    'sourceMeshGeometry': original, 'derivedOriginalMeshGeometry': current,
    'explicitGeometryChangeTargets': sorted(permitted),
    'allOtherOriginalPositionsTopologyAndUvLayers': 'unchanged',
})
print('PILOT_ORIGINAL_GEOMETRY_POLICY_VERIFIED', len(original), 'original meshes;', len(permitted), 'permitted carriers')

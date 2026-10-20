"""Compute the declared river-only re-layout from authored world bounds, not viewport pixels."""
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
read = lambda path: json.loads((ROOT / path).read_text(encoding='utf-8-sig'))
source = read('public/assets/chapter-2/scene.json')
names = ['右下河流与岸景', '右下河流与岸景.001', '右下河流与岸景.002']
meshes = [next(mesh for mesh in source['meshes'] if mesh['name'] == name) for name in names]
lower = [min(mesh['bounds']['min'][axis] for mesh in meshes) for axis in range(3)]
upper = [max(mesh['bounds']['max'][axis] for mesh in meshes) for axis in range(3)]
raw = 'artwork/reconstruction/raw/c2-t002-edge-repair-v2.png'
width, height = Image.open(ROOT / raw).size
aspect = width / height
union_width, union_height = upper[0] - lower[0], upper[1] - lower[1]
painting_width, painting_height = max(union_width, union_height * aspect), max(union_height, union_width / aspect)
center = [(lower[axis] + upper[axis]) / 2 for axis in range(3)]
center[2] = float(np.median([(mesh['bounds']['min'][2] + mesh['bounds']['max'][2]) / 2 for mesh in meshes]))
world = [[center[0] + x * painting_width, center[1] + y * painting_height, center[2]]
         for x, y in ((-.5, -.5), (.5, -.5), (.5, .5), (-.5, .5))]
original_matrix = np.array(meshes[0]['matrix']).reshape(4, 4, order='F')
inverse = np.linalg.inv(original_matrix)
local = [(inverse @ np.array([*point, 1]))[:3].tolist() for point in world]
reprojected = [(original_matrix @ np.array([*point, 1]))[:3].tolist() for point in local]
error = float(np.max(np.abs(np.array(world) - np.array(reprojected))))
assert error < 1e-10
result = {
    'schemaVersion': 1, 'chapter': 2, 'id': 'c2-t002',
    'status': 'computed-awaiting-placed-scene-review',
    'scope': 'Only the main river carrier local geometry may change; all source object world matrices stay fixed.',
    'replacement': {'meshNames': names[:1], 'geometryPolicy': 'explicit-corners', 'geometryCorners': local},
    'hiddenMeshNames': names[1:], 'edgeRepairs': [],
    'sourceWorldUnion': {'min': lower, 'max': upper, 'width': union_width, 'height': union_height},
    'sourceMeshes': [{'name': mesh['name'], 'matrix': mesh['matrix'], 'bounds': mesh['bounds']} for mesh in meshes],
    'raw': raw, 'rawWidth': width, 'rawHeight': height,
    'rawSha256': hashlib.sha256((ROOT / raw).read_bytes()).hexdigest(),
    'fittedPaintingAspect': aspect, 'aspectFitPolicy': 'cover-world-union-without-stretch',
    'paintingWorldWidth': painting_width, 'paintingWorldHeight': painting_height,
    'paintingWorldCenter': center, 'paintingWorldCorners': world,
    'cornerUvOrder': [[0, 0], [1, 0], [1, 1], [0, 1]],
    'paddingPolicy': 'Only expand the four raw-content corners around their center by paddingScaleX/Y; no contentAspect/sourceAspect factor.',
    'worldToLocalRoundTripMaxError': error,
    'visualIntent': 'One pavilion and one quiet viewing group; connected teal water, rocks and peony petals replace three repeated copies.',
}
(ROOT / 'reports/reconstruction/chapter-2-river-layout.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({key: result[key] for key in ('fittedPaintingAspect', 'paintingWorldWidth', 'paintingWorldHeight',
                                             'paintingWorldCenter', 'replacement', 'worldToLocalRoundTripMaxError')}, ensure_ascii=True))

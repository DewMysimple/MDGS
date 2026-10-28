"""Check the extracted Blender card and isolate the scene changes to that card."""
import argparse, hashlib, json, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = '06_右侧首饰瓷器_06_首饰与罐盒组合'
NEW = '06_首饰与罐盒组合'
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--baseline', required=True, help='Git revision before this replacement')
args = parser.parse_args()
scene_path = 'public/assets/new-scrolls/chapter-3/scene.json'
program_path = 'public/assets/new-scrolls/chapter-3/source-materials.json'
def baseline(path):
    return json.loads(subprocess.check_output(['git', 'show', f'{args.baseline}:{path}'], cwd=ROOT))
scene = json.loads((ROOT / scene_path).read_text(encoding='utf8'))
programs = json.loads((ROOT / program_path).read_text(encoding='utf8'))
prior_scene, prior_programs = baseline(scene_path), baseline(program_path)
patch = json.loads(Path(args.input).read_text(encoding='utf8'))
assert patch['sourceSha256'] == 'b8ca4c4e704f592f336aa46d2902cfaa229b5f06b2c983cd799474b7c248719a'
idx = next(i for i, m in enumerate(scene['meshes']) if m['name'] == NEW)
mesh = scene['meshes'][idx]
assert prior_scene['meshes'][idx]['name'] == OLD
assert not any(m['name'] == OLD for m in scene['meshes'])
original = patch['record']
for field, size in [('positions', 3), ('uvs', 2), ('normals', 3)]:
    expanded = [value for index in mesh['indices'] for value in mesh[field][index*size:index*size+size]]
    assert expanded == original[field], field
for field in ('name', 'type', 'matrix', 'bounds', 'animated', 'isText'):
    assert mesh[field] == original[field], field
mid = mesh['material']
assert mid == prior_scene['meshes'][idx]['material']
assert programs['programs'][f'{mid}:{NEW}'] == patch['program']
assert f'{mid}:{OLD}' not in programs['programs']
image = next(i for i in scene['images'] if i['id'] == patch['imageId'])
assert image['sourceSha256'] == patch['sourceImageSha256']
assert hashlib.sha256((ROOT / 'public/assets/new-scrolls/chapter-3' / image['src']).read_bytes()).hexdigest() == image['webSha256']
assert scene['visibility'][NEW] == [{'progress': 0, 'visible': True, 'frame': 1}]
# Normalize the reviewed replacement back to the baseline and compare all
# remaining scene and native shader data, including camera and animation.
scene['meshes'][idx] = prior_scene['meshes'][idx]
scene['materials'][mid] = prior_scene['materials'][mid]
scene['visibility'].pop(NEW)
scene['visibility'][OLD] = prior_scene['visibility'][OLD]
scene['audit'].pop('reviewedObjectReplacements')
assert scene == prior_scene, 'Unrelated scene data changed'
del programs['programs'][f'{mid}:{NEW}']
programs['programs'][f'{mid}:{OLD}'] = prior_programs['programs'][f'{mid}:{OLD}']
assert programs == prior_programs, 'Unrelated material data changed'
print(json.dumps({'status': 'passed', 'object': NEW, 'vertices': len(mesh['positions'])//3,
                  'triangles': len(mesh['indices'])//3, 'sourceSha256': patch['sourceSha256'],
                  'textureSha256': image['webSha256']}, ensure_ascii=False))

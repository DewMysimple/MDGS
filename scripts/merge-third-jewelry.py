"""Replace only the reviewed third-scroll jewelry card with the extracted source."""
import argparse, hashlib, json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = '06_右侧首饰瓷器_06_首饰与罐盒组合'
NEW = '06_首饰与罐盒组合'
BASE_SHA = '571308cc7c84c85a692f4768dc6ee23e6c0f7a0775c470605b561e4428b81354'
NEW_SHA = 'b8ca4c4e704f592f336aa46d2902cfaa229b5f06b2c983cd799474b7c248719a'
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
args = parser.parse_args()
folder = ROOT / 'public/assets/new-scrolls/chapter-3'
scene_file, program_file = folder / 'scene.json', folder / 'source-materials.json'
scene = json.loads(scene_file.read_text(encoding='utf8'))
programs = json.loads(program_file.read_text(encoding='utf8'))
patch = json.loads(Path(args.input).read_text(encoding='utf8'))
if scene['sourceSha256'] != BASE_SHA or programs['sourceSha256'] != BASE_SHA or patch['sourceSha256'] != NEW_SHA:
    raise ValueError('Unreviewed source revision')
matches = [i for i, m in enumerate(scene['meshes']) if m['name'] == OLD]
if len(matches) != 1 or any(m['name'] == NEW for m in scene['meshes']):
    raise ValueError('Expected precisely one original and no replacement')
index = matches[0]
old = scene['meshes'][index]
material_id = old['material']
old_key, new_key = f'{material_id}:{OLD}', f'{material_id}:{NEW}'
if old_key not in programs['programs'] or new_key in programs['programs']:
    raise ValueError('Unexpected material binding')
images = [im for im in scene['images'] if im['id'] == patch['imageId']]
if len(images) != 1 or images[0]['sourceSha256'] != patch['sourceImageSha256']:
    raise ValueError('Existing image does not match the new source image')
image = images[0]
if hashlib.sha256((folder / image['src']).read_bytes()).hexdigest() != image['webSha256']:
    raise ValueError('Existing texture is damaged')
mesh = patch['record']
if mesh['name'] != NEW or patch['frameRange'] != scene['frameRange']:
    raise ValueError('Unexpected extracted object or frame range')
positions, uvs, normals = mesh['positions'], mesh['uvs'], mesh['normals']
unique, out_p, out_uv, out_n, indices = {}, [], [], [], []
for i in range(len(positions) // 3):
    p, uv, n = positions[3*i:3*i+3], uvs[2*i:2*i+2], normals[3*i:3*i+3]
    key = tuple(p + uv + n)
    if key not in unique:
        unique[key] = len(out_p) // 3
        out_p.extend(p); out_uv.extend(uv); out_n.extend(n)
    indices.append(unique[key])
mesh.update(positions=out_p, uvs=out_uv, normals=out_n, indices=indices, material=material_id)
program = patch['program']
if program['objectName'] != NEW or not program['fields'] or any(f['url'] != image['src'] for f in program['fields']):
    raise ValueError('Unexpected source shader image')
scene['meshes'][index] = mesh
material = scene['materials'][material_id]
material.update(name=program['materialName'], texture=image['src'], color=[1, 1, 1], opacity=1,
                transparent=True, alphaTest=.012, side='double', depthWrite=False,
                sourceAlphaLinked=True, proceduralApproximation=False)
scene['visibility'].pop(OLD)
scene['visibility'][NEW] = [{'progress': 0, 'visible': True, 'frame': scene['frameRange'][0]}]
scene['animations'].pop(OLD, None)
del programs['programs'][old_key]
programs['programs'][new_key] = program
scene['audit']['reviewedObjectReplacements'] = [{'oldObject': OLD, 'object': NEW,
    'sourceSha256': NEW_SHA, 'sourceImageSha256': patch['sourceImageSha256'],
    'reason': 'User-provided revised third-scroll Blender file replaces the original jewelry card.'}]
for path, data in ((scene_file, scene), (program_file, programs)):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print(json.dumps({'object': NEW, 'sourceSha256': NEW_SHA, 'vertices': len(out_p)//3,
                  'triangles': len(indices)//3, 'texture': image['src']}, ensure_ascii=False))

"""Merge the reviewed viewport-only source card extracted by Blender.

Run after export-viewport-restore.py using --input <recovery-directory>.
The Blender source remains read-only; refuses unrelated source revisions.
"""
import argparse, hashlib, io, json
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = 'e459fad5ca48e209fa63555c5253c7650547036c6be247dd13cd48c1287f1402'
NAME = '主体 · 03_中央花车巡游与曲水'
parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
args = parser.parse_args()
folder = ROOT / 'public/assets/new-scrolls/chapter-1'
manifest_file, program_file = folder / 'scene.json', folder / 'source-materials.json'
manifest, programs = (json.loads(p.read_text(encoding='utf8')) for p in (manifest_file, program_file))
patch_dir = Path(args.input)
patch = json.loads((patch_dir / 'recovered.json').read_text(encoding='utf8'))
if any(x != EXPECTED for x in (manifest['sourceSha256'], programs['sourceSha256'], patch['sourceSha256'])):
    raise ValueError('Unexpected source revision')
if any(o['name'] == NAME for o in manifest['meshes']):
    raise ValueError('Recovery already applied; refusing to duplicate the object')
raw = (patch_dir / (patch['imageId'] + '.source')).read_bytes()
if hashlib.sha256(raw).hexdigest() != patch['sourceImageSha256']:
    raise ValueError('Packed image bytes changed')
with Image.open(io.BytesIO(raw)) as source:
    image = ImageOps.exif_transpose(source).convert('RGBA')
    original_format = source.format
    same_orientation = image.size == source.size and image.tobytes() == source.convert('RGBA').tobytes()
encoded = io.BytesIO()
image.save(encoded, 'WEBP', lossless=True, quality=100, method=4, exact=True)
webp = encoded.getvalue()
use_png = original_format == 'PNG' and same_orientation and len(raw) <= len(webp)
content = raw if use_png else webp
suffix = '.png' if use_png else '.webp'
url = 'textures/' + patch['imageId'] + suffix
with Image.open(io.BytesIO(content)) as check:
    if check.convert('RGBA').size != image.size or check.convert('RGBA').tobytes() != image.tobytes():
        raise ValueError('Recovered image pixels are not lossless')
image_record = {'id': patch['imageId'], 'src': url, 'sourceName': patch['imageName'],
    'sourceSize': list(image.size), 'webSize': list(image.size), 'bytes': len(content),
    'sourceSha256': patch['sourceImageSha256'], 'webSha256': hashlib.sha256(content).hexdigest(),
    'hasAlpha': True, 'encoding': 'original-png' if use_png else 'lossless-webp', 'lossless': True,
    'resized': False, 'rgbaSha256': hashlib.sha256(image.tobytes()).hexdigest(),
    'originalBytes': len(raw), 'losslessWebpBytes': len(webp)}
mesh = patch['record']
positions, uvs, normals = mesh['positions'], mesh['uvs'], mesh['normals']
unique, out_p, out_uv, out_n, indices = {}, [], [], [], []
for i in range(len(positions)//3):
    p, uv, n = positions[3*i:3*i+3], uvs[2*i:2*i+2], normals[3*i:3*i+3]
    key = tuple(p + uv + n)
    if key not in unique:
        unique[key] = len(out_p)//3
        out_p.extend(p); out_uv.extend(uv); out_n.extend(n)
    indices.append(unique[key])
mesh.update(positions=out_p, uvs=out_uv, normals=out_n, indices=indices)
material_id = len(manifest['materials'])
mesh['material'] = material_id
material = {'id': material_id, 'name': patch['program']['materialName'], 'texture': url,
    'color': [1, 1, 1], 'opacity': 1, 'transparent': True, 'alphaTest': .012,
    'side': 'double', 'depthWrite': False, 'sourceAlphaLinked': True, 'proceduralApproximation': False}
for field in patch['program']['fields']:
    if field['url'] != 'textures/' + patch['imageId'] + '.webp': raise ValueError('Unexpected source image dependency')
    field['url'] = url
manifest['images'].append(image_record)
manifest['materials'].append(material)
manifest['meshes'].append(mesh)
# This single viewport-only exception is specifically requested by the user.
# Its source render-hide keys remain in audit; the card is resident and clipped
# by the camera, exactly like other reviewed static scenery cards.
manifest['visibility'][NAME] = [{'progress': 0, 'visible': True, 'frame': manifest['frameRange'][0]}]
manifest['audit']['viewportRestoredObjects'] = [{'name': NAME, 'sourceRenderHidden': True,
    'sourceViewportVisible': True, 'sourceImageSha256': patch['sourceImageSha256'],
    'reason': 'User confirmed this scene 8 artwork from the Blender viewport; source render visibility excluded it from the native export.'}]
programs['programs'][str(material_id) + ':' + NAME] = patch['program']
target = folder / url
if target.exists() and target.read_bytes() != content: raise ValueError('Texture path collision')
target.write_bytes(content)
for path, data in ((manifest_file, manifest), (program_file, programs)):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')
print(json.dumps({'name': NAME, 'vertices': len(out_p)//3, 'indices': len(indices), 'texture': url,
    'sourceImageSha256': patch['sourceImageSha256'], 'outputSha256': image_record['webSha256']}, ensure_ascii=False))

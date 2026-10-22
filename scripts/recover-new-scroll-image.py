"""Recover one exact named missing image from the previous packed source, without saving it."""
import bpy, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
old=ROOT/'artwork/blender-reconstructed/chapter-1_reconstructed.blend'
name='05_左上西河寺景.png'
bpy.ops.wm.open_mainfile(filepath=str(old),load_ui=False,use_scripts=False)
matches=[im for im in bpy.data.images if im.name==name]
if len(matches)!=1 or not matches[0].packed_file:
    raise RuntimeError('The exact original missing picture is not packed in the earlier Blender source.')
raw=bytes(matches[0].packed_file.data)
sha1=hashlib.sha1(raw).hexdigest()
expected='c89eeebd8405cb3f'
if not sha1.startswith(expected):
    raise RuntimeError('Recovered image disagrees with the original exported image ID: '+sha1)
dest=ROOT/'.asset-cache/new-scrolls/recovered'/name
dest.parent.mkdir(parents=True,exist_ok=True)
dest.write_bytes(raw)
report={'missingImage':name,'newMesh':'05_左上西河寺景','newSource':'牡丹/画卷一_最终修订.blend',
        'recoverySource':'artwork/blender-reconstructed/chapter-1_reconstructed.blend',
        'packedDataName':matches[0].name,'packedBytes':len(raw),'sha1':sha1,'sha256':hashlib.sha256(raw).hexdigest(),
        'matchesPreviousManifestImageId':expected,'oldWebTexture':'public/assets/chapter-1/textures/'+expected+'.webp',
        'imageSize':list(matches[0].size),'recoveryCache':'.asset-cache/new-scrolls/recovered/'+name,
        'sourceFilesSaved':False,'reason':'Exact named old packed original, not generated replacement; restores broken relocated link.'}
(ROOT/'reports/new-scrolls/image-recovery.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False),flush=True)

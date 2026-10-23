"""Read packed source bytes without saving any blend or changing runtime assets.
Run with Blender --background --disable-autoexec --python THIS -- CACHE_DIR.
"""
from pathlib import Path
import sys, json, hashlib
import bpy

root = Path(__file__).resolve().parents[2]
target = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
assert target.is_relative_to((root / 'tmp').resolve())
target.mkdir(parents=True, exist_ok=True)
digest = lambda data: hashlib.sha256(data).hexdigest()
rows = []
for chapter in range(1, 5):
    source = root / 'artwork' / 'blender-reconstructed' / f'chapter-{chapter}_reconstructed.blend'
    manifest = json.loads((root / 'public/assets/new-scrolls' / f'chapter-{chapter}/scene.json').read_text(encoding='utf8'))
    before = digest(source.read_bytes())
    assert before == manifest['sourceSha256'], 'Packed file must be the exact independently verified source'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    packed = {}
    for image in bpy.data.images:
        if image.packed_file:
            raw = bytes(image.packed_file.data)
            packed[digest(raw)] = raw
    folder = target / f'chapter-{chapter}'
    folder.mkdir(parents=True, exist_ok=True)
    for image in manifest['images']:
        raw = packed[image['sourceSha256']]
        assert hashlib.sha1(raw).hexdigest()[:16] == image['id']
        file = folder / (image['id'] + '.source')
        file.write_bytes(raw)
        assert digest(file.read_bytes()) == image['sourceSha256']
    assert digest(source.read_bytes()) == before
    rows.append({'chapter': chapter, 'source': source.relative_to(root).as_posix(), 'sourceSha256': before,
                 'images': len(manifest['images']), 'sourceUnchanged': True})
report = {'status': 'passed', 'scope': 'Recover missing ignored cache from byte-identical packed originals, no Blender save/render and no runtime asset edits',
          'cache': target.relative_to(root).as_posix(), 'chapters': rows}
(target / 'recovery.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print(json.dumps(report, ensure_ascii=False))

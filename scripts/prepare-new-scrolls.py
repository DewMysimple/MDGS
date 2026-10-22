"""Index native geometry and deliver full-resolution, lossless source pigment."""
import concurrent.futures, hashlib, io, json, os
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(os.environ.get('MDGS_EXPORT_ASSETS', ROOT/'public/assets/new-scrolls'))
REPORT = Path(os.environ.get('MDGS_PREPARE_REPORT_DIR', ROOT/'reports/peony2-fidelity'))
REPORT.mkdir(parents=True, exist_ok=True)

def dump(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf8')

def encode(raw):
    original_bytes = raw.read_bytes()
    with Image.open(io.BytesIO(original_bytes)) as original:
        image = ImageOps.exif_transpose(original).convert('RGBA')
        source_format = original.format
        unchanged_orientation = image.size == original.size and image.tobytes() == original.convert('RGBA').tobytes()
    # No 2048px cap and no quantisation: decode must reproduce every RGBA byte.
    encoded = io.BytesIO()
    image.save(encoded, 'WEBP', lossless=True, quality=100, method=4, exact=True)
    webp_bytes = encoded.getvalue()
    use_original_png = source_format == 'PNG' and unchanged_orientation and len(original_bytes) <= len(webp_bytes)
    extension = '.png' if use_original_png else '.webp'
    target = raw.with_suffix(extension)
    delivered_bytes = original_bytes if use_original_png else webp_bytes
    target.write_bytes(delivered_bytes)
    unused = raw.with_suffix('.webp' if use_original_png else '.png')
    if unused.is_file(): unused.unlink()
    with Image.open(io.BytesIO(delivered_bytes)) as check:
        pixels = check.convert('RGBA')
        if pixels.size != image.size or pixels.tobytes() != image.tobytes():
            raise RuntimeError('Lossless pigment pixel verification failed: ' + raw.name)
    return {'id': raw.stem, 'src': 'textures/'+target.name, 'sourceSize': list(image.size),
            'webSize': list(image.size), 'bytes': len(delivered_bytes),
            'sourceSha256': hashlib.sha256(original_bytes).hexdigest(),
            'webSha256': hashlib.sha256(delivered_bytes).hexdigest(), 'hasAlpha': True,
            'encoding': 'original-png' if use_original_png else 'lossless-webp',
            'lossless': True, 'resized': False, 'rgbaSha256': hashlib.sha256(image.tobytes()).hexdigest(),
            'originalBytes': len(original_bytes), 'losslessWebpBytes': len(webp_bytes)}

def index_mesh(mesh):
    """A vertex can share an index only if all Basis and morph attributes agree."""
    positions, uvs, normals = mesh['positions'], mesh['uvs'], mesh.get('normals', [])
    targets = mesh.get('morphTargets', [])
    output_p, output_uv, output_n, indices, seen = [], [], [], [], {}
    output_targets = [{'name': target['name'], 'positions': [], **({'normals': []} if 'normals' in target else {})}
                      for target in targets]
    before = len(positions)//3
    for index in range(before):
        point = positions[index*3:index*3+3]; uv = uvs[index*2:index*2+2]
        normal = normals[index*3:index*3+3] if normals else []
        key = list(point+uv+normal)
        for target in targets:
            key.extend(target['positions'][index*3:index*3+3])
            key.extend(target.get('normals', [])[index*3:index*3+3])
        key = tuple(key)
        if key not in seen:
            seen[key] = len(output_p)//3; output_p.extend(point); output_uv.extend(uv); output_n.extend(normal)
            for target, output in zip(targets, output_targets):
                output['positions'].extend(target['positions'][index*3:index*3+3])
                if 'normals' in target: output['normals'].extend(target['normals'][index*3:index*3+3])
        indices.append(seen[key])
    mesh.update(positions=output_p, uvs=output_uv, indices=indices)
    if normals: mesh['normals'] = output_n
    if targets: mesh['morphTargets'] = output_targets
    return before, len(output_p)//3

summaries = []
for folder in sorted(ASSETS.glob('chapter-*')):
    manifest = folder/'scene.json'
    if not manifest.is_file(): continue
    data = json.loads(manifest.read_text(encoding='utf8'))
    if data['audit']['missingImages'] or data['audit']['skippedObjects']:
        raise RuntimeError('Incomplete actual source export: ' + data['id'])
    raws = [folder/'textures'/f"{image['id']}.source" for image in data['images']]
    if not all(raw.is_file() for raw in raws):
        raise RuntimeError('Export exact packed source bytes before texture preparation: ' + data['id'])
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        encoded = list(pool.map(encode, raws))
    images = {item['id']: item for item in encoded}
    texture_remap = {}
    for item in data['images']:
        old_src = item['src']; item.update(images[item['id']]); texture_remap[old_src] = item['src']
    for material in data['materials']:
        if material.get('texture'): material['texture'] = texture_remap[material['texture']]
    before = after = 0
    for mesh in data['meshes']:
        original, indexed = index_mesh(mesh); before += original; after += indexed
    start, end = data['frameRange']
    stops = []
    for authored in data['stops']:
        marker = dict(authored); marker['authoredFrame'] = marker['frame']
        marker['frame'] = min(end, max(start, marker['frame']))
        marker['progress'] = (marker['frame']-start)/max(1, end-start); stops.append(marker)
    data.update(stops=stops, geometryEncoding='indexed-json', sourcePipeline='scripts/export-new-scrolls.py + scripts/prepare-new-scrolls.py + scripts/export-source-materials.py')
    for repair in data['audit']['repairs']:
        repair['oldPath'] = Path(repair['oldPath'].replace('\\', '/')).name
        repair['resolvedPath'] = 'Exact original image resolved during native export.'
    data['audit']['rawSourcesMovedToIgnoredCache'] = True
    data['audit']['texturePolicy'] = 'Full source resolution; smaller of original PNG and lossless WebP; exact decoded RGBA verified.'
    data['audit']['losslessHeldMatrixSamples'] = {'after': sum(len(track) for track in data['animations'].values()), 'sampledFrames': end-start+1}
    dump(manifest, data)
    cache = ROOT/'.asset-cache/new-scrolls'/data['sourceRevision']/data['id']; cache.mkdir(parents=True, exist_ok=True)
    for raw in raws: raw.replace(cache/raw.name)
    candidates = []
    for mesh in data['meshes']:
        name = mesh['name']
        if not any(token in name for token in ['云','花瓣','飘带','帘','烟','波','柳','灯']): continue
        material = data['materials'][mesh['material']]
        candidates.append({'name': name, 'vertices': len(mesh['positions'])//3, 'bounds': mesh['bounds'],
                           'texture': material['texture'], 'sourceAnimated': mesh['animated'],
                           'containsFigure': any(token in name for token in ['人物','女子','仕女','衣袍']),
                           'safeIndependentName': not any(token in name for token in ['人物','女子','仕女','衣袍','组合'])})
    dump(REPORT/f"{data['id']}-motion-candidates.json", {'id': data['id'], 'source': data['source'], 'sourceAnimationObjects': list(data['animations']), 'motionCandidates': candidates})
    summary = {'id': data['id'], 'source': data['source'], 'sourceSha256': data['sourceSha256'],
               'meshCount': len(data['meshes']), 'visibleNativeMeshesAtStart': data['audit']['visibleNativeMeshesAtStart'],
               'materialCount': len(data['materials']), 'textures': len(data['images']),
               'textureBytes': sum(item['bytes'] for item in data['images']), 'frameRange': data['frameRange'],
               'stops': stops, 'travel': data['travel'], 'triangulatedVertices': before, 'indexedVertices': after,
               'manifestBytes': manifest.stat().st_size, 'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
               'cameraSamples': len(data['cameras']), 'morphObjects': sum(bool(mesh.get('morphTargets')) for mesh in data['meshes']),
               'textureEncodings': {encoding: sum(item['encoding']==encoding for item in data['images']) for encoding in ['original-png','lossless-webp']},
               'missingImages': data['audit']['missingImages'], 'skippedObjects': data['audit']['skippedObjects'],
               'sourceAnimationObjects': list(data['animations']), 'motionCandidates': candidates}
    summaries.append(summary)
    print(json.dumps({key: value for key, value in summary.items() if key not in ('stops','motionCandidates','sourceAnimationObjects')}, ensure_ascii=False), flush=True)
dump(REPORT/'web-delivery.json', summaries)

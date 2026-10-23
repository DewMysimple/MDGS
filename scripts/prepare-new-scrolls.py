"""Index new source meshes and encode their exact extracted pictures for the web."""
import concurrent.futures, hashlib, json, os, re
from pathlib import Path
from PIL import Image, ImageOps

ROOT=Path(__file__).resolve().parents[1]
ASSETS=Path(os.environ.get('MDGS_EXPORT_ASSETS',ROOT/'public/assets/new-scrolls'))
REPORT=Path(os.environ.get('MDGS_SCROLL_REPORT',ROOT/'reports/peony-2.0'))
REVISION=os.environ.get('MDGS_SCROLL_REVISION','peony-2.0-2026-10-22')

def dump(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')

def encode(raw):
    target=raw.with_suffix('.webp')
    with Image.open(raw) as original:
        image=ImageOps.exif_transpose(original).convert('RGBA')
        original_size=list(image.size)
        image.thumbnail((2048,2048),Image.Resampling.LANCZOS)
        image.save(target,'WEBP',quality=90,method=4,exact=True)
        return {'src':'textures/'+target.name,'sourceSize':original_size,'webSize':list(image.size),
                'bytes':target.stat().st_size,'sourceSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
                'webSha256':hashlib.sha256(target.read_bytes()).hexdigest(),'hasAlpha':True}

summaries=[]
for chapter in range(1,5):
    folder=ASSETS/f'chapter-{chapter}'
    manifest=folder/'scene.json'
    data=json.loads(manifest.read_text(encoding='utf8'))
    audit=json.loads((REPORT/f'chapter-{chapter}-source-audit.json').read_text(encoding='utf8'))
    if data['audit']['missingImages'] or data['audit']['skippedObjects']:
        raise RuntimeError('Incomplete actual source export: '+data['id'])
    raws=list((folder/'textures').glob('*.source'))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: encoded=list(pool.map(encode,raws))
    images={item['src']:item for item in encoded} if encoded else {item['src']:item for item in data['images']}
    for item in data['images']:
        item.update(images[item['src']])
    before=after=0
    for mesh in data['meshes']:
        if 'indices' in mesh:
            before+=len(mesh['indices']);after+=len(mesh['positions'])//3
            continue
        p=mesh['positions'];uv=mesh['uvs'];positions=[];uvs=[];indices=[];seen={}
        before+=len(p)//3
        for index in range(len(p)//3):
            xyz=p[index*3:index*3+3];st=uv[index*2:index*2+2];key=tuple(xyz+st)
            if key not in seen:
                seen[key]=len(positions)//3;positions.extend(xyz);uvs.extend(st)
            indices.append(seen[key])
        mesh.update(positions=positions,uvs=uvs,indices=indices)
        after+=len(positions)//3
    samples_before=sum(len(track) for track in data['animations'].values())
    # Exact duplicate holds are redundant, but keep both ends of every hold so
    # the following authored movement begins at the original source time.
    for name,track in data['animations'].items():
        data['animations'][name]=[item for i,item in enumerate(track)
            if i==0 or i==len(track)-1 or not (track[i-1]['matrix']==item['matrix']==track[i+1]['matrix'])]
    start,end=data['frameRange']
    data['cameras']=[sample for sample in data['cameras'] if start<=sample['frame']<=end]
    authored=data['markers']
    stops=[dict(marker) for marker in authored if '参考全景' not in marker['name'] and re.match(r'^\d{2}\s*·|^[1-4]-\d+\b',marker['name'])]
    for marker in stops:
        marker['authoredFrame']=marker['frame'];marker['frame']=min(end,max(start,marker['frame']))
        marker['progress']=(marker['frame']-start)/(end-start)
    data.update(stops=stops,sourceRevision=REVISION,sourceSha256=audit['sourceSha256'],
                source=audit['source'],geometryEncoding='indexed-json',sourcePipeline='scripts/export-new-scrolls.py + scripts/prepare-new-scrolls.py')
    # Reports retain the recovery proof, but public manifests never expose local paths.
    for repair in data['audit']['repairs']:
        repair['resolvedPath']='Exact original packed image; see edition report image-recovery.json'
    data['audit']['nativeSourceSha256']=audit['sourceSha256']
    data['audit']['visibleNativeMeshesAtStart']=sum(o['type']=='MESH' and not o['hidden'] for o in audit['objects'])
    data['audit']['exportedEverVisibleMeshes']=len(data['meshes'])
    data['audit']['sourceVisibilityScanned']=True
    data['audit']['losslessHeldMatrixSamples']={'before':samples_before,'after':sum(len(track) for track in data['animations'].values())}
    data['audit']['rawSourcesMovedToIgnoredCache']=True
    effects_file=REPORT/f'chapter-{chapter}-source-effects.json'
    if effects_file.exists():
        source_effects=json.loads(effects_file.read_text(encoding='utf8'))
        exported_materials={m['name']:m['id'] for m in data['materials']}
        effect_materials=[]
        scalar_tracks={}
        for effect in source_effects['materials']:
            if effect['name'] not in exported_materials:continue
            effect=dict(effect);effect['materialId']=exported_materials[effect['name']]
            label=effect['name']+' '+' '.join(node['name'] for node in effect['nodes'])
            effect['kind']='burn' if '灼烧' in label else 'ink' if '墨' in label else 'fade'
            keys=[key for key in source_effects['scalarTracks'] if key.startswith(effect['name']+'|')]
            effect['scalarKeys']=keys
            preferred=['灼烧入场','选择性出场进度','出场效果进度','水墨蔓延进度','显现进度','清晰显现进度']
            effect['progressScalarKey']=next((key for token in preferred for key in keys if token in key),keys[0] if keys else None)
            effect['noiseDefaults']=[{'node':node['name'],'inputs':{item['name']:item['value'] for item in node['inputs'] if item['value'] is not None}}
                for node in effect['nodes'] if node['type']=='TEX_NOISE']
            effect_materials.append(effect)
            scalar_tracks.update({key:source_effects['scalarTracks'][key] for key in keys})
        objects={node.get('object') for effect in effect_materials for node in effect['nodes'] if node.get('object')}
        data['sourceEffects']={'materials':effect_materials,'scalarTracks':scalar_tracks,
            'nodeGroups':source_effects.get('nodeGroups',[]),
            'coordinateObjects':[obj for obj in source_effects['objects'] if obj['name'] in objects],
            'sourceReport':effects_file.relative_to(ROOT).as_posix(),
            'sourceReportSha256':hashlib.sha256(effects_file.read_bytes()).hexdigest(),
            'scope':'Exact native graph metadata and evaluated frame scalar tracks; renderer noise approximation is separate.'}
    dump(manifest,data)
    cache=ROOT/'.asset-cache'/REVISION/data['id'];cache.mkdir(parents=True,exist_ok=True)
    for raw in raws: raw.replace(cache/raw.name)
    candidates=[]
    for mesh in data['meshes']:
        name=mesh['name']
        if not any(token in name for token in ['云','花瓣','飘带','帘','烟','波','柳','灯']): continue
        material=data['materials'][mesh['material']]
        candidates.append({'name':name,'vertices':len(mesh['positions'])//3,'bounds':mesh['bounds'],
                           'texture':material['texture'],'sourceAnimated':mesh['animated'],
                           'containsFigure':any(token in name for token in ['人物','女子','仕女','衣袍']),
                           'safeIndependentName':not any(token in name for token in ['人物','女子','仕女','衣袍','组合'])})
    (REPORT/f'chapter-{chapter}-motion-candidates.json').write_text(json.dumps(candidates,ensure_ascii=False,indent=2),encoding='utf8')
    summary={'id':data['id'],'source':data['source'],'sourceSha256':data['sourceSha256'],
             'meshCount':len(data['meshes']),'visibleNativeMeshesAtStart':data['audit']['visibleNativeMeshesAtStart'],
             'materialCount':len(data['materials']),'textures':len(data['images']),
             'textureBytes':sum(i['bytes'] for i in data['images']),'frameRange':data['frameRange'],
             'stops':stops,'travel':data['travel'],'triangulatedVertices':before,'indexedVertices':after,
             'manifestBytes':manifest.stat().st_size,'manifestSha256':hashlib.sha256(manifest.read_bytes()).hexdigest(),
             'missingImages':data['audit']['missingImages'],'skippedObjects':data['audit']['skippedObjects'],
             'sourceAnimationObjects':list(data['animations']),'motionCandidates':candidates}
    summary['sourceEffects']=[{'materialId':m['materialId'],'name':m['name'],'kind':m['kind'],'users':m['users'],
        'progressScalarKey':m['progressScalarKey'],'scalarKeys':m['scalarKeys']} for m in data.get('sourceEffects',{}).get('materials',[])]
    summaries.append(summary)
    print(json.dumps({k:v for k,v in summary.items() if k not in ('stops','motionCandidates')},ensure_ascii=False),flush=True)
(REPORT/'web-delivery.json').write_text(json.dumps(summaries,ensure_ascii=False,indent=2),encoding='utf8')

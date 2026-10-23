"""Replace the four active editable deliveries with packed copies of the new inputs."""
import bpy, hashlib, json, os, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from asset_config import load_pipeline, image_index, resolve_image
CONFIG=load_pipeline(['--config',os.environ.get('MDGS_SCROLL_CONFIG',str(ROOT/'scripts/peony-2.0-sources.json'))])
REPORT=Path(os.environ.get('MDGS_SCROLL_REPORT',ROOT/'reports/peony-2.0'))
OUTPUT=ROOT/'artwork/blender-reconstructed'
SOURCES=CONFIG.sources

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for part in iter(lambda:f.read(8*1024*1024),b''):h.update(part)
    return h.hexdigest()

def fingerprint():
    s=bpy.context.scene
    original=s.frame_current
    frames={s.frame_start,s.frame_end,(s.frame_start+s.frame_end)//2}
    frames.update(m.frame for m in s.timeline_markers if s.frame_start<=m.frame<=s.frame_end)
    samples=[]
    for frame in sorted(frames):
        s.frame_set(frame);dg=bpy.context.evaluated_depsgraph_get()
        samples.append({'frame':frame,'cameraMatrix':[round(float(v),6) for row in s.camera.evaluated_get(dg).matrix_world for v in row],
                        'objects':[{'name':o.name,'type':o.type,'hidden':o.hide_render,
                            'matrix':[round(float(v),6) for row in o.evaluated_get(dg).matrix_world for v in row],
                            'vertices':len(o.data.vertices) if o.type=='MESH' else None} for o in sorted(s.objects,key=lambda o:o.name)]})
    s.frame_set(original)
    data={'frames':[s.frame_start,s.frame_end],'fps':s.render.fps,'camera':s.camera.name,
          'render':[s.render.resolution_x,s.render.resolution_y],
          'markers':[(m.name,m.frame) for m in s.timeline_markers], 'samples':samples}
    return hashlib.sha256(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),len(samples)

results=[]
bpy.context.preferences.filepaths.save_version=0
for cid,file in SOURCES:
    chapter=int(cid.split('-')[-1]);source=Path(file);target=OUTPUT/f'chapter-{chapter}_reconstructed.blend'
    source_hash=sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
    before,sample_count=fingerprint()
    repaired=[]
    for image in bpy.data.images:
        if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).is_file():
            recovered=resolve_image(bpy.path.abspath(image.filepath),image.name,image_index(CONFIG.materials_root))
            if not recovered:raise RuntimeError('Missing exact source image: '+image.name)
            image.filepath=str(recovered);image.reload();image.pack();repaired.append(image.name)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True,check_existing=False)
    bpy.ops.wm.open_mainfile(filepath=str(target),load_ui=False,use_scripts=False)
    after,_=fingerprint()
    missing=[image.name for image in bpy.data.images if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).is_file()]
    if before!=after or missing or source_hash!=sha(source):
        raise RuntimeError('Native delivery changed source scene or has missing pictures: '+str(chapter))
    item={'id':f'chapter-{chapter}','input':source.relative_to(ROOT).as_posix(),'inputSha256':source_hash,
          'delivery':f'artwork/blender-reconstructed/{target.name}','deliverySha256':sha(target),
          'deliveryBytes':target.stat().st_size,'nativeReopened':True,'nativeSceneFingerprint':after,
          'sourceAndDeliveryEquivalent':True,'sampledCameraAndObjectMatrixFrames':sample_count,'missingImages':missing,
          'packedFileImages':sum(image.source=='FILE' and bool(image.packed_file) for image in bpy.data.images),
          'inputUnchanged':True,'repairedImages':repaired,'intentionalChange':'Pack any exact recovered image; save compressed copy. Source geometry, camera, markers, visibility and animations unchanged.'}
    results.append(item)
    (REPORT/'native-delivery.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(item,ensure_ascii=False),flush=True)

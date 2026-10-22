"""Replace the four active editable deliveries with packed copies of the new inputs."""
import bpy, hashlib, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPORT=ROOT/'reports/new-scrolls'
INPUT=ROOT/'牡丹'
OUTPUT=ROOT/'artwork/blender-reconstructed'
NAMES=['画卷一_最终修订.blend','画卷二_街市建筑完整补全版.blend','画卷三_分镜构图版_图层补全.blend','画卷四_转场运镜加快版.blend']

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
for chapter,name in enumerate(NAMES,1):
    source=INPUT/name;target=OUTPUT/f'chapter-{chapter}_reconstructed.blend'
    source_hash=sha(source)
    bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False,use_scripts=False)
    before,sample_count=fingerprint()
    if chapter==1:
        image=bpy.data.images['05_左上西河寺景.png']
        image.filepath=str(ROOT/'.asset-cache/new-scrolls/recovered/05_左上西河寺景.png')
        image.reload();image.pack()
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(target),compress=True,check_existing=False)
    bpy.ops.wm.open_mainfile(filepath=str(target),load_ui=False,use_scripts=False)
    after,_=fingerprint()
    missing=[image.name for image in bpy.data.images if image.source=='FILE' and not image.packed_file and not Path(bpy.path.abspath(image.filepath)).is_file()]
    if before!=after or missing or source_hash!=sha(source):
        raise RuntimeError('Native delivery changed source scene or has missing pictures: '+str(chapter))
    item={'id':f'chapter-{chapter}','input':f'牡丹/{name}','inputSha256':source_hash,
          'delivery':f'artwork/blender-reconstructed/{target.name}','deliverySha256':sha(target),
          'deliveryBytes':target.stat().st_size,'nativeReopened':True,'nativeSceneFingerprint':after,
          'sourceAndDeliveryEquivalent':True,'sampledCameraAndObjectMatrixFrames':sample_count,'missingImages':missing,
          'packedFileImages':sum(image.source=='FILE' and bool(image.packed_file) for image in bpy.data.images),
          'inputUnchanged':True,'intentionalChange':'Only pack exact missing original image for chapter 1; save compressed copy. New source geometry, camera, markers, visibility and animations unchanged.'}
    results.append(item)
    (REPORT/'native-delivery.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
    print(json.dumps(item,ensure_ascii=False),flush=True)

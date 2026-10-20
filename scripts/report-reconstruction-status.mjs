/** Derived implementation ledger; original visual decisions/inventory remain untouched. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createServer} from 'vite';

const root=new URL('../',import.meta.url),output=new URL('reports/reconstruction/',root);
const revisionFile=new URL('public/assets/reconstruction/manifest.json',root);
const revisionText=await readFile(revisionFile,'utf8'),revision=JSON.parse(revisionText);
const inventory=JSON.parse(await readFile(new URL('reports/reconstruction/layers-inventory.json',root),'utf8'));
const review=JSON.parse(await readFile(new URL('reports/reconstruction/visual-review.json',root),'utf8'));
const revisionHash=createHash('sha256').update(revisionText).digest('hex');
const vite=await createServer({server:{middlewareMode:true},appType:'custom',logLevel:'error'});
const countBy=(items,key)=>Object.fromEntries([...new Set(items.map(key))].sort().map(value=>[value,items.filter(item=>key(item)===value).length]));
const csv=value=>`"${String(value??'').replaceAll('"','""')}"`;
try{
  const {applyArtDirection}=await vite.ssrLoadModule('/src/scene/ArtDirectionLayer.ts');
  const {deriveUvBasis}=await vite.ssrLoadModule('/src/scene/MotionDirector.ts');
  const {motionProfiles}=await vite.ssrLoadModule('/src/data/motionProfiles.ts');
  const {prepareScene}=await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const rows=[],bindings=[],textLayers=[],chapterSummaries=[];
  for(const chapter of [1,2,3,4]){
    const raw=JSON.parse(await readFile(new URL(`public/assets/chapter-${chapter}/scene.json`,root),'utf8'));
    const manifest=prepareScene(raw,chapter),config=revision.chapters[String(chapter)],profile=motionProfiles[chapter];
    const scene=new THREE.Scene(),objects=[],sources=new Map();
    const originalInventory=inventory.meshes.filter(item=>item.chapter===chapter);
    const byName=new Map(originalInventory.map(item=>[item.name,item]));
    assert.equal(byName.size,raw.meshes.length,'Inventory/source mesh membership must remain current');
    for(const source of manifest.meshes){
      if(source.isText||!source.positions.length)continue;
      const definition=manifest.materials[source.material];if(!definition)continue;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions,3));
      if(source.uvs.length)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(source.uvs,2));
      if(source.indices?.length)geometry.setIndex(source.indices);
      geometry.computeBoundingSphere();
      const material=new THREE.MeshBasicMaterial({opacity:definition.opacity??1,transparent:definition.transparent||!!definition.texture,depthWrite:definition.texture?false:definition.depthWrite??true});
      const mesh=new THREE.Mesh(geometry,material);mesh.name=source.name;mesh.matrix.fromArray(source.matrix);mesh.matrixAutoUpdate=false;mesh.updateMatrixWorld(true);mesh.visible=!definition.texture;scene.add(mesh);
      const object={mesh,material,url:definition.texture?`assets/chapter-${chapter}/${definition.texture}`:undefined,animation:manifest.animations?.[source.name]};objects.push(object);
      sources.set(source.name,{source,geometry,positions:[...geometry.getAttribute('position').array],uvs:geometry.getAttribute('uv')?[...geometry.getAttribute('uv').array]:null,indices:geometry.getIndex()?[...geometry.getIndex().array]:null,matrix:[...mesh.matrix.elements]});
    }
    const originalFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,json:async()=>revision});
    let summary;try{summary=await applyArtDirection(chapter,manifest,objects,scene,new AbortController().signal);}finally{globalThis.fetch=originalFetch;}
    const actualByName=new Map(objects.map(object=>[object.mesh.name,object]));
    const motionByName=new Map(profile.bindings.map(binding=>[binding.meshName,binding]));
    for(const binding of profile.bindings){
      const object=actualByName.get(binding.meshName);assert(object&&!object.mesh.userData.artHidden,`Declared runtime binding missing/retired: ${chapter}/${binding.meshName}`);
      let uvBasis=null;
      if(binding.kind!=='opacityPulse'){
        const actual=deriveUvBasis(object.mesh.geometry,binding.uvDomain);
        if(binding.plane!=='UV')assert.equal(actual.plane,binding.plane);
        uvBasis={domain:binding.uvDomain??'image',plane:actual.plane,origin:actual.origin.toArray(),alongU:actual.alongU.toArray(),alongV:actual.alongV.toArray(),normal:actual.normal.toArray(),maxNormalResidual:actual.maxNormalResidual,maxInPlaneResidual:actual.maxInPlaneResidual};
      }
      const original=byName.get(binding.meshName),added=config.addedLayers.find(item=>item.name===binding.meshName);
      bindings.push({chapter,instanceId:original?.id??added.id,name:binding.meshName,origin:original?'original':'added-world',kind:binding.kind,declaredPlane:binding.plane,uvBasis,narrative:binding.narrative,periodSeconds:binding.periodSeconds,phase:binding.phase,pivot:binding.pivot??[.5,.5],group:binding.group??'legacy',priority:binding.priority??3,atmosphere:binding.atmosphere??null,angleDegrees:binding.angleDegrees??0,xRatio:binding.xRatio??0,yRatio:binding.yRatio??0,zRatio:binding.zRatio??0,opacityAmplitude:binding.opacityAmplitude??0,sourceAnimationSamples:object.animation?.length??0,activation:'profile configured; actual frustum/texture residency and per-group quota decide active frames',matrixPolicy:binding.kind==='opacityPulse'?'original matrix stays fixed; opacity only':'incremental delta from immutable source/source-animation base'});
    }
    for(const original of originalInventory){
      const object=actualByName.get(original.name),source=sources.get(original.name),texture=inventory.textures.find(item=>item.id===original.textureId);
      const audit=review.entries[original.textureId]??review.entries[original.id]??original;
      const replacements=config.replacements.filter(item=>item.sourceTexture===original.material?.texture&&(!item.meshNames||item.meshNames.includes(original.name)));
      const geometryRepairs=(config.geometryRepairs??[]).filter(item=>item.meshNames.includes(original.name));
      const edges=config.edgeRepairs.filter(item=>item.meshNames.includes(original.name));
      const hidden=!!object?.mesh.userData.artHidden;
      const html=(config.textLayers??[]).filter(item=>texture&&item.id.startsWith(texture.label.toLowerCase())||(chapter===1&&original.name==='14_批注06_右侧题字_原字'&&item.id==='r1-readable-title'));
      const motion=object&&!hidden?motionByName.get(original.name):undefined;
      let geometryPolicy=replacements[0]?.geometryPolicy??(replacements.length?'full-uv-affine':geometryRepairs.length?'full-uv-affine':'original');
      if(!object)geometryPolicy='not-rendered';
      if(source){
        assert.deepEqual(object.mesh.matrix.elements,source.matrix);
        assert.deepEqual([...source.geometry.getAttribute('position').array],source.positions);
        assert.deepEqual(source.geometry.getAttribute('uv')?[...source.geometry.getAttribute('uv').array]:null,source.uvs);
        assert.deepEqual(source.geometry.getIndex()?[...source.geometry.getIndex().array]:null,source.indices);
      }
      rows.push({id:original.id,label:original.label,chapter,name:original.name,origin:'original',role:original.type,sourceType:original.sourceType,textureId:original.textureId??null,sourceAsset:texture?.textureUrl??null,auditOriginal:{treatment:audit.treatment??original.treatment,problems:audit.problems??[],pendingVisualReview:audit.pendingVisualReview??original.pendingVisualReview,dynamicRecommendation:audit.dynamic??original.dynamic},implementation:{webStatus:!object?(original.isText?'source-font-skipped':'source-geometry-or-material-skipped'):hidden?(html.length?'retired-low-resolution-text':'retired-auxiliary'):'authored-instance-retained',pixels:!original.textureId?'not-raster':hidden?'retired-source-pixels':replacements.length?'replacement-raster':'retained-source-pixels',activeAsset:object?.url??null,replacementIds:replacements.map(item=>item.id),geometryPolicy,geometryRepairIds:geometryRepairs.map(item=>item.id),edgeRepairs:edges.map(item=>({id:item.id,uvRect:item.uvRect??[0,0,1,1],fades:item.fades})),htmlReplacementIds:html.map(item=>item.id),paperDepthMaskDisabled:!!object?.mesh.userData.artPaperBackground,sourceWorldMatrixPreserved:source?true:null,sourceGeometryBuffersPreserved:source?true:null,webEligible:!!object&&!hidden,sourceAnimationSamples:object?.animation?.length??0,independentMotionConfigured:!!motion,motionKind:motion?.kind??null,motionNarrative:motion?.narrative??null},narrative:object?.mesh.userData.narrative??audit.narrativeMatch?.basis??original.use});
    }
    for(const added of config.addedLayers){
      const object=actualByName.get(added.name);assert(object);
      const motion=motionByName.get(added.name);
      rows.push({id:added.id,label:added.id,chapter,name:added.name,origin:'added-world',role:added.role,sourceType:'MESH',textureId:null,sourceAsset:null,auditOriginal:null,implementation:{webStatus:'new-world-layer',pixels:'new-raster',activeAsset:object.url,replacementIds:[],geometryPolicy:'new-XY-plane'+(added.uvRect?'-atlas-region':''),geometryRepairIds:[],edgeRepairs:[],htmlReplacementIds:[],paperDepthMaskDisabled:false,sourceWorldMatrixPreserved:null,sourceGeometryBuffersPreserved:null,webEligible:true,sourceAnimationSamples:0,independentMotionConfigured:!!motion,motionKind:motion?.kind??null,motionNarrative:motion?.narrative??null},narrative:added.narrative});
    }
    for(const text of config.textLayers??[])textLayers.push({chapter,id:text.id,origin:'new-html-text',type:'CSS3DObject',matrix:text.matrix,domWidth:text.domWidth,domHeight:text.domHeight,range:text.range??[0,1],narrative:text.narrative??null,static:true,content:text.content??{title:text.title,lines:text.lines},visibility:'same authored world camera; may intentionally hide outside the actual frustum'});
    chapterSummaries.push({chapter,originalInstances:originalInventory.length,newWorldInstances:config.addedLayers.length,htmlTextLayers:(config.textLayers??[]).length,configuredMotion:profile.bindings.length,applied:{replacements:summary.replacements,geometryRepairs:summary.geometryRepairs,edgeRepairs:summary.edgeRepairs,addedLayers:summary.addedLayers},maxVisibleMotion:profile.maxVisibleBindings,narrativeEnvelope:profile.narrativeEnvelope??null});
    for(const object of objects){object.mesh.geometry.dispose();object.material.dispose();}scene.clear();
  }
  assert.equal(rows.filter(row=>row.origin==='original').length,inventory.meshes.length);
  assert.equal(rows.filter(row=>row.origin==='added-world').length,152);assert.equal(bindings.length,188);
  assert.equal(new Set(rows.map(row=>row.id)).size,rows.length,'Instance IDs must remain unique');
  assert.equal(await readFile(revisionFile,'utf8'),revisionText,'Canonical changed during ledger generation');
  const provenance={canonicalSha256:revisionHash,generatedAt:new Date().toISOString(),method:'SSR imports current profiles and executes actual applyArtDirection with the canonical JSON via a read-only mock fetch. No textures are loaded and no GPU is created. Every source instance matrix and geometry buffer is checked unchanged.',inputs:['reports/reconstruction/layers-inventory.json','reports/reconstruction/visual-review.json','public/assets/reconstruction/manifest.json','src/data/motionProfiles.ts','src/scene/ArtDirectionLayer.ts','src/scene/MotionDirector.ts'],scope:'Original inventory and visual judgments are not edited. Raster audit decisions are inherited from the texture review, not a claim of separate visual inspection of every repeated mesh. Configured motion is different from continuously active motion; visibility and quotas apply. HTML text is listed separately from mesh instances.'};
  const result={schemaVersion:1,...provenance,summary:{originalInstances:inventory.meshes.length,newWorldInstances:152,totalWorldInventoryInstances:rows.length,htmlTextLayers:textLayers.length,configuredMotion:bindings.length,statusCounts:countBy(rows,row=>row.implementation.webStatus),pixelCounts:countBy(rows,row=>row.implementation.pixels),pixelCountsUnit:'mesh instances, not unique source textures'},chapters:chapterSummaries,instances:rows,htmlTextLayers:textLayers};
  await writeFile(new URL('layer-implementation.json',output),JSON.stringify(result,null,2)+'\n');
  await writeFile(new URL('runtime-bindings.json',output),JSON.stringify({schemaVersion:1,...provenance,count:bindings.length,chapters:chapterSummaries,bindings},null,2)+'\n');
  const columns=['id','chapter','name','origin','role','sourceType','textureId','auditTreatment','webStatus','pixels','activeAsset','replacementIds','geometryPolicy','geometryRepairIds','edgeRepairIds','htmlReplacementIds','sourceWorldMatrixPreserved','sourceGeometryBuffersPreserved','sourceAnimationSamples','independentMotionConfigured','motionKind','narrative'];
  const lines=rows.map(row=>{const value={...row,...row.implementation,auditTreatment:row.auditOriginal?.treatment??'',replacementIds:row.implementation.replacementIds.join(';'),geometryRepairIds:row.implementation.geometryRepairIds.join(';'),edgeRepairIds:row.implementation.edgeRepairs.map(item=>item.id).join(';'),htmlReplacementIds:row.implementation.htmlReplacementIds.join(';')};return columns.map(key=>csv(value[key])).join(',');});
  await writeFile(new URL('layer-implementation.csv',output),'\ufeff'+columns.map(csv).join(',')+'\n'+lines.join('\n')+'\n');
  console.log(`Implementation ledger: ${inventory.meshes.length}+152 mesh instances, ${textLayers.length} HTML layers, ${bindings.length} actual profile bindings.`);
}finally{await vite.close();}

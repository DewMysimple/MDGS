import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { MotionDirector, fallingPetalEnvelope, deriveUvBasis, evaluateMotionEnvelope } = await server.ssrLoadModule('/src/scene/MotionDirector.ts');
  const { prepareScene } = await server.ssrLoadModule('/src/scene/prepareScene.ts');
  const { motionProfiles } = await server.ssrLoadModule('/src/data/motionProfiles.ts');
  const { completeUvPlane, applyArtDirection } = await server.ssrLoadModule('/src/scene/ArtDirectionLayer.ts');
  const source = JSON.parse(await readFile(new URL('../public/assets/chapter-1/scene.json', import.meta.url), 'utf8'));
  const byName = new Map(source.meshes.map(mesh => [mesh.name, mesh]));
  const revisionText=await readFile(new URL('../public/assets/reconstruction/manifest.json',import.meta.url),'utf8');
  const revision=JSON.parse(revisionText);
  const addedByName = new Map((revision.chapters['1']?.addedLayers ?? []).map(layer => [layer.name, layer]));
  const makeCarrier = (coordinates, relief = () => 0) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates.flat(), 2));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(coordinates.flatMap(([u, v]) => [(u - 0.5) * 8, (v - 0.5) * 4, relief(u, v)]), 3));
    return geometry;
  };
  const cropped = makeCarrier([[0.25, 0.2], [0.8, 0.2], [0.8, 0.8], [0.25, 0.8]]);
  const croppedBefore = [...cropped.getAttribute('position').array];
  const completed = completeUvPlane(cropped);
  assert.deepEqual([...cropped.getAttribute('position').array], croppedBefore, 'UV reconstruction must not mutate original geometry');
  assert.deepEqual([...completed.getAttribute('uv').array], [0, 0, 1, 0, 1, 1, 0, 1]);
  assert(Math.abs(completed.boundingBox.min.x + 4) < 1e-5 && Math.abs(completed.boundingBox.max.x - 4) < 1e-5, 'A cropped UV carrier must recover the full image width');
  assert(Math.abs(completed.boundingBox.min.y + 2) < 1e-5 && Math.abs(completed.boundingBox.max.y - 2) < 1e-5, 'A cropped UV carrier must recover the full image height');
  const grid = [0.2, 0.5, 0.8].flatMap(v => [0.2, 0.5, 0.8].map(u => [u, v]));
  const gentle = makeCarrier(grid, (u, v) => 0.06 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI));
  const flattened = completeUvPlane(gentle);
  assert(flattened.userData.uvReconstruction.maxNormalResidual > 0, 'Bounded normal relief must be measured rather than silently assumed flat');
  assert(flattened.userData.uvReconstruction.maxInPlaneResidual < 1e-5);
  const wrongUv = makeCarrier(grid);
  wrongUv.getAttribute('uv').setXY(4, 0.1, 0.9);
  assert.throws(() => completeUvPlane(wrongUv), /UV不匹配|曲面起伏/, 'An inconsistent image mapping must not be flattened as a valid image carrier');
  const degenerateUv = makeCarrier(grid);
  for (let index = 0; index < degenerateUv.getAttribute('uv').count; index++) degenerateUv.getAttribute('uv').setXY(index, 0.5, 0.5);
  assert.throws(() => completeUvPlane(degenerateUv), /UV退化/);
  const folded = makeCarrier(grid, (u, v) => u === 0.5 && v === 0.5 ? 1 : 0);
  assert.throws(() => completeUvPlane(folded), /UV不匹配|曲面起伏/, 'Large normal folds must be rejected');
  const fullUvReconstruction = [], explicitCarrierReconstruction=[];
  const verifyExplicitCarrier=async(chapter,raw,replacement)=>{
    assert.equal(replacement.geometryCorners.length,4,'An explicitly placed carrier needs four reviewed local corners');
    assert(replacement.geometryCorners.every(corner=>Array.isArray(corner)&&corner.length===3&&corner.every(Number.isFinite)));
    const paddingX=replacement.paddingScaleX??replacement.paddingScale,paddingY=replacement.paddingScaleY??replacement.paddingScale;
    assert(Number.isFinite(paddingX)&&Number.isFinite(paddingY)&&paddingX>=1&&paddingY>=1);
    const materialIds=new Set(raw.materials.filter(material=>material.texture===replacement.sourceTexture).map(material=>material.id));
    const related=raw.meshes.filter(mesh=>materialIds.has(mesh.material));
    const retired=related.filter(mesh=>!replacement.meshNames.includes(mesh.name)).map(mesh=>mesh.name);
    for(const name of retired)assert(revision.chapters[String(chapter)].hiddenMeshNames.includes(name),'Repeated river auxiliaries must retire explicitly');
    if(replacement.id==='c2-t002'){assert.deepEqual(replacement.meshNames,['右下河流与岸景']);assert.equal(retired.length,2);}
    const run=async(config,verify=true)=>{
      const scene=new THREE.Scene();
      const originalManifestArrays=related.map(source=>({name:source.name,positions:[...source.positions],uvs:[...source.uvs],indices:source.indices?[...source.indices]:null,matrix:[...source.matrix]}));
      const objects=related.map(source=>{
        const geometry=new THREE.BufferGeometry();
        geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions,3));
        geometry.setAttribute('uv',new THREE.Float32BufferAttribute(source.uvs,2));
        if(source.indices?.length)geometry.setIndex(source.indices);
        const material=new THREE.MeshBasicMaterial({transparent:true});
        const mesh=new THREE.Mesh(geometry,material);mesh.name=source.name;
        mesh.matrix.fromArray(source.matrix);mesh.matrixAutoUpdate=false;mesh.updateMatrixWorld(true);scene.add(mesh);
        return{mesh,material,url:'fixture-original',sourceGeometry:geometry,sourcePositions:[...geometry.getAttribute('position').array],sourceUvs:[...geometry.getAttribute('uv').array],sourceIndices:geometry.getIndex()?[...geometry.getIndex().array]:null,sourceMatrix:[...mesh.matrix.elements]};
      });
      const fixture={schemaVersion:1,activeChapters:[chapter],chapters:{[String(chapter)]:{replacements:[config],geometryRepairs:[],edgeRepairs:[],addedLayers:[],textLayers:[],hiddenMeshNames:retired,backgroundMeshNames:[]}}};
      const originalFetch=globalThis.fetch;
      globalThis.fetch=async()=>({ok:true,json:async()=>fixture});
      try{
        const summary=await applyArtDirection(chapter,prepareScene(raw,chapter),objects,scene,new AbortController().signal);
        if(!verify)return;
        assert.deepEqual(related.map(source=>({name:source.name,positions:[...source.positions],uvs:[...source.uvs],indices:source.indices?[...source.indices]:null,matrix:[...source.matrix]})),originalManifestArrays,'Runtime replacement may not edit source manifest arrays');
        assert.equal(summary.replacements,config.meshNames.length);assert.equal(summary.addedLayers,0);
        const snapshots=[];
        for(const object of objects){
          assert.deepEqual(object.mesh.matrix.elements,object.sourceMatrix,'Explicit corners must preserve the original world matrix');
          assert.deepEqual([...object.sourceGeometry.getAttribute('position').array],object.sourcePositions,'The original geometry buffer must remain untouched');
          assert.deepEqual([...object.sourceGeometry.getAttribute('uv').array],object.sourceUvs);
          assert.deepEqual(object.sourceGeometry.getIndex()?[...object.sourceGeometry.getIndex().array]:null,object.sourceIndices);
          if(retired.includes(object.mesh.name)){assert.equal(object.mesh.visible,false);assert.equal(object.url,undefined);assert.equal(object.mesh.userData.artHidden,true);continue;}
          const geometry=object.mesh.geometry,positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
          assert.equal(positions.count,4);assert.equal(uv.count,4);assert.equal(geometry.getIndex().count,6);
          assert([...positions.array].every(Number.isFinite)&&[...uv.array].every(Number.isFinite));
          const uvKeys=new Set();
          for(let index=0;index<4;index++){
            const u=uv.getX(index),v=uv.getY(index);assert((u===0||u===1)&&(v===0||v===1));uvKeys.add(`${u},${v}`);
          }
          assert.equal(uvKeys.size,4,'Exactly one of each positive full-image UV corner must be present');
          const indices=geometry.getIndex();
          for(let triangle=0;triangle<6;triangle+=3){
            const [a,b,c]=[0,1,2].map(offset=>indices.getX(triangle+offset));
            const area=(uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a))-(uv.getY(b)-uv.getY(a))*(uv.getX(c)-uv.getX(a));
            assert(area>0,'Explicit carrier triangles may not invert or collapse image UV');
            const pa=new THREE.Vector3().fromBufferAttribute(positions,a),pb=new THREE.Vector3().fromBufferAttribute(positions,b),pc=new THREE.Vector3().fromBufferAttribute(positions,c);
            assert(new THREE.Vector3().crossVectors(pb.sub(pa),pc.sub(pa)).lengthSq()>1e-12);
          }
          assert(object.url.endsWith(config.asset));
          snapshots.push({mesh:object.mesh.name,positions:[...positions.array],uvs:[...uv.array],indices:[...indices.array],matrixPreserved:true,originalGeometryPreserved:true});
        }
        return snapshots;
      }finally{
        globalThis.fetch=originalFetch;
        for(const object of objects){object.mesh.geometry.dispose();object.material.dispose();}
        scene.clear();
      }
    };
    const actual=await run(replacement);
    const corners=replacement.geometryCorners.map(corner=>new THREE.Vector3(...corner));
    const at=(u,v)=>corners[0].clone().multiplyScalar((1-u)*(1-v)).addScaledVector(corners[1],u*(1-v)).addScaledVector(corners[2],u*v).addScaledVector(corners[3],(1-u)*v);
    const span=Math.max(...corners.map(corner=>corner.distanceTo(corners[0])),1);
    for(const snapshot of actual)for(let index=0;index<4;index++){
      const u=snapshot.uvs[index*2],v=snapshot.uvs[index*2+1];
      const expected=at(.5+(u-.5)*paddingX,.5+(v-.5)*paddingY);
      assert(expected.distanceTo(new THREE.Vector3(...snapshot.positions.slice(index*3,index*3+3)))<span*1e-5,'Production gutter must only pad reviewed corners, without another aspect-ratio expansion');
    }
    assert.deepEqual(await run({...replacement,contentAspect:replacement.contentAspect*2,sourceAspect:replacement.sourceAspect/3}),actual,'Explicit reviewed placement may not be expanded again by image/source aspect ratio');
    const badFinite=replacement.geometryCorners.map(corner=>[...corner]);badFinite[1][0]=NaN;
    await assert.rejects(run({...replacement,geometryCorners:badFinite},false));
    await assert.rejects(run({...replacement,geometryCorners:replacement.geometryCorners.slice(0,3)},false));
    await assert.rejects(run({...replacement,geometryCorners:Array.from({length:4},()=>[0,0,0])},false));
    const badParallel=replacement.geometryCorners.map(corner=>[...corner]);badParallel[2][0]+=span*.1;
    await assert.rejects(run({...replacement,geometryCorners:badParallel},false));
    return{chapter,replacement:replacement.id,policy:'explicit-corners',rawCorners:replacement.geometryCorners,paddingOnly:[paddingX,paddingY],retiredAuxiliaries:retired,actual,checks:['four finite positive-UV corners','only production gutter expansion','no second aspect compensation','original manifest arrays, matrices and geometry buffers unchanged','old repeated auxiliaries explicitly hidden','malformed/non-finite/degenerate/non-parallel corners rejected']};
  };
  for (const chapter of revision.activeChapters) {
    const raw = chapter === 1 ? source : JSON.parse(await readFile(new URL(`../public/assets/chapter-${chapter}/scene.json`, import.meta.url), 'utf8'));
    const replacements = revision.chapters[String(chapter)]?.replacements ?? [];
    const geometryRepairs = revision.chapters[String(chapter)]?.geometryRepairs ?? [];
    const carriers = replacements.flatMap(replacement => {
      const materialIds = new Set(raw.materials.filter(material => material.texture === replacement.sourceTexture).map(material => material.id));
      return raw.meshes.filter(mesh => materialIds.has(mesh.material) && (!replacement.meshNames || replacement.meshNames.includes(mesh.name)))
        .map(mesh => ({mesh,id:replacement.id,preserve:replacement.geometryPolicy==='preserve-region',replacement}));
    });
    for(const repair of geometryRepairs)for(const name of repair.meshNames){
      const mesh=raw.meshes.find(item=>item.name===name);assert(mesh,`Missing geometry repair ${name}`);
      carriers.push({mesh,id:repair.id,preserve:false});
    }
    for (const {mesh,id,preserve,replacement} of carriers) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
      if(replacement?.geometryPolicy==='explicit-corners'){
        const proof=await verifyExplicitCarrier(chapter,raw,replacement);explicitCarrierReconstruction.push(proof);
        fullUvReconstruction.push({chapter,replacement:id,mesh:mesh.name,policy:'explicit-corners; reviewed local drawing area with gutter only'});continue;
      }
      if(preserve){fullUvReconstruction.push({chapter,replacement:id,mesh:mesh.name,policy:'preserve-region; existing UV subdivision retained'});continue;}
      const result = completeUvPlane(geometry);
      assert.equal(result.getAttribute('uv').count, 4);
      assert.equal(result.getIndex().count, 6);
      fullUvReconstruction.push({chapter,replacement:id,mesh:mesh.name,...result.userData.uvReconstruction});
    }
  }
  assert(motionProfiles[1].enabled);
  for (const chapter of [2, 3, 4]) assert.equal(motionProfiles[chapter].enabled, true, 'The verified first-scroll pilot now extends to all scrolls');
  for (const binding of motionProfiles[1].bindings) assert(byName.has(binding.meshName) || addedByName.has(binding.meshName), `Missing explicitly bound mesh ${binding.meshName}`);

  const planeAudit = [];
  const objects = motionProfiles[1].bindings.map(binding => {
    const item = byName.get(binding.meshName);
    const added = addedByName.get(binding.meshName);
    const geometry = item ? new THREE.BufferGeometry() : new THREE.PlaneGeometry(1, 1);
    if (item) {
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(item.positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(item.uvs, 2));
    } else if(added.uvRect) {
      const [u0,v0,u1,v1]=added.uvRect,uv=geometry.getAttribute('uv');
      for(let index=0;index<uv.count;index++)uv.setXY(index,u0+uv.getX(index)*(u1-u0),v0+uv.getY(index)*(v1-v0));
    }
    geometry.computeBoundingSphere();
    const basis=deriveUvBasis(geometry,binding.uvDomain);
    if(binding.plane!=='UV')assert.equal(basis.plane,binding.plane,`Declared local plane disagrees with actual geometry/UV: ${binding.meshName}`);
    planeAudit.push({chapter:1,name:binding.meshName,declaredPlane:binding.plane,actualPlane:basis.plane,alongU:basis.alongU.toArray(),alongV:basis.alongV.toArray(),normal:basis.normal.toArray(),maxNormalResidual:basis.maxNormalResidual,maxInPlaneResidual:basis.maxInPlaneResidual,source:item?'source manifest positions and UV':'standard added plane and canonical atlas UV'});
    const material = new THREE.MeshBasicMaterial({ opacity: 0.7, transparent: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = binding.meshName;
    mesh.matrix.fromArray((item ?? added).matrix);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrixWorld(true);
    return { mesh, material, original: mesh.matrix.clone(), kind: binding.kind };
  });
  const camera = new THREE.PerspectiveCamera(100, 2, 0.01, 1e6);
  camera.position.set(225, -1000, 50);
  camera.up.set(0, 0, 1);
  camera.lookAt(225, 0, 0);
  camera.updateMatrixWorld(true);
  const director = new MotionDirector(1, objects);
  director.advance(0.04);
  director.update(camera, true);
  const atOneTime = objects.map(({ mesh }) => [...mesh.matrix.elements]);
  for (let index = 0; index < 100; index++) director.update(camera, true);
  assert.deepEqual(objects.map(({ mesh }) => [...mesh.matrix.elements]), atOneTime, 'Repeated updates at one time must not accumulate transforms');
  assert(director.getDiagnostics().activeBindings > 0);
  assert(director.getDiagnostics().activeBindings <= motionProfiles[1].maxVisibleBindings);
  assert.equal(director.getDiagnostics().activeGroups.petal, 2, 'New petals must not be starved by legacy cloud bindings');
  assert.equal(director.getDiagnostics().activeGroups.bridge, 1, 'A new mist bridge must retain its own visible quota');
  for (let index = 0; index < 30; index++) director.advance(1 / 30);
  director.update(camera, true);
  assert.notDeepEqual(objects.map(({ mesh }) => [...mesh.matrix.elements]), atOneTime, 'Independent time must produce local movement without seeking');
  director.update(camera, false);
  for (const object of objects) {
    assert.deepEqual(object.mesh.matrix.elements, object.original.elements, 'Disabling must restore the source matrix');
    assert.equal(object.material.opacity, object.kind === 'fall' ? 0 : 0.7, 'Disabling must restore source opacity and hide optional falling overlays');
  }
  const animated = objects.find(object => object.mesh.name === '02_右下金色飘带');
  const animatedBase = animated.original.clone().premultiply(new THREE.Matrix4().makeTranslation(0.123, 0, 0));
  director.setBaseMatrix(animated.mesh, animatedBase);
  director.update(camera, true);
  director.update(camera, false);
  assert.deepEqual(animated.mesh.matrix.elements, animatedBase.elements, 'Source animation base must survive ambient movement and reset');
  const elapsed = director.getDiagnostics().elapsedSeconds;
  director.advance(3600);
  assert(director.getDiagnostics().elapsedSeconds - elapsed <= 0.05000001, 'Large frame gaps must be clamped');
  director.dispose();
  assert.equal(director.getDiagnostics().bindings, 0);
  assert.equal(fallingPetalEnvelope(0), 0);
  assert.equal(fallingPetalEnvelope(1), 0);
  assert(fallingPetalEnvelope(0.5) > 0.99, 'A fall must fade in and out while retaining a readable middle');
  const singlePetal = objects.find(object => object.mesh.name === 'R1_Petal_01_1');
  const petalDirector = new MotionDirector(1, [singlePetal]);
  petalDirector.update(camera, true);
  const inverse = singlePetal.original.clone().invert();
  const beforeFall = new THREE.Vector3().setFromMatrixPosition(inverse.clone().multiply(singlePetal.mesh.matrix));
  for (let index = 0; index < 30; index++) petalDirector.advance(1 / 30);
  petalDirector.update(camera, true);
  const afterFall = new THREE.Vector3().setFromMatrixPosition(inverse.clone().multiply(singlePetal.mesh.matrix));
  assert(afterFall.y < beforeFall.y, 'A new XY petal must descend along its local image vertical');
  assert(Math.abs(afterFall.z) < 1e-6, 'A new XY petal must not move along its plane normal');
  petalDirector.dispose();
  const later = new MotionDirector(99, objects);
  later.advance(1);
  assert.equal(later.getDiagnostics().supported, false);
  assert.equal(later.getDiagnostics().elapsedSeconds, 0);
  const result = {
    passed: true,
    canonicalSha256:createHash('sha256').update(revisionText).digest('hex'),
    firstScrollOnly: false,
    explicitlyBoundLayers: motionProfiles[1].bindings.length,
    checks: ['exact mesh bindings exist', 'geometry/UV validate every declared local plane', 'independent time without seek', 'no matrix accumulation', 'source animation base preserved', 'pause restores source opacity/matrices and hides optional petals', 'visible bindings bounded', 'new petal and mist quotas are reserved', 'petals descend in local XY', 'petal loops have invisible endpoints', 'large delta clamped', 'dispose clears bindings', 'unknown profiles stay disabled', 'cropped UV recovers the complete image plane without source mutation', 'bounded normal relief is accepted and audited', 'incorrect and degenerate UV mappings are rejected', 'large normal folds are rejected', 'every current canonical replacement reconstructs'],
    fullUvReconstruction,
    explicitCarrierReconstruction,
    scope: 'CPU matrix/configuration checks; browser RAF, reduced-motion, GPU context, texture retry and visual quality require browser validation',
  };
  result.chapters = [{ chapter: 1, bindings: motionProfiles[1].bindings.length, passed: true }];
  for (const chapter of [2, 3, 4]) {
    assert(revision.activeChapters.includes(chapter), `Canonical chapter ${chapter} has not yet been activated`);
    const raw = JSON.parse(await readFile(new URL(`../public/assets/chapter-${chapter}/scene.json`, import.meta.url), 'utf8'));
    const prepared = prepareScene(raw, chapter);
    const originals = new Map(raw.meshes.map(mesh => [mesh.name, mesh]));
    const additions = new Map(revision.chapters[String(chapter)].addedLayers.map(layer => [layer.name, layer]));
    const fixture = motionProfiles[chapter].bindings.map(config => {
      const original = originals.get(config.meshName), added = additions.get(config.meshName);
      assert(original || added, `Missing explicitly bound real layer ${chapter}/${config.meshName}`);
      const geometry = original ? new THREE.BufferGeometry() : new THREE.PlaneGeometry(1, 1);
      if (original) {
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(original.positions, 3));
        if (original.uvs.length) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(original.uvs, 2));
      } else if (added.uvRect) {
        const [u0, v0, u1, v1] = added.uvRect, uv = geometry.getAttribute('uv');
        for (let index = 0; index < uv.count; index++) uv.setXY(index, u0 + uv.getX(index) * (u1-u0), v0 + uv.getY(index) * (v1-v0));
      }
      geometry.computeBoundingSphere();
      const definition = original ? raw.materials[original.material] : null;
      const material = new THREE.MeshBasicMaterial({ opacity: .7, transparent: !!added || !!definition?.transparent || !!definition?.texture, depthWrite: added || definition?.texture ? false : definition?.depthWrite ?? true });
      const mesh = new THREE.Mesh(geometry, material); mesh.name = config.meshName; mesh.matrix.fromArray((original??added).matrix); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
      if (config.kind !== 'opacityPulse') {
        const basis = deriveUvBasis(geometry, config.uvDomain);
        if (config.plane !== 'UV') assert.equal(basis.plane, config.plane, `Actual UV plane mismatch ${config.meshName}`);
        const extent = basis.alongU.length() * basis.alongV.length();
        assert(extent > 0 && Math.abs(basis.normal.length()-1) < 1e-7);
        planeAudit.push({ chapter, name: config.meshName, declaredPlane: config.plane, actualPlane: basis.plane, alongU: basis.alongU.toArray(), alongV: basis.alongV.toArray(), normal: basis.normal.toArray(), maxNormalResidual: basis.maxNormalResidual, maxInPlaneResidual: basis.maxInPlaneResidual });
      } else {
        assert.equal(original.type, 'CURVE', 'Opacity-only structural candidates must remain their original curves');
        planeAudit.push({ chapter, name: config.meshName, declaredPlane: 'CURVE', action: 'opacity-only; no image-plane assumption' });
      }
      return { mesh, material, config, original: mesh.matrix.clone(), initialTransparent: material.transparent, initialDepthWrite: material.depthWrite };
    });
    const engine = new MotionDirector(chapter, fixture, prepared.stops);
    engine.advance(.04, 0);
    engine.update(camera, true, 0);
    assert(engine.getDiagnostics().activeGroups.petal === 2 && engine.getDiagnostics().activeGroups.bridge === 1);
    const atOneTime = fixture.map(({ mesh }) => [...mesh.matrix.elements]);
    for (let index=0; index<80; index++) engine.update(camera, true, 0);
    assert.deepEqual(fixture.map(({mesh})=>[...mesh.matrix.elements]), atOneTime, 'No accumulation in any scroll');
    engine.update(camera, false, 0);
    for (const object of fixture) {
      assert.deepEqual(object.mesh.matrix.elements, object.original.elements);
      assert.equal(object.material.opacity, object.config.kind==='fall'?0:.7);
    }
    const independent = fixture.find(object => object.config.kind === 'sway');
    const isolated = new MotionDirector(chapter, [independent], prepared.stops);
    isolated.advance(.04, 0); isolated.update(camera, true, 0);
    const basis = deriveUvBasis(independent.mesh.geometry, independent.config.uvDomain);
    const [pu,pv] = independent.config.pivot ?? [.5,.5];
    const pivot = basis.origin.clone().addScaledVector(basis.alongU,pu).addScaledVector(basis.alongV,pv);
    const localDelta = independent.original.clone().invert().multiply(independent.mesh.matrix);
    assert(pivot.clone().applyMatrix4(localDelta).distanceTo(pivot)<1e-6, 'The signed UV attachment point must remain fixed');
    assert(Math.abs(basis.normal.clone().transformDirection(localDelta).dot(basis.normal)-1)<1e-6, 'Sway must rotate around the real UV normal, including YZ/oblique carriers');
    isolated.dispose();
    const curve = fixture.find(object=>object.config.kind==='opacityPulse');
    if (curve) {
      const curveEngine = new MotionDirector(chapter,[curve],prepared.stops);
      curveEngine.advance(.04,0); curveEngine.update(camera,true,0);
      assert.deepEqual(curve.mesh.matrix.elements,curve.original.elements,'Curve geometry may not move');
      assert(curve.material.opacity < .7 && curve.material.opacity > .65);
      assert.equal(curve.material.transparent,true); assert.equal(curve.material.depthWrite,false);
      curveEngine.update(camera,false,0);
      assert.equal(curve.material.transparent,curve.initialTransparent); assert.equal(curve.material.depthWrite,curve.initialDepthWrite);
      curveEngine.dispose();
    }
    if (chapter===4) {
      const start = prepared.stops[4].progress, tail = prepared.stops[7].progress;
      assert(Math.abs(start-.5004329353980085)<1e-8);
      assert.equal(evaluateMotionEnvelope(motionProfiles[4],prepared.stops,start-1e-6).clockSpeed,1);
      assert(Math.abs(evaluateMotionEnvelope(motionProfiles[4],prepared.stops,start+1e-6).clockSpeed-1)<1e-7);
      let prior = {clockSpeed:1,petalDensity:1,cloudDensity:1};
      const samples=[];
      for(let index=0;index<=300;index++) {
        const progress=index/300, envelope=evaluateMotionEnvelope(motionProfiles[4],prepared.stops,progress);
        for(const key of ['clockSpeed','petalDensity','cloudDensity']) assert(envelope[key]<=prior[key]+1e-10, 'Narrative envelope must be monotone');
        if(progress>=tail)assert(envelope.maxBindings<=3);
        prior=envelope; if(index%30===0)samples.push({progress,...envelope});
      }
      const clockBefore=engine.getDiagnostics().elapsedSeconds;
      engine.advance(0,1); assert.equal(engine.getDiagnostics().elapsedSeconds,clockBefore,'Seeking never rewrites elapsed phase');
      engine.advance(.05,1); assert(Math.abs(engine.getDiagnostics().elapsedSeconds-clockBefore-.05*.32)<1e-8);
      engine.update(camera,true,1);
      assert(engine.getDiagnostics().activeGroups.petal<=1 && engine.getDiagnostics().activeBindings<=3);
      engine.update(camera,false,1);
      const mist=fixture.find(object=>object.config.group==='bridge');
      assert(Math.abs(mist.material.opacity-.7*.22)<1e-8,'The quiet tail stays sparse when reduced-motion or pause is selected');
      result.fourthScrollEnvelope={startProgress:start,tailProgress:tail,samples,final:engine.getDiagnostics()};
    }
    engine.dispose();
    assert.equal(engine.getDiagnostics().bindings,0);
    for(const object of fixture){assert.equal(object.material.transparent,object.initialTransparent);assert.equal(object.material.depthWrite,object.initialDepthWrite);}
    result.chapters.push({chapter,bindings:fixture.length,passed:true});
  }
  result.checks.push('all four real profiles and canonical additions match','YZ and oblique sways preserve signed UV attachment and normal','atlas UV domains retain sprite-local movement','curves only change shallow opacity and restore original material flags','all scrolls reset and dispose without matrix drift','fourth-scroll envelope starts at the real fifth stop and is monotone','speed changes integrate time without phase jumps','tail has at most one petal and three active layers','quiet narrative clouds stay sparse when motion is disabled');
  assert(explicitCarrierReconstruction.length>0,'The final reviewed continuous river must use explicit corners before this final validation');
  result.checks.push('explicit-corner dispatch preserves reviewed placement, positive UV, matrices and source buffers','explicit carriers only expand the gutter and reject malformed/non-finite/degenerate corner data');
  await mkdir(new URL('../reports/reconstruction/after-motion/',import.meta.url),{recursive:true});
  await writeFile(new URL('../reports/reconstruction/after-motion/validation-motion-unit.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(new URL('../reports/reconstruction/after-motion/motion-local-planes.json', import.meta.url), `${JSON.stringify({ verifiedFrom: 'actual position/UV fitting, without using world matrices to guess local axes', bindings: planeAudit }, null, 2)}\n`);
  console.log(`All-scroll motion passed ${result.checks.length} checks; ${result.chapters.map(chapter=>chapter.bindings).join('/')} explicit bindings.`);
} finally { await server.close(); }

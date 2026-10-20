/** Source-data regression for near-coplanar first-scroll painting sheets. No browser assets are mutated. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import * as THREE from 'three';

const vite = await createServer({server:{middlewareMode:true,watch:{ignored:['**/artwork/**','**/reports/**','**/source/**','**/wiki_memory/**']}},logLevel:'error'});
try {
  const { StableLayerSorting } = await vite.ssrLoadModule('/src/scene/StableLayerSorting.ts');
  const { prepareScene } = await vite.ssrLoadModule('/src/scene/prepareScene.ts');
  const manifest=prepareScene(JSON.parse(await readFile(new URL('../public/assets/chapter-1/scene.json',import.meta.url),'utf8')),1);
  const meshes=manifest.meshes.filter(m=>!m.isText&&m.positions.length).map(source=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(source.positions,3));geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.name=source.name;mesh.matrixAutoUpdate=false;mesh.matrix.fromArray(source.matrix);mesh.updateMatrixWorld(true);return mesh;
  });
  const poses=meshes.map(mesh=>mesh.matrix.toArray()),positions=meshes.map(mesh=>mesh.geometry.attributes.position.array.slice());
  const sort=new StableLayerSorting(manifest,meshes);
  const item=mesh=>({groupOrder:0,renderOrder:0,z:0,id:mesh.id,object:mesh});
  const a=meshes.find(mesh=>mesh.name==='06_01_中央主位女子'),b=meshes.find(mesh=>mesh.name==='06_05_京城全景');
  assert(a&&b);assert.equal(sort.axis.x,0);assert(Math.abs(sort.axis.length()-1)<1e-12);assert(sort.axis.y>0);
  assert(sort.compare(item(a),item(b))>0,'Complete empress must draw over palace');
  // Neither extreme camera yaw nor the ambient transform changes a registered base stack.
  const base=a.matrix.clone(),shifted=a.matrix.clone();shifted.elements[13]+=100;
  a.matrix.copy(shifted);a.updateMatrixWorld(true);
  assert(sort.compare(item(a),item(b))>0,'Local motion without a source-base update cannot reorder the painting');
  sort.updateBase(a,a.matrixWorld);assert(sort.compare(item(a),item(b))<0,'A real source-animation depth change must remain effective');
  a.matrix.copy(base);a.updateMatrixWorld(true);sort.updateBase(a,a.matrixWorld);assert(sort.compare(item(a),item(b))>0);
  const ordered=meshes.map(item).sort(sort.compare);
  for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++)assert(sort.compare(ordered[i],ordered[j])<=0,'Registered painter comparator must define a transitive total order');
  assert(sort.compare({...item(a),groupOrder:2},{...item(b),groupOrder:1})>0);
  assert(sort.compare({...item(a),renderOrder:-1},{...item(b),renderOrder:0})<0);
  for(let i=0;i<meshes.length;i++){assert.deepEqual(meshes[i].matrix.toArray(),poses[i]);assert.deepEqual(meshes[i].geometry.attributes.position.array,positions[i]);}
  const report={passed:true,createdAt:new Date().toISOString(),registeredSheets:meshes.length,axis:sort.axis.toArray(),checks:['Source-derived axis is normalized and orthogonal to lateral travel','Reported foreground empress remains ahead of palace','Ambient transforms cannot change registered base order','Intentional source-animation depth changes remain effective','All registered sheets define a transitive total order','Existing group and explicit render order remain authoritative','All source world matrices and geometry are retained']};
  await mkdir(new URL('../reports/blank-design/',import.meta.url),{recursive:true});await writeFile(new URL('../reports/blank-design/test-stable-layer-sorting.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(`Stable layer sorting: ${report.checks.length} checks, ${meshes.length} sheets passed. Axis ${report.axis.join(', ')}.`);
  for(const mesh of meshes){mesh.geometry.dispose();mesh.material.dispose();}
}finally{await vite.close();}

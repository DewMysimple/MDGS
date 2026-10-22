import * as THREE from 'three';
import type { CameraSample, SceneManifest } from '../types';
import type { ArtSceneObject } from './ArtDirectionLayer';
import type { LayerMotionBinding } from '../data/motionProfiles';
import { createNewMotionProfile } from '../data/newMotionProfiles';

/** A crop of the middle, isolated petal in the actual revised first-scroll atlas.
 * No new texture loader: these objects join SceneRenderer's existing queue. */
export const newPetalSource = {
  url: 'assets/new-scrolls/chapter-1/textures/76723c1dd92b9b3a.webp',
  sourceName: 's15_07.png',
  uvRect: [.3893591294, .2490613267, .6650544135, .4993742178] as const,
  sha256: '5a63bb58b158dc9de7b1a44647a6f1afe6f50d52c8e0ef636a7c1dc841e3a497',
};

function viewpointAt(cameras: CameraSample[], progress: number) {
  const index = cameras.findIndex(camera => camera.progress >= progress);
  if (index <= 0) return cameras[0];
  const a = cameras[index - 1], b = cameras[index];
  const ratio = THREE.MathUtils.clamp((progress - a.progress) / Math.max(1e-8, b.progress - a.progress), 0, 1);
  return {
    ...a,
    position: new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), ratio).toArray(),
    quaternion: new THREE.Quaternion().fromArray(a.quaternion).normalize().slerp(new THREE.Quaternion().fromArray(b.quaternion).normalize(), ratio).toArray(),
    fov: THREE.MathUtils.lerp(a.fov, b.fov, ratio),
  };
}

function singlePetalGeometry() {
  const geometry = new THREE.PlaneGeometry(1, .88, 8, 8), positions = geometry.attributes.position, uv = geometry.attributes.uv;
  const [u0, v0, u1, v1] = newPetalSource.uvRect;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i);
    positions.setZ(i, .055 * Math.sin((x + .5) * Math.PI) * Math.sin((y / .88 + .5) * Math.PI));
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
}

/** Anchored once in artwork space at the supplied source reading cameras.
 * Camera motion reveals their actual parallax; no screen-following particle
 * system or extra RAF owns these petals. The shared director caps visibility. */
export function createNewScrollAtmosphere(manifest: SceneManifest, chapterId: number) {
  const objects: ArtSceneObject[] = [], bindings: LayerMotionBinding[] = [];
  if (!manifest.cameras.length) return { objects, profile: createNewMotionProfile(chapterId) };
  const geometry = singlePetalGeometry();
  for (let index = 0; index < manifest.stops.length; index++) {
    const stop = manifest.stops[index], camera = viewpointAt(manifest.cameras, stop.progress);
    const quaternion = new THREE.Quaternion().fromArray(camera.quaternion).normalize();
    const distance = Math.max(.8, Math.min(12, (manifest.camera.far || 5000) * .02));
    const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) * .5);
    const aspect = manifest.render.width / Math.max(1, manifest.render.height);
    for (let petal = 0; petal < 2; petal++) {
      const material = new THREE.MeshBasicMaterial({
        color: '#fff5e9', opacity: .62, transparent: true, alphaTest: .16,
        depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `N${chapterId}_WindPetal_${String(index + 1).padStart(2, '0')}_${petal + 1}`;
      // One near-inner petal also stays inside portrait crops; its companion
      // occupies the outer space of a wide handscroll view.
      const offset = new THREE.Vector3((petal ? -.34 : .11) * height * aspect, height * (.16 + (index % 3) * .055), -distance);
      mesh.position.copy(offset.applyQuaternion(quaternion).add(new THREE.Vector3().fromArray(camera.position)));
      mesh.quaternion.copy(quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), index * .83 + petal * 2.1));
      mesh.scale.setScalar(height * (.024 + petal * .005));
      mesh.updateMatrix(); mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
      mesh.visible = false; mesh.castShadow = false; mesh.receiveShadow = false;
      mesh.userData.editionAtmosphere = true;
      mesh.userData.sourceNode = stop.name;
      mesh.userData.artRole = '动效层';
      objects.push({ mesh, material, url: `${import.meta.env.BASE_URL}${newPetalSource.url}` });
      bindings.push({
        meshName: mesh.name, narrative: '从该卷阅读景中的花枝引出的少量独立单瓣；不移动原人物、宫苑或花石组合。',
        kind: 'fall', plane: 'UV', uvDomain: 'current', group: 'petal', priority: 0,
        periodSeconds: 22 + (index % 4) * 2 + petal * 1.3,
        phase: index * 2.21 + petal * Math.PI, xRatio: .95, zRatio: 11.5, angleDegrees: 8,
      });
    }
  }
  return { objects, profile: createNewMotionProfile(chapterId, bindings) };
}

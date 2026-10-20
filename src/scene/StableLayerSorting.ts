import * as THREE from 'three';
import type { SceneManifest } from '../types';

interface SortItem { groupOrder: number; renderOrder: number; z: number; id: number; object: THREE.Object3D }

/** Painter order for the first scroll's fixed image sheets, independent of lateral camera yaw. */
export class StableLayerSorting {
  readonly axis = new THREE.Vector3();
  private centers = new WeakMap<THREE.Mesh, THREE.Vector3>();
  private depths = new WeakMap<THREE.Object3D, number>();
  private point = new THREE.Vector3();

  constructor(manifest: SceneManifest, meshes: THREE.Mesh[]) {
    // Retain the source view's vertical tilt, but remove travel-axis yaw: a
    // palace's distant horizontal centre must not move ahead of a nearby figure.
    // No source camera, image-plane geometry or world matrix is changed.
    const forward = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const travel = manifest.travel.axis === 'X' ? 'x' : 'y';
    for (const camera of manifest.cameras) {
      forward.set(0, 0, -1).applyQuaternion(rotation.fromArray(camera.quaternion).normalize());
      forward[travel] = 0;
      if (forward.lengthSq() > 1e-12) this.axis.add(forward.normalize());
    }
    if (this.axis.lengthSq() < 1e-12) throw new Error('画层排序缺少有效的原相机视向。');
    this.axis.normalize();
    for (const mesh of meshes) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      this.centers.set(mesh, mesh.geometry.boundingSphere!.center.clone());
      this.updateBase(mesh, mesh.matrixWorld);
    }
  }

  /** Source animation may alter depth; independent local sway never changes the sheet's stack. */
  updateBase(mesh: THREE.Mesh, matrix: THREE.Matrix4) {
    const center = this.centers.get(mesh);
    if (center) this.depths.set(mesh, this.point.copy(center).applyMatrix4(matrix).dot(this.axis));
  }

  readonly compare = (a: SortItem, b: SortItem): number => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    const aDepth = this.depths.get(a.object), bDepth = this.depths.get(b.object);
    // Every scene sheet is registered together. Keep Three's normal fallback
    // for unrelated renderables, including future non-sheet scene additions.
    if (aDepth === undefined || bDepth === undefined) return b.z - a.z || a.id - b.id;
    return bDepth - aDepth || a.id - b.id;
  };
}

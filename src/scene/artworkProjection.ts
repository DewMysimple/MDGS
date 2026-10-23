import * as THREE from 'three';
import type { ArtworkAnchorSpec, ProjectedArtAnchor } from '../data/artEncounters';
import type { SourceViewport } from './sourceViewport';

interface UVBinding { indices: [number, number, number]; weights: [number, number, number] }

/** A texture point is attached to the authored triangle, including its current
 * morph pose. No screen percentage is treated as an artwork-space anchor. */
export class ArtworkProjector {
  private bindings = new WeakMap<THREE.BufferGeometry, Map<string, UVBinding | null>>();
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private c = new THREE.Vector3();
  private point = new THREE.Vector3();

  private bind(geometry: THREE.BufferGeometry, u: number, v: number): UVBinding | null {
    let cache = this.bindings.get(geometry);
    if (!cache) { cache = new Map(); this.bindings.set(geometry, cache); }
    const key = `${u}:${v}`;
    if (cache.has(key)) return cache.get(key)!;
    const uv = geometry.getAttribute('uv'), index = geometry.getIndex();
    if (!uv || !Number.isFinite(u) || !Number.isFinite(v)) { cache.set(key, null); return null; }
    const count = index?.count ?? uv.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = index ? index.getX(i) : i, ib = index ? index.getX(i + 1) : i + 1, ic = index ? index.getX(i + 2) : i + 2;
      const au = uv.getX(ia), av = uv.getY(ia);
      const bu = uv.getX(ib) - au, bv = uv.getY(ib) - av;
      const cu = uv.getX(ic) - au, cv = uv.getY(ic) - av;
      const determinant = bu * cv - cu * bv;
      if (Math.abs(determinant) < 1e-12) continue;
      const wb = ((u - au) * cv - cu * (v - av)) / determinant;
      const wc = (bu * (v - av) - (u - au) * bv) / determinant;
      const wa = 1 - wb - wc;
      if (Math.min(wa, wb, wc) < -1e-6 || Math.max(wa, wb, wc) > 1 + 1e-6) continue;
      const binding: UVBinding = { indices: [ia, ib, ic], weights: [wa, wb, wc] };
      cache.set(key, binding); return binding;
    }
    cache.set(key, null); return null;
  }

  project(scene: THREE.Scene, camera: THREE.Camera, viewport: SourceViewport, width: number, height: number,
    specs: readonly ArtworkAnchorSpec[]): ProjectedArtAnchor[] {
    return specs.map(spec => {
      const absent = { id: spec.id, x: 0, y: 0, visible: false };
      const mesh = scene.getObjectByName(spec.meshName);
      if (!(mesh instanceof THREE.Mesh) || !(width > 0 && height > 0)) return absent;
      for (let ancestor: THREE.Object3D | null = mesh; ancestor; ancestor = ancestor.parent) if (!ancestor.visible) return absent;
      const binding = this.bind(mesh.geometry, spec.uv[0], spec.uv[1]);
      if (!binding) return absent;
      mesh.getVertexPosition(binding.indices[0], this.a);
      mesh.getVertexPosition(binding.indices[1], this.b);
      mesh.getVertexPosition(binding.indices[2], this.c);
      this.point.set(0, 0, 0).addScaledVector(this.a, binding.weights[0])
        .addScaledVector(this.b, binding.weights[1]).addScaledVector(this.c, binding.weights[2]);
      this.point.applyMatrix4(mesh.matrixWorld).project(camera);
      const x = (viewport.x + (this.point.x + 1) * .5 * viewport.width) / width;
      const y = (viewport.y + (1 - this.point.y) * .5 * viewport.height) / height;
      const visible = [x, y, this.point.z].every(Number.isFinite) && this.point.z >= -1 && this.point.z <= 1
        && this.point.x >= -1 && this.point.x <= 1 && this.point.y >= -1 && this.point.y <= 1;
      return { id: spec.id, x, y, visible };
    });
  }
}

import * as THREE from 'three';

export interface PaintedScrollOptions {
  width: number; height: number; artWidth?: number; artHeight?: number;
  painting?: THREE.Texture; paperTexture?: THREE.Texture; woodTexture?: THREE.Texture;
}
export interface ScrollSurface {
  flatHalf: number; radius: number; coreRadius: number; thickness: number; layerPitch: number; woundLength: number;
}

/** Area conservation determines the roll radius. A small interleaf gap keeps
 * ink and the adjacent reverse distinct. UVs belong to the entire sheet. */
export function scrollSurface(width: number, height: number, openness: number): ScrollSurface {
  const p = THREE.MathUtils.clamp(openness, 0, 1);
  const coreRadius = height * .022, thickness = height * .0012, layerPitch = thickness * 1.2;
  let closedHalf = coreRadius;
  for (let i = 0; i < 5; i++) closedHalf = Math.sqrt(coreRadius ** 2 + layerPitch * Math.max(0, width / 2 - closedHalf) / Math.PI) + height * .004;
  const flatHalf = THREE.MathUtils.lerp(closedHalf, width / 2, p), woundLength = Math.max(0, width / 2 - flatHalf);
  return { flatHalf, radius: Math.sqrt(coreRadius ** 2 + layerPitch * woundLength / Math.PI), coreRadius, thickness, layerPitch, woundLength };
}

/** Tightly wound Archimedean spiral from the outer tangent towards the core.
 * This stable quadratic expression avoids subtracting nearly equal radii. */
export function scrollSurfacePoint(x: number, y: number, width: number, height: number, openness: number, surface = scrollSurface(width, height, openness)) {
  const distance = Math.abs(x), side = Math.sign(x) || 1;
  if (distance <= surface.flatHalf) {
    const edge = Math.max(0, 1 - (distance / Math.max(surface.flatHalf, .0001)) ** 2);
    const sag = -height * .001 * (1 - openness) * edge * edge * Math.cos(y / height * Math.PI);
    return { x, y, z: sag, nx: 0, nz: 1, theta: 0 };
  }
  const length = distance - surface.flatHalf, b = surface.layerPitch / (Math.PI * 2);
  const inner = Math.sqrt(Math.max(surface.coreRadius ** 2, surface.radius ** 2 - 2 * b * length));
  const theta = 2 * length / (surface.radius + inner), radius = surface.radius - b * theta;
  const sin = Math.sin(theta), cos = Math.cos(theta), normalLength = Math.hypot(radius, b);
  return { x: side * (surface.flatHalf + sin * radius), y, z: surface.radius - cos * radius,
    nx: -side * (radius * sin + b * cos) / normalLength, nz: (radius * cos - b * sin) / normalLength, theta };
}

/** A real sheet, native-aspect print, reverse, and slender wooden shafts.
 * The print is unlit so the final frame retains its source ink and colour. */
export function createPaintedScroll(options: PaintedScrollOptions) {
  const { width, height } = options;
  const artWidth = options.artWidth ?? width * .91, artHeight = options.artHeight ?? height * .91;
  const group = new THREE.Group(); group.name = 'physical-painted-scroll';
  const ownedTextures: THREE.Texture[] = [];
  const paper = options.paperTexture ?? createSilkTexture(), wood = options.woodTexture ?? createWoodTexture();
  if (!options.paperTexture) ownedTextures.push(paper);
  if (!options.woodTexture) ownedTextures.push(wood);
  const front = new THREE.MeshStandardMaterial({ map: paper, color: '#fffaf0', roughness: .98, metalness: 0, side: THREE.FrontSide });
  const reverse = new THREE.MeshStandardMaterial({ map: paper, color: '#e3dac6', roughness: 1, metalness: 0, side: THREE.BackSide });
  const ink = new THREE.MeshBasicMaterial({ map: options.painting ?? paper, color: '#ffffff', toneMapped: false, side: THREE.FrontSide });
  const woodMaterial = new THREE.MeshStandardMaterial({ map: wood, color: '#ffffff', roughness: .78, metalness: 0 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#aa9974', metalness: .43, roughness: .7 });
  const jade = new THREE.MeshStandardMaterial({ color: '#82968b', roughness: .6, metalness: 0 });
  const paperGeometry = new THREE.PlaneGeometry(width, height, 384, 12), backGeometry = paperGeometry.clone();
  const artGeometry = new THREE.PlaneGeometry(artWidth, artHeight, Math.max(256, Math.round(384 * artWidth / width)), 12);
  const originals = [paperGeometry, backGeometry, artGeometry].map(geometry => new Float32Array(geometry.attributes.position.array));
  const sheet = new THREE.Mesh(paperGeometry, front), backing = new THREE.Mesh(backGeometry, reverse), painting = new THREE.Mesh(artGeometry, ink);
  sheet.name = 'bending-silk-front'; backing.name = 'bending-silk-reverse'; painting.name = 'native-aspect-printed-image';
  sheet.castShadow = true; sheet.receiveShadow = true; backing.castShadow = true;
  group.add(sheet, backing, painting);
  const shafts: THREE.Group[] = [], coreRadius = height * .022, rodLength = height * 1.075;
  for (const side of [-1, 1]) {
    const shaft = new THREE.Group(); shaft.name = side < 0 ? 'left-shaft' : 'right-shaft';
    const core = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius, coreRadius, rodLength, 36), woodMaterial);
    core.castShadow = true; shaft.add(core);
    for (const end of [-1, 1]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius * 1.2, coreRadius * 1.2, height * .012, 36), bronze);
      collar.position.y = end * height * .514; collar.castShadow = true; shaft.add(collar);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius * .96, coreRadius * .88, height * .028, 36), woodMaterial);
      tip.position.y = end * height * .535; tip.castShadow = true; shaft.add(tip);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(coreRadius * .63, 20, 12), jade);
      jewel.scale.y = .38; jewel.position.y = end * height * .55; shaft.add(jewel);
    }
    group.add(shaft); shafts.push(shaft);
  }
  let openness = -1;
  function setOpen(value: number) {
    const p = THREE.MathUtils.clamp(value, 0, 1);
    if (Math.abs(p - openness) < .00002) return;
    openness = p;
    const surface = scrollSurface(width, height, p);
    [paperGeometry, backGeometry, artGeometry].forEach((geometry, index) => {
      const position = geometry.attributes.position as THREE.BufferAttribute, original = originals[index];
      const offset = index === 1 ? -surface.thickness / 2 : surface.thickness / 2 + (index === 2 ? height * .00006 : 0);
      for (let i = 0; i < position.count; i++) {
        const point = scrollSurfacePoint(original[i * 3], original[i * 3 + 1], width, height, p, surface);
        position.setXYZ(i, point.x + point.nx * offset, point.y, point.z + point.nz * offset);
      }
      position.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    });
    const turns = scrollSurfacePoint(width / 2, 0, width, height, p, surface).theta;
    shafts.forEach((shaft, index) => { shaft.position.set((index ? 1 : -1) * surface.flatHalf, 0, surface.radius); shaft.rotation.y = (index ? -1 : 1) * turns; });
    Object.assign(group.userData, { open: p, shaftSeparation: surface.flatHalf * 2, curlRadius: surface.radius, thickness: surface.thickness, coreRadius, woundLength: surface.woundLength });
  }
  function setPainting(texture: THREE.Texture) { ink.map = texture; ink.needsUpdate = true; }
  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    group.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose());
    [front, reverse, ink, woodMaterial, bronze, jade].forEach(material => material.dispose());
    ownedTextures.forEach(texture => texture.dispose());
  }
  setOpen(0);
  return { group, setOpen, setPainting, dispose, paperGeometry, artGeometry, width, height, artWidth, artHeight };
}

export function createSilkTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#eee8dc'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 4200; i++) {
    const x = (i * 137.51) % 512, y = (i * 79.39) % 512;
    ctx.strokeStyle = i % 3 ? '#8d80600a' : '#fffdf324'; ctx.lineWidth = .35;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1.5 + i % 4, y + .3); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
export function createWoodTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#765c44'; ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = i % 3 ? '#372c241c' : '#c6a87732'; ctx.lineWidth = .5 + (i % 3) * .3;
    ctx.beginPath(); ctx.moveTo(i * 1.9, 0);
    for (let y = 0; y <= 512; y += 12) ctx.lineTo(i * 1.9 + Math.sin(y * .012 + i) * 2, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

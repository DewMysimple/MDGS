import * as THREE from 'three';

export interface PaintedScrollOptions {
  width: number;
  height: number;
  painting?: THREE.Texture;
  paperTexture?: THREE.Texture;
  woodTexture?: THREE.Texture;
}

/** A physical sheet in the local XY plane, its painted face pointing along +Z.
 * The wound paper retains its surface coordinates: hidden artwork coils around
 * the shafts instead of stretching or disappearing behind a rectangular mask. */
export function createPaintedScroll(options: PaintedScrollOptions) {
  const { width, height } = options;
  const group = new THREE.Group();
  group.name = 'physical-painted-scroll';
  const ownedTextures: THREE.Texture[] = [];
  const paper = options.paperTexture ?? createSilkTexture();
  const wood = options.woodTexture ?? createWoodTexture();
  if (!options.paperTexture) ownedTextures.push(paper);
  if (!options.woodTexture) ownedTextures.push(wood);
  const front = new THREE.MeshStandardMaterial({ map: options.painting ?? paper, color: '#f7efe0', roughness: .94, metalness: 0, side: THREE.FrontSide });
  const reverse = new THREE.MeshStandardMaterial({ map: paper, color: '#d8c6a6', roughness: 1, side: THREE.BackSide });
  const woodMaterial = new THREE.MeshStandardMaterial({ map: wood, color: '#b6a086', roughness: .88 });
  const bronze = new THREE.MeshStandardMaterial({ color: '#bba474', metalness: .22, roughness: .76 });
  const jade = new THREE.MeshStandardMaterial({ color: '#8daca3', roughness: .83, metalness: .03 });
  const paperGeometry = new THREE.PlaneGeometry(width, height, 160, 14);
  const original = new Float32Array(paperGeometry.attributes.position.array);
  const backGeometry = paperGeometry.clone();
  const sheet = new THREE.Mesh(paperGeometry, front);
  const backing = new THREE.Mesh(backGeometry, reverse);
  sheet.name = 'bending-silk-front'; backing.name = 'bending-silk-thickness';
  sheet.castShadow = true; sheet.receiveShadow = true; backing.castShadow = true;
  group.add(sheet, backing);
  const shafts: THREE.Group[] = [];
  const rollRings: THREE.Mesh[] = [];
  const coreRadius = Math.min(height * .036, width * .035);
  const rodLength = height * 1.12;
  for (const side of [-1, 1]) {
    const shaft = new THREE.Group(); shaft.name = side < 0 ? 'left-shaft' : 'right-shaft';
    const core = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius, coreRadius, rodLength, 28), woodMaterial);
    core.castShadow = true; shaft.add(core);
    for (const end of [-1, 1]) {
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius * 1.37, coreRadius * 1.37, height * .038, 28), bronze);
      collar.position.y = end * height * .522; collar.castShadow = true; shaft.add(collar);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(coreRadius * 1.08, coreRadius * 1.08, height * .048, 28), woodMaterial);
      tip.position.y = end * height * .566; tip.castShadow = true; shaft.add(tip);
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(coreRadius * .78, 18, 10), jade);
      jewel.scale.y = .45; jewel.position.y = end * height * .592; shaft.add(jewel);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, .025, 5, 36), bronze);
      ring.rotation.x = Math.PI / 2; ring.position.y = end * height * .501;
      shaft.add(ring); rollRings.push(ring);
    }
    group.add(shaft); shafts.push(shaft);
  }
  let openness = -1;
  function setOpen(value: number) {
    const p = THREE.MathUtils.clamp(value, 0, 1);
    if (Math.abs(p - openness) < .0001) return;
    openness = p;
    const r = coreRadius * (2.28 - p * 1.18);
    const flatHalf = THREE.MathUtils.lerp(coreRadius * 2.4, width / 2 - coreRadius * .22, p);
    const frontPosition = paperGeometry.attributes.position as THREE.BufferAttribute;
    const backPosition = backGeometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < frontPosition.count; i++) {
      const ox = original[i * 3], y = original[i * 3 + 1];
      const side = Math.sign(ox), distance = Math.abs(ox);
      let x = ox;
      let z = Math.sin(y / height * Math.PI) * .007 * (1 - p);
      if (distance > flatHalf) {
        const wound = distance - flatHalf;
        const theta = wound / r;
        const coilRadius = r + theta * .0018;
        x = side * (flatHalf + Math.sin(theta) * coilRadius);
        z += r - Math.cos(theta) * coilRadius;
      } else {
        // Subtle natural sag has actual geometry and a real contact shadow.
        z += .015 * Math.pow(distance / Math.max(flatHalf, .01), 6);
      }
      frontPosition.setXYZ(i, x, y, z + .008);
      backPosition.setXYZ(i, x, y, z - .008);
    }
    frontPosition.needsUpdate = true; backPosition.needsUpdate = true;
    paperGeometry.computeVertexNormals(); backGeometry.computeVertexNormals();
    paperGeometry.computeBoundingSphere(); backGeometry.computeBoundingSphere();
    shafts.forEach((shaft, index) => {
      shaft.position.set((index ? 1 : -1) * flatHalf, 0, r);
      shaft.rotation.y = (index ? -1 : 1) * (1 - p) * Math.PI * 6;
    });
    rollRings.forEach(ring => ring.scale.setScalar(r));
    group.userData.open = p;
    group.userData.shaftSeparation = flatHalf * 2;
    group.userData.curlRadius = r;
  }
  function setPainting(texture: THREE.Texture) { front.map = texture; front.needsUpdate = true; }
  function dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    group.traverse(object => { if (object instanceof THREE.Mesh) geometries.add(object.geometry); });
    geometries.forEach(geometry => geometry.dispose());
    [front, reverse, woodMaterial, bronze, jade].forEach(material => material.dispose());
    ownedTextures.forEach(texture => texture.dispose());
  }
  setOpen(1);
  return { group, setOpen, setPainting, dispose, paperGeometry };
}

export function createSilkTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ede5d4'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 512; i++) {
    ctx.strokeStyle = i % 3 ? '#c6b89c18' : '#fff9ec58'; ctx.lineWidth = .45;
    ctx.beginPath(); ctx.moveTo(i + .3, 0); ctx.lineTo(i + .3, 512); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i + .3); ctx.lineTo(512, i + .3); ctx.stroke();
  }
  for (let i = 0; i < 2400; i++) {
    const x = (i * 137.51) % 512, y = (i * 79.39) % 512;
    ctx.fillStyle = i % 9 ? '#8f80550a' : '#c5a87238';
    ctx.fillRect(x, y, i % 9 ? 1 : 2, i % 5 ? 1 : 3);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function createWoodTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8b725c'; ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 64; i++) {
    ctx.strokeStyle = i % 3 ? '#4b3c281a' : '#d2bc8f3d'; ctx.lineWidth = .6 + i % 3;
    ctx.beginPath(); ctx.moveTo(i * 2, 0);
    for (let y = 0; y <= 512; y += 12) ctx.lineTo(i * 2 + Math.sin(y * .012 + i) * 3, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

import * as THREE from 'three';

/** A closed, cupped corolla. The hand-painted pigment is a surface material;
 * its contour, thickness and depth remain geometry when the camera moves. */
export function gongbiBloomGeometries(image: HTMLImageElement) {
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return [0,1,2].map(column=>buildCorolla(pixels,canvas.width,canvas.height,column));
}

function buildCorolla(pixels: Uint8ClampedArray, imageWidth: number, imageHeight: number, column: number) {
  const cell = imageWidth / 3, height = imageHeight * .58, cx = (column + .5) * cell, cy = imageHeight * .5;
  const slices = 72, rings = 12, outline: number[] = [];
  for (let j = 0; j < slices; j++) {
    const a = j / slices * Math.PI * 2;
    let radius = .87;
    for (let r = .99; r > .12; r -= .008) {
      const x = Math.min(imageWidth - 1, Math.max(0, Math.floor(cx + Math.cos(a) * r * cell * .5)));
      const y = Math.min(imageHeight - 1, Math.max(0, Math.floor(cy - Math.sin(a) * r * height * .5)));
      if (pixels[(y * imageWidth + x) * 4 + 3] > 65) { radius = r; break; }
    }
    outline.push(radius);
  }
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const side of [0, 1]) for (let k = 0; k <= rings; k++) for (let j = 0; j <= slices; j++) {
    const a = j / slices * Math.PI * 2, t = k / rings;
    const r = (outline[j % slices] * .6 + outline[(j + 1) % slices] * .2 + outline[(j + slices - 1) % slices] * .2) * t;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    positions.push(x, y * height / cell, .32 * (1 - t * t) + .025 * Math.sin(a * 7) * t * (1 - t) - side * .045);
    uvs.push((column + (x + 1) * .5) / 3, .5 + y * .29);
  }
  const count = (rings + 1) * (slices + 1);
  for (let k = 0; k < rings; k++) for (let j = 0; j < slices; j++) {
    const a = k * (slices + 1) + j, b = a + slices + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
    indices.push(a + count, a + count + 1, b + count, a + count + 1, b + count + 1, b + count);
  }
  for (let j = 0; j < slices; j++) {
    const a = rings * (slices + 1) + j, b = a + 1;
    indices.push(a, b, a + count, b, b + count, a + count);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  return geometry;
}

export function leafPigment() {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 256;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#506d60'; c.fillRect(0, 0, 128, 256);
  const gradient = c.createLinearGradient(0, 0, 128, 0); gradient.addColorStop(0, '#354e49'); gradient.addColorStop(.5, '#849581'); gradient.addColorStop(1, '#465d51');
  c.fillStyle = gradient; c.fillRect(0, 0, 128, 256);
  c.strokeStyle = '#c6b88b9c'; c.lineWidth = 1; c.beginPath(); c.moveTo(64, 0); c.lineTo(64, 256); c.stroke();
  for (let y = 20; y < 250; y += 21) for (const side of [-1, 1]) { c.beginPath(); c.moveTo(64, y + 25); c.quadraticCurveTo(64 + side * 23, y + 12, 64 + side * 57, y - 20); c.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

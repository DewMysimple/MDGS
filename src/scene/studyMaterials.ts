import * as THREE from 'three';

/** Small hand-drawn surface maps. These are materials on solids, never scene billboards. */
export function paintedSurface(kind: 'silk' | 'wood' | 'brocade' | 'rug' | 'stone', colour: string) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  let seed = 78213;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  c.fillStyle = colour; c.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 12500; i++) {
    const v = random(); c.fillStyle = v > .5 ? `rgba(255,249,227,${v * .14})` : `rgba(72,68,50,${v * .13})`;
    const x = random() * 512, y = random() * 512;
    c.fillRect(x, y, kind === 'wood' ? random() * 60 : random() * 5 + .4, .4 + random());
  }
  c.lineWidth = .6;
  if (kind === 'wood') {
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = `rgba(68,52,38,${.025 + random() * .09})`; c.beginPath();
      for (let x = 0; x <= 512; x += 8) c.lineTo(x, i * 6 + Math.sin(x * .02 + i) * 3);
      c.stroke();
    }
  }
  if (kind === 'silk' || kind === 'brocade') {
    c.strokeStyle = '#faf3dc26';
    for (let x = 0; x < 512; x += 3) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 1, 512); c.stroke(); }
  }
  if (kind === 'brocade' || kind === 'rug') {
    const gold = kind === 'rug' ? '#a2876950' : '#b6a278a8';
    for (let y = -40; y < 550; y += 120) for (let x = -40; x < 550; x += 128) {
      const ox = x + (Math.floor(y / 120) % 2) * 64;
      c.save(); c.translate(ox, y); c.strokeStyle = gold; c.lineWidth = 1.2;
      for (let p = 0; p < 8; p++) {
        c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, 4); c.bezierCurveTo(-24, 24, -7, 43, 0, 42); c.bezierCurveTo(11, 33, 17, 17, 0, 4); c.stroke();
      }
      c.beginPath(); c.arc(0, 0, 6, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, 45); c.bezierCurveTo(75, 28, 15, 115, 65, 83); c.stroke(); c.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  return texture;
}

export function softSmokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d')!, g = ctx.createRadialGradient(64, 64, 1, 64, 64, 62);
  g.addColorStop(0, 'rgba(246,242,229,.6)'); g.addColorStop(.4, 'rgba(224,230,221,.23)'); g.addColorStop(1, 'rgba(224,230,221,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

/** Cupped, asymmetric petals: a real curved surface, with mineral-pigment vertex colours. */
export function petalGeometry(size = 1) {
  const g = new THREE.PlaneGeometry(size, size, 8, 10), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / size * 2, v = THREE.MathUtils.clamp(p.getY(i) / size + .5, 0, 1);
    const taper = Math.sqrt(Math.sin(v * Math.PI * .5)) * .9 + .025;
    p.setXYZ(i, u * size * .52 * taper, v * size * (1 - .24 * u * u), size * (.16 * u * u + .18 * Math.sin(v * Math.PI) - .14 * v * v));
  }
  const colours = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = i / p.count;
    const colour = new THREE.Color('#b88782').lerp(new THREE.Color('#f3ded0'), .4 + Math.sin(v * 8) * .18);
    colours.set([colour.r, colour.g, colour.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  g.computeVertexNormals(); return g;
}

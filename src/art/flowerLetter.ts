import { atlasArt } from '../data/peonyAtlas';
import type { FlowerLetter } from '../data/flowerLetters';
import type { FlowerLetterDesign } from '../data/flowerLetterDesigns';

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(src: string) {
  const cached = images.get(src);
  if (cached) return cached;
  const request = (async () => {
    const image = new Image(); image.decoding = 'async'; image.src = src;
    await image.decode(); return image;
  })().catch(error => { images.delete(src); throw error; });
  images.set(src, request); return request;
}

function vertical(context: CanvasRenderingContext2D, text: string, x: number, y: number, step: number) {
  [...text].forEach((character, index) => context.fillText(character, x, y + index * step));
}

/** A local visitor keepsake, composed from the work's own painted layers and
 * live type. No screenshot of a reference site, remote image or external API. */
export async function createFlowerLetter(letter: FlowerLetter, design: FlowerLetterDesign, sealed = true): Promise<Blob> {
  const [landscape, artwork, title] = await Promise.all([
    loadImage(atlasArt.landscape), loadImage(design.image), loadImage(atlasArt.title),
    document.fonts.load('40px "MDGS Kai"'),
  ]);
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1600;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#f3eddd'; ctx.fillRect(0, 0, 1200, 1600);
  ctx.save(); ctx.globalAlpha = .68; ctx.drawImage(landscape, -420, 0, 2843, 1600); ctx.restore();
  const wash = ctx.createLinearGradient(0, 0, 900, 1200);
  wash.addColorStop(0, '#f8f3e5ef'); wash.addColorStop(.6, '#f7f0dfc0'); wash.addColorStop(1, '#f7f0df00');
  ctx.fillStyle = wash; ctx.fillRect(0, 0, 1200, 1600);
  ctx.strokeStyle = '#ac956c55'; ctx.lineWidth = 1;
  ctx.strokeRect(48.5, 48.5, 1103, 1503);
  ctx.drawImage(title, 83, 94, 600, 200);
  ctx.fillStyle = '#8b7e5f'; ctx.font = '24px "MDGS Kai", KaiTi, serif';
  ctx.fillText('数 字 牡 丹 赋  ·  观 者 花 笺', 99, 322);
  // Keep the selected painted layer within the image area and away from the
  // vertical message. The same canvas supplies both preview and saved PNG.
  const artWidth = 835, artHeight = 680;
  const artScale = Math.min(artWidth / artwork.naturalWidth, artHeight / artwork.naturalHeight);
  const drawWidth = artwork.naturalWidth * artScale, drawHeight = artwork.naturalHeight * artScale;
  ctx.drawImage(artwork, 335 + (artWidth - drawWidth) / 2, 450 + (artHeight - drawHeight) / 2, drawWidth, drawHeight);
  ctx.fillStyle = '#475b45'; ctx.font = '100px "MDGS Kai", KaiTi, serif';
  vertical(ctx, letter.word, 96, 495, 124);
  ctx.fillStyle = '#7a6449'; ctx.font = '39px "MDGS Kai", KaiTi, serif';
  vertical(ctx, letter.lines[0], 292, 776, 62);
  vertical(ctx, letter.lines[1], 227, 838, 62);
  ctx.strokeStyle = '#a5916d88'; ctx.beginPath(); ctx.moveTo(112, 1045); ctx.lineTo(112, 1145); ctx.stroke();
  ctx.fillStyle = '#955040'; ctx.font = '26px "MDGS Kai", KaiTi, serif';
  ctx.fillText('花开于纸，也开在人间', 95, 1243);
  ctx.fillStyle = '#59684e'; ctx.font = '29px "MDGS Kai", KaiTi, serif';
  ctx.fillText('愿传统之美，在今天继续生长。', 95, 1298);
  if (sealed) {
  ctx.save(); ctx.translate(1005, 1330); ctx.rotate(.035);
  ctx.fillStyle = '#923d32'; ctx.fillRect(0, 0, 91, 112);
  ctx.strokeStyle = '#f4e4c2'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, 79, 100);
  ctx.fillStyle = '#f4e4c2'; ctx.font = '36px "MDGS Kai", KaiTi, serif';
  ctx.fillText('留', 28, 45); ctx.fillText('芳', 28, 89); ctx.restore();
  }
  ctx.strokeStyle = '#ac956c66'; ctx.beginPath(); ctx.moveTo(95, 1444); ctx.lineTo(940, 1444); ctx.stroke();
  ctx.fillStyle = '#8c886d'; ctx.font = '21px "MDGS Kai", KaiTi, serif';
  ctx.fillText('《国色长卷》数字游观 · 花笺新题', 95, 1494);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image export unavailable')), 'image/png'));
}

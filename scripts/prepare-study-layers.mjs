/** Optional offline image encoding; normal development/runtime does not require Sharp. */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const sharp = createRequire(import.meta.url)(process.env.MDGS_SHARP_MODULE || 'sharp');
const names = ['distant-garden','room-frame','desk','scrolls','foreground','title-compact'];
const results = [];
for (const name of names) {
  const source = new URL(`../public/ui/study-layered/${name}.png`, import.meta.url);
  const destination = new URL(`../public/ui/study-layered/${name}.webp`, import.meta.url);
  // Keep authored geometry/framing and alpha. Only the wire encoding changes.
  await writeFile(destination, await sharp(await readFile(source)).webp({ quality: 94, alphaQuality: 100, effort: 6, smartSubsample: true }).toBuffer());
  const bytes = await readFile(destination), original = await readFile(source);
  const meta = await sharp(bytes).metadata();
  results.push({ source: `${name}.png`, file: `${name}.webp`, width: meta.width, height: meta.height, alpha: meta.hasAlpha,
    originalBytes: original.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const manifest = { created:'2026-10-21', operation:'format encoding only; authored placement, dimensions and alpha retained', quality:94, alphaQuality:100,
  sourceBytes:results.reduce((sum,item)=>sum+item.originalBytes,0), runtimeBytes:results.reduce((sum,item)=>sum+item.bytes,0), assets:results };
await writeFile(new URL('../public/ui/study-layered/runtime-manifest.json',import.meta.url),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({sourceBytes:manifest.sourceBytes,runtimeBytes:manifest.runtimeBytes,assets:results.length}));

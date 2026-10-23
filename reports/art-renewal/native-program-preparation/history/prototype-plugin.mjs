import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath, transformWithEsbuild } from 'vite';
const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../..');
export async function prototypePlugin(){
  const originalId=normalizePath(path.join(root,'src/scene/SceneRenderer.ts'));
  const prototype=await fs.readFile(path.join(directory,'SceneRenderer.prototype.ts'),'utf8');
  const helper=path.join(directory,'ShaderWarmup.ts'),virtual='\0virtual:mdgs-shader-warmup.ts';
  return{name:'mdgs-isolated-shader-warmup',enforce:'pre',resolveId(id){if(id==='virtual:mdgs-shader-warmup')return virtual;},
    async load(id){if(normalizePath(id.split('?')[0])===originalId)return prototype;if(id===virtual)return transformWithEsbuild(await fs.readFile(helper,'utf8'),helper,{loader:'ts',target:'es2022'});}};
}

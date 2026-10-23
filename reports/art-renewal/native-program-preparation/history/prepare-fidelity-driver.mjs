import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(directory,'../..');
const original=await fs.readFile(path.join(root,'scripts/validate-peony2-fidelity.mjs'),'utf8');
let driver=original;
function replace(from,to){if(driver.split(from).length!==2)throw new Error('Expected one adapter anchor: '+from.slice(0,80));driver=driver.replace(from,to);}
replace("const root = fileURLToPath(new URL('../', import.meta.url));","const root = fileURLToPath(new URL('../../', import.meta.url));");
replace("  const {build} = await import('vite');","  const {build} = await import('vite');\n  const {prototypePlugin} = await import('./prototype-plugin.mjs');");
replace("  const outputs = await build({root, logLevel: 'error', build: {","  const outputs = await build({root, logLevel: 'error', plugins: [await prototypePlugin()], build: {");
replace("return {method: 'independent-vite-build-write-false', passed: true,","return {method: 'independent-vite-prototype-override-build-write-false', prototype: true, passed: true,");
replace("return hashFiles([...await filesBelow('src'), 'index.html'","return hashFiles(['tmp/shader-warmup/ShaderWarmup.ts', 'tmp/shader-warmup/SceneRenderer.prototype.ts', 'tmp/shader-warmup/prototype-plugin.mjs', 'tmp/shader-warmup/validate-fidelity-prototype.mjs', ...await filesBelow('src'), 'index.html'");
replace("const report = {status: 'running', startedAt:","const report = {status: 'running', prototype: true, warning: 'Isolated v3 shader-prewarm override preflight; not an adopted product-source bundle.', startedAt:");
replace("report.validatorSha256 = await digest('scripts/validate-peony2-fidelity.mjs');","report.validatorSha256 = await digest('tmp/shader-warmup/validate-fidelity-prototype.mjs');\nreport.originalValidatorSha256 = await digest('scripts/validate-peony2-fidelity.mjs');");
const output=path.join(directory,'validate-fidelity-prototype.mjs');await fs.writeFile(output,driver);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
await fs.writeFile(path.join(directory,'fidelity-adapter-binding.json'),JSON.stringify({createdAt:new Date().toISOString(),prototype:true,
 originalPath:'scripts/validate-peony2-fidelity.mjs',originalSha256:sha(original),adaptedPath:path.relative(root,output).replaceAll('\\','/'),adaptedSha256:sha(driver),
 changes:['Repo root from tmp location','Independent in-memory build uses the same explicit virtual prototype plugin','Binding includes exact prototype/helper/plugin/adapted-validator bytes','Report clearly declares prototype and carries both validator SHAs'],
 unchanged:'All native reference frames,243original decoded-RGBA/structural checks,59pixel capture protocol and pixel thresholds are unchanged; no original script or historical report edited.'},null,2));
console.log('Isolated fidelity adapter prepared; original validator untouched.');

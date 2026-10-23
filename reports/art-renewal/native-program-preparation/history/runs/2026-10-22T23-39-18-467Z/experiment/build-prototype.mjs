import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build, normalizePath, transformWithEsbuild } from 'vite';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const experiment = path.join(root, 'tmp/shader-warmup');
const originalPath = path.join(root, 'src/scene/SceneRenderer.ts');
const helperPath = path.join(experiment, 'ShaderWarmup.ts');
const source = await fs.readFile(originalPath, 'utf8');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
let prototype = source.replace(/\r\n/g, '\n');
function inject(anchor, replacement) {
  if (prototype.split(anchor).length !== 2) throw new Error(`Expected one source anchor: ${anchor.slice(0, 90)}`);
  prototype = prototype.replace(anchor, replacement);
}
inject("import * as THREE from 'three';", "import * as THREE from 'three';\nimport { ShaderWarmup } from 'virtual:mdgs-shader-warmup';");
inject('  private snapshotRequests = new Set<SnapshotRequest>();', '  private snapshotRequests = new Set<SnapshotRequest>();\n  private shaderWarmup?: ShaderWarmup;');
inject('      this.shaderFailed = true;', "      this.shaderFailed = true;\n      this.shaderWarmup?.cancel('shader-error');");
inject('    this.loaded = true;\n', '    this.loaded = true;\n    if (this.sourceFaithful && this.sourceMaterials) this.shaderWarmup = new ShaderWarmup(this.renderer, this.scene, this.camera, () => { this.dirty = true; this.requestFrame(); }, this.host.closest<HTMLElement>(\'.peony-experience\'));\n');
// Files use CRLF. Normalize only for injection; the complete override is saved
// and hashed separately, while the source file stays byte-for-byte untouched.
// (load() anchor above is normalized by the initial source conversion below.)
inject('    this.contextLost = true;', '    this.contextLost = true;\n    this.shaderWarmup?.loseContext();');
inject('    this.contextLost = false;', '    this.contextLost = false;\n    this.shaderWarmup?.restoreContext();');
inject('      this.motionDirector?.update(this.camera, motion, this.progress);', `      this.shaderWarmup?.enqueue(this.objects, object => this.objectTexturesReady(object));
      if (this.preparationActive && !this.firstFrameReady && this.shaderWarmup
        && !this.shaderWarmup.initialReady(this.objects, object => this.objectTexturesReady(object))) {
        this.updateDiagnostics();
        return;
      }
      this.motionDirector?.update(this.camera, motion, this.progress);`);
inject("    this.disposed = true;", "    this.disposed = true;\n    this.shaderWarmup?.dispose();");
await fs.writeFile(path.join(experiment, 'SceneRenderer.prototype.ts'), prototype);

async function walk(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Refuse symlink in source inputs: ${entry.name}`);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}
async function hashes(files) {
  const result = {};
  for (const file of files.sort()) result[normalizePath(path.relative(root, file))] = sha(await fs.readFile(file));
  return result;
}
const files = [...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'public')),
  ...['index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(x => path.join(root, x))];
const before = await hashes(files);
const options = { root, configFile: path.join(root, 'vite.config.ts'), logLevel: 'warn' };
// Vite's default public copy is intentional: these are independent prototypes,
// never aliases or mutations of dist, candidate3, or dist-exhibition.
await build({ ...options, build: { outDir: path.join(experiment, 'base-dist'), emptyOutDir: true } });
const virtualId = '\0virtual:mdgs-shader-warmup.ts';
const sourceId = normalizePath(originalPath);
await build({ ...options, plugins: [{ name: 'mdgs-isolated-shader-warmup', enforce: 'pre',
  resolveId(id) { if (id === 'virtual:mdgs-shader-warmup') return virtualId; },
  async load(id) {
    if (normalizePath(id.split('?')[0]) === sourceId) return prototype;
    if (id === virtualId) return transformWithEsbuild(await fs.readFile(helperPath, 'utf8'), helperPath, { loader: 'ts', target: 'es2022' });
  },
}], build: { outDir: path.join(root, 'tmp/shader-warmup-dist'), emptyOutDir: true } });
const afterFiles = [...await walk(path.join(root, 'src')), ...await walk(path.join(root, 'public')),
  ...['index.html', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json'].map(x => path.join(root, x))];
const after = await hashes(afterFiles);
const base = await hashes(await walk(path.join(experiment, 'base-dist')));
const warm = await hashes(await walk(path.join(root, 'tmp/shader-warmup-dist')));
const record = { status: JSON.stringify(before) === JSON.stringify(after) ? 'built-unmeasured' : 'source-drift',
  builtAt: new Date().toISOString(), originalRendererSha256: sha(source), prototypeRendererSha256: sha(prototype),
  helperSha256: sha(await fs.readFile(helperPath)), buildDriverSha256: sha(await fs.readFile(fileURLToPath(import.meta.url))),
  sourceInputs: before, sourceInputsAfter: after, sourceInputsUnchanged: JSON.stringify(before) === JSON.stringify(after),
  prototype: true, productSourceModified: false,
  boundary: 'Same current source/public/config for base and warm. Warm substitutes only SceneRenderer and one virtual helper; not the candidate3 product bundle. No browser measurement yet.',
  packages: { base, warm } };
await fs.writeFile(path.join(experiment, 'build-binding.json'), JSON.stringify(record, null, 2));
if (!record.sourceInputsUnchanged) throw new Error('Source/public/config changed during the paired build');
console.log(JSON.stringify({ status: record.status, inputs: files.length, baseFiles: Object.keys(base).length,
  warmFiles: Object.keys(warm).length, originalRendererSha256: record.originalRendererSha256,
  prototypeRendererSha256: record.prototypeRendererSha256 }));

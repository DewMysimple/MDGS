import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sourceFile = path.join(root, 'src/scene/SceneRenderer.ts');
const prototypeFile = path.join(root, 'tmp/shader-warmup/SceneRenderer.prototype.ts');
const helperFile = path.join(root, 'tmp/shader-warmup/ShaderWarmup.ts');
const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const host = ts.createCompilerHost(parsed.options);
const originalReadFile = host.readFile.bind(host);
host.readFile = file => path.resolve(file) === sourceFile ? fs.readFileSync(prototypeFile, 'utf8') : originalReadFile(file);
host.resolveModuleNames = (names, containingFile) => names.map(name => name === 'virtual:mdgs-shader-warmup'
  ? { resolvedFileName: helperFile, extension: ts.Extension.Ts }
  : ts.resolveModuleName(name, containingFile, parsed.options, host).resolvedModule);
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const errors = ts.getPreEmitDiagnostics(program);
if (errors.length) {
  process.stderr.write(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else console.log('Prototype + unchanged project strict TypeScript: passed');

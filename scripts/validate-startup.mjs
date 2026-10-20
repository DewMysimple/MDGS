/** Verify independent servers, occupied-port fallback, and project-relative startup. */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview, version as viteVersion } from 'vite';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const configFile = path.join(projectRoot, 'vite.config.ts');
const expectedTitle = (await readFile(path.join(projectRoot, 'index.html'), 'utf8')).match(/<title>(.*?)<\/title>/s)?.[1];
assert(expectedTitle, 'The project must have a page title.');
const originalCwd = process.cwd();
const running = [];
const checks = [];
const cleanup = [];
const failures = [];
const startedAt = new Date().toISOString();

// This test fetches HTML and public assets without loading browser modules.
// Avoid launching three unused dependency scans against the same Vite cache.
// Run after React's config hook, which adds optimizeDeps.include entries.
const httpOnly = {
  name: 'startup-http-only',
  enforce: 'post',
  config(config) {
    config.optimizeDeps = { ...config.optimizeDeps, noDiscovery: true, include: [] };
  },
};

async function checkPage(server, kind) {
  assert.equal(path.resolve(server.config.root), path.resolve(projectRoot));
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string' && address.port > 0);
  const url = server.resolvedUrls.local[0];
  assert.equal(Number(new URL(url).port), address.port, 'The printed URL must use the actual bound port.');
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.match(/<title>(.*?)<\/title>/s)?.[1], expectedTitle, 'The URL must serve this project.');
  if (kind === 'dev') assert(html.includes('/@vite/client'), 'Development HTML must include the Vite client.');
  const ornament = await fetch(new URL('ui/brocade.svg', url), { signal: AbortSignal.timeout(15000) });
  assert.equal(ornament.status, 200, 'Project assets must resolve at the selected address.');
  assert((await ornament.text()).includes('<svg'));
  checks.push({ kind, url, port: address.port, root: server.config.root, pageStatus: response.status, assetStatus: ornament.status });
  return address.port;
}

async function startDev(port) {
  const server = await createServer({ configFile, clearScreen: false, logLevel: 'error', plugins: [httpOnly], server: { host: '127.0.0.1', preTransformRequests: false, ...(port === undefined ? {} : { port }) } });
  running.push({ server, kind: 'dev', close: () => server.close() });
  assert.equal(server.environments.client.depsOptimizer, undefined, 'The HTTP-only check must not launch a dependency optimizer.');
  await server.listen();
  return server;
}

try {
  // Simulate a shortcut or external shell whose current directory is unrelated.
  process.chdir(tmpdir());
  const first = await startDev();
  const firstPort = await checkPage(first, 'dev');
  const secondPort = await checkPage(await startDev(), 'dev');
  assert.notEqual(firstPort, secondPort, 'Concurrent default servers need separate ports.');
  const fallbackPort = await checkPage(await startDev(firstPort), 'dev');
  assert.notEqual(fallbackPort, firstPort, 'An occupied explicit port must fall back.');

  // Build before running this check: preview must serve the real production output.
  for (let instance = 0; instance < 2; instance++) {
    const server = await preview({ configFile, logLevel: 'error', preview: { host: '127.0.0.1' } });
    running.push({ server, kind: 'preview', close: () => new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())) });
    await checkPage(server, 'preview');
  }
  const previewPorts = checks.filter(check => check.kind === 'preview').map(check => check.port);
  assert.notEqual(previewPorts[0], previewPorts[1]);
  assert.equal(checks.length, 5);
} catch (error) {
  failures.push(error);
} finally {
  // Close only the instances created here, and finish cleanup before reporting.
  for (const { server, kind, close } of running.reverse()) {
    const address = server.httpServer.address();
    try {
      await close();
      assert.equal(server.httpServer.listening, false, 'The test listener must stop.');
      assert.equal(server.httpServer.address(), null, 'The test listener must release its address.');
      cleanup.push({ kind, port: address?.port, listening: false, address: null, status: 'closed' });
    } catch (error) {
      failures.push(error);
    }
  }
  process.chdir(originalCwd);
}

if (failures.length) throw new AggregateError(failures, 'Startup assertions or server cleanup failed.');
assert.equal(cleanup.length, 5, 'All five test servers must be closed before passing.');
assert.equal(process.cwd(), originalCwd);
const result = { status: 'pass', startedAt, completedAt: new Date().toISOString(), viteVersion, launchedFrom: tmpdir(), checks, cleanup, cwdRestored: true, scope: 'Five real dev/preview HTTP servers; dependency scanning and speculative transforms are disabled only for this browserless startup test.' };
const reportDir = path.join(projectRoot, 'reports');
await mkdir(reportDir, { recursive: true });
await writeFile(path.join(reportDir, 'validation-startup.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));

/* Standalone local exhibition server. Requires only Node.js built-ins. */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const root = __dirname;
const argument = process.argv.indexOf('--port');
const port = argument < 0 ? 0 : Number(process.argv[argument + 1]);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be an integer from 0 to 65535.');
const inside = file => file === root || file.startsWith(root + path.sep);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
};
function acceptsGzip(header = '') {
  const entries = header.split(',').map(token => {
    const [name, ...parameters] = token.trim().toLowerCase().split(';');
    const parameter = parameters.map(item => item.trim()).find(item => item.startsWith('q='));
    const quality = parameter ? Number(parameter.slice(2)) : 1;
    return { name, quality: Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0 };
  });
  return (entries.find(entry => entry.name === 'gzip') ?? entries.find(entry => entry.name === '*'))?.quality > 0;
}
const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
    }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const candidate = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!inside(candidate)) { response.writeHead(403); response.end(); return; }
    const file = await fsp.realpath(candidate);
    if (!inside(file)) { response.writeHead(403); response.end(); return; }
    const info = await fsp.stat(file);
    if (!info.isFile()) { response.writeHead(404); response.end(); return; }
    const type = mime[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const tag = `W/"${info.size}-${info.mtimeMs.toString(16)}"`;
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache', ETag: tag, Vary: 'Accept-Encoding' };
    if (request.headers['if-none-match'] === tag) { response.writeHead(304, headers); response.end(); return; }
    // Native .gz program fields are already compressed. Only text responses
    // are compressed here; fetch transparently decodes their HTTP encoding.
    const gzip = acceptsGzip(request.headers['accept-encoding']) && /^(text\/|application\/json|image\/svg)/.test(type);
    if (gzip) headers['Content-Encoding'] = 'gzip'; else headers['Content-Length'] = info.size;
    response.writeHead(200, headers);
    if (request.method === 'HEAD') { response.end(); return; }
    const input = fs.createReadStream(file);
    input.on('error', () => response.destroy());
    response.on('close', () => input.destroy());
    if (gzip) { const compressor = zlib.createGzip(); compressor.on('error', () => response.destroy()); input.pipe(compressor).pipe(response); }
    else input.pipe(response);
  } catch (error) {
    if (!response.headersSent) response.writeHead(error.code === 'ENOENT' ? 404 : 400);
    response.end();
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => {
  const address = `http://127.0.0.1:${server.address().port}/`;
  console.log(`国色长卷 · 数字牡丹赋\n${address}\n保持此窗口开启。按 Ctrl+C 结束展览服务。`);
  if (process.argv.includes('--open')) {
    const [command, args] = process.platform === 'win32' ? ['cmd.exe', ['/c', 'start', '', address]]
      : process.platform === 'darwin' ? ['open', [address]] : ['xdg-open', [address]];
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => console.log(`请在浏览器中打开 ${address}`)); child.unref();
  }
});

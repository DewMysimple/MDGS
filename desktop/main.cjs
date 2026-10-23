/* The desktop host serves only the bundled exhibition. No local HTTP server,
 * system Node.js, browser installation or renderer Node integration is needed. */
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const TITLE = '国色长卷 · 数字牡丹赋';
const ORIGIN = 'mdgs://app';
const smoke = process.argv.includes('--mdgs-smoke');
const profileArgument = process.argv.find(argument => argument.startsWith('--mdgs-smoke-profile='));
if (smoke) app.setPath('userData', profileArgument
  ? path.resolve(profileArgument.slice('--mdgs-smoke-profile='.length))
  : path.join(app.getPath('temp'), `mdgs-desktop-smoke-${process.pid}`));
app.setName('数字牡丹赋');
app.setAppUserModelId('cn.mdgs.digital-peony');

protocol.registerSchemesAsPrivileged([{ scheme: 'mdgs', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true,
} }]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
};
const CSP = "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'";
let window;

function fullscreenOwner(event) {
  const owner = BrowserWindow.fromWebContents(event.sender);
  return owner === window ? owner : null;
}

ipcMain.handle('mdgs:fullscreen:get', event => Boolean(fullscreenOwner(event)?.isFullScreen()));
ipcMain.handle('mdgs:fullscreen:toggle', event => {
  const owner = fullscreenOwner(event);
  if (!owner) return false;
  const next = !owner.isFullScreen();
  owner.setFullScreen(next);
  return next;
});

function ownURL(value) {
  try { const url = new URL(value); return url.protocol === 'mdgs:' && url.hostname === 'app' && !url.port && !url.username && !url.password; }
  catch { return false; }
}
function localResource(value) {
  return ownURL(value) || value.startsWith('data:') || value.startsWith('blob:mdgs://app/');
}
function externalReference(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}
function showError(message) {
  dialog.showErrorBox(TITLE, message);
}

async function installProtocol() {
  // Isolate internal file reads from the renderer session's URL filter. This
  // session receives only file URLs constructed after the realpath check below.
  const bundledFiles = session.fromPartition('mdgs-bundled-files', { cache: false });
  const root = await fs.realpath(app.isPackaged
    ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'dist-exhibition'));
  const inside = file => file === root || file.startsWith(root + path.sep);
  protocol.handle('mdgs', async request => {
    if (!ownURL(request.url)) return new Response('Forbidden', { status: 403 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    try {
      const url = new URL(request.url);
      const pathname = decodeURIComponent(url.pathname);
      const candidate = path.resolve(root, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!inside(candidate)) return new Response('Forbidden', { status: 403 });
      const file = await fs.realpath(candidate);
      if (!inside(file)) return new Response('Forbidden', { status: 403 });
      if (!(await fs.stat(file)).isFile()) return new Response('Not found', { status: 404 });
      const response = await bundledFiles.fetch(pathToFileURL(file).href, { method: request.method, headers: request.headers, bypassCustomProtocolHandlers: true });
      const headers = new Headers(response.headers);
      headers.set('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
      headers.set('Cache-Control', 'no-cache');
      // Native .gz fields are compressed files, not an HTTP content encoding.
      headers.delete('Content-Encoding');
      if (path.extname(file).toLowerCase() === '.html') headers.set('Content-Security-Policy', CSP);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      return new Response(error.code === 'ENOENT' ? 'Not found' : 'Bad request', { status: error.code === 'ENOENT' ? 404 : 400 });
    }
  });
}

function createWindow() {
  window = new BrowserWindow({
    title: TITLE, width: 1440, height: 960, minWidth: 1000, minHeight: 650,
    show: false, backgroundColor: '#f3edde', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  let referenceGestureAt = 0;
  window.once('ready-to-show', () => { window.maximize(); window.show(); });
  window.on('enter-full-screen', () => window?.webContents.send('mdgs:fullscreen-change', true));
  window.on('leave-full-screen', () => window?.webContents.send('mdgs:fullscreen-change', false));
  window.webContents.on('before-mouse-event', (_event, input) => {
    if (input.type === 'mouseUp') referenceGestureAt = Date.now();
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'Enter' || input.key === ' ') referenceGestureAt = Date.now();
    if (input.key === 'F11') { event.preventDefault(); window.setFullScreen(!window.isFullScreen()); }
    else if (input.key === 'Escape' && window.isFullScreen()) { event.preventDefault(); window.setFullScreen(false); }
  });
  window.webContents.on('will-navigate', details => {
    if (!ownURL(details.url)) details.preventDefault();
  });
  window.webContents.on('will-frame-navigate', details => {
    if (!ownURL(details.url)) details.preventDefault();
  });
  // The bundled references use target=_blank. Only a browser tab gesture may
  // leave the app; scripted new-window popups and local/file schemes are denied.
  window.webContents.setWindowOpenHandler(details => {
    if (externalReference(details.url) && ownURL(window.webContents.getURL())
      && Date.now() - referenceGestureAt < 1500) {
      referenceGestureAt = 0;
      void shell.openExternal(details.url).catch(() => showError('无法打开参读链接，请检查系统浏览器。'));
    }
    return { action: 'deny' };
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    if (!['clean-exit', 'normal-exit'].includes(details.reason)) showError('画卷窗口意外关闭，请重新启动程序。');
  });
  window.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) showError(`展览加载失败（${code}）：${description}`);
  });
  window.on('closed', () => { window = undefined; });
  void window.loadURL(`${ORIGIN}/`).catch(error => showError(`无法载入内置展览：${error.message}`));
}

if (!smoke && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
  });
  app.whenReady().then(async () => {
    await installProtocol();
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !localResource(details.url) });
    });
    session.defaultSession.on('will-download', (event, item) => {
      if (!item.getURL().startsWith('blob:mdgs://app/') || !item.getFilename().toLowerCase().endsWith('.png')) { event.preventDefault(); return; }
      const filename = path.win32.basename(item.getFilename());
      item.setSaveDialogOptions({ title: '保存观者花笺', defaultPath: path.join(app.getPath('downloads'), filename), filters: [{ name: 'PNG 图像', extensions: ['png'] }] });
      item.on('done', (_event, state) => { if (state === 'interrupted') showError('花笺保存失败，请重新保存。'); });
    });
    createWindow();
  }).catch(error => { showError(`程序启动失败：${error.message}`); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}

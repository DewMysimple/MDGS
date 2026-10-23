const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mdgsDesktop', Object.freeze({
  getFullscreenState: () => ipcRenderer.invoke('mdgs:fullscreen:get'),
  toggleFullscreen: () => ipcRenderer.invoke('mdgs:fullscreen:toggle'),
  onFullscreenChange: listener => {
    const handleChange = (_event, fullscreen) => listener(Boolean(fullscreen));
    ipcRenderer.on('mdgs:fullscreen-change', handleChange);
    return () => ipcRenderer.removeListener('mdgs:fullscreen-change', handleChange);
  },
}));

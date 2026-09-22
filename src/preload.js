const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  listGames: () => ipcRenderer.invoke('catalog:list'),
  checkSystem: () => ipcRenderer.invoke('system:check'),
  install: (id) => ipcRenderer.invoke('game:install', id),
  play: (id) => ipcRenderer.invoke('game:play', id),
  stop: (id) => ipcRenderer.invoke('game:stop', id),
  openFolder: (id) => ipcRenderer.invoke('game:folder', id),
  onProgress: (callback) => ipcRenderer.on('game:progress', (_event, payload) => callback(payload)),
  onCatalogChanged: (callback) => ipcRenderer.on('catalog:changed', (_event, payload) => callback(payload))
});


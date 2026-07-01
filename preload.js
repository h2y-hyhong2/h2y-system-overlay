const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  dragStart: (coords) => ipcRenderer.send('window-drag-start', coords),
  dragWindow: () => ipcRenderer.send('window-drag'),
  onStatsUpdate: (callback) => ipcRenderer.on('stats-update', (event, value) => callback(value)),
  onClickThroughChanged: (callback) => ipcRenderer.on('click-through-changed', (event, value) => callback(value)),
  onPositionLockChanged: (callback) => ipcRenderer.on('position-lock-changed', (event, value) => callback(value)),
  onLayoutModeChanged: (callback) => ipcRenderer.on('layout-mode-changed', (event, value) => callback(value)),
  closeWindow: () => ipcRenderer.send('window-close'),
  toggleLayout: () => ipcRenderer.send('window-toggle-layout')
});

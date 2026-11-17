const { contextBridge, ipcRenderer } = require('electron');
// Only our own local pages (setup / offline) get this bridge, never the remote site.
if (location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('litex', {
    current: () => ipcRenderer.invoke('litex:current'),
    save: (url) => ipcRenderer.invoke('litex:save', url),
    open: () => ipcRenderer.invoke('litex:open'),
    changeLink: () => ipcRenderer.invoke('litex:change')
  });
}

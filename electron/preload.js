/* Bridge between the page and the desktop shell. Only these calls exist; the page gets no other access. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('incogFile', {
  save: (args) => ipcRenderer.invoke('file:save', args),          // {text, path, name} -> {path} | {canceled}
  open: (path) => ipcRenderer.invoke('file:open', path),          // -> {path, text} | {canceled}
  onOpen: (cb) => ipcRenderer.on('file:opened', (_e, f) => cb(f)),// a .incog file double-clicked in Windows
  checkUpdate: () => ipcRenderer.send('app:check-update'),
  setDirty: (d) => ipcRenderer.send('file:dirty', !!d),
});
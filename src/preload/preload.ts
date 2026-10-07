import { contextBridge, ipcRenderer } from 'electron';
import { injectBrowserAction } from 'electron-chrome-extensions/browser-action';
import type { BrowserAPI } from '../shared/ipc';
import type { BrowserWindowState } from '../shared/models';
// Only chrome receives this preload. Remote website views receive no bridge.
const api: BrowserAPI = {
  snapshot: () => ipcRenderer.invoke('dot:snapshot'),
  command: (command) => ipcRenderer.invoke('dot:command', command),
  onState: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, state: BrowserWindowState) =>
      handler(state);
    ipcRenderer.on('dot:state', listener);
    return () => ipcRenderer.removeListener('dot:state', listener);
  },
  onEvent: (handler) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      event: { type: string; message?: string },
    ) => handler(event);
    ipcRenderer.on('dot:event', listener);
    return () => ipcRenderer.removeListener('dot:event', listener);
  },
};
contextBridge.exposeInMainWorld('dot', api);
injectBrowserAction();

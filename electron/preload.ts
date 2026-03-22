import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),

  // Screen sharing
  getScreenSources: () => ipcRenderer.invoke('screen:get-sources') as Promise<
    Array<{ id: string; name: string; thumbnail: string; isScreen: boolean }>
  >,
  selectScreenSource: (sourceId: string) => ipcRenderer.invoke('screen:select-source', sourceId) as Promise<boolean>,
});

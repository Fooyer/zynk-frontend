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

  // Gamepad emulation
  gamepadCreateVirtual: () => ipcRenderer.invoke('gamepad:create-virtual') as Promise<{ success: boolean; error?: string }>,
  gamepadInput: (state: { index: number; timestamp: number; buttons: { pressed: boolean; value: number }[]; axes: number[] }) =>
    ipcRenderer.send('gamepad:input', state),
  gamepadDestroyVirtual: () => ipcRenderer.invoke('gamepad:destroy-virtual') as Promise<void>,
  gamepadIsAvailable: () => ipcRenderer.invoke('gamepad:is-available') as Promise<boolean>,
});

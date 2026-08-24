import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  windowMinimize: () => ipcRenderer.send('window:minimize'),
  windowMaximize: () => ipcRenderer.send('window:maximize'),
  windowClose: () => ipcRenderer.send('window:close'),

  // Auto-update
  getAppVersion: () => ipcRenderer.invoke('app:get-version') as Promise<string>,
  checkForUpdates: () => ipcRenderer.invoke('update:check') as Promise<void>,
  onUpdateChecking: (callback: () => void) => {
    ipcRenderer.on('update:checking', () => callback());
  },
  onUpdateAvailable: (callback: (version: string) => void) => {
    ipcRenderer.on('update:available', (_event, version) => callback(version));
  },
  onUpdateNotAvailable: (callback: () => void) => {
    ipcRenderer.on('update:not-available', () => callback());
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('update:progress', (_event, percent) => callback(percent));
  },
  onUpdateDownloaded: (callback: (version: string) => void) => {
    ipcRenderer.on('update:downloaded', (_event, version) => callback(version));
  },
  onUpdateError: (callback: (message: string) => void) => {
    ipcRenderer.on('update:error', (_event, message) => callback(message));
  },
  restartToUpdate: () => ipcRenderer.send('update:restart'),

  // Badge de notificação não lida — taskbar (overlay) e bandeja (ícone inteiro)
  setOverlayBadge: (dataUrl: string | null) => ipcRenderer.send('notif:set-overlay-badge', dataUrl),
  setTrayBadge: (dataUrl: string | null) => ipcRenderer.send('notif:set-tray-badge', dataUrl),

  // Edit commands — usados pelo menu de contexto customizado dos campos de texto
  editUndo: () => ipcRenderer.send('edit:undo'),
  editRedo: () => ipcRenderer.send('edit:redo'),
  editCut: () => ipcRenderer.send('edit:cut'),
  editCopy: () => ipcRenderer.send('edit:copy'),
  editPaste: () => ipcRenderer.send('edit:paste'),
  editSelectAll: () => ipcRenderer.send('edit:selectAll'),

  // Screen sharing
  getScreenSources: () => ipcRenderer.invoke('screen:get-sources') as Promise<
    Array<{ id: string; name: string; thumbnail: string; isScreen: boolean }>
  >,
  selectScreenSource: (sourceId: string) => ipcRenderer.invoke('screen:select-source', sourceId) as Promise<boolean>,

  // Gamepad emulation
  gamepadIsAvailable: () => ipcRenderer.invoke('gamepad:is-available') as Promise<boolean>,

  // Multi-gamepad (game sessions)
  gamepadCreateSlot: (slot: number) => ipcRenderer.invoke('gamepad:create-slot', slot) as Promise<{ success: boolean; error?: string }>,
  gamepadDestroySlot: (slot: number) => ipcRenderer.invoke('gamepad:destroy-slot', slot) as Promise<void>,
  gamepadDestroyAllSlots: () => ipcRenderer.invoke('gamepad:destroy-all-slots') as Promise<void>,
  gamepadInputSlot: (slot: number, state: { index: number; timestamp: number; buttons: { pressed: boolean; value: number }[]; axes: number[] }) =>
    ipcRenderer.send('gamepad:input-slot', { slot, state }),

  // Filesystem (code sessions)
  fsSelectFolder: () => ipcRenderer.invoke('fs:select-folder') as Promise<string | null>,
  fsReadDir: (dirPath: string) => ipcRenderer.invoke('fs:read-dir', dirPath) as Promise<Array<{ name: string; isDirectory: boolean; path: string }>>,
  fsReadFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath) as Promise<string | null>,
  fsSaveFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:save-file', filePath, content) as Promise<boolean>,

  // Code tunnel (VS Code + file watcher)
  tunnelOpenVSCode: (folderPath: string) => ipcRenderer.invoke('tunnel:open-vscode', folderPath) as Promise<{ success: boolean; error?: string }>,
  tunnelWatchFolder: (folderPath: string) => ipcRenderer.invoke('tunnel:watch-folder', folderPath) as Promise<{ success: boolean; error?: string }>,
  tunnelStopWatching: () => ipcRenderer.invoke('tunnel:stop-watching') as Promise<void>,
  tunnelWriteRemoteFile: (folderPath: string, relativePath: string, content: string) =>
    ipcRenderer.invoke('tunnel:write-remote-file', folderPath, relativePath, content) as Promise<boolean>,
  tunnelDeleteRemoteFile: (folderPath: string, relativePath: string) =>
    ipcRenderer.invoke('tunnel:delete-remote-file', folderPath, relativePath) as Promise<boolean>,
  tunnelOnFileChanged: (callback: (data: { relativePath: string; action: 'change' | 'create' | 'delete'; content: string | null }) => void) => {
    ipcRenderer.on('tunnel:file-changed', (_event, data) => callback(data));
  },
  tunnelOffFileChanged: () => {
    ipcRenderer.removeAllListeners('tunnel:file-changed');
  },

  // Atalhos globais (system-wide) — funcionam mesmo com o Zynk minimizado/
  // sem foco, ex.: mutar o microfone enquanto joga em tela cheia.
  setGlobalShortcuts: (items: { action: string; accelerator: string }[]) =>
    ipcRenderer.invoke('shortcuts:set', items) as Promise<{ failed: string[] }>,
  onGlobalShortcut: (callback: (action: string) => void) => {
    ipcRenderer.on('shortcut:triggered', (_event, action) => callback(action));
  },
  offGlobalShortcut: () => {
    ipcRenderer.removeAllListeners('shortcut:triggered');
  },
});

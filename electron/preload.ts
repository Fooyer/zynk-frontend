import { contextBridge } from 'electron';

/**
 * Preload script — ponte segura entre Node.js e o renderer (React).
 * Expõe apenas o necessário via contextBridge.
 * 
 * Por enquanto mínimo, mas aqui entra:
 * - Notificações nativas
 * - Deep links
 * - File system (para upload)
 * - Autostart / tray
 */
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  // Futuros métodos aqui
});

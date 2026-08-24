import { create } from 'zustand';
import type { ShortcutActionId } from './keybindingsStore';

/**
 * Não-persistido — só reflete o resultado do último registro de atalhos
 * globais (Electron globalShortcut), pra Settings avisar quando um atalho
 * configurado não pôde ser registrado no sistema (ex.: já em uso por outro
 * programa). Escrito por ShortcutManager, lido pela aba Atalhos.
 */
interface ShortcutStatusState {
  failedGlobalActions: Set<ShortcutActionId>;
  setFailedGlobalActions: (ids: Set<ShortcutActionId>) => void;
}

export const useShortcutStatusStore = create<ShortcutStatusState>((set) => ({
  failedGlobalActions: new Set(),
  setFailedGlobalActions: (failedGlobalActions) => set({ failedGlobalActions }),
}));

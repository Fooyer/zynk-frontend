import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KeyCombo } from '../utils/keyCombo';

export type ShortcutActionId = 'toggleMute' | 'toggleScreenShare' | 'toggleAudioShare' | 'leaveCall';

interface KeybindingsState {
  // Sem nada por padrão — atalho é opt-in, pra não colidir de surpresa com
  // outro programa (jogo, IDE etc.) assim que o usuário abre o Zynk.
  bindings: Partial<Record<ShortcutActionId, KeyCombo>>;
  setBinding: (action: ShortcutActionId, combo: KeyCombo | null) => void;
}

export const useKeybindingsStore = create<KeybindingsState>()(
  persist(
    (set) => ({
      bindings: {},
      setBinding: (action, combo) =>
        set((s) => {
          const next = { ...s.bindings };
          if (combo) next[action] = combo; else delete next[action];
          return { bindings: next };
        }),
    }),
    { name: 'zynk-keybindings', version: 1 },
  ),
);

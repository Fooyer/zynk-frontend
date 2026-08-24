import { create } from 'zustand';

export type MediaFocus = 'screen' | 'watch';

interface WatchTogetherUiState {
  // true enquanto o player grande do YouTube (dentro da aba Chamada) está
  // montado e em foco — o mini player flutuante (App.tsx) só aparece quando
  // isto é false, pra nunca ter dois embeds do YouTube tocando o mesmo
  // vídeo ao mesmo tempo (áudio duplicado). Escrito por GroupCallView, lido
  // pelo mini player.
  isMainPlayerVisible: boolean;
  setMainPlayerVisible: (v: boolean) => void;

  // "Expandir" no mini player flutuante pede pra abrir a aba Chamada do
  // grupo certo com o YouTube em foco — consumido uma vez só (padrão igual
  // ao pendingChannelId de groupStore), cada um pelo componente responsável:
  // GroupLayout decide a aba, GroupCallView decide o foco dentro dela.
  pendingCallTab: boolean;
  requestCallTab: () => void;
  consumeCallTab: () => boolean;

  pendingCallFocus: MediaFocus | null;
  requestCallFocus: (focus: MediaFocus) => void;
  consumeCallFocus: () => MediaFocus | null;
}

export const useWatchTogetherUiStore = create<WatchTogetherUiState>((set, get) => ({
  isMainPlayerVisible: false,
  setMainPlayerVisible: (v) => set({ isMainPlayerVisible: v }),

  pendingCallTab: false,
  requestCallTab: () => set({ pendingCallTab: true }),
  consumeCallTab: () => {
    const v = get().pendingCallTab;
    if (v) set({ pendingCallTab: false });
    return v;
  },

  pendingCallFocus: null,
  requestCallFocus: (focus) => set({ pendingCallFocus: focus }),
  consumeCallFocus: () => {
    const v = get().pendingCallFocus;
    if (v !== null) set({ pendingCallFocus: null });
    return v;
  },
}));

import { create } from 'zustand';

export type AppView = 'home' | 'settings' | 'group' | 'events';

interface UiState {
  view: AppView;
  setView: (view: AppView) => void;
}

export const useUiStore = create<UiState>((set) => ({
  view: 'home',
  setView: (view) => set({ view }),
}));

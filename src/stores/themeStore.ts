import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AppMode = 'dark' | 'light';
export type AccentMode = 'preset' | 'custom' | 'gradient';
export type AccentPreset = 'red' | 'blue' | 'purple' | 'green';

interface ThemeState {
  mode: AppMode;
  accentMode: AccentMode;
  accentPreset: AccentPreset;
  customColor: string;   // hex, usado quando accentMode === 'custom'
  gradientFrom: string;  // hex, usado quando accentMode === 'gradient'
  gradientTo: string;    // hex, usado quando accentMode === 'gradient'

  setMode: (mode: AppMode) => void;
  setAccentMode: (mode: AccentMode) => void;
  setAccentPreset: (preset: AccentPreset) => void;
  setCustomColor: (hex: string) => void;
  setGradient: (from: string, to: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'dark',
      accentMode: 'preset',
      accentPreset: 'red',
      customColor: '#ff1339',
      gradientFrom: '#ff1339',
      gradientTo: '#8913ff',

      setMode: (mode) => set({ mode }),
      setAccentMode: (accentMode) => set({ accentMode }),
      setAccentPreset: (accentPreset) => set({ accentPreset }),
      setCustomColor: (customColor) => set({ customColor }),
      setGradient: (gradientFrom, gradientTo) => set({ gradientFrom, gradientTo }),
    }),
    {
      name: 'zynk-theme',
      version: 1,
      // v0 guardava um único themeId ('red'|'light'|'blue'|'purple'|'green')
      // combinando claro/escuro e cor num campo só — não dá pra migrar 1:1
      // pro novo formato (mode + accent separados), então reseta pro padrão.
      migrate: (persisted: any, version) => {
        if (version === 0) return undefined;
        return persisted;
      },
    },
  ),
);

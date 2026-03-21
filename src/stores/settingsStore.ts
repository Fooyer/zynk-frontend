import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NoiseSuppression = 'off' | 'low' | 'medium' | 'high';

interface SettingsState {
  // Dispositivos
  inputDeviceId: string;   // '' = padrão do sistema
  outputDeviceId: string;  // '' = padrão do sistema

  // Áudio
  inputVolume: number;       // 0–2 (0–200%)
  noiseSuppression: NoiseSuppression;
  echoCancellation: boolean;
  autoGainControl: boolean;

  // Ações
  setInputDevice: (id: string) => void;
  setOutputDevice: (id: string) => void;
  setInputVolume: (v: number) => void;
  setNoiseSuppression: (v: NoiseSuppression) => void;
  setEchoCancellation: (v: boolean) => void;
  setAutoGainControl: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      inputDeviceId: '',
      outputDeviceId: '',
      inputVolume: 1,
      noiseSuppression: 'high',
      echoCancellation: true,
      autoGainControl: true,

      setInputDevice: (inputDeviceId) => set({ inputDeviceId }),
      setOutputDevice: (outputDeviceId) => set({ outputDeviceId }),
      setInputVolume: (inputVolume) => set({ inputVolume }),
      setNoiseSuppression: (noiseSuppression) => set({ noiseSuppression }),
      setEchoCancellation: (echoCancellation) => set({ echoCancellation }),
      setAutoGainControl: (autoGainControl) => set({ autoGainControl }),
    }),
    { name: 'zynk-audio-settings' },
  ),
);

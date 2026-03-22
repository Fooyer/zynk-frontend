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

  // Notificações
  notifSound: boolean;
  notifPush: boolean;
  notifVolume: number;  // 0–1

  // Ações
  setInputDevice: (id: string) => void;
  setOutputDevice: (id: string) => void;
  setInputVolume: (v: number) => void;
  setNoiseSuppression: (v: NoiseSuppression) => void;
  setEchoCancellation: (v: boolean) => void;
  setAutoGainControl: (v: boolean) => void;
  setNotifSound: (v: boolean) => void;
  setNotifPush: (v: boolean) => void;
  setNotifVolume: (v: number) => void;
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

      notifSound: true,
      notifPush: true,
      notifVolume: 0.5,

      setInputDevice: (inputDeviceId) => set({ inputDeviceId }),
      setOutputDevice: (outputDeviceId) => set({ outputDeviceId }),
      setInputVolume: (inputVolume) => set({ inputVolume }),
      setNoiseSuppression: (noiseSuppression) => set({ noiseSuppression }),
      setEchoCancellation: (echoCancellation) => set({ echoCancellation }),
      setAutoGainControl: (autoGainControl) => set({ autoGainControl }),
      setNotifSound: (notifSound) => set({ notifSound }),
      setNotifPush: (notifPush) => set({ notifPush }),
      setNotifVolume: (notifVolume) => set({ notifVolume }),
    }),
    { name: 'zynk-audio-settings' },
  ),
);

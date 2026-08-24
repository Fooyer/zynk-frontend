import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  // Dispositivos
  inputDeviceId: string;   // '' = padrão do sistema
  outputDeviceId: string;  // '' = padrão do sistema

  // Áudio
  inputVolume: number;       // 0–2 (0–200%)
  noiseSuppression: boolean; // liga/desliga só — RNNoise contínuo, sem níveis
  echoCancellation: boolean;
  autoGainControl: boolean;
  // Isolamento de voz — atenua (não corta) o que sobra de ruído de fundo
  // depois do RNNoise, principalmente nas pausas entre falas. Complementa a
  // supressão de ruído, não substitui — só roda dentro do mesmo pipeline
  // (exige noiseSuppression ligado).
  noiseGateEnabled: boolean;
  noiseGateAuto: boolean;    // true = calibra o piso de ruído sozinho; false = usa noiseGateThreshold
  noiseGateThreshold: number; // dB, só usado quando noiseGateAuto=false (ex.: -40)

  // Notificações
  notifSound: boolean;
  notifPush: boolean;
  notifVolume: number;  // 0–1

  // "Assistir junto" (YouTube) — volume do player (mini flutuante ou grande,
  // são o mesmo valor) salvo como padrão pro próximo vídeo/sessão.
  watchTogetherVolume: number; // 0–100

  // Ações
  setInputDevice: (id: string) => void;
  setOutputDevice: (id: string) => void;
  setInputVolume: (v: number) => void;
  setNoiseSuppression: (v: boolean) => void;
  setEchoCancellation: (v: boolean) => void;
  setAutoGainControl: (v: boolean) => void;
  setNoiseGateEnabled: (v: boolean) => void;
  setNoiseGateAuto: (v: boolean) => void;
  setNoiseGateThreshold: (v: number) => void;
  setNotifSound: (v: boolean) => void;
  setNotifPush: (v: boolean) => void;
  setNotifVolume: (v: number) => void;
  setWatchTogetherVolume: (v: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      inputDeviceId: '',
      outputDeviceId: '',
      inputVolume: 1,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      noiseGateEnabled: true,
      noiseGateAuto: true,
      noiseGateThreshold: -40,

      notifSound: true,
      notifPush: true,
      notifVolume: 0.5,

      watchTogetherVolume: 80,

      setInputDevice: (inputDeviceId) => set({ inputDeviceId }),
      setOutputDevice: (outputDeviceId) => set({ outputDeviceId }),
      setInputVolume: (inputVolume) => set({ inputVolume }),
      setNoiseSuppression: (noiseSuppression) => set({ noiseSuppression }),
      setEchoCancellation: (echoCancellation) => set({ echoCancellation }),
      setAutoGainControl: (autoGainControl) => set({ autoGainControl }),
      setNoiseGateEnabled: (noiseGateEnabled) => set({ noiseGateEnabled }),
      setNoiseGateAuto: (noiseGateAuto) => set({ noiseGateAuto }),
      setNoiseGateThreshold: (noiseGateThreshold) => set({ noiseGateThreshold }),
      setNotifSound: (notifSound) => set({ notifSound }),
      setNotifPush: (notifPush) => set({ notifPush }),
      setNotifVolume: (notifVolume) => set({ notifVolume }),
      setWatchTogetherVolume: (watchTogetherVolume) => set({ watchTogetherVolume }),
    }),
    {
      name: 'zynk-audio-settings',
      version: 1,
      // v0 guardava 'off'|'low'|'medium'|'high' — converte pro liga/desliga novo.
      migrate: (persisted: any, version) => {
        if (version === 0 && persisted && typeof persisted.noiseSuppression === 'string') {
          persisted.noiseSuppression = persisted.noiseSuppression !== 'off';
        }
        return persisted;
      },
    },
  ),
);

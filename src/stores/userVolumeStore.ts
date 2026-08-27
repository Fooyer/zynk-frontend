import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserVolumeState {
  // Volume local por usuário (0-200%, 100 = padrão) — só afeta o que EU
  // escuto dessa pessoa, nunca é broadcast. Persiste pra sempre (localStorage),
  // igual ao Discord: ajustou uma vez, aplica em toda call futura com ela.
  volumes: Record<number, number>;
  setVolume: (userId: number, pct: number) => void;
  getVolume: (userId: number) => number;
}

export const useUserVolumeStore = create<UserVolumeState>()(
  persist(
    (set, get) => ({
      volumes: {},
      setVolume: (userId, pct) => {
        const clamped = Math.min(200, Math.max(0, Math.round(pct)));
        set((state) => ({ volumes: { ...state.volumes, [userId]: clamped } }));
      },
      getVolume: (userId) => get().volumes[userId] ?? 100,
    }),
    { name: 'zynk-user-volumes' },
  ),
);

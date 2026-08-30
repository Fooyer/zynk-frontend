import type { WatchTogetherState } from '../types';

// Compartilhado entre useYouTubeSync e useDirectVideoSync — os dois motores
// precisam corrigir deriva do mesmo jeito, senão trocar de fonte no meio da
// sessão (YouTube → link direto ou vice-versa) muda a sensação de sync.
export const DRIFT_THRESHOLD_SEC = 1.5;

export function expectedPosition(state: WatchTogetherState): number {
  if (!state.isPlaying) return state.positionSec;
  return state.positionSec + (Date.now() - state.updatedAtMs) / 1000;
}

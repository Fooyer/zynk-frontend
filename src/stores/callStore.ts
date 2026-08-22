import { create } from 'zustand';
import type { CallMode } from '../types';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active';

interface CallState {
  status: CallStatus;
  peerId: number | null;
  peerUsername: string | null;
  channelId: number | null;
  mode: CallMode;
  pendingOffer: RTCSessionDescriptionInit | null;
  isMuted: boolean;
  volume: number;
  isScreenSharing: boolean;
  remoteHasScreen: boolean;
  // Compartilhamento de só o áudio do sistema (sem vídeo) — mutuamente
  // exclusivo com isScreenSharing (um desliga o outro na UI).
  isSharingAudio: boolean;
  // Timestamp de início da chamada — fica na store (não em estado local de
  // componente) porque a barra flutuante e o painel inline montam/desmontam
  // conforme a navegação, e um estado local reiniciaria o cronômetro do zero.
  callStartedAt: number | null;

  initCall: (peerId: number, peerUsername: string, channelId: number, mode?: CallMode) => void;
  receiveCall: (from: { id: number; username: string }, channelId: number, offer: RTCSessionDescriptionInit, mode?: CallMode) => void;
  setActive: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setScreenSharing: (v: boolean) => void;
  setSharingAudio: (v: boolean) => void;
  setRemoteHasScreen: (v: boolean) => void;
  reset: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  status: 'idle',
  peerId: null,
  peerUsername: null,
  channelId: null,
  mode: 'normal',
  pendingOffer: null,
  isMuted: false,
  volume: 1,
  isScreenSharing: false,
  remoteHasScreen: false,
  isSharingAudio: false,
  callStartedAt: null,

  initCall: (peerId, peerUsername, channelId, mode = 'normal') =>
    set({ status: 'calling', peerId, peerUsername, channelId, mode, callStartedAt: null }),

  receiveCall: (from, channelId, offer, mode = 'normal') =>
    set({ status: 'ringing', peerId: from.id, peerUsername: from.username, channelId, pendingOffer: offer, mode, callStartedAt: null }),

  setActive: () => set({ status: 'active', pendingOffer: null, callStartedAt: Date.now() }),
  setMuted: (isMuted) => set({ isMuted }),
  setVolume: (volume) => set({ volume }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setSharingAudio: (isSharingAudio) => set({ isSharingAudio }),
  setRemoteHasScreen: (remoteHasScreen) => set({ remoteHasScreen }),
  reset: () => set({
    status: 'idle', peerId: null, peerUsername: null, channelId: null, mode: 'normal',
    pendingOffer: null, isMuted: false, volume: 1, isScreenSharing: false, remoteHasScreen: false,
    isSharingAudio: false, callStartedAt: null,
  }),
}));

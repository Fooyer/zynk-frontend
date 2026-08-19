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

  initCall: (peerId: number, peerUsername: string, channelId: number, mode?: CallMode) => void;
  receiveCall: (from: { id: number; username: string }, channelId: number, offer: RTCSessionDescriptionInit, mode?: CallMode) => void;
  setActive: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setScreenSharing: (v: boolean) => void;
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

  initCall: (peerId, peerUsername, channelId, mode = 'normal') =>
    set({ status: 'calling', peerId, peerUsername, channelId, mode }),

  receiveCall: (from, channelId, offer, mode = 'normal') =>
    set({ status: 'ringing', peerId: from.id, peerUsername: from.username, channelId, pendingOffer: offer, mode }),

  setActive: () => set({ status: 'active', pendingOffer: null }),
  setMuted: (isMuted) => set({ isMuted }),
  setVolume: (volume) => set({ volume }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setRemoteHasScreen: (remoteHasScreen) => set({ remoteHasScreen }),
  reset: () => set({
    status: 'idle', peerId: null, peerUsername: null, channelId: null, mode: 'normal',
    pendingOffer: null, isMuted: false, volume: 1, isScreenSharing: false, remoteHasScreen: false,
  }),
}));

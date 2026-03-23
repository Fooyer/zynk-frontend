import { create } from 'zustand';

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'active';

interface CallState {
  status: CallStatus;
  peerId: number | null;
  peerUsername: string | null;
  channelId: number | null;
  pendingOffer: RTCSessionDescriptionInit | null;
  isMuted: boolean;
  volume: number;
  isScreenSharing: boolean;
  remoteHasScreen: boolean;
  isGamepadSharing: boolean;
  remoteHasGamepad: boolean;

  initCall: (peerId: number, peerUsername: string, channelId: number) => void;
  receiveCall: (from: { id: number; username: string }, channelId: number, offer: RTCSessionDescriptionInit) => void;
  setActive: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  setScreenSharing: (v: boolean) => void;
  setRemoteHasScreen: (v: boolean) => void;
  setGamepadSharing: (v: boolean) => void;
  setRemoteHasGamepad: (v: boolean) => void;
  reset: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  status: 'idle',
  peerId: null,
  peerUsername: null,
  channelId: null,
  pendingOffer: null,
  isMuted: false,
  volume: 1,
  isScreenSharing: false,
  remoteHasScreen: false,
  isGamepadSharing: false,
  remoteHasGamepad: false,

  initCall: (peerId, peerUsername, channelId) =>
    set({ status: 'calling', peerId, peerUsername, channelId }),

  receiveCall: (from, channelId, offer) =>
    set({ status: 'ringing', peerId: from.id, peerUsername: from.username, channelId, pendingOffer: offer }),

  setActive: () => set({ status: 'active', pendingOffer: null }),
  setMuted: (isMuted) => set({ isMuted }),
  setVolume: (volume) => set({ volume }),
  setScreenSharing: (isScreenSharing) => set({ isScreenSharing }),
  setRemoteHasScreen: (remoteHasScreen) => set({ remoteHasScreen }),
  setGamepadSharing: (isGamepadSharing) => set({ isGamepadSharing }),
  setRemoteHasGamepad: (remoteHasGamepad) => set({ remoteHasGamepad }),
  reset: () => set({
    status: 'idle', peerId: null, peerUsername: null, channelId: null,
    pendingOffer: null, isMuted: false, volume: 1, isScreenSharing: false, remoteHasScreen: false,
    isGamepadSharing: false, remoteHasGamepad: false,
  }),
}));

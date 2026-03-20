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

  initCall: (peerId: number, peerUsername: string, channelId: number) => void;
  receiveCall: (from: { id: number; username: string }, channelId: number, offer: RTCSessionDescriptionInit) => void;
  setActive: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
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

  initCall: (peerId, peerUsername, channelId) =>
    set({ status: 'calling', peerId, peerUsername, channelId }),

  receiveCall: (from, channelId, offer) =>
    set({ status: 'ringing', peerId: from.id, peerUsername: from.username, channelId, pendingOffer: offer }),

  setActive: () => set({ status: 'active', pendingOffer: null }),
  setMuted: (isMuted) => set({ isMuted }),
  setVolume: (volume) => set({ volume }),
  reset: () => set({ status: 'idle', peerId: null, peerUsername: null, channelId: null, pendingOffer: null, isMuted: false, volume: 1 }),
}));

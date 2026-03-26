import { create } from 'zustand';
import { gameSessionsAPI } from '../services/api';
import type { GameSession, GameSessionParticipant } from '../types';

interface GameSessionState {
  activeSession: GameSession | null;
  isLoading: boolean;

  createSession: (groupId: number, title?: string, maxPlayers?: number) => Promise<GameSession>;
  joinSession: (sessionId: number) => Promise<void>;
  leaveSession: (sessionId: number) => Promise<void>;
  endSession: (sessionId: number) => Promise<void>;
  loadActiveSession: (groupId: number) => Promise<void>;
  setActiveSession: (session: GameSession | null) => void;
  addParticipant: (participant: GameSessionParticipant) => void;
  removeParticipant: (userId: number) => void;
}

export const useGameSessionStore = create<GameSessionState>((set, get) => ({
  activeSession: null,
  isLoading: false,

  createSession: async (groupId, title, maxPlayers) => {
    const { data } = await gameSessionsAPI.create({ groupId, title, maxPlayers });
    set({ activeSession: data });
    return data;
  },

  joinSession: async (sessionId) => {
    await gameSessionsAPI.join(sessionId);
    const { data } = await gameSessionsAPI.get(sessionId);
    set({ activeSession: data });
  },

  leaveSession: async (sessionId) => {
    await gameSessionsAPI.leave(sessionId);
    set({ activeSession: null });
  },

  endSession: async (sessionId) => {
    await gameSessionsAPI.end(sessionId);
    set({ activeSession: null });
  },

  loadActiveSession: async (groupId) => {
    set({ isLoading: true });
    try {
      const { data } = await gameSessionsAPI.getActive(groupId);
      set({ activeSession: data && data.id ? data : null });
    } catch {
      set({ activeSession: null });
    } finally {
      set({ isLoading: false });
    }
  },

  setActiveSession: (session) => set({ activeSession: session }),

  addParticipant: (participant) => {
    const session = get().activeSession;
    if (!session) return;
    set({
      activeSession: {
        ...session,
        participants: [...session.participants, participant],
      },
    });
  },

  removeParticipant: (userId) => {
    const session = get().activeSession;
    if (!session) return;
    set({
      activeSession: {
        ...session,
        participants: session.participants.filter((p) => p.userId !== userId),
      },
    });
  },
}));

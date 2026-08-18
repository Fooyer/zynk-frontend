import { create } from 'zustand';
import { authAPI, usersAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import type { User } from '../types';
import { useChatStore } from './chatStore';
import { useFriendStore } from './friendStore';
import { useUiStore } from './uiStore';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  updateUsername: (username: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.login({ username, password });
      localStorage.setItem('token', data.accessToken);
      set({ token: data.accessToken, user: data.user as User, isLoading: false });
      connectSocket();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao fazer login';
      set({ error: msg, isLoading: false });
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await authAPI.register({ username, email, password });
      localStorage.setItem('token', data.accessToken);
      set({ token: data.accessToken, user: data.user as User, isLoading: false });
      connectSocket();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao registrar';
      set({ error: msg, isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    disconnectSocket();
    // Limpa todos os stores para não vazar dados entre contas
    useChatStore.setState({ messagesByChannel: {}, cursors: {}, hasMore: {}, typingUsers: {} });
    useFriendStore.setState({ friends: [], requests: [], sent: [], dmChannels: [], activeDmChannelId: null, error: null });
    useUiStore.setState({ view: 'home' });
    set({ user: null, token: null });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    set({ isLoading: true });
    try {
      const { data } = await authAPI.me();
      set({ user: data, isLoading: false });
      connectSocket();
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isLoading: false });
    }
  },

  updateUsername: async (username) => {
    const { data } = await usersAPI.updateMe({ username });
    localStorage.setItem('token', data.accessToken);
    // O token novo carrega o username atualizado (usado pelo gateway de socket),
    // então reconecta pra refletir a mudança em tempo real (voz, presença, etc).
    disconnectSocket();
    set((s) => ({
      token: data.accessToken,
      user: s.user ? { ...s.user, username: data.user.username } : (data.user as User),
    }));
    connectSocket();
  },

  clearError: () => set({ error: null }),
}));

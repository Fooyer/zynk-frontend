import { create } from 'zustand';
import { authAPI } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

/**
 * Store de autenticação.
 * 
 * Por que Zustand?
 * - API mínima (~1KB), zero boilerplate
 * - Selectors automáticos (re-render só quando muda o que o componente usa)
 * - Sem providers/context wrappers
 */
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

  clearError: () => set({ error: null }),
}));

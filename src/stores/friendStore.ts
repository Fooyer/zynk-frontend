import { create } from 'zustand';
import { friendsAPI, channelsAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useChatStore } from './chatStore';
import { useUnreadStore } from './unreadStore';
import type { FriendEntry, FriendRequest, SentRequest, DmChannel } from '../types';

interface FriendState {
  friends: FriendEntry[];
  requests: FriendRequest[];
  sent: SentRequest[];
  dmChannels: DmChannel[];
  activeDmChannelId: number | null;
  isLoading: boolean;
  isDmLoading: boolean;
  error: string | null;

  loadAll: () => Promise<void>;
  loadDmChannels: () => Promise<void>;
  openDm: (targetUserId: number) => Promise<number>;
  closeDm: (channelId: number) => Promise<void>;
  setActiveDm: (channelId: number | null) => void;
  updateFriendStatus: (userId: number, status: string) => void;
  updateFriendIdentity: (userId: number, username: string) => void;
  isFriend: (userId: number) => boolean;
  sendRequest: (username: string, tag: string) => Promise<void>;
  sendRequestByUserId: (userId: number) => Promise<void>;
  accept: (id: number) => Promise<void>;
  reject: (id: number) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearError: () => void;
}

// Guarda contra chamadas concorrentes de openDm para o mesmo usuário
const pendingOpenDm = new Map<number, Promise<number>>();

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  requests: [],
  sent: [],
  dmChannels: [],
  activeDmChannelId: null,
  isLoading: false,
  isDmLoading: false,
  error: null,

  loadAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [friendsRes, requestsRes, sentRes] = await Promise.all([
        friendsAPI.listFriends(),
        friendsAPI.listRequests(),
        friendsAPI.listSent(),
      ]);
      set({ friends: friendsRes.data, requests: requestsRes.data, sent: sentRes.data, isLoading: false });
    } catch {
      set({ isLoading: false, error: 'Erro ao carregar amigos' });
    }
  },

  loadDmChannels: async () => {
    set({ isDmLoading: true });
    try {
      const { data } = await channelsAPI.getDmChannels();
      set({ dmChannels: data, isDmLoading: false });
    } catch {
      set({ isDmLoading: false });
    }
  },

  openDm: async (targetUserId: number): Promise<number> => {
    // Evita criar múltiplos DMs com o mesmo usuário por cliques rápidos
    if (pendingOpenDm.has(targetUserId)) {
      return pendingOpenDm.get(targetUserId)!;
    }

    const promise = (async () => {
      const { data } = await channelsAPI.openDM(targetUserId);
      const channelId = data.channelId;

      await useChatStore.getState().loadMessages(channelId);

      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('channel:join', { channelId });
      }

      await get().loadDmChannels();

      set({ activeDmChannelId: channelId });
      useUnreadStore.getState().clear(channelId);
      return channelId;
    })().finally(() => pendingOpenDm.delete(targetUserId));

    pendingOpenDm.set(targetUserId, promise);
    return promise;
  },

  closeDm: async (channelId) => {
    // Otimista — some da lista na hora; se a chamada falhar, na pior das
    // hipóteses a conversa reaparece no próximo loadDmChannels().
    set((s) => ({
      dmChannels: s.dmChannels.filter((d) => d.channelId !== channelId),
      activeDmChannelId: s.activeDmChannelId === channelId ? null : s.activeDmChannelId,
    }));
    try {
      await channelsAPI.closeDM(channelId);
    } catch {
      // Silencioso — fechar conversa nunca deve travar a UI
    }
  },

  updateFriendStatus: (userId, status) => {
    set((s) => ({
      friends: s.friends.map((f) =>
        Number(f.friend.id) === Number(userId) ? { ...f, friend: { ...f.friend, status: status as any } } : f,
      ),
      dmChannels: s.dmChannels.map((d) =>
        Number(d.friend.id) === Number(userId) ? { ...d, friend: { ...d.friend, status: status as any } } : d,
      ),
    }));
  },

  updateFriendIdentity: (userId, username) => {
    set((s) => ({
      friends: s.friends.map((f) =>
        Number(f.friend.id) === Number(userId) ? { ...f, friend: { ...f.friend, username } } : f,
      ),
      dmChannels: s.dmChannels.map((d) =>
        Number(d.friend.id) === Number(userId) ? { ...d, friend: { ...d.friend, username } } : d,
      ),
    }));
  },

  setActiveDm: (channelId) => {
    set({ activeDmChannelId: channelId });
    if (channelId) {
      useChatStore.getState().loadMessages(channelId);
      useUnreadStore.getState().clear(channelId);
    }
  },

  isFriend: (userId) => get().friends.some((f) => Number(f.friend.id) === Number(userId)),

  sendRequest: async (username, tag) => {
    set({ error: null });
    try {
      await friendsAPI.sendRequest(username, tag);
      await get().loadAll();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao enviar solicitação';
      set({ error: Array.isArray(msg) ? msg.join(', ') : msg });
      throw err;
    }
  },

  sendRequestByUserId: async (userId) => {
    set({ error: null });
    try {
      await friendsAPI.sendRequestByUserId(userId);
      await get().loadAll();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao enviar solicitação';
      set({ error: Array.isArray(msg) ? msg.join(', ') : msg });
      throw err;
    }
  },

  accept: async (id) => {
    try {
      await friendsAPI.accept(id);
      await get().loadAll();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao aceitar solicitação';
      set({ error: Array.isArray(msg) ? msg.join(', ') : msg });
    }
  },

  reject: async (id) => {
    try {
      await friendsAPI.reject(id);
      await get().loadAll();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao recusar solicitação';
      set({ error: Array.isArray(msg) ? msg.join(', ') : msg });
    }
  },

  remove: async (id) => {
    try {
      await friendsAPI.remove(id);
      await get().loadAll();
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Erro ao remover amigo';
      set({ error: Array.isArray(msg) ? msg.join(', ') : msg });
    }
  },

  clearError: () => set({ error: null }),
}));

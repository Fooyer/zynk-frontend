import { create } from 'zustand';
import { channelsAPI } from '../services/api';
import type { Channel, ChannelMember } from '../types';

interface ChannelState {
  channels: Channel[];
  activeChannelId: number | null;
  members: ChannelMember[];
  isLoading: boolean;
  discoverChannels: Channel[];
  isLoadingDiscover: boolean;

  loadChannels: () => Promise<void>;
  setActiveChannel: (channelId: number) => Promise<void>;
  reloadMembers: () => Promise<void>;
  updateMemberStatus: (userId: number, status: string) => void;
  createChannel: (name: string, description?: string) => Promise<Channel>;
  joinChannel: (channelId: number) => Promise<void>;
  loadDiscoverChannels: () => Promise<void>;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  activeChannelId: null,
  members: [],
  isLoading: false,
  discoverChannels: [],
  isLoadingDiscover: false,

  loadChannels: async () => {
    set({ isLoading: true });
    try {
      const { data } = await channelsAPI.list();
      set({ channels: data, isLoading: false });

      // Se não tem canal ativo, seleciona o primeiro
      if (!get().activeChannelId && data.length > 0) {
        get().setActiveChannel(data[0].id);
      }
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveChannel: async (channelId) => {
    set({ activeChannelId: channelId });

    // Carrega membros do canal
    try {
      const { data } = await channelsAPI.members(channelId);
      set({ members: data });
    } catch {
      set({ members: [] });
    }
  },

  reloadMembers: async () => {
    const channelId = get().activeChannelId;
    if (!channelId) return;
    try {
      const { data } = await channelsAPI.members(channelId);
      set({ members: data });
    } catch {
      // silencioso
    }
  },

  updateMemberStatus: (userId, status) => {
    set((s) => ({
      members: s.members.map((m) =>
        Number(m.user.id) === Number(userId) ? { ...m, user: { ...m.user, status: status as any } } : m,
      ),
    }));
  },

  createChannel: async (name, description) => {
    const { data } = await channelsAPI.create({ name, description });
    set((state) => ({ channels: [...state.channels, data] }));
    return data;
  },

  joinChannel: async (channelId) => {
    await channelsAPI.join(channelId);
    await get().loadChannels();
  },

  loadDiscoverChannels: async () => {
    set({ isLoadingDiscover: true });
    try {
      const { data } = await channelsAPI.discover();
      set({ discoverChannels: data, isLoadingDiscover: false });
    } catch {
      set({ isLoadingDiscover: false });
    }
  },
}));

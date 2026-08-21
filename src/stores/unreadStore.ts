import { create } from 'zustand';

interface UnreadState {
  // Mensagens não lidas por canal (DM ou canal de texto de grupo)
  counts: Record<number, number>;
  // channelId -> groupId, só para canais de texto de grupo (permite somar por servidor)
  channelGroup: Record<number, number>;

  increment: (channelId: number) => void;
  clear: (channelId: number) => void;
  registerChannels: (channelIds: number[], groupId: number) => void;
}

export const useUnreadStore = create<UnreadState>((set) => ({
  counts: {},
  channelGroup: {},

  increment: (channelId) =>
    set((s) => ({ counts: { ...s.counts, [channelId]: (s.counts[channelId] ?? 0) + 1 } })),

  clear: (channelId) =>
    set((s) => {
      if (!s.counts[channelId]) return s;
      const counts = { ...s.counts };
      delete counts[channelId];
      return { counts };
    }),

  registerChannels: (channelIds, groupId) =>
    set((s) => {
      const channelGroup = { ...s.channelGroup };
      for (const id of channelIds) channelGroup[id] = groupId;
      return { channelGroup };
    }),
}));

import { create } from 'zustand';
import { pollsAPI } from '../services/api';
import { getSocket } from '../services/socket';
import type { Poll } from '../types';

interface PollState {
  pollsByChannel: Record<number, Poll[]>;
  isLoaded: Record<number, boolean>;

  loadPolls: (channelId: number) => Promise<void>;
  upsertPoll: (poll: Poll) => void;
  createPoll: (channelId: number, question: string, options: string[], allowMultiple: boolean) => Promise<void>;
  vote: (pollId: number, optionId: number) => Promise<void>;
  closePoll: (pollId: number) => Promise<void>;
  reopenPoll: (pollId: number) => Promise<void>;
  deletePoll: (pollId: number) => Promise<void>;
  removePoll: (channelId: number, pollId: number) => void;
}

export const usePollStore = create<PollState>((set, get) => ({
  pollsByChannel: {},
  isLoaded: {},

  loadPolls: async (channelId) => {
    if (get().isLoaded[channelId]) return;
    try {
      const { data } = await pollsAPI.getByChannel(channelId);
      set((state) => ({
        pollsByChannel: { ...state.pollsByChannel, [channelId]: data },
        isLoaded: { ...state.isLoaded, [channelId]: true },
      }));
    } catch {
      // Silencioso — canal sem enquetes/erro de rede não deve travar o chat
    }
  },

  upsertPoll: (poll) => {
    set((state) => {
      const existing = state.pollsByChannel[poll.channelId] || [];
      const idx = existing.findIndex((p) => p.id === poll.id);
      const next = idx >= 0 ? existing.map((p, i) => (i === idx ? poll : p)) : [...existing, poll];
      return { pollsByChannel: { ...state.pollsByChannel, [poll.channelId]: next } };
    });
  },

  createPoll: async (channelId, question, options, allowMultiple) => {
    const { data } = await pollsAPI.create(channelId, { question, options, allowMultiple });
    get().upsertPoll(data);
    getSocket().emit('poll:created', { channelId, poll: data });
  },

  vote: async (pollId, optionId) => {
    const { data } = await pollsAPI.vote(pollId, optionId);
    get().upsertPoll(data);
    getSocket().emit('poll:updated', { channelId: data.channelId, poll: data });
  },

  closePoll: async (pollId) => {
    const { data } = await pollsAPI.close(pollId);
    get().upsertPoll(data);
    getSocket().emit('poll:updated', { channelId: data.channelId, poll: data });
  },

  reopenPoll: async (pollId) => {
    const { data } = await pollsAPI.reopen(pollId);
    get().upsertPoll(data);
    getSocket().emit('poll:updated', { channelId: data.channelId, poll: data });
  },

  deletePoll: async (pollId) => {
    const { data } = await pollsAPI.remove(pollId);
    get().removePoll(data.channelId, pollId);
    getSocket().emit('poll:deleted', { channelId: data.channelId, pollId });
  },

  removePoll: (channelId, pollId) => {
    set((state) => ({
      pollsByChannel: {
        ...state.pollsByChannel,
        [channelId]: (state.pollsByChannel[channelId] || []).filter((p) => p.id !== pollId),
      },
    }));
  },
}));

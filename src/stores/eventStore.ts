import { create } from 'zustand';
import { eventsAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useGroupStore } from './groupStore';
import type { ServerEvent } from '../types';

interface EventState {
  events: ServerEvent[];
  isLoaded: boolean;
  // Convite recém-chegado (via socket) que ainda não recebeu resposta —
  // dirige o popup de convite. Só um por vez (fila simples: o próximo só
  // aparece depois que o atual for despachado).
  pendingInvite: ServerEvent | null;

  loadEvents: () => Promise<void>;
  upsertEvent: (event: ServerEvent) => void;
  removeEvent: (eventId: number) => void;
  setPendingInvite: (event: ServerEvent | null) => void;
  createEvent: (
    groupId: number,
    data: { title: string; description?: string; scheduledAt: string; channelKind: 'text' | 'voice'; channelId: number },
  ) => Promise<ServerEvent>;
  respond: (eventId: number, status: 'accepted' | 'declined') => Promise<void>;
  deleteEvent: (eventId: number) => Promise<void>;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  isLoaded: false,
  pendingInvite: null,

  loadEvents: async () => {
    if (get().isLoaded) return;
    try {
      const { data } = await eventsAPI.mine();
      set({ events: data, isLoaded: true });
    } catch {
      // Silencioso — não deve travar o resto do app
    }
  },

  upsertEvent: (event) => {
    set((state) => {
      const idx = state.events.findIndex((e) => e.id === event.id);
      const events = idx >= 0 ? state.events.map((e, i) => (i === idx ? event : e)) : [...state.events, event];
      return { events };
    });
  },

  removeEvent: (eventId) => {
    set((state) => ({ events: state.events.filter((e) => e.id !== eventId) }));
  },

  setPendingInvite: (event) => set({ pendingInvite: event }),

  createEvent: async (groupId, data) => {
    const { data: event } = await eventsAPI.create(groupId, data);
    get().upsertEvent(event);
    const group = useGroupStore.getState().groups.find((g) => g.id === groupId);
    if (group?.channelId) {
      getSocket().emit('event:created', { channelId: group.channelId, event });
    }
    return event;
  },

  respond: async (eventId, status) => {
    const { data: event } = await eventsAPI.respond(eventId, status);
    get().upsertEvent(event);
    if (get().pendingInvite?.id === eventId) set({ pendingInvite: null });
  },

  deleteEvent: async (eventId) => {
    const event = get().events.find((e) => e.id === eventId);
    await eventsAPI.remove(eventId);
    get().removeEvent(eventId);
    if (event) {
      const group = useGroupStore.getState().groups.find((g) => g.id === event.groupId);
      if (group?.channelId) {
        getSocket().emit('event:deleted', { channelId: group.channelId, eventId });
      }
    }
  },
}));

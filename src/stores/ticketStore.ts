import { create } from 'zustand';
import { ticketsAPI } from '../services/api';
import type { TicketCard } from '../types';

interface TicketState {
  tickets: TicketCard[];
  isLoaded: boolean;

  loadTickets: () => Promise<void>;
  upsertTicket: (ticket: TicketCard) => void;
  removeTicket: (ticketId: number) => void;
  // myUserId decide se o like/unlike é "meu" (o servidor manda pra todo
  // mundo, mas likedByMe é por pessoa — só quem curtiu de fato muda o seu).
  applyLike: (payload: { ticketId: number; likesCount: number; userId: number; liked: boolean }, myUserId: number | undefined) => void;

  createTicket: (data: { title: string; description?: string; imageUrls?: string[] }) => Promise<TicketCard>;
  updateTicket: (id: number, data: { status?: string; title?: string; description?: string }) => Promise<TicketCard>;
  deleteTicket: (id: number) => Promise<void>;
  toggleLike: (id: number) => Promise<void>;
}

export const useTicketStore = create<TicketState>((set, get) => ({
  tickets: [],
  isLoaded: false,

  loadTickets: async () => {
    if (get().isLoaded) return;
    try {
      const { data } = await ticketsAPI.list();
      set({ tickets: data, isLoaded: true });
    } catch {
      // Silencioso — não deve travar o resto do app
    }
  },

  // Idempotente de propósito: tanto a resposta REST de quem agiu quanto o
  // broadcast do servidor (que alcança todo mundo, incluindo quem agiu)
  // passam por aqui sem duplicar nem regredir estado.
  upsertTicket: (ticket) => {
    set((state) => {
      const idx = state.tickets.findIndex((t) => t.id === ticket.id);
      const tickets = idx >= 0 ? state.tickets.map((t, i) => (i === idx ? ticket : t)) : [ticket, ...state.tickets];
      return { tickets };
    });
  },

  removeTicket: (ticketId) => {
    set((state) => ({ tickets: state.tickets.filter((t) => t.id !== ticketId) }));
  },

  applyLike: (payload, myUserId) => {
    set((state) => ({
      tickets: state.tickets.map((t) => {
        if (t.id !== payload.ticketId) return t;
        const likedByMe = payload.userId === myUserId ? payload.liked : t.likedByMe;
        return { ...t, likesCount: payload.likesCount, likedByMe };
      }),
    }));
  },

  createTicket: async (data) => {
    const { data: ticket } = await ticketsAPI.create(data);
    get().upsertTicket(ticket);
    return ticket;
  },

  updateTicket: async (id, data) => {
    const { data: ticket } = await ticketsAPI.update(id, data);
    get().upsertTicket(ticket);
    return ticket;
  },

  deleteTicket: async (id) => {
    await ticketsAPI.remove(id);
    get().removeTicket(id);
  },

  toggleLike: async (id) => {
    const { data: ticket } = await ticketsAPI.toggleLike(id);
    get().upsertTicket(ticket);
  },
}));

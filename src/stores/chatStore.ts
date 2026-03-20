import { create } from 'zustand';
import { messagesAPI } from '../services/api';
import type { Message, TypingEvent } from '../types';

interface ChatState {
  // Messages por canal — Map-like para evitar re-render desnecessário
  messagesByChannel: Record<number, Message[]>;
  cursors: Record<number, number | null>;
  hasMore: Record<number, boolean>;
  isLoading: boolean;

  // Typing
  typingUsers: Record<number, { userId: number; username: string; timeout: NodeJS.Timeout }[]>;

  // Actions
  loadMessages: (channelId: number) => Promise<void>;
  loadMore: (channelId: number) => Promise<void>;
  addMessage: (message: Message) => void;
  addSystemMessage: (channelId: number, content: string) => void;
  setTyping: (event: TypingEvent) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByChannel: {},
  cursors: {},
  hasMore: {},
  isLoading: false,
  typingUsers: {},

  /**
   * Carrega as mensagens iniciais de um canal.
   * Se já carregou, não recarrega (cache local).
   */
  loadMessages: async (channelId) => {
    // Se já tem mensagens desse canal, não recarrega
    if (get().messagesByChannel[channelId]?.length) return;

    set({ isLoading: true });
    try {
      const { data } = await messagesAPI.list(channelId);
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          // Inverte: API retorna DESC, UI mostra ASC (mais antigo em cima)
          [channelId]: data.messages.reverse(),
        },
        cursors: { ...state.cursors, [channelId]: data.nextCursor },
        hasMore: { ...state.hasMore, [channelId]: data.hasMore },
        isLoading: false,
      }));
    } catch {
      set({ isLoading: false });
    }
  },

  /**
   * Carrega mensagens mais antigas (scroll up).
   */
  loadMore: async (channelId) => {
    const cursor = get().cursors[channelId];
    if (!cursor || !get().hasMore[channelId]) return;

    try {
      const { data } = await messagesAPI.list(channelId, cursor);
      set((state) => ({
        messagesByChannel: {
          ...state.messagesByChannel,
          // Prepend: mensagens antigas vão no início
          [channelId]: [...data.messages.reverse(), ...(state.messagesByChannel[channelId] || [])],
        },
        cursors: { ...state.cursors, [channelId]: data.nextCursor },
        hasMore: { ...state.hasMore, [channelId]: data.hasMore },
      }));
    } catch {
      // Silencioso
    }
  },

  /**
   * Adiciona mensagem nova (do socket).
   */
  addMessage: (message) => {
    set((state) => {
      const existing = state.messagesByChannel[message.channelId] || [];
      // Evita duplicatas (pode acontecer em reconexão)
      if (existing.some((m) => m.id === message.id)) return state;

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [message.channelId]: [...existing, message],
        },
      };
    });
  },

  /**
   * Adiciona uma mensagem local de sistema (ex: "Chamada iniciada").
   */
  addSystemMessage: (channelId, content) => {
    const systemMessage: Message = {
      id: -Date.now(),
      content,
      channelId,
      senderId: 0,
      createdAt: new Date().toISOString(),
      sender: { id: 0, username: '', avatarUrl: null },
      isSystem: true,
    };
    set((state) => {
      const existing = state.messagesByChannel[channelId] || [];
      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [channelId]: [...existing, systemMessage],
        },
      };
    });
  },

  /**
   * Gerencia typing indicator com timeout automático.
   */
  setTyping: (event) => {
    set((state) => {
      const channelTyping = [...(state.typingUsers[event.channelId] || [])];

      // Remove entrada antiga do mesmo user
      const existingIdx = channelTyping.findIndex((t) => t.userId === event.userId);
      if (existingIdx >= 0) {
        clearTimeout(channelTyping[existingIdx].timeout);
        channelTyping.splice(existingIdx, 1);
      }

      // Adiciona com timeout de 3s
      const timeout = setTimeout(() => {
        set((s) => ({
          typingUsers: {
            ...s.typingUsers,
            [event.channelId]: (s.typingUsers[event.channelId] || []).filter(
              (t) => t.userId !== event.userId,
            ),
          },
        }));
      }, 3000);

      channelTyping.push({ userId: event.userId, username: event.username, timeout });

      return {
        typingUsers: { ...state.typingUsers, [event.channelId]: channelTyping },
      };
    });
  },

  clearMessages: () => {
    set({ messagesByChannel: {}, cursors: {}, hasMore: {} });
  },
}));

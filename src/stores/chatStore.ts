import { create } from 'zustand';
import { messagesAPI } from '../services/api';
import type { Message, TypingEvent } from '../types';

// Máximo de mensagens mantidas em memória por canal — acima disso, a ponta
// mais distante da posição atual de leitura é descartada (igual ao Discord:
// abrir um histórico antigo não empilha infinitamente as mensagens recentes
// já vistas, e vice-versa).
const WINDOW_SIZE = 150;

interface ChatState {
  // Messages por canal — Map-like para evitar re-render desnecessário
  messagesByChannel: Record<number, Message[]>;
  cursors: Record<number, number | null>;
  hasMore: Record<number, boolean>;
  // true = a ponta recente (mais nova) deste canal foi descartada da memória
  // pra caber na janela — o array carregado não chega mais até "agora".
  // Enquanto true, mensagens novas do socket não são anexadas (deixariam um
  // buraco no meio do histórico) e a UI deve oferecer "voltar ao recente".
  hasNewer: Record<number, boolean>;
  isLoading: Record<number, boolean>;
  isLoadingMore: Record<number, boolean>;

  // Typing
  typingUsers: Record<number, { userId: number; username: string; timeout: NodeJS.Timeout }[]>;

  // Reply — por canal: sem isso, iniciar uma resposta num canal e trocar de
  // conversa sem cancelar fazia o banner (e o replyToId enviado) vazarem
  // pra dentro da conversa errada.
  replyingTo: Record<number, Message | null>;

  // Incrementado sempre que uma ação em outro componente (ex: salvar/cancelar
  // edição de mensagem) deve devolver o foco ao campo de digitação principal.
  composerFocusTick: number;

  // Actions
  loadMessages: (channelId: number) => Promise<void>;
  loadMore: (channelId: number) => Promise<void>;
  /** Descarta a janela carregada e busca a página mais recente de novo — "voltar ao presente". */
  jumpToLatest: (channelId: number) => Promise<void>;
  addMessage: (message: Message) => void;
  updateMessage: (message: Message) => void;
  removeMessage: (channelId: number, messageId: number) => void;
  addSystemMessage: (channelId: number, content: string) => void;
  setTyping: (event: TypingEvent) => void;
  setReplyingTo: (channelId: number, message: Message | null) => void;
  focusComposer: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messagesByChannel: {},
  cursors: {},
  hasMore: {},
  hasNewer: {},
  isLoading: {},
  isLoadingMore: {},
  typingUsers: {},
  replyingTo: {},
  composerFocusTick: 0,

  /**
   * Carrega as mensagens iniciais de um canal.
   * Se já carregou, não recarrega (cache local).
   */
  loadMessages: async (channelId) => {
    // Se já tem mensagens desse canal, não recarrega
    if (get().messagesByChannel[channelId]?.length) return;

    set((state) => ({ isLoading: { ...state.isLoading, [channelId]: true } }));
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
        hasNewer: { ...state.hasNewer, [channelId]: false },
        isLoading: { ...state.isLoading, [channelId]: false },
      }));
    } catch {
      set((state) => ({ isLoading: { ...state.isLoading, [channelId]: false } }));
    }
  },

  /**
   * Carrega mensagens mais antigas (scroll up).
   *
   * Reentrância: scroll dispara vários eventos por segundo, e sem uma trava
   * por canal aqui, cada um deles chamava loadMore de novo antes do anterior
   * responder — todos liam o mesmo cursor (ainda não avançou) e prepend'avam
   * a MESMA página, duplicando mensagens no histórico.
   */
  loadMore: async (channelId) => {
    const cursor = get().cursors[channelId];
    if (!cursor || !get().hasMore[channelId] || get().isLoadingMore[channelId]) return;

    set((state) => ({ isLoadingMore: { ...state.isLoadingMore, [channelId]: true } }));
    try {
      const { data } = await messagesAPI.list(channelId, cursor);
      set((state) => {
        const existing = state.messagesByChannel[channelId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const older = data.messages.reverse().filter((m: Message) => !existingIds.has(m.id));
        let merged = [...older, ...existing];

        // Janela cheia: descarta a ponta recente (o usuário está navegando
        // pra trás, longe dela) e marca que este canal não alcança mais "agora".
        let hasNewer = state.hasNewer[channelId] ?? false;
        if (merged.length > WINDOW_SIZE) {
          merged = merged.slice(0, WINDOW_SIZE);
          hasNewer = true;
        }

        return {
          messagesByChannel: { ...state.messagesByChannel, [channelId]: merged },
          cursors: { ...state.cursors, [channelId]: data.nextCursor },
          hasMore: { ...state.hasMore, [channelId]: data.hasMore },
          hasNewer: { ...state.hasNewer, [channelId]: hasNewer },
        };
      });
    } catch {
      // Silencioso
    } finally {
      set((state) => ({ isLoadingMore: { ...state.isLoadingMore, [channelId]: false } }));
    }
  },

  /**
   * "Voltar ao recente" — descarta a janela atual (que pode estar presa lá
   * atrás no histórico) e busca a página mais nova de novo, do zero.
   */
  jumpToLatest: async (channelId) => {
    set((state) => ({ isLoading: { ...state.isLoading, [channelId]: true } }));
    try {
      const { data } = await messagesAPI.list(channelId);
      set((state) => ({
        messagesByChannel: { ...state.messagesByChannel, [channelId]: data.messages.reverse() },
        cursors: { ...state.cursors, [channelId]: data.nextCursor },
        hasMore: { ...state.hasMore, [channelId]: data.hasMore },
        hasNewer: { ...state.hasNewer, [channelId]: false },
        isLoading: { ...state.isLoading, [channelId]: false },
      }));
    } catch {
      set((state) => ({ isLoading: { ...state.isLoading, [channelId]: false } }));
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

      // Canal com a ponta recente descartada da janela (usuário lá atrás no
      // histórico): anexar aqui deixaria um buraco entre o que está carregado
      // e a mensagem nova. Deixa o badge de não lida e o botão "voltar ao
      // recente" cuidarem disso em vez de corromper a linha do tempo.
      if (state.hasNewer[message.channelId]) return state;

      let updated = [...existing, message];
      if (updated.length > WINDOW_SIZE) {
        updated = updated.slice(updated.length - WINDOW_SIZE);
      }

      return {
        messagesByChannel: {
          ...state.messagesByChannel,
          [message.channelId]: updated,
        },
      };
    });
  },

  /**
   * Atualiza uma mensagem existente (edição, própria ou via socket).
   */
  updateMessage: (message) => {
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [message.channelId]: (state.messagesByChannel[message.channelId] || []).map((m) =>
          m.id === message.id ? message : m,
        ),
      },
    }));
  },

  /**
   * Remove uma mensagem (exclusão, própria ou via socket).
   */
  removeMessage: (channelId, messageId) => {
    set((state) => ({
      messagesByChannel: {
        ...state.messagesByChannel,
        [channelId]: (state.messagesByChannel[channelId] || []).filter((m) => m.id !== messageId),
      },
    }));
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

  setReplyingTo: (channelId, message) => {
    set((state) => ({ replyingTo: { ...state.replyingTo, [channelId]: message } }));
  },

  focusComposer: () => {
    set((state) => ({ composerFocusTick: state.composerFocusTick + 1 }));
  },

  clearMessages: () => {
    set({
      messagesByChannel: {},
      cursors: {},
      hasMore: {},
      hasNewer: {},
      isLoading: {},
      isLoadingMore: {},
      replyingTo: {},
    });
  },
}));

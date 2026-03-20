import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import { useChannelStore } from '../stores/channelStore';
import type { Message, TypingEvent, UserStatusEvent } from '../types';

/**
 * Hook que conecta os eventos do Socket.IO às stores.
 * Deve ser usado UMA vez no componente raiz do chat (AppLayout).
 *
 * Centraliza todo o binding de eventos — componentes individuais
 * só leem da store, nunca escutam socket diretamente.
 */
export function useSocket() {
  const addMessage = useChatStore((s) => s.addMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const loadChannels = useChannelStore((s) => s.loadChannels);
  const hasSetup = useRef(false);

  useEffect(() => {
    if (hasSetup.current) return;
    hasSetup.current = true;

    const socket = getSocket();

    // Nova mensagem
    socket.on('message:new', (message: Message) => {
      addMessage(message);
    });

    // Typing
    socket.on('message:typing', (event: TypingEvent) => {
      setTyping(event);
    });

    // Alguém entrou no canal
    socket.on('channel:user_joined', () => {
      loadChannels(); // Recarrega lista de membros
    });

    // Status de usuário mudou
    socket.on('user:status', (_event: UserStatusEvent) => {
      // Futuramente: atualizar na store de membros
    });

    // Erro do servidor
    socket.on('error', (err: { message: string }) => {
      console.error('[Socket Error]', err.message);
    });

    // Eventos de conexão
    socket.on('connect', () => {
      console.log('[Socket] Conectado');
    });

    socket.on('disconnect', (reason: string) => {
      console.log('[Socket] Desconectado:', reason);
    });

    socket.on('reconnect', (attempt: number) => {
      console.log(`[Socket] Reconectado após ${attempt} tentativa(s)`);
    });

    return () => {
      socket.off('message:new');
      socket.off('message:typing');
      socket.off('channel:user_joined');
      socket.off('user:status');
      socket.off('error');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
      hasSetup.current = false;
    };
  }, [addMessage, setTyping, loadChannels]);
}

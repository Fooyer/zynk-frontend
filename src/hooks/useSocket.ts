import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';
import { useChatStore } from '../stores/chatStore';
import { useChannelStore } from '../stores/channelStore';
import { useFriendStore } from '../stores/friendStore';
import type { Message, TypingEvent, UserStatusEvent } from '../types';

export function useSocket() {
  const addMessage = useChatStore((s) => s.addMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const loadChannels = useChannelStore((s) => s.loadChannels);
  const loadDmChannels = useFriendStore((s) => s.loadDmChannels);
  const hasSetup = useRef(false);

  useEffect(() => {
    if (hasSetup.current) return;
    hasSetup.current = true;

    const socket = getSocket();

    socket.on('message:new', (message: Message) => {
      addMessage(message);
    });

    socket.on('message:typing', (event: TypingEvent) => {
      setTyping(event);
    });

    socket.on('channel:user_joined', () => {
      loadChannels();
    });

    // Novo DM aberto pelo outro usuário — recarrega lista de DMs
    socket.on('dm:new', () => {
      loadDmChannels();
    });

    socket.on('user:status', (_event: UserStatusEvent) => {
      // Futuramente: atualizar status na store de membros / amigos
    });

    socket.on('error', (err: { message: string }) => {
      console.error('[Socket Error]', err.message);
    });

    socket.on('connect', () => console.log('[Socket] Conectado'));
    socket.on('disconnect', (reason: string) => console.log('[Socket] Desconectado:', reason));
    socket.on('reconnect', (attempt: number) =>
      console.log(`[Socket] Reconectado após ${attempt} tentativa(s)`),
    );

    return () => {
      socket.off('message:new');
      socket.off('message:typing');
      socket.off('channel:user_joined');
      socket.off('dm:new');
      socket.off('user:status');
      socket.off('error');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
      hasSetup.current = false;
    };
  }, [addMessage, setTyping, loadChannels, loadDmChannels]);
}

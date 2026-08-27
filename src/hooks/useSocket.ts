import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';
import { notifyMessage, requestNotificationPermission } from '../services/notification';
import { useChatStore } from '../stores/chatStore';
import { useFriendStore } from '../stores/friendStore';
import { useGroupStore } from '../stores/groupStore';
import { useUiStore } from '../stores/uiStore';
import { useUnreadStore } from '../stores/unreadStore';
import { usePollStore } from '../stores/pollStore';
import { useEventStore } from '../stores/eventStore';
import { useAuthStore } from '../stores/authStore';
import type { Message, Poll, ServerEvent, TypingEvent, UserStatusEvent } from '../types';

export function useSocket() {
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const removeMessage = useChatStore((s) => s.removeMessage);
  const setTyping = useChatStore((s) => s.setTyping);
  const loadDmChannels = useFriendStore((s) => s.loadDmChannels);
  const updateFriendStatus = useFriendStore((s) => s.updateFriendStatus);
  const updateFriendIdentity = useFriendStore((s) => s.updateFriendIdentity);
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const updateMemberStatus = useGroupStore((s) => s.updateMemberStatus);
  const updateMemberIdentity = useGroupStore((s) => s.updateMemberIdentity);
  const loadMembers = useGroupStore((s) => s.loadMembers);
  const hasSetup = useRef(false);

  useEffect(() => {
    if (hasSetup.current) return;
    hasSetup.current = true;

    const socket = getSocket();

    requestNotificationPermission();

    socket.on('message:new', (message: Message) => {
      addMessage(message);
      notifyMessage(message);
    });

    socket.on('message:typing', (event: TypingEvent) => {
      setTyping(event);
    });

    socket.on('message:updated', (message: Message) => {
      updateMessage(message);
    });

    socket.on('message:deleted', (data: { channelId: number; messageId: number }) => {
      removeMessage(data.channelId, data.messageId);
    });

    // Novo DM aberto pelo outro usuário — recarrega lista de DMs
    socket.on('dm:new', () => {
      loadDmChannels();
    });

    // Fui adicionado a um grupo (ou convidado) enquanto online — antes só
    // aparecia após relogar. O payload do evento é parcial (id/nome/canal),
    // então recarrega a lista inteira em vez de tentar montar o Group na mão.
    socket.on('group:invited', () => {
      loadGroups();
    });

    socket.on('user:status', (event: UserStatusEvent) => {
      // Presença é lida em pelo menos dois lugares diferentes (lista de
      // amigos/DMs e membros do grupo aberto) — sem atualizar os dois, um
      // ficava online numa tela e offline na outra até recarregar.
      updateFriendStatus(event.userId, event.status);
      updateMemberStatus(event.userId, event.status);
    });

    // Alguém mudou o username (Configurações > Conta) — reflete em toda
    // cópia local: lista de amigos/DMs e membros de grupo.
    socket.on('user:identity-updated', (data: { userId: number; username: string }) => {
      updateFriendIdentity(data.userId, data.username);
      updateMemberIdentity(data.userId, data.username);
    });

    // Alguém entrou/saiu de um grupo que já estou vendo — a lista de
    // membros do grupo ativo não se atualizava sozinha antes disso.
    socket.on('group:member-joined', (data: { groupId: number }) => {
      if (useGroupStore.getState().activeGroupId === data.groupId) loadMembers(data.groupId);
    });
    socket.on('group:member-left', (data: { groupId: number }) => {
      if (useGroupStore.getState().activeGroupId === data.groupId) loadMembers(data.groupId);
    });

    // Enquete criada/votada por outro membro do canal
    socket.on('poll:created', (poll: Poll) => usePollStore.getState().upsertPoll(poll));
    socket.on('poll:updated', (poll: Poll) => usePollStore.getState().upsertPoll(poll));
    socket.on('poll:deleted', (data: { channelId: number; pollId: number }) => {
      usePollStore.getState().removePoll(data.channelId, data.pollId);
    });

    // Evento criado num servidor — o payload vem hidratado com o RSVP de
    // quem criou (sempre 'accepted'), não o meu. Pra quem só está recebendo
    // o convite, força myStatus null (evento acabou de ser criado, ninguém
    // além do criador respondeu ainda) e dispara o popup de convite.
    socket.on('event:created', (event: ServerEvent) => {
      const me = useAuthStore.getState().user;
      const isCreator = Number(event.creator.id) === Number(me?.id);
      const normalized: ServerEvent = isCreator ? event : { ...event, myStatus: null };
      useEventStore.getState().upsertEvent(normalized);
      if (!isCreator) useEventStore.getState().setPendingInvite(normalized);
    });
    socket.on('event:deleted', (data: { eventId: number }) => {
      useEventStore.getState().removeEvent(data.eventId);
    });

    socket.on('error', (err: { message: string }) => {
      console.error('[Socket Error]', err.message);
    });

    socket.on('connect', () => console.log('[Socket] Conectado'));
    socket.on('disconnect', (reason: string) => console.log('[Socket] Desconectado:', reason));
    socket.on('reconnect', (attempt: number) =>
      console.log(`[Socket] Reconectado após ${attempt} tentativa(s)`),
    );

    // ── Away detection ─────────────────────────────────────────
    // Marca como "away" após 5 min sem atividade (mouse/teclado/scroll),
    // igual ao Discord — não depende da janela estar em foco ou não.
    const AWAY_TIMEOUT = 5 * 60 * 1000;
    const ACTIVITY_THROTTLE = 15 * 1000;

    let awayTimer: ReturnType<typeof setTimeout> | null = null;
    let isAway = false;
    let lastActivityReset = 0;

    const emitStatus = (status: 'online' | 'away') => {
      if (socket.connected) socket.emit('user:status_update', { status });
    };

    const goAway = () => {
      isAway = true;
      emitStatus('away');
    };

    const resetAwayTimer = () => {
      if (awayTimer) clearTimeout(awayTimer);
      awayTimer = setTimeout(goAway, AWAY_TIMEOUT);
    };

    const onActivity = () => {
      const now = Date.now();

      if (isAway) {
        isAway = false;
        emitStatus('online');

        // Voltou a interagir com a conversa certa já aberta — zera o não
        // lida dela em vez de esperar o usuário trocar de canal.
        const { view } = useUiStore.getState();
        if (view === 'home') {
          const { activeDmChannelId } = useFriendStore.getState();
          if (activeDmChannelId) useUnreadStore.getState().clear(activeDmChannelId);
        } else if (view === 'group') {
          const { activeChannelId } = useGroupStore.getState();
          if (activeChannelId) useUnreadStore.getState().clear(activeChannelId);
        }

        lastActivityReset = now;
        resetAwayTimer();
        return;
      }

      // Throttla os resets: mousemove dispara dezenas de vezes por segundo,
      // não precisamos rearmar o timer a cada evento.
      if (now - lastActivityReset < ACTIVITY_THROTTLE) return;
      lastActivityReset = now;
      resetAwayTimer();
    };

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'focus'] as const;
    activityEvents.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));

    resetAwayTimer();

    return () => {
      socket.off('message:new');
      socket.off('message:typing');
      socket.off('message:updated');
      socket.off('message:deleted');
      socket.off('dm:new');
      socket.off('group:invited');
      socket.off('user:status');
      socket.off('user:identity-updated');
      socket.off('group:member-joined');
      socket.off('group:member-left');
      socket.off('poll:created');
      socket.off('poll:updated');
      socket.off('poll:deleted');
      socket.off('event:created');
      socket.off('event:deleted');
      socket.off('error');
      socket.off('connect');
      socket.off('disconnect');
      socket.off('reconnect');
      activityEvents.forEach((ev) => window.removeEventListener(ev, onActivity));
      if (awayTimer) clearTimeout(awayTimer);
      hasSetup.current = false;
    };
  }, [
    addMessage, updateMessage, removeMessage, setTyping,
    loadDmChannels, updateFriendStatus, updateFriendIdentity,
    loadGroups, updateMemberStatus, updateMemberIdentity, loadMembers,
  ]);
}

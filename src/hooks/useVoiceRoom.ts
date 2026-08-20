import { useEffect, useRef, useState } from 'react';
import { groupsAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { captureScreen } from '../services/screenCapture';
import { alertDialog } from '../stores/dialogStore';
import { ICE_SERVERS } from '../services/iceServers';
import { applyLowLatencySenderParams, withLowLatencyOpus } from '../services/lowLatencyAudio';
import { getProcessedStream } from '../services/audioProcessing';
import {
  playJoinCallSound,
  playLeaveCallSound,
  playMuteSound,
  playUnmuteSound,
  playScreenShareStartSound,
  playScreenShareStopSound,
} from '../services/callSounds';
import type { CallMode, VoiceChannel, VoiceParticipant } from '../types';

interface ScreenSenders {
  video: RTCRtpSender;
  audio?: RTCRtpSender;
}

/**
 * Canais de voz de um grupo — separados dos canais de texto (cada um é seu
 * próprio tipo, escolhido na criação). Montado uma única vez em AppLayout
 * (não dentro de GroupLayout), pra uma call em andamento sobreviver à
 * navegação entre telas/grupos — GroupLayout só recebe `voice` via prop.
 */
export function useVoiceRoom(groupId: number, groupChannelId: number | null) {
  const user = useAuthStore((s) => s.user);

  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [activeVcId, setActiveVcId] = useState<number | null>(null);
  // Canal ao qual estou de fato conectado — independente do grupo que estou
  // visualizando no momento, pra sobreviver a navegação entre grupos/telas.
  const [connectedVc, setConnectedVc] = useState<VoiceChannel | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStreams, setScreenStreams] = useState<Map<number, MediaStream>>(new Map());

  const localStream = useRef<MediaStream | null>(null);
  const localScreenStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<number, RTCPeerConnection>>(new Map());
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
  const screenSenders = useRef<Map<number, ScreenSenders>>(new Map());
  const activeVcIdRef = useRef<number | null>(null);
  activeVcIdRef.current = activeVcId;
  // Ids dos outros participantes da call conectada — usado só pra decidir
  // quando tocar som de entrar/sair de gente que não sou eu.
  const connectedParticipantIds = useRef<Set<number>>(new Set());
  // Modo do canal conectado no momento — usado pelo signaling (offer/answer)
  // pra saber se aplica o tuning de baixa latência nessa negociação.
  const activeModeRef = useRef<CallMode>('normal');
  // Snapshot do canal de texto do grupo no momento da entrada — usado pro
  // 'voice:leave' mesmo que o usuário tenha navegado pra outro grupo depois.
  const connectedGroupChannelIdRef = useRef<number | null>(null);

  const activeVc = connectedVc;

  // Load channels
  useEffect(() => {
    groupsAPI.getVoiceChannels(groupId).then(({ data }) => setVoiceChannels(data));
  }, [groupId]);

  // Socket: canal de voz novo criado por outro membro — sem isso, só quem
  // criou via essa aba (update otimista local) via até recarregar a página.
  useEffect(() => {
    const socket = getSocket();
    const onCreated = (channel: VoiceChannel) => {
      if (channel.groupId !== groupId) return;
      setVoiceChannels((prev) => (prev.some((vc) => vc.id === channel.id) ? prev : [...prev, channel]));
    };
    socket.on('group-voice-channel:created', onCreated);
    return () => { socket.off('group-voice-channel:created', onCreated); };
  }, [groupId]);

  // Socket: presence updates — mantém a lista lateral do grupo visualizado em dia.
  useEffect(() => {
    if (!groupChannelId) return;
    const socket = getSocket();

    const onChannelUpdated = (data: { voiceChannelId: number; participants: VoiceParticipant[] }) => {
      setVoiceChannels((prev) =>
        prev.map((vc) => vc.id === data.voiceChannelId ? { ...vc, participants: data.participants } : vc),
      );
    };

    socket.on('voice:channel-updated', onChannelUpdated);
    return () => { socket.off('voice:channel-updated', onChannelUpdated); };
  }, [groupChannelId]);

  // Socket: mantém o canal em que estou conectado atualizado sempre —
  // mesmo enquanto navego por outro grupo ou pela Home. Também toca o som de
  // entrar/sair pra quando OUTROS participantes (não eu) entram ou saem da
  // call em que estou — comparando o roster novo com o anterior via ref
  // (seedado em join()/_leave(), pra não confundir "acabei de entrar numa
  // sala que já tinha gente" com "todo mundo entrou agora").
  useEffect(() => {
    const socket = getSocket();
    const onChannelUpdated = (data: { voiceChannelId: number; participants: VoiceParticipant[] }) => {
      if (activeVcIdRef.current !== data.voiceChannelId) return;

      const prevIds = connectedParticipantIds.current;
      const nextIds = new Set(data.participants.filter((p) => p.userId !== user?.id).map((p) => p.userId));
      let joined = false;
      let left = false;
      for (const id of nextIds) if (!prevIds.has(id)) joined = true;
      for (const id of prevIds) if (!nextIds.has(id)) left = true;
      connectedParticipantIds.current = nextIds;
      if (joined) playJoinCallSound();
      else if (left) playLeaveCallSound();

      setConnectedVc((prev) => (prev && prev.id === data.voiceChannelId ? { ...prev, participants: data.participants } : prev));
    };
    socket.on('voice:channel-updated', onChannelUpdated);
    return () => { socket.off('voice:channel-updated', onChannelUpdated); };
  }, [user?.id]);

  // Limpa telas "fantasma" com base no roster (fonte confiável), não no
  // WebRTC — `track.onended` não dispara de forma consistente quando o
  // outro lado só dá removeTrack()+renegocia, o que deixava o último frame
  // congelado na tela em vez de sumir quando alguém parava de compartilhar.
  useEffect(() => {
    if (!connectedVc) return;
    const sharingIds = new Set(connectedVc.participants.filter((p) => p.isSharing).map((p) => p.userId));
    setScreenStreams((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const uid of next.keys()) {
        if (!sharingIds.has(uid)) { next.delete(uid); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [connectedVc?.participants]);

  // Socket: renomeação de canal de voz por outro membro do grupo.
  useEffect(() => {
    const socket = getSocket();
    const onChannelRenamed = (data: { channelId: number; type: 'text' | 'voice'; name: string }) => {
      if (data.type !== 'voice') return;
      setVoiceChannels((prev) => prev.map((vc) => (vc.id === data.channelId ? { ...vc, name: data.name } : vc)));
      setConnectedVc((prev) => (prev && prev.id === data.channelId ? { ...prev, name: data.name } : prev));
    };
    socket.on('channel:renamed', onChannelRenamed);
    return () => { socket.off('channel:renamed', onChannelRenamed); };
  }, []);

  const addScreenStream = (uid: number, stream: MediaStream) => {
    setScreenStreams((prev) => {
      const next = new Map(prev);
      next.set(uid, stream);
      return next;
    });
  };

  const removeScreenStream = (uid: number) => {
    setScreenStreams((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Map(prev);
      next.delete(uid);
      return next;
    });
  };

  const renegotiate = async (targetUserId: number, pc: RTCPeerConnection) => {
    const voiceChannelId = activeVcIdRef.current;
    if (!voiceChannelId) return;
    const offer = await pc.createOffer();
    if (activeModeRef.current === 'game' && offer.sdp) offer.sdp = withLowLatencyOpus(offer.sdp);
    await pc.setLocalDescription(offer);
    getSocket().emit('voice:offer', { targetUserId, offer, voiceChannelId });
  };

  // Socket: WebRTC signaling
  useEffect(() => {
    if (!activeVcId) return;
    const socket = getSocket();

    const onRoomState = async (data: { voiceChannelId: number; participants: VoiceParticipant[] }) => {
      if (data.voiceChannelId !== activeVcId) return;
      for (const p of data.participants) {
        if (p.userId === user?.id) continue;
        const pc = createPeer(p.userId);
        const offer = await pc.createOffer();
        if (activeModeRef.current === 'game' && offer.sdp) offer.sdp = withLowLatencyOpus(offer.sdp);
        await pc.setLocalDescription(offer);
        socket.emit('voice:offer', { targetUserId: p.userId, offer, voiceChannelId: activeVcId });
      }
    };
    const onOffer = async (data: { from: number; offer: RTCSessionDescriptionInit; voiceChannelId: number }) => {
      if (data.voiceChannelId !== activeVcId) return;
      let pc = peers.current.get(data.from);
      const isNewPeer = !pc;
      if (!pc) pc = createPeer(data.from);
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      if (activeModeRef.current === 'game' && answer.sdp) answer.sdp = withLowLatencyOpus(answer.sdp);
      await pc.setLocalDescription(answer);
      socket.emit('voice:answer', { targetUserId: data.from, answer, voiceChannelId: activeVcId });

      // createPeer() já tinha adicionado os tracks da minha tela (se eu
      // estiver compartilhando), mas uma resposta não pode introduzir
      // m-lines que não vieram no offer de quem acabou de entrar — sem
      // essa renegociação extra, a tela nunca chegava pra quem chegou
      // depois que o compartilhamento já tinha começado.
      if (isNewPeer && localScreenStream.current) {
        await renegotiate(data.from, pc);
      }
    };
    const onAnswer = async (data: { from: number; answer: RTCSessionDescriptionInit }) => {
      const pc = peers.current.get(data.from);
      if (pc) await pc.setRemoteDescription(data.answer);
    };
    const onIce = async (data: { from: number; candidate: RTCIceCandidateInit }) => {
      const pc = peers.current.get(data.from);
      if (pc) await pc.addIceCandidate(data.candidate);
    };

    socket.on('voice:room-state', onRoomState);
    socket.on('voice:offer', onOffer);
    socket.on('voice:answer', onAnswer);
    socket.on('voice:ice', onIce);
    return () => {
      socket.off('voice:room-state', onRoomState);
      socket.off('voice:offer', onOffer);
      socket.off('voice:answer', onAnswer);
      socket.off('voice:ice', onIce);
    };
  }, [activeVcId, user?.id]);

  // Socket: servidor recusou a entrada (sala já no limite de participantes)
  // — desfaz o estado otimista que `join()` já tinha setado e libera o mic.
  // Efeito próprio (não o de signaling) pra garantir que o listener já
  // esteja registrado antes da resposta do servidor chegar.
  useEffect(() => {
    const socket = getSocket();
    const onJoinRejected = (data: { voiceChannelId: number; reason: string; max: number }) => {
      if (data.voiceChannelId !== activeVcIdRef.current) return;
      localStream.current?.getTracks().forEach((t) => t.stop());
      localStream.current = null;
      connectedGroupChannelIdRef.current = null;
      setActiveVcId(null);
      setConnectedVc(null);
      alertDialog(`Essa sala já está com o máximo de ${data.max} pessoas — tente outro canal.`, { title: 'Sala cheia' });
    };
    socket.on('voice:join-rejected', onJoinRejected);
    return () => { socket.off('voice:join-rejected', onJoinRejected); };
  }, []);

  // Cleanup on unmount — usa uma ref pra sempre pegar a versão mais recente
  // de _leave/activeVcId (o callback de cleanup de um efeito com deps [] fica
  // "congelado" na primeira renderização, então referenciar as variáveis
  // direto aqui sempre resultava em activeVcId === null e o _leave nunca
  // era chamado de verdade ao desmontar).
  const leaveOnUnmountRef = useRef<() => void>(() => {});
  leaveOnUnmountRef.current = () => { if (activeVcIdRef.current) _leave(activeVcIdRef.current); };

  useEffect(() => {
    return () => { leaveOnUnmountRef.current(); };
  }, []);

  const createPeer = (targetUserId: number): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (e.candidate) getSocket().emit('voice:ice', { targetUserId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const track = e.track;
      if (track.kind === 'audio') {
        let audio = audioRefs.current.get(targetUserId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audioRefs.current.set(targetUserId, audio);
          const outputId = useSettingsStore.getState().outputDeviceId;
          if (outputId && typeof audio.setSinkId === 'function') {
            audio.setSinkId(outputId).catch(() => {});
          }
        }
        audio.srcObject = e.streams[0];
        // `autoplay` sozinho não é confiável (política de autoplay do
        // Chromium/Electron pode bloquear silenciosamente) — era por isso
        // que só dava pra ouvir o outro depois de interagir com o picker de
        // tela (o clique ali "destravava" autoplay por acidente). Chamar
        // .play() explicitamente é o padrão que já funciona na call 1:1.
        audio.play().catch(() => {});
      } else if (track.kind === 'video') {
        const stream = e.streams[0] ?? new MediaStream([track]);
        addScreenStream(targetUserId, stream);
        track.onended = () => removeScreenStream(targetUserId);
      }
    };
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => {
        const sender = pc.addTrack(t, localStream.current!);
        if (activeModeRef.current === 'game') applyLowLatencySenderParams(sender);
      });
    }

    // Se já estamos compartilhando a tela, o novo peer entra recebendo o
    // compartilhamento em andamento (sem precisar de renegociação extra).
    if (localScreenStream.current) {
      const videoTrack = localScreenStream.current.getVideoTracks()[0];
      if (videoTrack) {
        const senders: ScreenSenders = { video: pc.addTrack(videoTrack, localScreenStream.current) };
        const audioTrack = localScreenStream.current.getAudioTracks()[0];
        if (audioTrack) senders.audio = pc.addTrack(audioTrack, localScreenStream.current);
        screenSenders.current.set(targetUserId, senders);
      }
    }

    peers.current.set(targetUserId, pc);
    return pc;
  };

  const closePeer = (uid: number) => {
    peers.current.get(uid)?.close();
    peers.current.delete(uid);
    const audio = audioRefs.current.get(uid);
    if (audio) { audio.srcObject = null; audioRefs.current.delete(uid); }
    screenSenders.current.delete(uid);
    removeScreenStream(uid);
  };

  const _leave = (vcId: number) => {
    playLeaveCallSound();
    getSocket().emit('voice:leave', { voiceChannelId: vcId, groupChannelId: connectedGroupChannelIdRef.current });
    connectedGroupChannelIdRef.current = null;
    connectedParticipantIds.current = new Set();
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    localScreenStream.current?.getTracks().forEach((t) => t.stop());
    localScreenStream.current = null;
    screenSenders.current.clear();
    setScreenStreams(new Map());
    setIsScreenSharing(false);
    peers.current.forEach((_, uid) => closePeer(uid));
    setActiveVcId(null);
    setConnectedVc(null);
    setIsMuted(false);
    activeModeRef.current = 'normal';
  };

  const join = async (vc: VoiceChannel) => {
    if (activeVcId === vc.id) return;
    if (activeVcId !== null) _leave(activeVcId);
    setIsConnecting(true);
    activeModeRef.current = vc.mode;
    try {
      // Mesmo pipeline de áudio da call 1:1 (RNNoise + noise gate nos
      // níveis médio/alto) — antes, canal de voz de grupo pegava o
      // microfone cru, sem nenhum filtro de ruído.
      const { stream } = await getProcessedStream(vc.mode);
      localStream.current = stream;
      // Fixa o grupo/canal de texto do momento da entrada — se o usuário
      // navegar pra outro grupo depois, a saída ainda usa o grupo certo.
      connectedGroupChannelIdRef.current = groupChannelId;
      // Seed com quem já está na sala — sem isso, a primeira atualização do
      // roster (me incluindo) seria lida como "todo mundo entrou agora".
      connectedParticipantIds.current = new Set(vc.participants.filter((p) => p.userId !== user?.id).map((p) => p.userId));
      getSocket().emit('voice:join', { voiceChannelId: vc.id, groupChannelId, avatarUrl: user?.avatarUrl });
      setActiveVcId(vc.id);
      setConnectedVc(vc);
      playJoinCallSound();
    } catch {
      alertDialog('Não foi possível acessar o microfone. Verifique as permissões do sistema.', { title: 'Erro de microfone' });
    } finally {
      setIsConnecting(false);
    }
  };

  const leave = () => { if (activeVcId !== null) _leave(activeVcId); };

  const toggleMute = () => {
    if (!localStream.current) return;
    const next = !isMuted;
    localStream.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted(next);
    if (next) playMuteSound(); else playUnmuteSound();

    // Avisa o roster (igual ao compartilhamento de tela) — é o que faz o
    // ícone de mudo aparecer na lista de participantes.
    if (activeVcIdRef.current) {
      getSocket().emit(next ? 'voice:mute-start' : 'voice:mute-stop', {
        voiceChannelId: activeVcIdRef.current,
        groupChannelId: connectedGroupChannelIdRef.current,
      });
    }
  };

  const startScreenShare = async (sourceId?: string) => {
    if (!activeVcId || isScreenSharing) return;
    try {
      const screenStream = await captureScreen(sourceId);
      const videoTrack = screenStream.getVideoTracks()[0];
      if (!videoTrack) return;
      videoTrack.contentHint = 'detail';
      localScreenStream.current = screenStream;

      const audioTrack = screenStream.getAudioTracks()[0];

      for (const [uid, pc] of peers.current) {
        const senders: ScreenSenders = { video: pc.addTrack(videoTrack, screenStream) };
        if (audioTrack) senders.audio = pc.addTrack(audioTrack, screenStream);
        screenSenders.current.set(uid, senders);
        await renegotiate(uid, pc);
      }

      // Mostra a própria tela pra mim também — sem isso só quem recebe via
      // WebRTC (os outros participantes, via `ontrack`) conseguia ver.
      if (user?.id) addScreenStream(user.id, screenStream);

      // Avisa o roster (não é sinal WebRTC) — é o que faz o ícone de
      // compartilhamento aparecer até pra quem não está na call.
      getSocket().emit('voice:screen-start', {
        voiceChannelId: activeVcIdRef.current,
        groupChannelId: connectedGroupChannelIdRef.current,
      });

      setIsScreenSharing(true);
      playScreenShareStartSound();

      videoTrack.onended = () => { stopScreenShare(); };
    } catch (e) {
      console.error('[voice-screen-share] erro ao iniciar:', e);
      localScreenStream.current?.getTracks().forEach((t) => t.stop());
      localScreenStream.current = null;
    }
  };

  const stopScreenShare = async () => {
    if (!localScreenStream.current) return;
    for (const [uid, pc] of peers.current) {
      const senders = screenSenders.current.get(uid);
      if (senders) {
        pc.removeTrack(senders.video);
        if (senders.audio) pc.removeTrack(senders.audio);
        screenSenders.current.delete(uid);
        await renegotiate(uid, pc);
      }
    }
    localScreenStream.current.getTracks().forEach((t) => t.stop());
    localScreenStream.current = null;
    if (user?.id) removeScreenStream(user.id);

    if (activeVcIdRef.current) {
      getSocket().emit('voice:screen-stop', {
        voiceChannelId: activeVcIdRef.current,
        groupChannelId: connectedGroupChannelIdRef.current,
      });
    }

    setIsScreenSharing(false);
    playScreenShareStopSound();
  };

  const createChannel = async (name: string, mode: CallMode = 'normal') => {
    const { data } = await groupsAPI.createVoiceChannel(groupId, name, mode);
    setVoiceChannels((prev) => [...prev, { ...data, participants: [] }]);
  };

  const deleteChannel = async (vcId: number) => {
    if (activeVcId === vcId) _leave(vcId);
    await groupsAPI.deleteVoiceChannel(groupId, vcId);
    setVoiceChannels((prev) => prev.filter((c) => c.id !== vcId));
  };

  const renameChannel = async (vcId: number, name: string) => {
    setVoiceChannels((prev) => prev.map((vc) => (vc.id === vcId ? { ...vc, name } : vc)));
    setConnectedVc((prev) => (prev && prev.id === vcId ? { ...prev, name } : prev));
    await groupsAPI.renameVoiceChannel(groupId, vcId, name);
  };

  /** Atualização otimista da posição (drag-and-drop) antes de persistir no servidor. */
  const updateChannelPositions = (positions: Map<number, number>) => {
    setVoiceChannels((prev) => prev.map((vc) => (positions.has(vc.id) ? { ...vc, position: positions.get(vc.id)! } : vc)));
  };

  return {
    voiceChannels,
    activeVcId,
    activeVc,
    isMuted,
    isConnecting,
    isScreenSharing,
    screenStreams,
    join,
    leave,
    toggleMute,
    startScreenShare,
    stopScreenShare,
    createChannel,
    deleteChannel,
    renameChannel,
    updateChannelPositions,
  };
}

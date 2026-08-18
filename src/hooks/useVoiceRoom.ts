import { useEffect, useRef, useState } from 'react';
import { groupsAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuthStore } from '../stores/authStore';
import { captureScreen } from '../services/screenCapture';
import type { VoiceChannel, VoiceParticipant } from '../types';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

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
  // Snapshot do canal de texto do grupo no momento da entrada — usado pro
  // 'voice:leave' mesmo que o usuário tenha navegado pra outro grupo depois.
  const connectedGroupChannelIdRef = useRef<number | null>(null);

  const activeVc = connectedVc;

  // Load channels
  useEffect(() => {
    groupsAPI.getVoiceChannels(groupId).then(({ data }) => setVoiceChannels(data));
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
  // mesmo enquanto navego por outro grupo ou pela Home.
  useEffect(() => {
    const socket = getSocket();
    const onChannelUpdated = (data: { voiceChannelId: number; participants: VoiceParticipant[] }) => {
      setConnectedVc((prev) => (prev && prev.id === data.voiceChannelId ? { ...prev, participants: data.participants } : prev));
    };
    socket.on('voice:channel-updated', onChannelUpdated);
    return () => { socket.off('voice:channel-updated', onChannelUpdated); };
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
        await pc.setLocalDescription(offer);
        socket.emit('voice:offer', { targetUserId: p.userId, offer, voiceChannelId: activeVcId });
      }
    };
    const onOffer = async (data: { from: number; offer: RTCSessionDescriptionInit; voiceChannelId: number }) => {
      if (data.voiceChannelId !== activeVcId) return;
      let pc = peers.current.get(data.from);
      if (!pc) pc = createPeer(data.from);
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice:answer', { targetUserId: data.from, answer, voiceChannelId: activeVcId });
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
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate) getSocket().emit('voice:ice', { targetUserId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      const track = e.track;
      if (track.kind === 'audio') {
        let audio = audioRefs.current.get(targetUserId);
        if (!audio) { audio = new Audio(); audio.autoplay = true; audioRefs.current.set(targetUserId, audio); }
        audio.srcObject = e.streams[0];
      } else if (track.kind === 'video') {
        const stream = e.streams[0] ?? new MediaStream([track]);
        addScreenStream(targetUserId, stream);
        track.onended = () => removeScreenStream(targetUserId);
      }
    };
    if (localStream.current)
      localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));

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
    getSocket().emit('voice:leave', { voiceChannelId: vcId, groupChannelId: connectedGroupChannelIdRef.current });
    connectedGroupChannelIdRef.current = null;
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
  };

  const join = async (vc: VoiceChannel) => {
    if (activeVcId === vc.id) return;
    if (activeVcId !== null) _leave(activeVcId);
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      // Fixa o grupo/canal de texto do momento da entrada — se o usuário
      // navegar pra outro grupo depois, a saída ainda usa o grupo certo.
      connectedGroupChannelIdRef.current = groupChannelId;
      getSocket().emit('voice:join', { voiceChannelId: vc.id, groupChannelId, avatarUrl: user?.avatarUrl });
      setActiveVcId(vc.id);
      setConnectedVc(vc);
    } catch {
      alert('Não foi possível acessar o microfone');
    } finally {
      setIsConnecting(false);
    }
  };

  const leave = () => { if (activeVcId !== null) _leave(activeVcId); };

  const toggleMute = () => {
    if (!localStream.current) return;
    localStream.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted((m) => !m);
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

      setIsScreenSharing(true);

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
    setIsScreenSharing(false);
  };

  const createChannel = async (name: string) => {
    const { data } = await groupsAPI.createVoiceChannel(groupId, name);
    setVoiceChannels((prev) => [...prev, { ...data, participants: [] }]);
  };

  const deleteChannel = async (vcId: number) => {
    if (activeVcId === vcId) _leave(vcId);
    await groupsAPI.deleteVoiceChannel(groupId, vcId);
    setVoiceChannels((prev) => prev.filter((c) => c.id !== vcId));
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
    updateChannelPositions,
  };
}

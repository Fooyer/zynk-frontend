import { useEffect, useRef, useState } from 'react';
import { groupsAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuthStore } from '../stores/authStore';
import type { VoiceChannel, VoiceParticipant } from '../types';

const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function useVoiceRoom(groupId: number, groupChannelId: number | null) {
  const user = useAuthStore((s) => s.user);

  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [activeVcId, setActiveVcId] = useState<number | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const localStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<number, RTCPeerConnection>>(new Map());
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  const activeVc = voiceChannels.find((vc) => vc.id === activeVcId) ?? null;

  // Load channels
  useEffect(() => {
    groupsAPI.getVoiceChannels(groupId).then(({ data }) => setVoiceChannels(data));
  }, [groupId]);

  // Socket: presence updates
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

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (activeVcId) _leave(activeVcId); };
  }, []);

  const createPeer = (targetUserId: number): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pc.onicecandidate = (e) => {
      if (e.candidate) getSocket().emit('voice:ice', { targetUserId, candidate: e.candidate });
    };
    pc.ontrack = (e) => {
      let audio = audioRefs.current.get(targetUserId);
      if (!audio) { audio = new Audio(); audio.autoplay = true; audioRefs.current.set(targetUserId, audio); }
      audio.srcObject = e.streams[0];
    };
    if (localStream.current)
      localStream.current.getTracks().forEach((t) => pc.addTrack(t, localStream.current!));
    peers.current.set(targetUserId, pc);
    return pc;
  };

  const closePeer = (uid: number) => {
    peers.current.get(uid)?.close();
    peers.current.delete(uid);
    const audio = audioRefs.current.get(uid);
    if (audio) { audio.srcObject = null; audioRefs.current.delete(uid); }
  };

  const _leave = (vcId: number) => {
    getSocket().emit('voice:leave', { voiceChannelId: vcId, groupChannelId });
    localStream.current?.getTracks().forEach((t) => t.stop());
    localStream.current = null;
    peers.current.forEach((_, uid) => closePeer(uid));
    setActiveVcId(null);
    setIsMuted(false);
  };

  const join = async (vc: VoiceChannel) => {
    if (activeVcId === vc.id) return;
    if (activeVcId !== null) _leave(activeVcId);
    setIsConnecting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStream.current = stream;
      getSocket().emit('voice:join', { voiceChannelId: vc.id, groupChannelId, avatarUrl: user?.avatarUrl });
      setActiveVcId(vc.id);
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

  const createChannel = async (name: string) => {
    const { data } = await groupsAPI.createVoiceChannel(groupId, name);
    setVoiceChannels((prev) => [...prev, { ...data, participants: [] }]);
  };

  const deleteChannel = async (vcId: number) => {
    if (activeVcId === vcId) _leave(vcId);
    await groupsAPI.deleteVoiceChannel(groupId, vcId);
    setVoiceChannels((prev) => prev.filter((c) => c.id !== vcId));
  };

  return {
    voiceChannels,
    activeVcId,
    activeVc,
    isMuted,
    isConnecting,
    join,
    leave,
    toggleMute,
    createChannel,
    deleteChannel,
  };
}

import { useEffect, useRef, useState } from 'react';
import { groupsAPI } from '../services/api';
import { getSocket } from '../services/socket';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { captureScreen, captureSystemAudio } from '../services/screenCapture';
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
import type { CallMode, VoiceChannel, VoiceParticipant, WatchTogetherState } from '../types';

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
  const [isSharingAudio, setIsSharingAudio] = useState(false);
  const [screenStreams, setScreenStreams] = useState<Map<number, MediaStream>>(new Map());
  // "Assistir junto" (YouTube) — autoritativo no servidor, null quando não
  // há sessão ativa no canal de voz conectado.
  const [watchState, setWatchState] = useState<WatchTogetherState | null>(null);
  // "Silenciar localmente" — só afeta o que EU escuto de alguém, não é
  // broadcast pro roster (diferente do isMuted, que é o próprio participante
  // se mutando pra todo mundo).
  const [locallyMutedIds, setLocallyMutedIds] = useState<Set<number>>(new Set());
  // Quem está falando agora (eu incluído) — populado pelo polling de
  // AnalyserNode logo abaixo, consumido pelos indicadores visuais (anel no
  // avatar da grade da call, linha destacada na lista de participantes).
  const [speakingUserIds, setSpeakingUserIds] = useState<Set<number>>(new Set());

  const localStream = useRef<MediaStream | null>(null);
  const localScreenStream = useRef<MediaStream | null>(null);
  const localAudioShareStream = useRef<MediaStream | null>(null);
  const peers = useRef<Map<number, RTCPeerConnection>>(new Map());
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
  // Stream persistente por peer que RECEBE áudio — o mic e um eventual
  // compartilhamento de áudio chegam como tracks separados (ontrack dispara
  // uma vez por track), então acumulam nesse MediaStream em vez de
  // substituir o srcObject do <audio> a cada novo track (senão o segundo
  // track — o áudio compartilhado — silenciava o mic desse peer pra todo mundo).
  const remoteAudioStreams = useRef<Map<number, MediaStream>>(new Map());
  // Detecção de fala (indicador visual, tipo Discord) — um AnalyserNode por
  // participante, tapeando o MediaStream sem interferir na reprodução (que
  // continua pelo <audio> nativo, sem passar pelo Web Audio). O local usa o
  // analyser que já sai pronto de getProcessedStream(); os remotos tapeiam o
  // stream assim que o primeiro áudio (mic) chega, com um AudioContext único
  // compartilhado entre todos os peers.
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteAnalysers = useRef<Map<number, AnalyserNode>>(new Map());
  const remoteAnalyserCtxRef = useRef<AudioContext | null>(null);
  // Diagnóstico temporário: guarda o id do PRIMEIRO track de áudio recebido
  // de cada peer (sempre o mic, adicionado na entrada da call) só pra rotular
  // os logs de stats e não ficar adivinhando qual dos tracks acumulados no
  // mesmo <audio> é o mic e qual é o compartilhamento de áudio do sistema.
  const firstAudioTrackIdByUser = useRef<Map<number, string>>(new Map());
  const locallyMutedIdsRef = useRef<Set<number>>(new Set());
  locallyMutedIdsRef.current = locallyMutedIds;
  const screenSenders = useRef<Map<number, ScreenSenders>>(new Map());
  const audioShareSenders = useRef<Map<number, RTCRtpSender>>(new Map());
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

  // Socket: estado do "assistir junto" (carregar vídeo, play/pause/seek,
  // parar) — autoritativo no servidor, chega tanto pra quem disparou a ação
  // (eco, aplicar é um no-op) quanto pra todo mundo mais na call.
  useEffect(() => {
    const socket = getSocket();
    const onWatchState = (data: { voiceChannelId: number; state: WatchTogetherState | null }) => {
      if (data.voiceChannelId !== activeVcIdRef.current) return;
      setWatchState(data.state);
    };
    socket.on('watch:state', onWatchState);
    return () => { socket.off('watch:state', onWatchState); };
  }, []);

  // Detecção de fala — sondagem periódica de nível de áudio (mesmo padrão da
  // call 1:1 em DMChatArea.tsx), aqui pra N participantes de uma vez. Preso
  // ao connectedVc (não activeVc) pra não rodar sondando analysers já
  // fechados enquanto a call está desconectando.
  useEffect(() => {
    if (!connectedVc) { setSpeakingUserIds(new Set()); return; }
    const data = new Uint8Array(128);
    const interval = setInterval(() => {
      const next = new Set<number>();
      if (localAnalyserRef.current && !isMuted && user?.id) {
        localAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > 8) next.add(user.id);
      }
      remoteAnalysers.current.forEach((analyser, uid) => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        if (avg > 8) next.add(uid);
      });
      setSpeakingUserIds((prev) => {
        if (prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [connectedVc, isMuted, user?.id]);

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

  // Socket: WebRTC signaling — registrado incondicionalmente (sem gate em
  // activeVcId) e sempre montado. `join()` emite 'voice:join' e o servidor
  // pode responder com 'voice:room-state' antes que o re-render disparado
  // por setActiveVcId(vc.id) chegasse a rodar este efeito — se o listener só
  // fosse anexado depois disso, esse 'voice:room-state' chegava com ninguém
  // ouvindo e era perdido pra sempre (socket.io não bufferiza eventos sem
  // listener), fazendo o recém-entrado nunca criar nenhum peer connection:
  // não ouvia ninguém e ninguém via a tela dele — e o inverso, ele não via
  // tela/ouvia áudio de quem já estava na call. Por isso os handlers filtram
  // por activeVcIdRef.current (sempre atual) em vez de depender de quando o
  // efeito foi (re)criado.
  useEffect(() => {
    const socket = getSocket();

    const onRoomState = async (data: { voiceChannelId: number; participants: VoiceParticipant[] }) => {
      if (data.voiceChannelId !== activeVcIdRef.current) return;
      for (const p of data.participants) {
        if (p.userId === user?.id) continue;
        const pc = createPeer(p.userId);
        const offer = await pc.createOffer();
        if (activeModeRef.current === 'game' && offer.sdp) offer.sdp = withLowLatencyOpus(offer.sdp);
        await pc.setLocalDescription(offer);
        socket.emit('voice:offer', { targetUserId: p.userId, offer, voiceChannelId: data.voiceChannelId });
      }
    };
    const onOffer = async (data: { from: number; offer: RTCSessionDescriptionInit; voiceChannelId: number }) => {
      if (data.voiceChannelId !== activeVcIdRef.current) return;
      let pc = peers.current.get(data.from);
      const isNewPeer = !pc;
      if (!pc) pc = createPeer(data.from);
      await pc.setRemoteDescription(data.offer);
      const answer = await pc.createAnswer();
      if (activeModeRef.current === 'game' && answer.sdp) answer.sdp = withLowLatencyOpus(answer.sdp);
      await pc.setLocalDescription(answer);
      socket.emit('voice:answer', { targetUserId: data.from, answer, voiceChannelId: data.voiceChannelId });

      // createPeer() já tinha adicionado os tracks da minha tela/áudio (se eu
      // estiver compartilhando), mas uma resposta não pode introduzir
      // m-lines que não vieram no offer de quem acabou de entrar — sem
      // essa renegociação extra, a tela/áudio nunca chegava pra quem chegou
      // depois que o compartilhamento já tinha começado.
      if (isNewPeer && (localScreenStream.current || localAudioShareStream.current)) {
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
  }, [user?.id]);

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
    // Sem isso, uma falha de ICE (ex.: CSP bloqueando os servidores STUN/TURN,
    // ou os dois lados atrás de NAT sem candidato viável) é totalmente muda —
    // nem áudio/vídeo chegam (então nenhum log de ontrack dispara) nem o
    // WebRTC lança exceção nenhuma, só fica preso em "failed"/"disconnected"
    // pra sempre e ninguém percebe olhando o console.
    pc.oniceconnectionstatechange = () => {
      console.log(`[voice-ice] estado da conexão com ${targetUserId}: ${pc.iceConnectionState}`);
    };
    pc.ontrack = (e) => {
      const track = e.track;
      if (track.kind === 'audio') {
        let stream = remoteAudioStreams.current.get(targetUserId);
        if (!stream) {
          stream = new MediaStream();
          remoteAudioStreams.current.set(targetUserId, stream);
        }
        stream.addTrack(track);
        if (!firstAudioTrackIdByUser.current.has(targetUserId)) {
          firstAudioTrackIdByUser.current.set(targetUserId, track.id);
        }

        let audio = audioRefs.current.get(targetUserId);
        if (!audio) {
          audio = new Audio();
          audio.autoplay = true;
          audio.muted = locallyMutedIdsRef.current.has(targetUserId);
          audioRefs.current.set(targetUserId, audio);
          const outputId = useSettingsStore.getState().outputDeviceId;
          if (outputId && typeof audio.setSinkId === 'function') {
            audio.setSinkId(outputId).catch(() => {});
          }
          audio.srcObject = stream;

          // Tapeia esse mesmo MediaStream pra medir nível de áudio — só na
          // criação (primeiro track = mic, ver comentário acima), pra não
          // acabar analisando o track de compartilhamento de áudio do
          // sistema como se fosse a voz da pessoa.
          try {
            if (!remoteAnalyserCtxRef.current) remoteAnalyserCtxRef.current = new AudioContext();
            const ctx = remoteAnalyserCtxRef.current;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            remoteAnalysers.current.set(targetUserId, analyser);
          } catch { /* medição de fala é cosmética — segue sem ela se falhar */ }
        }
        // `autoplay` sozinho não é confiável (política de autoplay do
        // Chromium/Electron pode bloquear silenciosamente) — era por isso
        // que só dava pra ouvir o outro depois de interagir com o picker de
        // tela (o clique ali "destravava" autoplay por acidente). Chamar
        // .play() explicitamente é o padrão que já funciona na call 1:1.
        console.log(`[voice-ontrack] áudio recebido de ${targetUserId}:`, {
          trackId: track.id, muted: track.muted, readyState: track.readyState, tracksNoStream: stream.getAudioTracks().length,
        });
        audio.play().then(
          () => console.log(`[voice-ontrack] audio.play() ok pra ${targetUserId}`),
          (err) => console.error(`[voice-ontrack] audio.play() FALHOU pra ${targetUserId}:`, err),
        );

        // Diagnóstico temporário: `.play()` resolver não prova que áudio
        // está audível — só que o elemento começou a tentar tocar. Se
        // bytesReceived/audioLevel ficarem sempre em 0 aqui, o problema é
        // de rede/ICE (pacote nunca chega); se eles sobem normalmente mas
        // ainda assim não dá pra ouvir, o problema é no roteamento de saída
        // de áudio do SO/dispositivo, não no código.
        let statsChecks = 0;
        const statsInterval = setInterval(async () => {
          statsChecks += 1;
          try {
            // Sem seletor de track aqui de propósito: com seletor o
            // getStats() só devolve os relatórios daquele track (inbound-rtp
            // etc.) e omite candidate-pair — que é o que diz se a conexão tá
            // indo direto P2P ou caindo pro TURN de fallback (relay1.
            // expressturn.com, público e sem garantia de capacidade).
            const stats = await pc.getStats();
            stats.forEach((report) => {
              if (report.type === 'inbound-rtp' && report.kind === 'audio') {
                const isMic = report.trackIdentifier === firstAudioTrackIdByUser.current.get(targetUserId);
                console.log(`[voice-audio-stats] de ${targetUserId} (${isMic ? 'MIC' : 'COMPARTILHADO'}):`, {
                  trackIdentifier: report.trackIdentifier,
                  bytesReceived: report.bytesReceived,
                  packetsReceived: report.packetsReceived,
                  packetsLost: report.packetsLost,
                  audioLevel: report.audioLevel,
                  totalAudioEnergy: report.totalAudioEnergy,
                  jitterBufferDelay: report.jitterBufferDelay,
                });
              }
              if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
                const local = stats.get(report.localCandidateId);
                const remote = stats.get(report.remoteCandidateId);
                console.log(`[voice-audio-stats] par ICE ativo com ${targetUserId}:`, {
                  localType: local?.candidateType,
                  remoteType: remote?.candidateType,
                  bytesSent: report.bytesSent,
                  bytesReceived: report.bytesReceived,
                  currentRoundTripTime: report.currentRoundTripTime,
                });
              }
            });
          } catch { /* ignore */ }
          if (statsChecks >= 6) clearInterval(statsInterval);
        }, 2000);
        track.addEventListener('ended', () => clearInterval(statsInterval));
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

    // Mesma ideia pro compartilhamento de só áudio.
    if (localAudioShareStream.current) {
      const audioTrack = localAudioShareStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioShareSenders.current.set(targetUserId, pc.addTrack(audioTrack, localAudioShareStream.current));
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
    remoteAudioStreams.current.delete(uid);
    firstAudioTrackIdByUser.current.delete(uid);
    remoteAnalysers.current.delete(uid);
    screenSenders.current.delete(uid);
    audioShareSenders.current.delete(uid);
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
    localAudioShareStream.current?.getTracks().forEach((t) => t.stop());
    localAudioShareStream.current = null;
    screenSenders.current.clear();
    audioShareSenders.current.clear();
    setScreenStreams(new Map());
    setIsScreenSharing(false);
    setIsSharingAudio(false);
    peers.current.forEach((_, uid) => closePeer(uid));
    localAnalyserRef.current = null;
    remoteAnalysers.current.clear();
    remoteAnalyserCtxRef.current?.close().catch(() => {});
    remoteAnalyserCtxRef.current = null;
    setSpeakingUserIds(new Set());
    setActiveVcId(null);
    setConnectedVc(null);
    setIsMuted(false);
    setLocallyMutedIds(new Set());
    setWatchState(null);
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
      const { stream, analyser } = await getProcessedStream(vc.mode);
      localStream.current = stream;
      localAnalyserRef.current = analyser;
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

  /** Mudo local — só afeta o que EU escuto dessa pessoa, não é broadcast. */
  const toggleLocalMute = (userId: number) => {
    const nowMuted = !locallyMutedIds.has(userId);
    const next = new Set(locallyMutedIds);
    if (nowMuted) next.add(userId); else next.delete(userId);
    setLocallyMutedIds(next);
    const audio = audioRefs.current.get(userId);
    if (audio) audio.muted = nowMuted;
  };

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
    if (!activeVcId || isScreenSharing || isSharingAudio) return;
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
      if ((e as Error)?.name !== 'NotAllowedError') {
        alertDialog('Não foi possível compartilhar a tela. Tente novamente.', { title: 'Erro ao compartilhar' });
      }
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

  /**
   * Compartilha só o áudio do sistema (sem vídeo) — útil pra tocar uma
   * música/áudio de jogo pra call sem expor a tela. Mutuamente exclusivo
   * com startScreenShare (a UI desabilita um enquanto o outro está ativo).
   */
  const startAudioShare = async () => {
    if (!activeVcId || isSharingAudio || isScreenSharing) return;
    try {
      const audioStream = await captureSystemAudio();
      const audioTrack = audioStream.getAudioTracks()[0];
      localAudioShareStream.current = audioStream;

      console.log(`[voice-audio-share] enviando pra ${peers.current.size} peer(s)`);
      for (const [uid, pc] of peers.current) {
        audioShareSenders.current.set(uid, pc.addTrack(audioTrack, audioStream));
        await renegotiate(uid, pc);
      }

      // Mesmo padrão do compartilhamento de tela: avisa o roster (não é
      // sinal WebRTC) — é o que faz o indicador aparecer mesmo pra quem
      // não está na call.
      getSocket().emit('voice:audio-share-start', {
        voiceChannelId: activeVcIdRef.current,
        groupChannelId: connectedGroupChannelIdRef.current,
      });

      setIsSharingAudio(true);
      playScreenShareStartSound();

      audioTrack.onended = () => { stopAudioShare(); };
    } catch (e) {
      console.error('[voice-audio-share] erro ao iniciar:', e);
      localAudioShareStream.current?.getTracks().forEach((t) => t.stop());
      localAudioShareStream.current = null;
      if ((e as Error)?.name !== 'NotAllowedError') {
        alertDialog(
          (e as Error)?.message === 'Nenhum áudio do sistema disponível pra capturar.'
            ? 'Nenhum áudio do sistema disponível pra capturar. Verifique se algo está tocando e tente de novo.'
            : 'Não foi possível compartilhar o áudio do sistema. Tente novamente.',
          { title: 'Erro ao compartilhar áudio' },
        );
      }
    }
  };

  const stopAudioShare = async () => {
    if (!localAudioShareStream.current) return;
    for (const [uid, pc] of peers.current) {
      const sender = audioShareSenders.current.get(uid);
      if (sender) {
        pc.removeTrack(sender);
        audioShareSenders.current.delete(uid);
        await renegotiate(uid, pc);
      }
    }
    localAudioShareStream.current.getTracks().forEach((t) => t.stop());
    localAudioShareStream.current = null;

    if (activeVcIdRef.current) {
      getSocket().emit('voice:audio-share-stop', {
        voiceChannelId: activeVcIdRef.current,
        groupChannelId: connectedGroupChannelIdRef.current,
      });
    }

    setIsSharingAudio(false);
    playScreenShareStopSound();
  };

  /**
   * "Assistir junto" (YouTube) — o estado de verdade fica no servidor
   * (watchState acima só reflete o último `watch:state` recebido); estas
   * funções só emitem a intenção, sem otimismo local, pra nunca divergir do
   * que o servidor manda pro resto da call.
   */
  const loadVideo = (videoId: string) => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:load', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
      videoId,
    });
  };

  const playVideo = (positionSec: number) => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:play', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
      positionSec,
    });
  };

  const pauseVideo = (positionSec: number) => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:pause', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
      positionSec,
    });
  };

  const seekVideo = (positionSec: number) => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:seek', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
      positionSec,
    });
  };

  const stopWatch = () => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:stop', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
    });
  };

  /** Toca na hora se nada estiver rolando ainda, ou entra no fim da fila se já tem vídeo tocando. */
  const addToQueue = (videoId: string) => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:add', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
      videoId,
    });
  };

  const removeFromQueue = (index: number) => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:queue-remove', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
      index,
    });
  };

  /** `endedVideoId` deixa a chamada idempotente — ver comentário do handler no gateway. */
  const playNextInQueue = (endedVideoId?: string) => {
    if (!activeVcIdRef.current) return;
    getSocket().emit('watch:next', {
      voiceChannelId: activeVcIdRef.current,
      groupChannelId: connectedGroupChannelIdRef.current,
      endedVideoId,
    });
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
    isSharingAudio,
    screenStreams,
    locallyMutedIds,
    speakingUserIds,
    watchState,
    join,
    leave,
    toggleMute,
    toggleLocalMute,
    startScreenShare,
    stopScreenShare,
    startAudioShare,
    stopAudioShare,
    loadVideo,
    playVideo,
    pauseVideo,
    seekVideo,
    stopWatch,
    addToQueue,
    removeFromQueue,
    playNextInQueue,
    createChannel,
    deleteChannel,
    renameChannel,
    updateChannelPositions,
  };
}

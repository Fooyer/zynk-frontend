import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { getSocket } from '../../services/socket';
import { IncomingCallModal } from './IncomingCallModal';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

async function getProcessedStream(): Promise<MediaStream> {
  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    },
  });

  try {
    const audioCtx = new AudioContext({ sampleRate: 48000 });

    // Carrega o noise gate worklet (arquivo em /public)
    await audioCtx.audioWorklet.addModule('/noise-gate-processor.js');

    const source = audioCtx.createMediaStreamSource(rawStream);
    const destination = audioCtx.createMediaStreamDestination();

    // High-pass: remove ruído de baixa frequência (< 80Hz) — ventilador, A/C
    const highPass = audioCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 80;
    highPass.Q.value = 0.7;

    // Noise gate: silencia quando não há voz, detecta e descarta cliques (teclado/mouse)
    const noiseGate = new AudioWorkletNode(audioCtx, 'noise-gate-processor');

    // Dynamics compressor: normaliza volume da voz
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 10;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.1;

    // Chain: source → high-pass → noise gate → compressor → output
    source.connect(highPass);
    highPass.connect(noiseGate);
    noiseGate.connect(compressor);
    compressor.connect(destination);

    return new MediaStream([...destination.stream.getAudioTracks()]);
  } catch {
    // Fallback sem worklet (Firefox ou ambientes sem suporte)
    return rawStream;
  }
}

export function CallManager() {
  const { status, peerId, peerUsername, pendingOffer, volume, setActive, setMuted, reset } = useCallStore();

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (remoteAudioRef.current) remoteAudioRef.current.volume = volume;
  }, [volume]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
  }, []);

  const createPC = useCallback(
    (currentPeerId: number) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          getSocket()?.emit('call:ice-candidate', {
            targetUserId: currentPeerId,
            candidate: candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        if (!remoteAudioRef.current) remoteAudioRef.current = new Audio();
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.autoplay = true;
        remoteAudioRef.current.play().catch(() => {});
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          getSocket()?.emit('call:status_update', { inCall: false });
          cleanup();
          reset();
        }
      };

      pcRef.current = pc;
      return pc;
    },
    [cleanup, reset],
  );

  // Caller: starts when status becomes 'calling'
  useEffect(() => {
    if (status !== 'calling' || !peerId) return;

    const currentPeerId = peerId;
    const channelId = useCallStore.getState().channelId;

    (async () => {
      try {
        const stream = await getProcessedStream();
        localStreamRef.current = stream;

        const pc = createPC(currentPeerId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        getSocket()?.emit('call:offer', {
          targetUserId: currentPeerId,
          offer: pc.localDescription,
          channelId,
        });
      } catch {
        cleanup();
        reset();
      }
    })();
  }, [status]);

  // Socket event handlers
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onIncoming = (data: { from: { id: number; username: string }; offer: RTCSessionDescriptionInit; channelId: number }) => {
      const { status } = useCallStore.getState();
      if (status !== 'idle') {
        // Already in a call — reject automatically
        socket.emit('call:reject', { targetUserId: data.from.id });
        return;
      }
      useCallStore.getState().receiveCall(data.from, data.channelId, data.offer);
    };

    const onAnswered = async (data: { answer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(data.answer);
      // Flush queued candidates
      for (const c of pendingCandidates.current) {
        await pcRef.current.addIceCandidate(c).catch(() => {});
      }
      pendingCandidates.current = [];
      setActive();
      const { channelId } = useCallStore.getState();
      if (channelId) useChatStore.getState().addSystemMessage(channelId, 'Chamada iniciada');
      getSocket()?.emit('call:status_update', { inCall: true });
    };

    const onIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      if (pcRef.current?.remoteDescription) {
        await pcRef.current.addIceCandidate(data.candidate).catch(() => {});
      } else {
        pendingCandidates.current.push(data.candidate);
      }
    };

    const onRejected = () => {
      getSocket()?.emit('call:status_update', { inCall: false });
      cleanup();
      reset();
    };

    const onHangup = () => {
      const { status: currentStatus, channelId } = useCallStore.getState();
      if (currentStatus === 'active' && channelId) {
        useChatStore.getState().addSystemMessage(channelId, 'Chamada encerrada');
      }
      getSocket()?.emit('call:status_update', { inCall: false });
      cleanup();
      reset();
    };

    // Custom event listeners for DMSidebar communication
    const onToggleMute = () => {
      const newMuted = !useCallStore.getState().isMuted;
      localStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
      setMuted(newMuted);
    };

    const onHangupEvent = () => {
      const { peerId, status: currentStatus, channelId } = useCallStore.getState();
      if (peerId) getSocket()?.emit('call:hangup', { targetUserId: peerId });
      if (currentStatus === 'active' && channelId) {
        useChatStore.getState().addSystemMessage(channelId, 'Chamada encerrada');
      }
      getSocket()?.emit('call:status_update', { inCall: false });
      cleanup();
      reset();
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered', onAnswered);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:rejected', onRejected);
    socket.on('call:hangup', onHangup);
    window.addEventListener('call:toggle-mute', onToggleMute);
    window.addEventListener('call:hangup', onHangupEvent);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:rejected', onRejected);
      socket.off('call:hangup', onHangup);
      window.removeEventListener('call:toggle-mute', onToggleMute);
      window.removeEventListener('call:hangup', onHangupEvent);
    };
  }, []);

  const handleAccept = useCallback(async () => {
    const { pendingOffer, peerId } = useCallStore.getState();
    if (!pendingOffer || !peerId) return;

    const currentPeerId = peerId;

    try {
      const stream = await getProcessedStream();
      localStreamRef.current = stream;

      const pc = createPC(currentPeerId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      await pc.setRemoteDescription(pendingOffer);

      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(c).catch(() => {});
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      getSocket()?.emit('call:answer', {
        targetUserId: currentPeerId,
        answer: pc.localDescription,
      });

      setActive();
      const { channelId } = useCallStore.getState();
      if (channelId) useChatStore.getState().addSystemMessage(channelId, 'Chamada iniciada');
      getSocket()?.emit('call:status_update', { inCall: true });
    } catch {
      cleanup();
      reset();
    }
  }, [createPC, setActive, cleanup, reset]);

  const handleReject = useCallback(() => {
    const { peerId } = useCallStore.getState();
    if (peerId) getSocket()?.emit('call:reject', { targetUserId: peerId });
    getSocket()?.emit('call:status_update', { inCall: false });
    cleanup();
    reset();
  }, [cleanup, reset]);

  if (status === 'idle') return null;

  if (status === 'ringing' && peerUsername) {
    return (
      <IncomingCallModal
        peerUsername={peerUsername}
        onAccept={handleAccept}
        onReject={handleReject}
      />
    );
  }

  return null;
}

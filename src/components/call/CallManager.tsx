import { useEffect, useRef, useCallback } from 'react';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getSocket } from '../../services/socket';
import { remoteScreenStreamRef, localScreenStreamRef } from '../../services/callStream';
import { IncomingCallModal } from './IncomingCallModal';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

async function getProcessedStream(): Promise<MediaStream> {
  const settings = useSettingsStore.getState();
  const deviceConstraints: MediaTrackConstraints = {
    noiseSuppression: settings.echoCancellation,
    echoCancellation: settings.echoCancellation,
    autoGainControl: settings.autoGainControl,
    channelCount: 1,
    sampleRate: 48000,
  };
  if (settings.inputDeviceId) {
    deviceConstraints.deviceId = { exact: settings.inputDeviceId };
  }

  const rawStream = await navigator.mediaDevices.getUserMedia({ audio: deviceConstraints });

  // Nível 'off' — retorna stream cru sem processamento
  if (settings.noiseSuppression === 'off') return rawStream;

  try {
    const audioCtx = new AudioContext({ sampleRate: 48000 });
    const source = audioCtx.createMediaStreamSource(rawStream);
    const destination = audioCtx.createMediaStreamDestination();

    // Input gain (volume do microfone)
    const inputGain = audioCtx.createGain();
    inputGain.gain.value = settings.inputVolume;

    // Nível 'low': apenas filtros básicos (highpass + lowpass + compressor)
    // Nível 'medium': filtros + noise gate
    // Nível 'high': cadeia completa (filtros + EQ + noise gate + compressor + makeup)

    const isLow = settings.noiseSuppression === 'low';
    const isMediumOrHigh = settings.noiseSuppression === 'medium' || settings.noiseSuppression === 'high';
    const isHigh = settings.noiseSuppression === 'high';

    // 1. High-pass: remove rumble e ruído de baixa frequência
    const highPass = audioCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = isHigh ? 100 : 80;
    highPass.Q.value = 0.71;

    // 2. Low-pass: corta frequências acima da voz
    const lowPass = audioCtx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = isHigh ? 8000 : 12000;
    lowPass.Q.value = 0.71;

    // Conecta início: source → inputGain → highPass → lowPass
    source.connect(inputGain);
    inputGain.connect(highPass);
    highPass.connect(lowPass);

    let lastNode: AudioNode = lowPass;

    // 3. Presença vocal (apenas 'high')
    if (isHigh) {
      const presence = audioCtx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2500;
      presence.Q.value = 1.2;
      presence.gain.value = 3;
      lastNode.connect(presence);
      lastNode = presence;

      // 4. De-esser (apenas 'high')
      const deesser = audioCtx.createBiquadFilter();
      deesser.type = 'peaking';
      deesser.frequency.value = 6000;
      deesser.Q.value = 2;
      deesser.gain.value = -3;
      lastNode.connect(deesser);
      lastNode = deesser;
    }

    // 5. Noise gate (medium e high)
    if (isMediumOrHigh) {
      await audioCtx.audioWorklet.addModule('/noise-gate-processor.js');
      const noiseGate = new AudioWorkletNode(audioCtx, 'noise-gate-processor');
      lastNode.connect(noiseGate);
      lastNode = noiseGate;
    }

    // 6. Compressor
    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = isHigh ? -28 : -20;
    compressor.knee.value = isHigh ? 12 : 15;
    compressor.ratio.value = isHigh ? 6 : 4;
    compressor.attack.value = 0.003;
    compressor.release.value = isLow ? 0.1 : 0.15;
    lastNode.connect(compressor);
    lastNode = compressor;

    // 7. Makeup gain (medium e high)
    if (isMediumOrHigh) {
      const makeupGain = audioCtx.createGain();
      makeupGain.gain.value = isHigh ? 1.4 : 1.2;
      lastNode.connect(makeupGain);
      lastNode = makeupGain;
    }

    lastNode.connect(destination);
    return new MediaStream([...destination.stream.getAudioTracks()]);
  } catch {
    return rawStream;
  }
}

/** Aplica parâmetros de qualidade no sender de vídeo da tela após renegociação. */
async function applyScreenVideoParams(sender: RTCRtpSender) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) return;
    params.encodings[0].maxBitrate = 3_000_000;  // 3 Mbps — suficiente para 1080p@30
    params.encodings[0].maxFramerate = 30;
    // degradationPreference 'maintain-framerate': reduz resolução se necessário mas mantém FPS
    params.degradationPreference = 'maintain-framerate';
    await sender.setParameters(params);
  } catch { /* setParameters pode falhar antes da negociação completar */ }
}

export function CallManager() {
  const {
    status, peerId, peerUsername, pendingOffer, volume,
    setActive, setMuted, setScreenSharing, setRemoteHasScreen, reset,
  } = useCallStore();

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteGainRef = useRef<GainNode | null>(null);
  const remoteAudioCtxRef = useRef<AudioContext | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  const screenAudioSenderRef = useRef<RTCRtpSender | null>(null);
  // Ref ao primeiro track de áudio remoto (microfone) para distinguir do áudio da tela
  const initialRemoteAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const isConnectedRef = useRef(false);

  // Volume: usa GainNode para permitir amplificação acima de 100% (até 200%)
  useEffect(() => {
    if (remoteGainRef.current) {
      remoteGainRef.current.gain.value = volume;
    } else if (remoteAudioRef.current) {
      // Fallback sem GainNode
      remoteAudioRef.current.volume = Math.min(volume, 1);
    }
  }, [volume]);

  // Sons de chamada: ringback (ligando) e ringtone (recebendo)
  useEffect(() => {
    if (status !== 'calling' && status !== 'ringing') return;

    let audioCtx: AudioContext | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    // Toca um burst de tom com envelope suave de ataque/release
    const playBurst = (durationSec: number, delayMs = 0) => {
      setTimeout(() => {
        if (stopped || !audioCtx) return;
        const now = audioCtx.currentTime;
        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.015);
        gain.gain.setValueAtTime(0.18, now + durationSec - 0.015);
        gain.gain.linearRampToValueAtTime(0, now + durationSec);
        gain.connect(audioCtx.destination);
        // 440 + 480 Hz = tom clássico de telefone
        [440, 480].forEach((freq) => {
          const osc = audioCtx!.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq;
          osc.connect(gain);
          osc.start(now);
          osc.stop(now + durationSec);
        });
      }, delayMs);
    };

    const schedulePattern = () => {
      if (stopped) return;
      if (status === 'ringing') {
        // Ringtone: duplo toque (0.4s, pausa, 0.4s) a cada 4s
        playBurst(0.4);
        playBurst(0.4, 600);
        timerId = setTimeout(schedulePattern, 4000);
      } else {
        // Ringback: toque longo (1s) a cada 4s (som que o chamador ouve)
        playBurst(1.0);
        timerId = setTimeout(schedulePattern, 4000);
      }
    };

    audioCtx = new AudioContext();
    audioCtx.resume().then(schedulePattern);

    return () => {
      stopped = true;
      if (timerId) clearTimeout(timerId);
      audioCtx?.close();
    };
  }, [status]);

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current = null;
    screenSenderRef.current = null;
    screenAudioSenderRef.current = null;
    initialRemoteAudioTrackRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    pendingCandidates.current = [];
    isConnectedRef.current = false;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteAudioCtxRef.current?.close().catch(() => {});
    remoteAudioCtxRef.current = null;
    remoteGainRef.current = null;
    remoteScreenStreamRef.current = null;
    window.dispatchEvent(new CustomEvent('call:screen-stream-changed'));
  }, []);

  const createPC = useCallback(
    (currentPeerId: number) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Stream acumulador: todos os tracks de áudio remoto (mic + áudio da tela)
      const remoteAudioStream = new MediaStream();

      // Audio element como destino do áudio remoto
      if (!remoteAudioRef.current) remoteAudioRef.current = new Audio();
      remoteAudioRef.current.srcObject = remoteAudioStream;
      remoteAudioRef.current.autoplay = true;

      // Aplica dispositivo de saída configurado
      const outputId = useSettingsStore.getState().outputDeviceId;
      if (outputId && typeof remoteAudioRef.current.setSinkId === 'function') {
        remoteAudioRef.current.setSinkId(outputId).catch(() => {});
      }

      // Função para configurar Web Audio com GainNode (chamada quando o primeiro track chegar)
      let remoteAudioSetup = false;
      const setupRemoteGain = () => {
        if (remoteAudioSetup) return;
        remoteAudioSetup = true;
        try {
          const remoteCtx = new AudioContext({ sampleRate: 48000 });
          remoteAudioCtxRef.current = remoteCtx;
          // Usa o audio element como source (ele já tem os tracks)
          const source = remoteCtx.createMediaElementSource(remoteAudioRef.current!);
          const gainNode = remoteCtx.createGain();
          gainNode.gain.value = useCallStore.getState().volume;
          remoteGainRef.current = gainNode;
          source.connect(gainNode);
          gainNode.connect(remoteCtx.destination);
          remoteCtx.resume().catch(() => {});
        } catch {
          // Fallback: volume normal via audio element (sem boost)
          remoteAudioRef.current!.volume = Math.min(useCallStore.getState().volume, 1);
        }
      };

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          getSocket()?.emit('call:ice-candidate', {
            targetUserId: currentPeerId,
            candidate: candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        const track = event.track;
        if (track.kind === 'audio') {
          remoteAudioStream.addTrack(track);
          // Configura o GainNode na primeira vez que um track de áudio chega
          setupRemoteGain();
          remoteAudioRef.current?.play().catch(() => {});
          // Salva o primeiro track (microfone) para não removê-lo no screen-stop
          if (!initialRemoteAudioTrackRef.current) {
            initialRemoteAudioTrackRef.current = track;
          }
        } else if (track.kind === 'video') {
          const stream = event.streams[0] ?? new MediaStream([track]);
          remoteScreenStreamRef.current = stream;
          useCallStore.getState().setRemoteHasScreen(true);
          window.dispatchEvent(new CustomEvent('call:screen-stream-changed'));
          track.onended = () => {
            remoteScreenStreamRef.current = null;
            useCallStore.getState().setRemoteHasScreen(false);
            window.dispatchEvent(new CustomEvent('call:screen-stream-changed'));
          };
        }
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
        socket.emit('call:reject', { targetUserId: data.from.id });
        return;
      }
      useCallStore.getState().receiveCall(data.from, data.channelId, data.offer);
    };

    const onAnswered = async (data: { answer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      await pcRef.current.setRemoteDescription(data.answer);
      for (const c of pendingCandidates.current) {
        await pcRef.current.addIceCandidate(c).catch(() => {});
      }
      pendingCandidates.current = [];
      isConnectedRef.current = true;
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

    // Renegotiation — usado para screen share
    const onReoffer = async (data: { offer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        const { peerId } = useCallStore.getState();
        getSocket()?.emit('call:reanswer', { targetUserId: peerId, answer });
      } catch (e) {
        console.error('[reoffer] error:', e);
      }
    };

    const onReanswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        // Aplica parâmetros de qualidade após renegociação concluída
        if (screenSenderRef.current) {
          await applyScreenVideoParams(screenSenderRef.current);
        }
      } catch (e) {
        console.error('[reanswer] error:', e);
      }
    };

    // Receptor: o outro lado parou de compartilhar
    const onScreenStop = () => {
      // Remove tracks de áudio da tela (mantém apenas o microfone)
      if (remoteAudioRef.current?.srcObject) {
        const stream = remoteAudioRef.current.srcObject as MediaStream;
        stream.getAudioTracks().forEach((t) => {
          if (t !== initialRemoteAudioTrackRef.current) {
            stream.removeTrack(t);
          }
        });
      }
      remoteScreenStreamRef.current = null;
      useCallStore.getState().setRemoteHasScreen(false);
      window.dispatchEvent(new CustomEvent('call:screen-stream-changed'));
    };

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

    // Helper: renegociar após mudança de tracks
    const renegotiate = async (targetPeerId: number) => {
      if (!pcRef.current) return;
      const pc = pcRef.current;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      getSocket()?.emit('call:reoffer', { targetUserId: targetPeerId, offer });
    };

    const notifyScreenStop = (targetPeerId: number) => {
      getSocket()?.emit('call:screen-stop', { targetUserId: targetPeerId });
    };

    const stopScreenShare = async (targetPeerId: number) => {
      if (screenSenderRef.current && pcRef.current) {
        pcRef.current.removeTrack(screenSenderRef.current);
        screenSenderRef.current = null;
      }
      if (screenAudioSenderRef.current && pcRef.current) {
        pcRef.current.removeTrack(screenAudioSenderRef.current);
        screenAudioSenderRef.current = null;
      }
      localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
      setScreenSharing(false);
      notifyScreenStop(targetPeerId);
      await renegotiate(targetPeerId);
    };

    const onScreenShareToggle = async () => {
      const { isScreenSharing, peerId } = useCallStore.getState();
      if (!pcRef.current || !peerId) {
        console.warn('[screen-share] PC ou peerId não disponível', { pc: !!pcRef.current, peerId });
        return;
      }

      if (isScreenSharing) {
        await stopScreenShare(peerId);
        return;
      }

      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 30, min: 10 },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          } as MediaTrackConstraints,
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });

        const videoTrack = screenStream.getVideoTracks()[0];
        // 'detail' diz ao encoder para priorizar nitidez vs motion blur (ideal para tela)
        videoTrack.contentHint = 'detail';

        localScreenStreamRef.current = screenStream;
        screenSenderRef.current = pcRef.current.addTrack(videoTrack, screenStream);

        // Áudio do sistema/aba (disponível no Linux com PipeWire ou Windows)
        const audioTracks = screenStream.getAudioTracks();
        if (audioTracks.length > 0) {
          screenAudioSenderRef.current = pcRef.current.addTrack(audioTracks[0], screenStream);
        }

        setScreenSharing(true);
        await renegotiate(peerId);
        // Os parâmetros de qualidade são aplicados em onReanswer após a resposta

        // Usuário parou pelo controle nativo do sistema (botão "parar compartilhamento")
        videoTrack.onended = async () => {
          const currentPeerId = useCallStore.getState().peerId;
          if (currentPeerId && pcRef.current) {
            await stopScreenShare(currentPeerId);
          }
        };
      } catch (e) {
        console.error('[screen-share] getDisplayMedia falhou:', e);
      }
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered', onAnswered);
    socket.on('call:ice-candidate', onIceCandidate);
    socket.on('call:rejected', onRejected);
    socket.on('call:hangup', onHangup);
    socket.on('call:reoffer', onReoffer);
    socket.on('call:reanswer', onReanswer);
    socket.on('call:screen-stop', onScreenStop);
    window.addEventListener('call:toggle-mute', onToggleMute);
    window.addEventListener('call:hangup', onHangupEvent);
    window.addEventListener('call:screen-share-toggle', onScreenShareToggle as EventListener);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:rejected', onRejected);
      socket.off('call:hangup', onHangup);
      socket.off('call:reoffer', onReoffer);
      socket.off('call:reanswer', onReanswer);
      socket.off('call:screen-stop', onScreenStop);
      window.removeEventListener('call:toggle-mute', onToggleMute);
      window.removeEventListener('call:hangup', onHangupEvent);
      window.removeEventListener('call:screen-share-toggle', onScreenShareToggle as EventListener);
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

      isConnectedRef.current = true;
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

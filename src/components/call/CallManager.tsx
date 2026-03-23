import { useEffect, useRef, useCallback, useState } from 'react';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getSocket } from '../../services/socket';
import { remoteScreenStreamRef, localScreenStreamRef } from '../../services/callStream';
import {
  startGamepadPolling,
  stopGamepadPolling,
  deserializeGamepadState,
} from '../../services/gamepadService';
import { IncomingCallModal } from './IncomingCallModal';
import { ScreenPicker } from './ScreenPicker';
import type { ScreenSource } from '../../types';

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

    const inputGain = audioCtx.createGain();
    inputGain.gain.value = settings.inputVolume;

    const isLow = settings.noiseSuppression === 'low';
    const isMediumOrHigh = settings.noiseSuppression === 'medium' || settings.noiseSuppression === 'high';
    const isHigh = settings.noiseSuppression === 'high';

    const highPass = audioCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = isHigh ? 100 : 80;
    highPass.Q.value = 0.71;

    const lowPass = audioCtx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = isHigh ? 8000 : 12000;
    lowPass.Q.value = 0.71;

    source.connect(inputGain);
    inputGain.connect(highPass);
    highPass.connect(lowPass);

    let lastNode: AudioNode = lowPass;

    if (isHigh) {
      const presence = audioCtx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2500;
      presence.Q.value = 1.2;
      presence.gain.value = 3;
      lastNode.connect(presence);
      lastNode = presence;

      const deesser = audioCtx.createBiquadFilter();
      deesser.type = 'peaking';
      deesser.frequency.value = 6000;
      deesser.Q.value = 2;
      deesser.gain.value = -3;
      lastNode.connect(deesser);
      lastNode = deesser;
    }

    if (isMediumOrHigh) {
      await audioCtx.audioWorklet.addModule('/noise-gate-processor.js');
      const noiseGate = new AudioWorkletNode(audioCtx, 'noise-gate-processor');
      lastNode.connect(noiseGate);
      lastNode = noiseGate;
    }

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = isHigh ? -28 : -20;
    compressor.knee.value = isHigh ? 12 : 15;
    compressor.ratio.value = isHigh ? 6 : 4;
    compressor.attack.value = 0.003;
    compressor.release.value = isLow ? 0.1 : 0.15;
    lastNode.connect(compressor);
    lastNode = compressor;

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

async function applyScreenVideoParams(sender: RTCRtpSender) {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) return;
    params.encodings[0].maxBitrate = 3_000_000;
    params.encodings[0].maxFramerate = 30;
    params.degradationPreference = 'maintain-framerate';
    await sender.setParameters(params);
  } catch { /* pode falhar antes da negociação completar */ }
}

/**
 * Captura a tela usando getDisplayMedia.
 * Se sourceId é fornecido, avisa o main process antes para que o
 * setDisplayMediaRequestHandler use o source escolhido pelo usuário.
 */
async function captureScreen(sourceId?: string): Promise<MediaStream> {
  try {
    // Se tem sourceId, avisa o main process qual source usar.
    // O await garante que o main process já guardou o source ANTES
    // de getDisplayMedia disparar o handler.
    if (sourceId && window.electronAPI?.selectScreenSource) {
      await window.electronAPI.selectScreenSource(sourceId);
    }
    return await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (e) {
    console.error('[captureScreen] getDisplayMedia falhou:', e);
    throw e;
  }
}

export function CallManager() {
  const {
    status, peerId, peerUsername, pendingOffer, volume,
    setActive, setMuted, setScreenSharing, setRemoteHasScreen, reset,
  } = useCallStore();
  const [showScreenPicker, setShowScreenPicker] = useState(false);
  const startScreenShareRef = useRef<((sourceId: string) => Promise<void>) | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteGainRef = useRef<GainNode | null>(null);
  const remoteAudioCtxRef = useRef<AudioContext | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const screenSenderRef = useRef<RTCRtpSender | null>(null);
  const screenAudioSenderRef = useRef<RTCRtpSender | null>(null);
  const initialRemoteAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const isConnectedRef = useRef(false);
  const gamepadChannelRef = useRef<RTCDataChannel | null>(null);
  const remoteGamepadChannelRef = useRef<RTCDataChannel | null>(null);

  useEffect(() => {
    if (remoteGainRef.current) {
      remoteGainRef.current.gain.value = volume;
    } else if (remoteAudioRef.current) {
      remoteAudioRef.current.volume = Math.min(volume, 1);
    }
  }, [volume]);

  useEffect(() => {
    if (status !== 'calling' && status !== 'ringing') return;

    let audioCtx: AudioContext | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

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
        playBurst(0.4);
        playBurst(0.4, 600);
        timerId = setTimeout(schedulePattern, 4000);
      } else {
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
    // Gamepad cleanup
    stopGamepadPolling();
    gamepadChannelRef.current?.close();
    gamepadChannelRef.current = null;
    remoteGamepadChannelRef.current?.close();
    remoteGamepadChannelRef.current = null;
    window.electronAPI?.gamepadDestroyVirtual?.().catch(() => {});

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

      const remoteAudioStream = new MediaStream();

      if (!remoteAudioRef.current) remoteAudioRef.current = new Audio();
      remoteAudioRef.current.srcObject = remoteAudioStream;
      remoteAudioRef.current.autoplay = true;

      const outputId = useSettingsStore.getState().outputDeviceId;
      if (outputId && typeof remoteAudioRef.current.setSinkId === 'function') {
        remoteAudioRef.current.setSinkId(outputId).catch(() => {});
      }

      let remoteAudioSetup = false;
      const setupRemoteGain = () => {
        if (remoteAudioSetup) return;
        remoteAudioSetup = true;
        try {
          const remoteCtx = new AudioContext({ sampleRate: 48000 });
          remoteAudioCtxRef.current = remoteCtx;
          const source = remoteCtx.createMediaElementSource(remoteAudioRef.current!);
          const gainNode = remoteCtx.createGain();
          gainNode.gain.value = useCallStore.getState().volume;
          remoteGainRef.current = gainNode;
          source.connect(gainNode);
          gainNode.connect(remoteCtx.destination);
          remoteCtx.resume().catch(() => {});
        } catch {
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
          setupRemoteGain();
          remoteAudioRef.current?.play().catch(() => {});
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

      // ── Gamepad DataChannel ──
      // Cria o canal no lado do caller; o callee recebe via ondatachannel
      const gpChannel = pc.createDataChannel('gamepad', {
        ordered: false,
        maxRetransmits: 0,
      });
      gpChannel.binaryType = 'arraybuffer';
      gamepadChannelRef.current = gpChannel;

      // Recebe DataChannel criado pelo peer remoto
      pc.ondatachannel = (event) => {
        if (event.channel.label === 'gamepad') {
          const ch = event.channel;
          ch.binaryType = 'arraybuffer';
          remoteGamepadChannelRef.current = ch;
          ch.onmessage = (msg) => {
            if (msg.data instanceof ArrayBuffer) {
              const state = deserializeGamepadState(msg.data);
              window.electronAPI?.gamepadInput?.(state);
            }
          };
          ch.onclose = () => {
            remoteGamepadChannelRef.current = null;
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

  // Caller
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

  // Socket + window events
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
        if (screenSenderRef.current) {
          await applyScreenVideoParams(screenSenderRef.current);
        }
      } catch (e) {
        console.error('[reanswer] error:', e);
      }
    };

    const onScreenStop = () => {
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

    // ── Gamepad sharing ──
    const onGamepadStart = async () => {
      // Peer remoto começou a enviar gamepad — criar controle virtual
      const result = await window.electronAPI?.gamepadCreateVirtual?.();
      if (result && !result.success) {
        console.warn('[gamepad] Falha ao criar controle virtual:', result.error);
      }
      useCallStore.getState().setRemoteHasGamepad(true);
    };

    const onGamepadStop = () => {
      window.electronAPI?.gamepadDestroyVirtual?.().catch(() => {});
      useCallStore.getState().setRemoteHasGamepad(false);
    };

    const onGamepadToggle = () => {
      const { isGamepadSharing, peerId } = useCallStore.getState();
      if (!peerId) return;

      if (isGamepadSharing) {
        // Parar de enviar gamepad
        stopGamepadPolling();
        useCallStore.getState().setGamepadSharing(false);
        getSocket()?.emit('call:gamepad-stop', { targetUserId: peerId });
        return;
      }

      // Começar a enviar gamepad
      const channel = gamepadChannelRef.current;
      if (!channel || channel.readyState !== 'open') {
        console.warn('[gamepad] DataChannel não está aberto');
        return;
      }

      startGamepadPolling(channel);
      useCallStore.getState().setGamepadSharing(true);
      getSocket()?.emit('call:gamepad-start', { targetUserId: peerId });
    };

    // ── Screen share toggle ──
    const onScreenShareToggle = async () => {
      const { isScreenSharing, peerId } = useCallStore.getState();
      if (!pcRef.current || !peerId) return;

      if (isScreenSharing) {
        await stopScreenShare(peerId);
        return;
      }

      // Abre o picker — a captura real acontece via startScreenShareRef
      setShowScreenPicker(true);
    };

    // Função chamada pelo picker após o usuário escolher o source
    startScreenShareRef.current = async (sourceId: string) => {
      const pc = pcRef.current;
      if (!pc) return;
      const { peerId: pid } = useCallStore.getState();
      if (!pid) return;

      try {
        const screenStream = await captureScreen(sourceId);

        const videoTrack = screenStream.getVideoTracks()[0];
        if (!videoTrack) return;
        videoTrack.contentHint = 'detail';

        localScreenStreamRef.current = screenStream;
        screenSenderRef.current = pc.addTrack(videoTrack, screenStream);

        const audioTracks = screenStream.getAudioTracks();
        if (audioTracks.length > 0) {
          screenAudioSenderRef.current = pc.addTrack(audioTracks[0], screenStream);
        }

        setScreenSharing(true);
        await renegotiate(pid);

        videoTrack.onended = async () => {
          const currentPeerId = useCallStore.getState().peerId;
          if (currentPeerId && pcRef.current) {
            await stopScreenShare(currentPeerId);
          }
        };
      } catch (e) {
        console.error('[screen-share] ERRO:', e);
        localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
        localScreenStreamRef.current = null;
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
    socket.on('call:gamepad-start', onGamepadStart);
    socket.on('call:gamepad-stop', onGamepadStop);
    window.addEventListener('call:toggle-mute', onToggleMute);
    window.addEventListener('call:hangup', onHangupEvent);
    window.addEventListener('call:screen-share-toggle', onScreenShareToggle as EventListener);
    window.addEventListener('call:gamepad-toggle', onGamepadToggle as EventListener);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered', onAnswered);
      socket.off('call:ice-candidate', onIceCandidate);
      socket.off('call:rejected', onRejected);
      socket.off('call:hangup', onHangup);
      socket.off('call:reoffer', onReoffer);
      socket.off('call:reanswer', onReanswer);
      socket.off('call:screen-stop', onScreenStop);
      socket.off('call:gamepad-start', onGamepadStart);
      socket.off('call:gamepad-stop', onGamepadStop);
      window.removeEventListener('call:toggle-mute', onToggleMute);
      window.removeEventListener('call:hangup', onHangupEvent);
      window.removeEventListener('call:screen-share-toggle', onScreenShareToggle as EventListener);
      window.removeEventListener('call:gamepad-toggle', onGamepadToggle as EventListener);
      startScreenShareRef.current = null;
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

  const handlePickerSelect = useCallback((source: ScreenSource) => {
    setShowScreenPicker(false);
    startScreenShareRef.current?.(source.id);
  }, []);

  const handlePickerCancel = useCallback(() => {
    setShowScreenPicker(false);
  }, []);

  return (
    <>
      {status === 'ringing' && peerUsername && (
        <IncomingCallModal
          peerUsername={peerUsername}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
      {showScreenPicker && (
        <ScreenPicker
          onSelect={handlePickerSelect}
          onCancel={handlePickerCancel}
        />
      )}
    </>
  );
}

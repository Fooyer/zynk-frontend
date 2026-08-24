import { useEffect, useRef, useCallback, useState } from 'react';
import { useCallStore } from '../../stores/callStore';
import { useChatStore } from '../../stores/chatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { getSocket } from '../../services/socket';
import { remoteScreenStreamRef, localScreenStreamRef, localAnalyserRef, remoteAnalyserRef } from '../../services/callStream';
import { captureScreen, captureSystemAudio } from '../../services/screenCapture';
import { ICE_SERVERS } from '../../services/iceServers';
import { applyLowLatencySenderParams, withLowLatencyOpus } from '../../services/lowLatencyAudio';
import { getProcessedStream } from '../../services/audioProcessing';
import { alertDialog } from '../../stores/dialogStore';
import {
  playJoinCallSound,
  playLeaveCallSound,
  playMuteSound,
  playUnmuteSound,
  playScreenShareStartSound,
  playScreenShareStopSound,
} from '../../services/callSounds';
import { IncomingCallModal } from './IncomingCallModal';
import { ScreenPicker } from './ScreenPicker';
import type { CallMode, ScreenSource } from '../../types';

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

export function CallManager() {
  const {
    status, peerId, peerUsername, pendingOffer, volume, mode,
    setActive, setMuted, setScreenSharing, setSharingAudio, setRemoteHasScreen, reset,
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
    localAnalyserRef.current = null;
    remoteAnalyserRef.current = null;
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
          const analyser = remoteCtx.createAnalyser();
          analyser.fftSize = 256;
          remoteAnalyserRef.current = analyser;
          const gainNode = remoteCtx.createGain();
          gainNode.gain.value = useCallStore.getState().volume;
          remoteGainRef.current = gainNode;
          source.connect(analyser);
          analyser.connect(gainNode);
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
          console.log('[call-ontrack] áudio recebido:', { trackId: track.id, muted: track.muted, readyState: track.readyState });
          remoteAudioRef.current?.play().then(
            () => console.log('[call-ontrack] audio.play() ok'),
            (err) => console.error('[call-ontrack] audio.play() FALHOU:', err),
          );
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

  // Caller
  useEffect(() => {
    if (status !== 'calling' || !peerId) return;

    const currentPeerId = peerId;
    const channelId = useCallStore.getState().channelId;

    const mode = useCallStore.getState().mode;

    (async () => {
      try {
        const { stream, analyser } = await getProcessedStream(mode);
        localStreamRef.current = stream;
        localAnalyserRef.current = analyser;

        const pc = createPC(currentPeerId);
        stream.getTracks().forEach((track) => {
          const sender = pc.addTrack(track, stream);
          if (mode === 'game') applyLowLatencySenderParams(sender);
        });

        const offer = await pc.createOffer();
        if (mode === 'game' && offer.sdp) offer.sdp = withLowLatencyOpus(offer.sdp);
        await pc.setLocalDescription(offer);

        getSocket()?.emit('call:offer', {
          targetUserId: currentPeerId,
          offer: pc.localDescription,
          channelId,
          mode,
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

    const onIncoming = (data: { from: { id: number; username: string }; offer: RTCSessionDescriptionInit; channelId: number; mode?: CallMode }) => {
      const { status } = useCallStore.getState();
      if (status !== 'idle') {
        socket.emit('call:reject', { targetUserId: data.from.id });
        return;
      }
      useCallStore.getState().receiveCall(data.from, data.channelId, data.offer, data.mode);
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
      playJoinCallSound();
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
        playLeaveCallSound();
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
        if (useCallStore.getState().mode === 'game' && answer.sdp) answer.sdp = withLowLatencyOpus(answer.sdp);
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
      if (newMuted) playMuteSound(); else playUnmuteSound();
    };

    const onHangupEvent = () => {
      const { peerId, status: currentStatus, channelId } = useCallStore.getState();
      if (peerId) getSocket()?.emit('call:hangup', { targetUserId: peerId });
      if (currentStatus === 'active' && channelId) {
        useChatStore.getState().addSystemMessage(channelId, 'Chamada encerrada');
        playLeaveCallSound();
      }
      getSocket()?.emit('call:status_update', { inCall: false });
      cleanup();
      reset();
    };

    const renegotiate = async (targetPeerId: number) => {
      if (!pcRef.current) return;
      const pc = pcRef.current;
      const offer = await pc.createOffer();
      if (useCallStore.getState().mode === 'game' && offer.sdp) offer.sdp = withLowLatencyOpus(offer.sdp);
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
      setSharingAudio(false);
      playScreenShareStopSound();
      notifyScreenStop(targetPeerId);
      await renegotiate(targetPeerId);
    };

    // ── Screen share toggle ──
    const onScreenShareToggle = async () => {
      const { isScreenSharing, isSharingAudio, peerId } = useCallStore.getState();
      if (!pcRef.current || !peerId) return;

      if (isScreenSharing) {
        await stopScreenShare(peerId);
        return;
      }
      if (isSharingAudio) return; // já compartilhando áudio — pare primeiro

      // Abre o picker — a captura real acontece via startScreenShareRef
      setShowScreenPicker(true);
    };

    // ── Compartilhar só o áudio do sistema (sem vídeo) ──
    const onAudioShareToggle = async () => {
      const { isScreenSharing, isSharingAudio, peerId } = useCallStore.getState();
      if (!pcRef.current || !peerId) return;

      if (isSharingAudio) {
        await stopScreenShare(peerId);
        return;
      }
      if (isScreenSharing) return; // já compartilhando tela — pare primeiro

      try {
        const audioStream = await captureSystemAudio();
        const audioTrack = audioStream.getAudioTracks()[0];

        localScreenStreamRef.current = audioStream;
        screenAudioSenderRef.current = pcRef.current.addTrack(audioTrack, audioStream);

        setSharingAudio(true);
        playScreenShareStartSound();
        await renegotiate(peerId);

        audioTrack.onended = async () => {
          const currentPeerId = useCallStore.getState().peerId;
          if (currentPeerId && pcRef.current) {
            await stopScreenShare(currentPeerId);
          }
        };
      } catch (e) {
        console.error('[audio-share] ERRO:', e);
        localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
        localScreenStreamRef.current = null;
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
        playScreenShareStartSound();
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
        if ((e as Error)?.name !== 'NotAllowedError') {
          alertDialog('Não foi possível compartilhar a tela. Tente novamente.', { title: 'Erro ao compartilhar' });
        }
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
    window.addEventListener('call:audio-share-toggle', onAudioShareToggle as EventListener);

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
      window.removeEventListener('call:audio-share-toggle', onAudioShareToggle as EventListener);
      startScreenShareRef.current = null;
    };
  }, []);

  const handleAccept = useCallback(async () => {
    const { pendingOffer, peerId, mode } = useCallStore.getState();
    if (!pendingOffer || !peerId) return;

    const currentPeerId = peerId;

    try {
      const { stream, analyser } = await getProcessedStream(mode);
      localStreamRef.current = stream;
      localAnalyserRef.current = analyser;

      const pc = createPC(currentPeerId);
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (mode === 'game') applyLowLatencySenderParams(sender);
      });

      await pc.setRemoteDescription(pendingOffer);

      for (const c of pendingCandidates.current) {
        await pc.addIceCandidate(c).catch(() => {});
      }
      pendingCandidates.current = [];

      const answer = await pc.createAnswer();
      if (mode === 'game' && answer.sdp) answer.sdp = withLowLatencyOpus(answer.sdp);
      await pc.setLocalDescription(answer);

      getSocket()?.emit('call:answer', {
        targetUserId: currentPeerId,
        answer: pc.localDescription,
      });

      isConnectedRef.current = true;
      setActive();
      const { channelId } = useCallStore.getState();
      if (channelId) useChatStore.getState().addSystemMessage(channelId, 'Chamada iniciada');
      playJoinCallSound();
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
          mode={mode}
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

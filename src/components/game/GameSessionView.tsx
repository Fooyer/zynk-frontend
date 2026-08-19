import { useEffect, useRef, useState, useCallback } from 'react';
import { useGameSessionStore } from '../../stores/gameSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { ICE_SERVERS } from '../../services/iceServers';

interface Props {
  onBack: () => void;
}

export function GameSessionView({ onBack }: Props) {
  const { activeSession, leaveSession } = useGameSessionStore();
  const user = useAuthStore((s) => s.user);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef<Map<number, RTCPeerConnection>>(new Map());
  const pendingCandidates = useRef<Map<number, RTCIceCandidateInit[]>>(new Map());
  const remoteDescSet = useRef<Set<number>>(new Set());
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isGamepadActive, setIsGamepadActive] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<Set<number>>(new Set());

  const isHost = activeSession && user && Number(activeSession.hostId) === Number(user.id);

  const addIceSafe = useCallback(async (pc: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('[WebRTC] Erro ao adicionar ICE candidate:', e);
    }
  }, []);

  const flushCandidates = useCallback(async (pc: RTCPeerConnection, from: number) => {
    const buffered = pendingCandidates.current.get(from) || [];
    for (const c of buffered) {
      await addIceSafe(pc, c);
    }
    pendingCandidates.current.delete(from);
    remoteDescSet.current.add(from);
  }, [addIceSafe]);

  const createPeerConnection = useCallback((targetUserId: number): RTCPeerConnection => {
    // Fechar conexão anterior se existir
    const existing = peerConnections.current.get(targetUserId);
    if (existing) {
      existing.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('game:ice-candidate', {
          targetUserId,
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
          sessionId: activeSession?.id,
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state (peer ${targetUserId}):`, pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setConnectedPeers((prev) => new Set(prev).add(targetUserId));
      }
      if (pc.iceConnectionState === 'failed') {
        console.error(`[WebRTC] ICE failed para peer ${targetUserId}, tentando restart`);
        pc.restartIce();
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state (peer ${targetUserId}):`, pc.connectionState);
    };

    peerConnections.current.set(targetUserId, pc);
    return pc;
  }, [activeSession?.id]);

  useEffect(() => {
    const socket = getSocket();

    if (isHost) {
      // Host: escuta jogadores se conectando
      socket.on('game:answer', async ({ from, answer }: { from: number; answer: RTCSessionDescriptionInit }) => {
        console.log('[WebRTC] Host recebeu answer de:', from);
        const pc = peerConnections.current.get(from);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            await flushCandidates(pc, from);
          } catch (e) {
            console.error('[WebRTC] Erro ao processar answer:', e);
          }
        }
      });

      socket.on('game:ice-candidate', async ({ from, candidate }: { from: number; candidate: RTCIceCandidateInit }) => {
        const pc = peerConnections.current.get(from);
        if (pc && candidate) {
          if (remoteDescSet.current.has(from)) {
            await addIceSafe(pc, candidate);
          } else {
            const buf = pendingCandidates.current.get(from) || [];
            buf.push(candidate);
            pendingCandidates.current.set(from, buf);
          }
        }
      });
    } else {
      // Player: escuta offer do host
      socket.on('game:offer', async ({ from, offer }: { from: number; offer: RTCSessionDescriptionInit }) => {
        console.log('[WebRTC] Player recebeu offer de:', from);
        const pc = createPeerConnection(from);

        pc.ontrack = (event) => {
          console.log('[WebRTC] ontrack fired, streams:', event.streams.length, 'track:', event.track.kind, 'readyState:', event.track.readyState);
          if (!videoRef.current) return;

          const stream = event.streams[0] || new MediaStream([event.track]);
          videoRef.current.srcObject = stream;

          // Forçar play com retry
          const tryPlay = () => {
            videoRef.current?.play().catch((err) => {
              console.warn('[WebRTC] play() falhou, retrying:', err);
              setTimeout(tryPlay, 500);
            });
          };
          tryPlay();
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          await flushCandidates(pc, from);

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          console.log('[WebRTC] Player enviando answer para:', from);
          socket.emit('game:answer', {
            targetUserId: from,
            answer: { type: answer.type, sdp: answer.sdp },
            sessionId: activeSession?.id,
          });
        } catch (e) {
          console.error('[WebRTC] Erro ao processar offer:', e);
        }
      });

      socket.on('game:ice-candidate', async ({ from, candidate }: { from: number; candidate: RTCIceCandidateInit }) => {
        const pc = peerConnections.current.get(from);
        if (pc && candidate) {
          if (remoteDescSet.current.has(from)) {
            await addIceSafe(pc, candidate);
          } else {
            const buf = pendingCandidates.current.get(from) || [];
            buf.push(candidate);
            pendingCandidates.current.set(from, buf);
          }
        }
      });
    }

    return () => {
      socket.off('game:offer');
      socket.off('game:answer');
      socket.off('game:ice-candidate');
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
      pendingCandidates.current.clear();
      remoteDescSet.current.clear();
    };
  }, [isHost, activeSession?.id, createPeerConnection, flushCandidates, addIceSafe]);

  const startScreenShare = async () => {
    if (!isHost || !activeSession) return;

    try {
      let stream: MediaStream;

      if (window.electronAPI) {
        // Selecionar source e usar getDisplayMedia (API moderna)
        const sources = await window.electronAPI.getScreenSources();
        if (sources.length > 0) {
          await window.electronAPI.selectScreenSource(sources[0].id);
          // getDisplayMedia aciona o setDisplayMediaRequestHandler no main process
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
          });
        } else return;
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }

      console.log('[WebRTC] Stream capturado, tracks:', stream.getTracks().map(t => `${t.kind}:${t.readyState}`));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Enviar offer para cada participante
      for (const p of activeSession.participants) {
        if (Number(p.userId) === Number(user?.id)) continue;

        const pc = createPeerConnection(p.userId);
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        console.log('[WebRTC] Host enviando offer para:', p.userId);
        getSocket().emit('game:offer', {
          targetUserId: p.userId,
          offer: { type: offer.type, sdp: offer.sdp },
          sessionId: activeSession.id,
        });
      }

      setIsScreenSharing(true);
    } catch (err) {
      console.error('Erro ao compartilhar tela:', err);
    }
  };

  const startGamepad = async () => {
    if (isHost || !activeSession) return;

    if (window.electronAPI?.gamepadIsAvailable) {
      const available = await window.electronAPI.gamepadIsAvailable();
      if (!available) return;
    }

    // Captura gamepad e envia via data channel
    const pc = peerConnections.current.get(activeSession.hostId);
    if (!pc) return;

    const dataChannel = pc.createDataChannel('gamepad');
    dataChannel.onopen = () => {
      setIsGamepadActive(true);

      const pollGamepad = () => {
        if (!isGamepadActive) return;
        const gamepads = navigator.getGamepads();
        const gp = gamepads[0];
        if (gp && dataChannel.readyState === 'open') {
          dataChannel.send(JSON.stringify({
            buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
            axes: [...gp.axes],
            timestamp: gp.timestamp,
          }));
        }
        requestAnimationFrame(pollGamepad);
      };
      pollGamepad();
    };
  };

  const handleLeave = async () => {
    if (!activeSession) return;
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();
    await leaveSession(activeSession.id);
    onBack();
  };

  if (!activeSession) return null;

  return (
    <div className="flex-1 flex flex-col bg-black">
      {/* Video area */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain bg-black"
        />

        {!isScreenSharing && isHost && (
          <div className="absolute inset-0 flex items-center justify-center">
            <button
              onClick={startScreenShare}
              className="px-6 py-3 bg-accent-600 hover:bg-accent-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              Compartilhar Tela
            </button>
          </div>
        )}

        {/* Participants overlay */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          {activeSession.participants.map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-semibold"
                style={{ backgroundColor: getUserColor(p.user.username) }}
              >
                {getInitials(p.user.username)}
              </div>
              <span className="text-xs text-white">{p.user.username}</span>
              {connectedPeers.has(p.userId) && (
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="h-14 bg-surface-900 border-t border-surface-700/50 flex items-center px-4 gap-3">
        <button
          onClick={onBack}
          className="text-surface-400 hover:text-surface-100 transition-colors text-sm"
        >
          Voltar
        </button>

        <div className="flex-1" />

        <span className="text-xs text-surface-400">
          {activeSession.title || 'Game Session'} - {activeSession.participants.length} jogadores
        </span>

        <div className="flex-1" />

        {!isHost && (
          <button
            onClick={startGamepad}
            disabled={isGamepadActive}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              isGamepadActive
                ? 'bg-success/20 text-success'
                : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
            }`}
          >
            {isGamepadActive ? 'Gamepad Ativo' : 'Ativar Gamepad'}
          </button>
        )}

        <button
          onClick={handleLeave}
          className="px-3 py-1.5 bg-danger hover:bg-danger/80 text-white text-xs font-medium rounded-md transition-colors"
        >
          {isHost ? 'Encerrar' : 'Sair'}
        </button>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useGameSessionStore } from '../../stores/gameSessionStore';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';
import { getInitials, getUserColor } from '../../utils/formatDate';

interface Props {
  onBack: () => void;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function GameSessionView({ onBack }: Props) {
  const { activeSession, leaveSession } = useGameSessionStore();
  const user = useAuthStore((s) => s.user);
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnections = useRef<Map<number, RTCPeerConnection>>(new Map());
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isGamepadActive, setIsGamepadActive] = useState(false);
  const [connectedPeers, setConnectedPeers] = useState<Set<number>>(new Set());

  const isHost = activeSession && user && Number(activeSession.hostId) === Number(user.id);

  useEffect(() => {
    const socket = getSocket();

    if (isHost) {
      // Host: escuta jogadores se conectando
      socket.on('game:answer', async ({ from, answer }: { from: number; answer: RTCSessionDescriptionInit }) => {
        const pc = peerConnections.current.get(from);
        if (pc) {
          await pc.setRemoteDescription(answer);
          setConnectedPeers((prev) => new Set(prev).add(from));
        }
      });

      socket.on('game:ice-candidate', async ({ from, candidate }: { from: number; candidate: RTCIceCandidateInit }) => {
        const pc = peerConnections.current.get(from);
        if (pc && candidate) {
          await pc.addIceCandidate(candidate);
        }
      });
    } else {
      // Player: escuta offer do host
      socket.on('game:offer', async ({ from, offer }: { from: number; offer: RTCSessionDescriptionInit }) => {
        const pc = createPeerConnection(from);

        pc.ontrack = (event) => {
          if (videoRef.current && event.streams[0]) {
            videoRef.current.srcObject = event.streams[0];
          }
        };

        await pc.setRemoteDescription(offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('game:answer', {
          targetUserId: from,
          answer,
          sessionId: activeSession?.id,
        });
      });

      socket.on('game:ice-candidate', async ({ from, candidate }: { from: number; candidate: RTCIceCandidateInit }) => {
        const pc = peerConnections.current.get(from);
        if (pc && candidate) {
          await pc.addIceCandidate(candidate);
        }
      });
    }

    return () => {
      socket.off('game:offer');
      socket.off('game:answer');
      socket.off('game:ice-candidate');
      // Cleanup peer connections
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
    };
  }, [isHost, activeSession?.id]);

  function createPeerConnection(targetUserId: number): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('game:ice-candidate', {
          targetUserId,
          candidate: event.candidate,
          sessionId: activeSession?.id,
        });
      }
    };

    peerConnections.current.set(targetUserId, pc);
    return pc;
  }

  const startScreenShare = async () => {
    if (!isHost || !activeSession) return;

    try {
      let stream: MediaStream;

      if (window.electronAPI) {
        const sources = await window.electronAPI.getScreenSources();
        if (sources.length > 0) {
          await window.electronAPI.selectScreenSource(sources[0].id);
          stream = await (navigator.mediaDevices as any).getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sources[0].id,
              },
            },
          });
        } else return;
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }

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

        getSocket().emit('game:offer', {
          targetUserId: p.userId,
          offer,
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

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { ScreenPicker } from '../call/ScreenPicker';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';
import type { ScreenSource, VoiceParticipant } from '../../types';

interface Props {
  voice: ReturnType<typeof useVoiceRoom>;
}

function ParticipantTile({ participant, isSelf, isMuted }: {
  participant: VoiceParticipant;
  isSelf: boolean;
  isMuted: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 w-28">
      <div className="relative">
        <div
          className="w-20 h-20 rounded-full ring-2 ring-white/[0.10] flex items-center justify-center text-white text-2xl font-bold overflow-hidden"
          style={{ backgroundColor: getUserColor(participant.username) }}
        >
          {participant.avatarUrl ? (
            <img src={participant.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            getInitials(participant.username)
          )}
        </div>
        {isMuted && (
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-danger flex items-center justify-center border-2 border-surface-950">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            </svg>
          </div>
        )}
      </div>
      <span className="text-sm font-medium text-surface-200 truncate max-w-full">
        {isSelf ? 'Você' : participant.username}
      </span>
    </div>
  );
}

function ParticipantChip({ participant, isSharing, isFocused, onClick }: {
  participant: VoiceParticipant;
  isSharing: boolean;
  isFocused: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!isSharing}
      className={`flex flex-col items-center gap-1 flex-shrink-0 w-16 ${isSharing ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div
        className={`relative w-12 h-12 rounded-full flex items-center justify-center text-white text-xs font-semibold overflow-hidden ${
          isFocused ? 'ring-2 ring-accent-500' : 'ring-1 ring-white/[0.10]'
        }`}
        style={{ backgroundColor: getUserColor(participant.username) }}
      >
        {participant.avatarUrl ? (
          <img src={participant.avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          getInitials(participant.username)
        )}
        {isSharing && (
          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-success flex items-center justify-center border border-surface-950">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <polyline points="8 21 12 17 16 21" />
            </svg>
          </span>
        )}
      </div>
      <span className="text-[10px] text-surface-400 truncate max-w-full">{participant.username}</span>
    </button>
  );
}

function ControlButton({ onClick, title, danger, active, children }: {
  onClick: () => void;
  title: string;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-3.5 rounded-full transition-colors flex items-center justify-center ${
        danger
          ? 'bg-danger text-white hover:bg-red-700'
          : active
          ? 'bg-success text-white hover:bg-success-600'
          : 'bg-white/[0.06] text-surface-200 hover:bg-white/[0.12]'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Visão de chamada — abre no lugar do chat (aba "Chamada"), como um app de
 * reunião: grade com a foto de todo mundo quando ninguém compartilha tela;
 * quando alguém compartilha, a tela vira o foco e os participantes viram
 * uma tira de miniaturas embaixo (clicável, se mais de uma tela ativa).
 */
export function GroupCallView({ voice }: Props) {
  const vc = voice.activeVc;
  const currentUser = useAuthStore((s) => s.user);
  const [focusedUserId, setFocusedUserId] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const focusedVideoRef = useRef<HTMLVideoElement>(null);
  const focusedContainerRef = useRef<HTMLDivElement>(null);

  // Foca automaticamente a primeira tela compartilhada disponível; troca
  // sozinho se quem estava em foco parar de compartilhar.
  useEffect(() => {
    if (focusedUserId !== null && voice.screenStreams.has(focusedUserId)) return;
    const first = voice.screenStreams.keys().next();
    setFocusedUserId(first.done ? null : first.value);
  }, [voice.screenStreams, focusedUserId]);

  const focusedStream = focusedUserId !== null ? voice.screenStreams.get(focusedUserId) ?? null : null;

  useEffect(() => {
    if (focusedStream && focusedVideoRef.current) {
      focusedVideoRef.current.srcObject = focusedStream;
      focusedVideoRef.current.play().catch(() => {});
    }
  }, [focusedStream]);

  // Tela cheia de verdade (Fullscreen API), não só um overlay dentro do
  // app — cobre o monitor inteiro. Sincroniza com Esc/F11 nativos também.
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === focusedContainerRef.current);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Sai da tela cheia sozinho se a tela em foco parar de ser compartilhada
  // (senão ficava preso em tela cheia mostrando um vídeo parado/preto).
  useEffect(() => {
    if (!focusedStream && document.fullscreenElement === focusedContainerRef.current) {
      document.exitFullscreen().catch(() => {});
    }
  }, [focusedStream]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      focusedContainerRef.current?.requestFullscreen().catch(() => {});
    }
  };

  if (!vc) return null;

  const handleScreenClick = () => {
    if (voice.isScreenSharing) voice.stopScreenShare();
    else setShowPicker(true);
  };

  const handlePickerSelect = (source: ScreenSource) => {
    setShowPicker(false);
    voice.startScreenShare(source.id);
  };

  const nameFor = (uid: number) => vc.participants.find((p) => p.userId === uid)?.username ?? 'Alguém';

  const gridCols = vc.participants.length <= 1 ? 1 : vc.participants.length <= 4 ? 2 : vc.participants.length <= 6 ? 3 : 4;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-surface-950">
      <div className="flex-1 overflow-hidden p-6 flex items-center justify-center min-h-0">
        {focusedStream ? (
          <div className="w-full h-full flex flex-col gap-4">
            <div
              ref={focusedContainerRef}
              className={`flex-1 min-h-0 overflow-hidden bg-black relative group/screen ${isFullscreen ? '' : 'rounded-2xl'}`}
            >
              <video
                ref={focusedVideoRef}
                autoPlay
                muted
                className="w-full h-full object-contain cursor-pointer"
                onDoubleClick={toggleFullscreen}
              />
              <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
                {Number(focusedUserId) === Number(currentUser?.id) ? 'Você' : nameFor(focusedUserId!)} — tela compartilhada
              </span>
              <button
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
                className="absolute bottom-3 right-3 p-2 rounded-lg bg-black/60 text-white opacity-0 group-hover/screen:opacity-100 hover:bg-black/80 backdrop-blur-sm transition-opacity"
              >
                {isFullscreen ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
            </div>

            {vc.participants.length > 1 && (
              <div className="flex-shrink-0 flex items-center gap-3 overflow-x-auto pb-1">
                {vc.participants.map((p) => (
                  <ParticipantChip
                    key={p.userId}
                    participant={p}
                    isSharing={voice.screenStreams.has(p.userId)}
                    isFocused={p.userId === focusedUserId}
                    onClick={() => setFocusedUserId(p.userId)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div
            className="grid gap-x-8 gap-y-6 justify-center content-center"
            style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, max-content))` }}
          >
            {vc.participants.map((p) => (
              <ParticipantTile
                key={p.userId}
                participant={p}
                isSelf={Number(p.userId) === Number(currentUser?.id)}
                isMuted={Number(p.userId) === Number(currentUser?.id) && voice.isMuted}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controles */}
      <div className="flex-shrink-0 border-t border-white/[0.06] py-4 flex items-center justify-center gap-3">
        <ControlButton onClick={voice.toggleMute} title={voice.isMuted ? 'Ativar microfone' : 'Silenciar'} active={voice.isMuted ? false : undefined}>
          {voice.isMuted ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-danger">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </ControlButton>

        <ControlButton onClick={handleScreenClick} title={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'} active={voice.isScreenSharing}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <polyline points="8 21 12 17 16 21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </ControlButton>

        <ControlButton onClick={voice.leave} title="Sair da call" danger>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
          </svg>
        </ControlButton>
      </div>

      {showPicker && <ScreenPicker onSelect={handlePickerSelect} onCancel={() => setShowPicker(false)} />}
    </div>
  );
}

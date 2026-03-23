import { useEffect, useRef, useState } from 'react';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { TypingIndicator } from '../chat/TypingIndicator';
import { useFriendStore } from '../../stores/friendStore';
import { useCallStore } from '../../stores/callStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { remoteScreenStreamRef } from '../../services/callStream';
import { getConnectedGamepads, setupGamepadListeners } from '../../services/gamepadService';
import type { DmChannel } from '../../types';

interface Props {
  dm: DmChannel;
}

function HeaderIconButton({ title, onClick, children, danger, active }: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        active
          ? 'text-success bg-surface-700'
          : danger
          ? 'text-surface-400 hover:text-danger hover:bg-surface-700'
          : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
      }`}
    >
      {children}
    </button>
  );
}

function CallPanel({ dm, callStatus }: { dm: DmChannel; callStatus: 'calling' | 'active' }) {
  const isMuted = useCallStore((s) => s.isMuted);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const remoteHasScreen = useCallStore((s) => s.remoteHasScreen);
  const isGamepadSharing = useCallStore((s) => s.isGamepadSharing);
  const remoteHasGamepad = useCallStore((s) => s.remoteHasGamepad);
  const volume = useCallStore((s) => s.volume);
  const setVolume = useCallStore((s) => s.setVolume);
  const videoRef = useRef<HTMLVideoElement>(null);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);
  const [screenExpanded, setScreenExpanded] = useState(false);
  const [hasLocalGamepad, setHasLocalGamepad] = useState(false);

  const isCalling = callStatus === 'calling';

  // Detecta gamepads via polling (eventos são pouco confiáveis no Electron)
  useEffect(() => {
    const cleanupListeners = setupGamepadListeners();

    const check = () => {
      const gps = navigator.getGamepads();
      const found = gps ? Array.from(gps).some((g) => g !== null && g.connected) : false;
      setHasLocalGamepad(found);
    };

    check();
    const interval = setInterval(check, 2000);

    window.addEventListener('gamepadconnected', check);
    window.addEventListener('gamepaddisconnected', check);
    return () => {
      cleanupListeners();
      clearInterval(interval);
      window.removeEventListener('gamepadconnected', check);
      window.removeEventListener('gamepaddisconnected', check);
    };
  }, []);

  // Tenta anexar o stream sempre que o video element ou o stream muda
  const attachStream = () => {
    const stream = remoteScreenStreamRef.current;
    if (!stream) return;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    if (expandedVideoRef.current) {
      expandedVideoRef.current.srcObject = stream;
      expandedVideoRef.current.play().catch(() => {});
    }
  };

  // Quando o stream remoto muda (evento do CallManager)
  useEffect(() => {
    window.addEventListener('call:screen-stream-changed', attachStream);
    return () => window.removeEventListener('call:screen-stream-changed', attachStream);
  }, []);

  // Quando remoteHasScreen vai para true: o video element acaba de montar
  useEffect(() => {
    if (remoteHasScreen) attachStream();
  }, [remoteHasScreen]);

  // Quando o painel monta com stream já ativo (usuário voltou para a DM)
  useEffect(() => {
    if (remoteScreenStreamRef.current) attachStream();
  }, []);

  // Attach stream quando troca entre expanded/inline
  useEffect(() => {
    if (!remoteScreenStreamRef.current) return;
    if (screenExpanded && expandedVideoRef.current) {
      expandedVideoRef.current.srcObject = remoteScreenStreamRef.current;
      expandedVideoRef.current.play().catch(() => {});
    }
    if (!screenExpanded && videoRef.current) {
      // Re-anexa ao video inline ao sair do fullscreen
      videoRef.current.srcObject = remoteScreenStreamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [screenExpanded]);

  // Fecha expanded quando o stream remoto para
  useEffect(() => {
    if (!remoteHasScreen) setScreenExpanded(false);
  }, [remoteHasScreen]);

  // Esc fecha expanded
  useEffect(() => {
    if (!screenExpanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setScreenExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screenExpanded]);

  const handleToggleMute = () => window.dispatchEvent(new CustomEvent('call:toggle-mute'));
  const handleHangup = () => window.dispatchEvent(new CustomEvent('call:hangup'));
  const handleScreenShare = () => window.dispatchEvent(new CustomEvent('call:screen-share-toggle'));
  const handleGamepadToggle = () => window.dispatchEvent(new CustomEvent('call:gamepad-toggle'));

  // Mostrar botão de gamepad quando tem gamepad local e está em chamada ativa
  const showGamepadButton = hasLocalGamepad && !isCalling;

  return (
    <>
      <div className="bg-surface-800 border-b border-surface-700/50 flex-shrink-0">
        {/* Barra principal */}
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          {isCalling ? (
            <>
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-warning">Ligando...</span>
              <span className="text-sm text-surface-400 truncate">{dm.friend.username}</span>

              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={handleHangup}
                  title="Cancelar chamada"
                  className="px-3 py-1 rounded bg-danger text-white text-xs font-medium hover:bg-red-700 transition-colors flex items-center gap-1.5"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                  </svg>
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold text-success">Em chamada</span>
              <span className="text-sm text-surface-400 truncate">{dm.friend.username}</span>

              <div className="ml-auto flex items-center gap-1">
                {/* Mute */}
                <button
                  onClick={handleToggleMute}
                  title={isMuted ? 'Ativar microfone' : 'Silenciar'}
                  className={`p-1.5 rounded transition-colors ${
                    isMuted ? 'bg-danger text-white' : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
                  }`}
                >
                  {isMuted ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  ) : (
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  )}
                </button>

                {/* Compartilhar tela */}
                <button
                  onClick={handleScreenShare}
                  title={isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
                  className={`p-1.5 rounded transition-colors ${
                    isScreenSharing
                      ? 'bg-success text-white'
                      : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
                  }`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <polyline points="8 21 12 17 16 21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </button>

                {/* Gamepad */}
                {showGamepadButton && (
                  <button
                    onClick={handleGamepadToggle}
                    title={isGamepadSharing ? 'Parar controle remoto' : 'Compartilhar controle'}
                    className={`p-1.5 rounded transition-colors ${
                      isGamepadSharing
                        ? 'bg-success text-white'
                        : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
                    }`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="20" height="12" rx="4" />
                      <circle cx="8" cy="12" r="1" fill="currentColor" />
                      <circle cx="16" cy="10" r="1" fill="currentColor" />
                      <circle cx="18" cy="12" r="1" fill="currentColor" />
                      <circle cx="16" cy="14" r="1" fill="currentColor" />
                      <circle cx="14" cy="12" r="1" fill="currentColor" />
                      <line x1="6" y1="10" x2="6" y2="14" />
                      <line x1="4" y1="12" x2="8" y2="12" />
                    </svg>
                  </button>
                )}

                {/* Indicador de gamepad remoto */}
                {remoteHasGamepad && (
                  <div className="flex items-center gap-1 text-xs text-accent" title="Controle remoto ativo">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="6" width="20" height="12" rx="4" />
                      <circle cx="8" cy="12" r="1" fill="currentColor" />
                      <line x1="6" y1="10" x2="6" y2="14" />
                      <line x1="4" y1="12" x2="8" y2="12" />
                    </svg>
                  </div>
                )}

                {/* Volume — até 200% */}
                <div className="flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-surface-400 flex-shrink-0">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                    {volume > 1 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                  </svg>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={Math.round(volume * 100)}
                    onChange={(e) => setVolume(Number(e.target.value) / 100)}
                    title={`Volume: ${Math.round(volume * 100)}%`}
                    className="w-24 h-1 accent-success cursor-pointer"
                  />
                  <span className="text-[10px] text-surface-500 w-8 text-right tabular-nums">
                    {Math.round(volume * 100)}%
                  </span>
                </div>

                {/* Encerrar */}
                <button
                  onClick={handleHangup}
                  title="Encerrar chamada"
                  className="p-1.5 rounded bg-danger text-white hover:bg-red-700 transition-colors ml-1"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Tela compartilhada remotamente — inline */}
        {!isCalling && remoteHasScreen && !screenExpanded && (
          <div className="bg-black border-t border-surface-700/30 max-h-[60vh] flex items-center justify-center relative group">
            <video
              ref={videoRef}
              autoPlay
              muted
              className="w-full max-h-[60vh] object-contain cursor-pointer"
              onDoubleClick={() => setScreenExpanded(true)}
            />
            {/* Controles do vídeo — aparecem no hover */}
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {/* Expandir */}
              <button
                onClick={() => setScreenExpanded(true)}
                title="Expandir tela"
                className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Indicador de compartilhamento local (sem preview) */}
        {!isCalling && isScreenSharing && !remoteHasScreen && (
          <div className="px-4 py-2 border-t border-surface-700/30 flex items-center gap-2 text-xs text-success">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Você está compartilhando a tela
          </div>
        )}
      </div>

      {/* Tela expandida — overlay fullscreen (top-9 = abaixo da title bar nativa de 36px) */}
      {screenExpanded && remoteHasScreen && (
        <div className="fixed top-9 inset-x-0 bottom-0 z-[9998] bg-black flex flex-col">
          {/* Header do modo expandido */}
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-white">{dm.friend.username} — Tela compartilhada</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Minimizar */}
              <button
                onClick={() => setScreenExpanded(false)}
                title="Minimizar (Esc)"
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              {/* Encerrar chamada */}
              <button
                onClick={() => { setScreenExpanded(false); handleHangup(); }}
                title="Encerrar chamada"
                className="p-2 rounded-lg bg-danger text-white hover:bg-red-700 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Vídeo fullscreen */}
          <video
            ref={expandedVideoRef}
            autoPlay
            muted
            className="w-full h-full object-contain"
            onDoubleClick={() => setScreenExpanded(false)}
          />

          {/* Barra inferior com controles — aparece no hover */}
          <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center gap-3 px-4 py-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
            {/* Mute */}
            <button
              onClick={handleToggleMute}
              title={isMuted ? 'Ativar microfone' : 'Silenciar'}
              className={`p-3 rounded-full transition-colors ${
                isMuted ? 'bg-danger text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {isMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>

            {/* Compartilhar tela */}
            <button
              onClick={handleScreenShare}
              title={isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
              className={`p-3 rounded-full transition-colors ${
                isScreenSharing ? 'bg-success text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <polyline points="8 21 12 17 16 21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </button>

            {/* Gamepad (expanded) */}
            {showGamepadButton && (
              <button
                onClick={handleGamepadToggle}
                title={isGamepadSharing ? 'Parar controle remoto' : 'Compartilhar controle'}
                className={`p-3 rounded-full transition-colors ${
                  isGamepadSharing ? 'bg-success text-white' : 'bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="6" width="20" height="12" rx="4" />
                  <circle cx="8" cy="12" r="1" fill="currentColor" />
                  <circle cx="16" cy="10" r="1" fill="currentColor" />
                  <circle cx="18" cy="12" r="1" fill="currentColor" />
                  <circle cx="16" cy="14" r="1" fill="currentColor" />
                  <circle cx="14" cy="12" r="1" fill="currentColor" />
                  <line x1="6" y1="10" x2="6" y2="14" />
                  <line x1="4" y1="12" x2="8" y2="12" />
                </svg>
              </button>
            )}

            {/* Minimizar */}
            <button
              onClick={() => setScreenExpanded(false)}
              title="Minimizar"
              className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>

            {/* Encerrar */}
            <button
              onClick={() => { setScreenExpanded(false); handleHangup(); }}
              title="Encerrar chamada"
              className="p-3 rounded-full bg-danger text-white hover:bg-red-700 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function DMChatArea({ dm }: Props) {
  const { friend, channelId } = dm;
  const color = getUserColor(friend.username);
  const setActiveDm = useFriendStore((s) => s.setActiveDm);
  const initCall = useCallStore((s) => s.initCall);
  const callStatus = useCallStore((s) => s.status);
  const callPeerId = useCallStore((s) => s.peerId);

  const isInCallWithFriend = Number(callPeerId) === Number(friend.id) && callStatus !== 'idle';

  const getStatusDotClass = (status: string) => {
    if (status === 'online') return 'bg-online';
    if (status === 'in_call') return 'bg-warning';
    return 'bg-offline';
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-surface-900">
      <header className="h-12 flex items-center gap-2 px-3 border-b border-surface-700/50 flex-shrink-0">
        {/* Left: back + identity */}
        <button
          onClick={() => setActiveDm(null)}
          className="p-1.5 -ml-0.5 text-surface-400 hover:text-surface-100 hover:bg-surface-700 rounded transition-colors flex-shrink-0"
          title="Voltar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* DM icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-surface-400 flex-shrink-0">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>

        <div className="w-px h-5 bg-surface-700 mx-1 flex-shrink-0" />

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{ backgroundColor: color }}
          >
            {friend.avatarUrl ? (
              <img src={friend.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              getInitials(friend.username)
            )}
          </div>
          <div
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-900 ${getStatusDotClass(friend.status)}`}
          />
        </div>

        {/* Name + status */}
        <div className="min-w-0">
          <span className="font-semibold text-surface-100 text-sm">{friend.username}</span>
          <span className="ml-1.5 text-xs text-surface-500">
            {friend.status === 'online' ? '● Online' : friend.status === 'in_call' ? '● Em chamada' : '● Offline'}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* Chamada de voz */}
          <HeaderIconButton
            title={isInCallWithFriend ? 'Em chamada' : 'Chamada de voz'}
            onClick={() => {
              if (callStatus === 'idle') initCall(Number(friend.id), friend.username, channelId);
            }}
            active={isInCallWithFriend}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </HeaderIconButton>

          <div className="w-px h-5 bg-surface-700 mx-1" />

          {/* Fechar chat (volta para amigos) */}
          <HeaderIconButton title="Voltar para amigos" danger onClick={() => setActiveDm(null)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </HeaderIconButton>
        </div>
      </header>

      {/* Painel de chamada — acima do chat (ligando + em chamada) */}
      {isInCallWithFriend && (callStatus === 'calling' || callStatus === 'active') && (
        <CallPanel dm={dm} callStatus={callStatus} />
      )}

      <MessageList channelId={channelId} />
      <TypingIndicator channelId={channelId} />
      <MessageInput channelId={channelId} placeholder={`Mensagem para @${friend.username}`} />
    </main>
  );
}

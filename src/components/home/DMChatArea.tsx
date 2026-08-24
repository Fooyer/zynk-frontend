import { useEffect, useRef, useState } from 'react';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { TypingIndicator } from '../chat/TypingIndicator';
import { useFriendStore } from '../../stores/friendStore';
import { useCallStore } from '../../stores/callStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useAuthStore } from '../../stores/authStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { remoteScreenStreamRef, localAnalyserRef, remoteAnalyserRef } from '../../services/callStream';
import type { DmChannel } from '../../types';

interface Props {
  dm: DmChannel;
}

function HeaderIconButton({ title, onClick, children, danger, active, warn }: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
  warn?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-lg transition-colors ${
        active
          ? warn ? 'text-warning bg-white/[0.08]' : 'text-success bg-white/[0.08]'
          : danger
          ? 'text-surface-400 hover:text-danger hover:bg-white/[0.06]'
          : warn
          ? 'text-surface-400 hover:text-warning hover:bg-white/[0.06]'
          : 'text-surface-400 hover:text-surface-100 hover:bg-white/[0.06]'
      }`}
    >
      {children}
    </button>
  );
}

function CallPanel({ dm, callStatus }: { dm: DmChannel; callStatus: 'calling' | 'active' }) {
  const user = useAuthStore((s) => s.user);
  const mode = useCallStore((s) => s.mode);
  const isGame = mode === 'game';
  const isMuted = useCallStore((s) => s.isMuted);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const isSharingAudio = useCallStore((s) => s.isSharingAudio);
  const remoteHasScreen = useCallStore((s) => s.remoteHasScreen);
  const volume = useCallStore((s) => s.volume);
  const setVolume = useCallStore((s) => s.setVolume);
  const videoRef = useRef<HTMLVideoElement>(null);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);
  const [screenExpanded, setScreenExpanded] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const callStartedAt = useCallStore((s) => s.callStartedAt);
  const [, forceTick] = useState(0);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);

  const isCalling = callStatus === 'calling';

  // Duração vem do timestamp da store, não de um estado local — este painel
  // desmonta/remonta quando a call vira barra flutuante e volta, e um estado
  // local reiniciaria o cronômetro do zero nesse momento.
  useEffect(() => {
    if (isCalling || !callStartedAt) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isCalling, callStartedAt]);

  const callDuration = callStartedAt ? Math.floor((Date.now() - callStartedAt) / 1000) : 0;

  // Detecção de fala via AnalyserNode
  useEffect(() => {
    if (isCalling) return;
    const data = new Uint8Array(128);
    const interval = setInterval(() => {
      if (localAnalyserRef.current && !isMuted) {
        localAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLocalSpeaking(avg > 8);
      } else {
        setLocalSpeaking(false);
      }
      if (remoteAnalyserRef.current) {
        remoteAnalyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setRemoteSpeaking(avg > 8);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [isCalling, isMuted]);

  const formatDuration = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // ─── Screen stream management ───
  const attachStream = () => {
    const stream = remoteScreenStreamRef.current;
    if (!stream) return;
    if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}); }
    if (expandedVideoRef.current) { expandedVideoRef.current.srcObject = stream; expandedVideoRef.current.play().catch(() => {}); }
  };

  useEffect(() => {
    window.addEventListener('call:screen-stream-changed', attachStream);
    return () => window.removeEventListener('call:screen-stream-changed', attachStream);
  }, []);
  useEffect(() => { if (remoteHasScreen) attachStream(); }, [remoteHasScreen]);
  useEffect(() => { if (remoteScreenStreamRef.current) attachStream(); }, []);
  useEffect(() => {
    if (!remoteScreenStreamRef.current) return;
    if (screenExpanded && expandedVideoRef.current) { expandedVideoRef.current.srcObject = remoteScreenStreamRef.current; expandedVideoRef.current.play().catch(() => {}); }
    if (!screenExpanded && videoRef.current) { videoRef.current.srcObject = remoteScreenStreamRef.current; videoRef.current.play().catch(() => {}); }
  }, [screenExpanded]);
  useEffect(() => { if (!remoteHasScreen) { setScreenExpanded(false); setCinemaMode(false); } }, [remoteHasScreen]);
  useEffect(() => {
    if (!screenExpanded && !cinemaMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setScreenExpanded(false); setCinemaMode(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screenExpanded, cinemaMode]);

  // Reflete o modo cinema local no layout global — esconde a lista de
  // conversas e recolhe o nav na versão menor, restaurando ao desligar
  // (inclusive se este painel desmontar com o modo ainda ligado).
  useEffect(() => {
    if (cinemaMode) useLayoutStore.getState().enterCinemaMode();
    else useLayoutStore.getState().exitCinemaMode();
    return () => useLayoutStore.getState().exitCinemaMode();
  }, [cinemaMode]);

  const handleToggleMute = () => window.dispatchEvent(new CustomEvent('call:toggle-mute'));
  const handleHangup = () => window.dispatchEvent(new CustomEvent('call:hangup'));
  const handleScreenShare = () => window.dispatchEvent(new CustomEvent('call:screen-share-toggle'));
  const handleAudioShare = () => window.dispatchEvent(new CustomEvent('call:audio-share-toggle'));

  // ─── User card component ───
  const UserCard = ({ username, avatarUrl, color, speaking, muted, label }: {
    username: string; avatarUrl?: string | null; color: string;
    speaking: boolean; muted?: boolean; label?: string;
  }) => (
    <div className="flex flex-col items-center gap-2 min-w-[100px]">
      <div className={`relative rounded-full transition-all duration-200 ${
        speaking
          ? 'ring-[3px] ring-accent-500 shadow-glow-accent'
          : 'ring-[3px] ring-white/[0.1]'
      }`}>
        <div
          className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white text-xl font-bold"
          style={{ backgroundColor: color }}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            getInitials(username)
          )}
        </div>
        {muted && (
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-danger flex items-center justify-center border-2 border-surface-800">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
            </svg>
          </div>
        )}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-surface-200 leading-tight">{username}</p>
        {/* Sempre renderizado (mesmo sem label) pra reservar a altura da
            linha — senão mutar/desmutar muda a altura do card e empurra a
            barra de controles abaixo pra cima/baixo. */}
        <p className={`text-[11px] mt-0.5 ${label ? 'text-surface-500' : 'invisible'}`}>{label || ' '}</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Véu escurecendo o resto do app no modo cinema — o painel abaixo
          fica com z-index acima dele, só o chat por trás é que escurece */}
      {cinemaMode && (
        <div className="fixed inset-0 z-[9970] bg-black/85 animate-fade-in" onClick={() => setCinemaMode(false)} />
      )}
      <div className={`bg-accent-900 border-b flex-shrink-0 relative ${cinemaMode ? 'z-[9971]' : ''} ${isGame ? 'border-warning/40' : 'border-white/[0.06]'}`}>
        {isCalling ? (
          /* ─── Estado: Chamando ─── */
          <div className="pt-14 pb-8 flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute -inset-2 rounded-full animate-ping opacity-20" style={{ backgroundColor: getUserColor(dm.friend.username) }} />
              <div
                className="w-[72px] h-[72px] rounded-full flex items-center justify-center text-white text-xl font-bold relative"
                style={{ backgroundColor: getUserColor(dm.friend.username) }}
              >
                {dm.friend.avatarUrl ? (
                  <img src={dm.friend.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  getInitials(dm.friend.username)
                )}
              </div>
            </div>
            {isGame && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 text-warning text-[11px] font-semibold">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
                CHAMADA DE JOGOS — BAIXA LATÊNCIA
              </span>
            )}
            <div className="text-center">
              <p className="text-surface-100 font-semibold">{dm.friend.username}</p>
              <p className="text-sm text-surface-400 mt-0.5">Chamando...</p>
            </div>
            <button
              onClick={handleHangup}
              className="mt-1 px-5 py-2 rounded-full bg-danger text-white text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
              </svg>
              Cancelar
            </button>
          </div>
        ) : (
          /* ─── Estado: Em chamada (layout Discord-like) ─── */
          <div className="py-5 px-4">
            {/* Timer */}
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isGame ? 'bg-warning' : 'bg-success'}`} />
              <span className="text-xs text-surface-400 font-mono tracking-wide">{formatDuration(callDuration)}</span>
              {isGame && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/15 text-warning text-[10px] font-semibold ml-1">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                  </svg>
                  JOGOS
                </span>
              )}
            </div>

            {/* Dois cards de usuário */}
            <div className="flex items-start justify-center gap-10 mb-5">
              <UserCard
                username={user?.username ?? 'Você'}
                avatarUrl={user?.avatarUrl}
                color={getUserColor(user?.username ?? 'Você')}
                speaking={localSpeaking}
                muted={isMuted}
                label={isMuted ? 'Mutado' : undefined}
              />
              <UserCard
                username={dm.friend.username}
                avatarUrl={dm.friend.avatarUrl ?? undefined}
                color={getUserColor(dm.friend.username)}
                speaking={remoteSpeaking}
              />
            </div>

            {/* Barra de controles */}
            <div className="flex items-center justify-center gap-2">
              {/* Mute */}
              <button onClick={handleToggleMute} title={isMuted ? 'Ativar microfone' : 'Silenciar'}
                className={`p-2.5 rounded-full transition-colors ${
                  isMuted ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-white/[0.06] text-surface-300 hover:bg-white/[0.12] hover:text-surface-100'
                }`}
              >
                {isMuted ? (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                    <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>

              {/* Screen share */}
              <button onClick={handleScreenShare} disabled={isSharingAudio}
                title={isSharingAudio ? 'Pare o compartilhamento de áudio primeiro' : isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
                className={`p-2.5 rounded-full transition-colors ${
                  isSharingAudio ? 'opacity-30 cursor-not-allowed bg-white/[0.06] text-surface-300'
                  : isScreenSharing ? 'bg-success/20 text-success hover:bg-success/30' : 'bg-white/[0.06] text-surface-300 hover:bg-white/[0.12] hover:text-surface-100'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <polyline points="8 21 12 17 16 21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </button>

              {/* Compartilhar apenas o áudio (sem vídeo) */}
              <button onClick={handleAudioShare} disabled={isScreenSharing}
                title={isScreenSharing ? 'Pare o compartilhamento de tela primeiro' : isSharingAudio ? 'Parar compartilhamento de áudio' : 'Compartilhar apenas o áudio'}
                className={`p-2.5 rounded-full transition-colors ${
                  isScreenSharing ? 'opacity-30 cursor-not-allowed bg-white/[0.06] text-surface-300'
                  : isSharingAudio ? 'bg-success/20 text-success hover:bg-success/30' : 'bg-white/[0.06] text-surface-300 hover:bg-white/[0.12] hover:text-surface-100'
                }`}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 bg-white/[0.06] rounded-full px-3 py-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-surface-400 flex-shrink-0">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
                  {volume > 1 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                </svg>
                <input type="range" min="0" max="200" value={Math.round(volume * 100)}
                  onChange={(e) => setVolume(Number(e.target.value) / 100)}
                  title={`Volume: ${Math.round(volume * 100)}%`}
                  className="w-20 cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #43b581 ${(volume / 2) * 100}%, rgb(var(--color-surface-800)) ${(volume / 2) * 100}%)`,
                  }}
                />
                <span className="text-[10px] text-surface-500 w-7 text-right tabular-nums">{Math.round(volume * 100)}%</span>
              </div>

              {/* Hangup */}
              <button onClick={handleHangup} title="Encerrar chamada"
                className="p-2.5 rounded-full bg-danger text-white hover:bg-red-700 transition-colors"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Tela compartilhada remotamente — inline (ou em modo cinema,
            maior e com o resto do app escurecido por trás) */}
        {!isCalling && remoteHasScreen && !screenExpanded && (
          <div className={`bg-black border-t border-white/[0.05] flex items-center justify-center relative group ${cinemaMode ? 'max-h-[80vh]' : 'max-h-[60vh]'}`}>
            <video ref={videoRef} autoPlay muted className={`w-full object-contain cursor-pointer ${cinemaMode ? 'max-h-[80vh]' : 'max-h-[60vh]'}`} onDoubleClick={() => setScreenExpanded(true)} />
            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => setCinemaMode((v) => !v)} title={cinemaMode ? 'Sair do modo cinema' : 'Modo cinema'}
                className={`p-1.5 rounded backdrop-blur-sm transition-colors ${cinemaMode ? 'bg-accent-600 text-white' : 'bg-black/60 text-white hover:bg-black/80'}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="18" rx="2" />
                  <line x1="7" y1="3" x2="7" y2="21" /><line x1="17" y1="3" x2="17" y2="21" />
                  <line x1="2" y1="8" x2="7" y2="8" /><line x1="2" y1="16" x2="7" y2="16" />
                  <line x1="17" y1="8" x2="22" y2="8" /><line x1="17" y1="16" x2="22" y2="16" />
                </svg>
              </button>
              <button onClick={() => { setCinemaMode(false); setScreenExpanded(true); }} title="Expandir tela"
                className="p-1.5 rounded bg-black/60 text-white hover:bg-black/80 backdrop-blur-sm transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Indicador de compartilhamento local */}
        {!isCalling && isScreenSharing && !remoteHasScreen && (
          <div className="px-4 py-2 border-t border-white/[0.05] flex items-center gap-2 text-xs text-success">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Você está compartilhando a tela
          </div>
        )}
        {!isCalling && isSharingAudio && (
          <div className="px-4 py-2 border-t border-white/[0.05] flex items-center gap-2 text-xs text-success">
            <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Você está compartilhando apenas o áudio
          </div>
        )}
      </div>

      {/* Tela expandida — fullscreen overlay */}
      {screenExpanded && remoteHasScreen && (
        <div className="fixed top-9 inset-x-0 bottom-0 z-[9998] bg-black flex flex-col">
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-white">{dm.friend.username} — Tela compartilhada</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setScreenExpanded(false)} title="Minimizar (Esc)"
                className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              </button>
              <button onClick={() => { setScreenExpanded(false); handleHangup(); }} title="Encerrar chamada"
                className="p-2 rounded-lg bg-danger text-white hover:bg-red-700 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
                </svg>
              </button>
            </div>
          </div>

          <video ref={expandedVideoRef} autoPlay muted className="w-full h-full object-contain" onDoubleClick={() => setScreenExpanded(false)} />

          <div className="absolute bottom-0 inset-x-0 z-10 flex items-center justify-center gap-3 px-4 py-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
            <button onClick={handleToggleMute} title={isMuted ? 'Ativar microfone' : 'Silenciar'}
              className={`p-3 rounded-full transition-colors ${isMuted ? 'bg-danger text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              {isMuted ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
            <button onClick={handleScreenShare} disabled={isSharingAudio} title={isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
              className={`p-3 rounded-full transition-colors ${isSharingAudio ? 'opacity-30 cursor-not-allowed bg-white/10 text-white' : isScreenSharing ? 'bg-success text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" /><polyline points="8 21 12 17 16 21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </button>
            <button onClick={handleAudioShare} disabled={isScreenSharing} title={isSharingAudio ? 'Parar compartilhamento de áudio' : 'Compartilhar apenas o áudio'}
              className={`p-3 rounded-full transition-colors ${isScreenSharing ? 'opacity-30 cursor-not-allowed bg-white/10 text-white' : isSharingAudio ? 'bg-success text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            </button>
            <button onClick={() => setScreenExpanded(false)} title="Minimizar"
              className="p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
            <button onClick={() => { setScreenExpanded(false); handleHangup(); }} title="Encerrar chamada"
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
  const callMode = useCallStore((s) => s.mode);

  const isInCallWithFriend = Number(callPeerId) === Number(friend.id) && callStatus !== 'idle';

  const getStatusDotClass = (status: string) => {
    if (status === 'online') return 'bg-online';
    if (status === 'in_call') return 'bg-warning';
    return 'bg-offline';
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 min-h-0 zk-surface shadow-panel rounded-2xl overflow-hidden">
      <header className="h-12 flex items-center gap-2 px-3 border-b border-white/[0.06] flex-shrink-0">
        {/* Left: back + identity */}
        <button
          onClick={() => setActiveDm(null)}
          className="p-1.5 -ml-0.5 text-surface-400 hover:text-surface-100 hover:bg-white/[0.06] rounded-lg transition-colors flex-shrink-0"
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

        <div className="w-px h-5 bg-white/[0.1] mx-1 flex-shrink-0" />

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
          {/* Chamada de voz — normal ou jogos (baixa latência), lado a lado */}
          <HeaderIconButton
            title={isInCallWithFriend && callMode === 'normal' ? 'Em chamada' : 'Chamada de voz'}
            onClick={() => {
              if (callStatus === 'idle') initCall(Number(friend.id), friend.username, channelId, 'normal');
            }}
            active={isInCallWithFriend && callMode === 'normal'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </HeaderIconButton>

          <HeaderIconButton
            title={isInCallWithFriend && callMode === 'game' ? 'Em chamada de jogos' : 'Chamada de jogos — menor delay possível'}
            onClick={() => {
              if (callStatus === 'idle') initCall(Number(friend.id), friend.username, channelId, 'game');
            }}
            active={isInCallWithFriend && callMode === 'game'}
            warn
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
          </HeaderIconButton>

          <div className="w-px h-5 bg-white/[0.1] mx-1" />

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

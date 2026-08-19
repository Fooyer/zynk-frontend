import { useEffect, useRef, useState } from 'react';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { useGroupStore } from '../../stores/groupStore';
import { useUiStore } from '../../stores/uiStore';
import { ScreenPicker } from '../call/ScreenPicker';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';
import type { ScreenSource } from '../../types';

interface Props {
  voice: ReturnType<typeof useVoiceRoom>;
  /** Rail recolhido — mostra só ícones empilhados em vez do card completo. */
  collapsed?: boolean;
}

function ScreenThumb({ stream, username, onExpand }: { stream: MediaStream; username: string; onExpand: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  return (
    <button onClick={onExpand} className="relative w-full aspect-video rounded-lg overflow-hidden bg-black block">
      <video ref={videoRef} autoPlay muted className="w-full h-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1 flex items-center gap-1">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success flex-shrink-0">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <polyline points="8 21 12 17 16 21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        <span className="text-[10px] text-white font-medium truncate">{username}</span>
      </div>
    </button>
  );
}

/**
 * Barra de call de voz — encaixada no rodapé do rail de navegação (acima de
 * Configurações/conta), visível em qualquer tela do app enquanto estou
 * conectado, não só dentro do grupo/canal em questão. Fica sempre no mesmo
 * lugar (dentro do NavBar) em vez de flutuar sobre o conteúdo, então nunca
 * sobrepõe outra coisa nem aparece duplicada.
 */
export function VoiceStatusBar({ voice, collapsed }: Props) {
  const vc = voice.activeVc;
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const setView = useUiStore((s) => s.setView);

  const [showPicker, setShowPicker] = useState(false);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);

  const expandedStream = expandedUserId !== null ? voice.screenStreams.get(expandedUserId) ?? null : null;

  useEffect(() => {
    if (expandedStream && expandedVideoRef.current) {
      expandedVideoRef.current.srcObject = expandedStream;
      expandedVideoRef.current.play().catch(() => {});
    }
  }, [expandedStream]);

  useEffect(() => {
    if (expandedUserId !== null && !voice.screenStreams.has(expandedUserId)) setExpandedUserId(null);
  }, [voice.screenStreams, expandedUserId]);

  useEffect(() => {
    if (expandedUserId === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpandedUserId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedUserId]);

  if (!vc) return null;

  const handleScreenClick = () => {
    if (voice.isScreenSharing) voice.stopScreenShare();
    else setShowPicker(true);
  };

  const handlePickerSelect = (source: ScreenSource) => {
    setShowPicker(false);
    voice.startScreenShare(source.id);
  };

  const handleOpenChannel = () => {
    setActiveGroup(vc.groupId);
    setView('group');
  };

  const nameFor = (uid: number) => vc.participants.find((p) => p.userId === uid)?.username ?? 'Alguém';

  if (collapsed) {
    return (
      <>
        <div className="flex-shrink-0 flex flex-col items-center gap-1.5 py-2 border-y border-surface-800 w-full">
          <button
            onClick={handleOpenChannel}
            title={`${vc.name} — Voz conectada`}
            className="w-9 h-9 rounded-xl bg-success/15 text-success flex items-center justify-center flex-shrink-0"
          >
            <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
          </button>
          <button
            onClick={voice.toggleMute}
            title={voice.isMuted ? 'Ativar microfone' : 'Silenciar'}
            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
              voice.isMuted ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-surface-700 text-surface-200 hover:bg-surface-600'
            }`}
          >
            {voice.isMuted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          <button
            onClick={handleScreenClick}
            title={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
              voice.isScreenSharing ? 'bg-success text-white hover:bg-success-600' : 'bg-surface-700 text-surface-200 hover:bg-surface-600'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <polyline points="8 21 12 17 16 21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
          <button
            onClick={voice.leave}
            title="Sair da call"
            className="w-9 h-9 rounded-lg bg-danger/90 text-white hover:bg-danger transition-colors flex items-center justify-center flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
            </svg>
          </button>
        </div>

        {showPicker && <ScreenPicker onSelect={handlePickerSelect} onCancel={() => setShowPicker(false)} />}
      </>
    );
  }

  return (
    <>
      <div className="mx-2 mb-2 flex-shrink-0 bg-surface-800 border border-surface-700 rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[45vh]">
        {/* Header */}
        <button onClick={handleOpenChannel} className="px-3 py-2.5 border-b border-surface-700/60 flex items-center gap-2 flex-shrink-0 text-left hover:bg-surface-700/40 transition-colors">
          <span className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-surface-100 truncate">{vc.name}</p>
            <p className="text-[10px] text-success">Voz conectada</p>
          </div>
        </button>

        {/* Participantes */}
        {vc.participants.length > 0 && (
          <div className="px-3 py-2 space-y-1.5 overflow-y-auto flex-shrink-0 max-h-32">
            {vc.participants.map((p) => (
              <div key={p.userId} className="flex items-center gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0"
                  style={{ backgroundColor: getUserColor(p.username) }}
                >
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    getInitials(p.username)
                  )}
                </div>
                <span className="text-xs text-surface-200 truncate flex-1">{p.username}</span>
              </div>
            ))}
          </div>
        )}

        {/* Telas compartilhadas */}
        {voice.screenStreams.size > 0 && (
          <div className="px-3 pb-2 space-y-1.5 overflow-y-auto">
            {Array.from(voice.screenStreams.entries()).map(([uid, stream]) => (
              <ScreenThumb key={uid} stream={stream} username={nameFor(uid)} onExpand={() => setExpandedUserId(uid)} />
            ))}
          </div>
        )}

        {/* Controles */}
        <div className="p-2 border-t border-surface-700/60 flex-shrink-0 flex items-center gap-1">
          <button
            onClick={voice.toggleMute}
            title={voice.isMuted ? 'Ativar microfone' : 'Silenciar'}
            className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center ${
              voice.isMuted ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-surface-700 text-surface-200 hover:bg-surface-600'
            }`}
          >
            {voice.isMuted ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          <button
            onClick={handleScreenClick}
            title={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
            className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center ${
              voice.isScreenSharing ? 'bg-success text-white hover:bg-success-600' : 'bg-surface-700 text-surface-200 hover:bg-surface-600'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <polyline points="8 21 12 17 16 21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
          <button
            onClick={voice.leave}
            title="Sair da call"
            className="flex-1 py-2 rounded-lg bg-danger/90 text-white hover:bg-danger transition-colors flex items-center justify-center"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
            </svg>
          </button>
        </div>
      </div>

      {showPicker && <ScreenPicker onSelect={handlePickerSelect} onCancel={() => setShowPicker(false)} />}

      {expandedStream && (
        <div className="fixed top-9 inset-x-0 bottom-0 z-[9998] bg-black flex flex-col">
          <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium text-white">{nameFor(expandedUserId!)} — Tela compartilhada</span>
            </div>
            <button
              onClick={() => setExpandedUserId(null)}
              title="Minimizar (Esc)"
              className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </button>
          </div>
          <video ref={expandedVideoRef} autoPlay muted className="w-full h-full object-contain" onDoubleClick={() => setExpandedUserId(null)} />
        </div>
      )}
    </>
  );
}

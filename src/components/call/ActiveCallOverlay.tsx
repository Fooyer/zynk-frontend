import { useEffect, useState } from 'react';
import { useCallStore } from '../../stores/callStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * Barra flutuante persistente da chamada 1:1 — visível em qualquer tela do
 * app enquanto há uma chamada ativa e a conversa correspondente não está
 * aberta (nesse caso os controles inline do DMChatArea já bastam).
 */
export function ActiveCallOverlay() {
  const status = useCallStore((s) => s.status);
  const peerUsername = useCallStore((s) => s.peerUsername);
  const mode = useCallStore((s) => s.mode);
  const isMuted = useCallStore((s) => s.isMuted);
  const isScreenSharing = useCallStore((s) => s.isScreenSharing);
  const isSharingAudio = useCallStore((s) => s.isSharingAudio);
  const callStartedAt = useCallStore((s) => s.callStartedAt);
  const [, forceTick] = useState(0);
  const isGame = mode === 'game';

  // Duração vem do timestamp da store (sobrevive a esta barra montar e
  // desmontar quando a call some/reaparece) — o interval aqui só força o
  // componente a re-renderizar a cada segundo pra atualizar o texto.
  useEffect(() => {
    if (status !== 'active' || !callStartedAt) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [status, callStartedAt]);

  const seconds = callStartedAt ? Math.floor((Date.now() - callStartedAt) / 1000) : 0;

  if (!peerUsername) return null;
  const color = getUserColor(peerUsername);

  const onToggleMute = () => window.dispatchEvent(new CustomEvent('call:toggle-mute'));
  const onScreenShare = () => window.dispatchEvent(new CustomEvent('call:screen-share-toggle'));
  const onAudioShare = () => window.dispatchEvent(new CustomEvent('call:audio-share-toggle'));
  const onHangup = () => window.dispatchEvent(new CustomEvent('call:hangup'));

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90]">
      <div className={`zk-corners bg-accent-900 border rounded-2xl px-5 py-4 flex items-center gap-4 shadow-elevated min-w-[320px] ${isGame ? 'border-warning/50' : 'border-white/[0.08]'}`}>
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {getInitials(peerUsername)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-surface-100 font-semibold text-sm truncate">{peerUsername}</p>
            {isGame && (
              <span className="flex-shrink-0 flex items-center gap-0.5 px-1 py-0.5 rounded bg-warning/15 text-warning" title="Chamada de jogos — baixa latência">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
                </svg>
              </span>
            )}
          </div>
          <p className={`text-xs ${status === 'active' ? (isGame ? 'text-warning' : 'text-success') : 'text-surface-300'}`}>
            {status === 'calling' ? 'Chamando...' : status === 'ringing' ? 'Conectando...' : formatDuration(seconds)}
          </p>
        </div>

        {/* Mute */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Ativar microfone' : 'Silenciar'}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? 'bg-danger text-white' : 'bg-white/[0.06] text-surface-200 hover:bg-white/[0.12]'
          }`}
        >
          {isMuted ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>

        {/* Compartilhar tela */}
        <button
          onClick={onScreenShare}
          disabled={isSharingAudio}
          title={isSharingAudio ? 'Pare o compartilhamento de áudio primeiro' : isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            isSharingAudio ? 'opacity-30 cursor-not-allowed bg-white/[0.06] text-surface-200' : isScreenSharing ? 'bg-success text-white' : 'bg-white/[0.06] text-surface-200 hover:bg-white/[0.12]'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <polyline points="8 21 12 17 16 21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
        </button>

        {/* Compartilhar apenas o áudio */}
        <button
          onClick={onAudioShare}
          disabled={isScreenSharing}
          title={isScreenSharing ? 'Pare o compartilhamento de tela primeiro' : isSharingAudio ? 'Parar compartilhamento de áudio' : 'Compartilhar apenas o áudio'}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            isScreenSharing ? 'opacity-30 cursor-not-allowed bg-white/[0.06] text-surface-200' : isSharingAudio ? 'bg-success text-white' : 'bg-white/[0.06] text-surface-200 hover:bg-white/[0.12]'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
            <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
          </svg>
        </button>

        {/* Hangup */}
        <button
          onClick={onHangup}
          title="Encerrar chamada"
          className="w-9 h-9 rounded-full bg-danger flex items-center justify-center hover:bg-danger-600 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

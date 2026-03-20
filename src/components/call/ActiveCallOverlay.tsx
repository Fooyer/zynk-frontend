import { useEffect, useState } from 'react';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { CallStatus } from '../../stores/callStore';

interface Props {
  peerUsername: string;
  status: CallStatus;
  isMuted: boolean;
  onHangup: () => void;
  onToggleMute: () => void;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ActiveCallOverlay({ peerUsername, status, isMuted, onHangup, onToggleMute }: Props) {
  const [seconds, setSeconds] = useState(0);
  const color = getUserColor(peerUsername);

  useEffect(() => {
    if (status !== 'active') return;
    const interval = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(interval);
  }, [status]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90]">
      <div className="bg-surface-800 border border-surface-700 rounded-2xl px-5 py-4 flex items-center gap-4 shadow-2xl min-w-[300px]">
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {getInitials(peerUsername)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-surface-100 font-semibold text-sm truncate">{peerUsername}</p>
          <p className={`text-xs ${status === 'active' ? 'text-success' : 'text-surface-400'}`}>
            {status === 'calling' ? 'Chamando...' : status === 'ringing' ? 'Conectando...' : formatDuration(seconds)}
          </p>
        </div>

        {/* Mute */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Ativar microfone' : 'Silenciar'}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
            isMuted ? 'bg-danger text-white' : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
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

        {/* Hangup */}
        <button
          onClick={onHangup}
          title="Encerrar chamada"
          className="w-9 h-9 rounded-full bg-danger flex items-center justify-center hover:bg-red-700 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

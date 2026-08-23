import { useEffect, useState } from 'react';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { CallMode } from '../../types';

interface Props {
  peerUsername: string;
  mode: CallMode;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCallModal({ peerUsername, mode, onAccept, onReject }: Props) {
  const [dots, setDots] = useState('');
  const color = getUserColor(peerUsername);
  const isGame = mode === 'game';

  useEffect(() => {
    const interval = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 600);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className={`zk-corners bg-accent-900 rounded-2xl p-8 flex flex-col items-center gap-5 shadow-modal border w-72 animate-scale-in ${isGame ? 'border-warning/50' : 'border-white/[0.08]'}`}>
        {/* Avatar animado com pulse */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ backgroundColor: color }} />
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold relative"
            style={{ backgroundColor: color }}
          >
            {getInitials(peerUsername)}
          </div>
        </div>

        {isGame && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 text-warning text-[11px] font-semibold -mt-2">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
            </svg>
            CHAMADA DE JOGOS — BAIXA LATÊNCIA
          </span>
        )}

        <div className="text-center">
          <p className="text-surface-400 text-sm">{isGame ? 'Chamada de jogos de' : 'Chamada de voz de'}</p>
          <p className="text-surface-100 font-bold text-xl">{peerUsername}</p>
          <p className="text-surface-500 text-xs mt-1">Chamando{dots}</p>
        </div>

        <div className="flex gap-4">
          {/* Rejeitar */}
          <button
            onClick={onReject}
            className="w-14 h-14 rounded-full bg-danger flex items-center justify-center hover:bg-red-700 transition-colors shadow-lg"
            title="Rejeitar"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>

          {/* Aceitar */}
          <button
            onClick={onAccept}
            className="w-14 h-14 rounded-full bg-success flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg"
            title="Aceitar"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

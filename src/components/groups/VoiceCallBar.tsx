import { useAuthStore } from '../../stores/authStore';
import type { VoiceChannel } from '../../types';

interface Props {
  activeVc: VoiceChannel;
  isMuted: boolean;
  onToggleMute: () => void;
  onLeave: () => void;
}

function MicIcon({ muted }: { muted: boolean }) {
  if (muted) return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

export function VoiceCallBar({ activeVc, isMuted, onToggleMute, onLeave }: Props) {
  const user = useAuthStore((s) => s.user);
  const allParticipants = [
    { userId: user?.id ?? 0, username: user?.username ?? '', avatarUrl: user?.avatarUrl ?? null },
    ...activeVc.participants.filter((p) => p.userId !== user?.id),
  ];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-green-950/60 border-t border-green-800/40 flex-shrink-0">
      {/* Status dot + channel name */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-green-400 flex-shrink-0">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        <span className="text-xs font-medium text-green-300 truncate">{activeVc.name}</span>
      </div>

      {/* Participant avatars */}
      <div className="flex items-center">
        {allParticipants.slice(0, 5).map((p, i) => (
          <div
            key={p.userId}
            className="w-5 h-5 rounded-full border border-green-900 flex items-center justify-center text-[9px] font-bold text-white bg-accent-700 flex-shrink-0"
            style={{ marginLeft: i === 0 ? 0 : '-4px', zIndex: allParticipants.length - i }}
            title={p.username}
          >
            {p.avatarUrl
              ? <img src={p.avatarUrl} className="w-full h-full rounded-full object-cover" />
              : p.username[0]?.toUpperCase()
            }
          </div>
        ))}
        {allParticipants.length > 5 && (
          <span className="text-[10px] text-green-400 ml-1">+{allParticipants.length - 5}</span>
        )}
      </div>

      <span className="text-[11px] text-green-500 ml-0.5">
        {allParticipants.length} conectado{allParticipants.length !== 1 ? 's' : ''}
      </span>

      <div className="ml-auto flex items-center gap-1">
        {/* Mute */}
        <button
          onClick={onToggleMute}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
            isMuted
              ? 'bg-red-600/30 text-red-300 hover:bg-red-600/50'
              : 'text-green-400 hover:bg-green-900/40'
          }`}
          title={isMuted ? 'Desmutar' : 'Mutar'}
        >
          <MicIcon muted={isMuted} />
          <span>{isMuted ? 'Mutado' : 'Ativo'}</span>
        </button>

        {/* Leave */}
        <button
          onClick={onLeave}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-900/30 transition-colors"
          title="Sair do canal"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>Sair</span>
        </button>
      </div>
    </div>
  );
}

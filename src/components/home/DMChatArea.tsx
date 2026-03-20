import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { TypingIndicator } from '../chat/TypingIndicator';
import { useFriendStore } from '../../stores/friendStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { DmChannel } from '../../types';

interface Props {
  dm: DmChannel;
}

function HeaderIconButton({ title, onClick, children, danger }: {
  title: string;
  onClick?: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${
        danger
          ? 'text-surface-400 hover:text-danger hover:bg-surface-700'
          : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
      }`}
    >
      {children}
    </button>
  );
}

export function DMChatArea({ dm }: Props) {
  const { friend, channelId } = dm;
  const color = getUserColor(friend.username);
  const setActiveDm = useFriendStore((s) => s.setActiveDm);

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

        {/* DM @ icon */}
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
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-900 ${
              friend.status === 'online' ? 'bg-online' : 'bg-offline'
            }`}
          />
        </div>

        {/* Name + status */}
        <div className="min-w-0">
          <span className="font-semibold text-surface-100 text-sm">{friend.username}</span>
          <span className="ml-1.5 text-xs text-surface-500">
            {friend.status === 'online' ? '🟢 Online' : '⚫ Offline'}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="ml-auto flex items-center gap-0.5">
          {/* Chamada de voz — futuro */}
          <HeaderIconButton title="Chamada de voz (em breve)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.97-.97a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </HeaderIconButton>

          {/* Chamada de vídeo — futuro */}
          <HeaderIconButton title="Chamada de vídeo (em breve)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
          </HeaderIconButton>

          <div className="w-px h-5 bg-surface-700 mx-1" />

          {/* Voltar para amigos */}
          <HeaderIconButton title="Voltar para amigos" danger onClick={() => setActiveDm(null)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </HeaderIconButton>
        </div>
      </header>

      <MessageList channelId={channelId} />
      <TypingIndicator channelId={channelId} />
      <MessageInput channelId={channelId} placeholder={`Mensagem para @${friend.username}`} />
    </main>
  );
}

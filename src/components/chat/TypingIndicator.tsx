import { useChatStore } from '../../stores/chatStore';
import { useChannelStore } from '../../stores/channelStore';
import { useAuthStore } from '../../stores/authStore';

export function TypingIndicator() {
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const typingUsers = useChatStore((s) =>
    activeChannelId ? s.typingUsers[activeChannelId] || [] : [],
  );

  // Filtra o próprio usuário
  const others = typingUsers.filter((t) => t.userId !== currentUserId);

  if (others.length === 0) return <div className="h-6 px-4" />;

  const text =
    others.length === 1
      ? `${others[0].username} está digitando`
      : others.length === 2
        ? `${others[0].username} e ${others[1].username} estão digitando`
        : `${others[0].username} e mais ${others.length - 1} estão digitando`;

  return (
    <div className="h-6 px-4 flex items-center gap-2">
      {/* Dots animados */}
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-surface-400">{text}</span>
    </div>
  );
}

import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  channelId: number;
}

export function TypingIndicator({ channelId }: Props) {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const typingUsers = useChatStore((s) => s.typingUsers[channelId] || []);
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
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-surface-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-surface-400">{text}</span>
    </div>
  );
}

import { useChannelStore } from '../../stores/channelStore';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { TypingIndicator } from '../chat/TypingIndicator';

export function ChatArea() {
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const channels = useChannelStore((s) => s.channels);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-surface-900">
      {/* Channel header */}
      <header className="h-12 flex items-center px-4 border-b border-surface-700/50 flex-shrink-0">
        {activeChannel ? (
          <div className="flex items-center gap-2">
            <span className="text-surface-400 text-lg">#</span>
            <h2 className="font-semibold text-surface-100 text-sm">{activeChannel.name}</h2>
            {activeChannel.description && (
              <>
                <div className="w-px h-4 bg-surface-600 mx-1" />
                <span className="text-xs text-surface-400 truncate">{activeChannel.description}</span>
              </>
            )}
          </div>
        ) : (
          <span className="text-surface-500 text-sm">Selecione um canal</span>
        )}
      </header>

      {/* Messages */}
      <MessageList />

      {/* Typing indicator */}
      <TypingIndicator />

      {/* Input */}
      <MessageInput />
    </main>
  );
}

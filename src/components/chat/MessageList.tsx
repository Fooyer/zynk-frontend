import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageItem } from './MessageItem';

interface Props {
  channelId: number;
}

export function MessageList({ channelId }: Props) {
  const messages = useChatStore((s) => s.messagesByChannel[channelId] || []);
  const hasMore = useChatStore((s) => s.hasMore[channelId] ?? true);
  const loadMore = useChatStore((s) => s.loadMore);
  const isLoading = useChatStore((s) => s.isLoading);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  useEffect(() => {
    if (wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const threshold = 100;
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    if (el.scrollTop < 50 && hasMore && !isLoading) {
      const prevHeight = el.scrollHeight;
      loadMore(channelId).then(() => {
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  }, [hasMore, isLoading, channelId, loadMore]);

  return (
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto">
      {hasMore && (
        <div className="py-4 text-center">
          <span className="text-xs text-surface-500">
            {isLoading ? 'Carregando...' : 'Scroll para carregar mais'}
          </span>
        </div>
      )}
      <div className="pb-4">
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const isGrouped =
            !!prev &&
            prev.senderId === msg.senderId &&
            new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 300000;
          return <MessageItem key={msg.id} message={msg} isGrouped={isGrouped} />;
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

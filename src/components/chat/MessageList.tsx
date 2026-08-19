import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { MessageItem } from './MessageItem';
import { MessageListSkeleton } from '../common/Skeleton';

interface Props {
  channelId: number;
}

export function MessageList({ channelId }: Props) {
  const messages = useChatStore((s) => s.messagesByChannel[channelId] || []);
  const hasMore = useChatStore((s) => s.hasMore[channelId] ?? true);
  const loadMore = useChatStore((s) => s.loadMore);
  const isLoading = useChatStore((s) => s.isLoading);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);

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

  if (isLoading && messages.length === 0) {
    return <MessageListSkeleton />;
  }

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
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex items-center gap-3 my-2 px-4">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-xs text-surface-500 flex-shrink-0 flex items-center gap-1.5">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-surface-500">
                    <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                  </svg>
                  {msg.content}
                </span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>
            );
          }
          const prev = messages[i - 1];
          const isGrouped =
            !!prev &&
            !prev.isSystem &&
            prev.senderId === msg.senderId &&
            !msg.replyTo &&
            new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 300000;
          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isGrouped={isGrouped}
              onReply={setReplyingTo}
            />
          );
        })}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

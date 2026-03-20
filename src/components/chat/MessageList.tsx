import { useEffect, useRef, useCallback } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { useChannelStore } from '../../stores/channelStore';
import { MessageItem } from './MessageItem';

export function MessageList() {
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const messages = useChatStore((s) =>
    activeChannelId ? s.messagesByChannel[activeChannelId] || [] : [],
  );
  const hasMore = useChatStore((s) =>
    activeChannelId ? s.hasMore[activeChannelId] ?? true : false,
  );
  const loadMore = useChatStore((s) => s.loadMore);
  const isLoading = useChatStore((s) => s.isLoading);

  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottom = useRef(true);

  // Auto-scroll para baixo quando nova mensagem chega (se já estava embaixo)
  useEffect(() => {
    if (wasAtBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  // Detecta se está no fundo da lista
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const threshold = 100; // px do fundo
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;

    // Load more quando scroll chega no topo
    if (el.scrollTop < 50 && hasMore && !isLoading && activeChannelId) {
      const prevHeight = el.scrollHeight;
      loadMore(activeChannelId).then(() => {
        // Mantém posição do scroll após carregar mensagens antigas
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight - prevHeight;
          }
        });
      });
    }
  }, [hasMore, isLoading, activeChannelId, loadMore]);

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-surface-400 text-lg">Selecione um canal para começar</p>
          <p className="text-surface-500 text-sm mt-1">Ou crie um novo canal</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {/* Load more indicator */}
      {hasMore && (
        <div className="py-4 text-center">
          <span className="text-xs text-surface-500">
            {isLoading ? 'Carregando...' : 'Scroll para carregar mais'}
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="pb-4">
        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          // Agrupa mensagens do mesmo sender em sequência (< 5min entre elas)
          const isGrouped =
            !!prev &&
            prev.senderId === msg.senderId &&
            new Date(msg.createdAt).getTime() - new Date(prev.createdAt).getTime() < 300000;

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isGrouped={isGrouped}
            />
          );
        })}
      </div>

      {/* Anchor para auto-scroll */}
      <div ref={bottomRef} />
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
import { getSocket } from '../../services/socket';
import { useChannelStore } from '../../stores/channelStore';

export function MessageInput() {
  const [content, setContent] = useState('');
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const lastTypingEmit = useRef(0);

  const handleSend = useCallback(() => {
    if (!content.trim() || !activeChannelId) return;

    const socket = getSocket();
    socket.emit('message:send', {
      channelId: activeChannelId,
      content: content.trim(),
    });

    setContent('');
  }, [content, activeChannelId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Emit typing com throttle de 2s (evita spam)
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    if (!activeChannelId) return;
    const now = Date.now();
    if (now - lastTypingEmit.current > 2000) {
      lastTypingEmit.current = now;
      const socket = getSocket();
      socket.emit('message:typing', { channelId: activeChannelId });
    }
  };

  if (!activeChannelId) return null;

  return (
    <div className="px-4 pb-4 pt-1">
      <div className="flex items-end gap-2 bg-surface-700 rounded-xl px-4 py-2 border border-surface-600 focus-within:border-accent-500/50 transition-colors">
        <textarea
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Envie uma mensagem..."
          className="flex-1 bg-transparent text-surface-100 placeholder-surface-500 resize-none focus:outline-none text-sm leading-relaxed max-h-32 py-1.5"
          style={{ minHeight: '24px' }}
          onInput={(e) => {
            // Auto-resize textarea
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 128) + 'px';
          }}
        />
        <button
          onClick={handleSend}
          disabled={!content.trim()}
          className="p-2 rounded-lg text-accent-400 hover:bg-accent-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          aria-label="Enviar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

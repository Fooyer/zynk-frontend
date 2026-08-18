import { memo, useState } from 'react';
import { formatMessageDate, getInitials, getUserColor } from '../../utils/formatDate';
import type { Message } from '../../types';

const API_URL = 'https://zynk.fooyer.com';

interface Props {
  message: Message;
  isGrouped: boolean;
  onReply: (message: Message) => void;
}

function MessageContent({ content, imageUrl }: { content: string; imageUrl?: string | null }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {imageUrl && (
        <img
          src={`${API_URL}${imageUrl}`}
          alt="Imagem"
          onClick={() => setExpanded(!expanded)}
          className={`rounded-lg border border-surface-600 cursor-pointer transition-all hover:brightness-110 ${
            expanded ? 'max-w-lg max-h-[500px]' : 'max-w-xs max-h-48'
          } object-cover mt-1`}
          loading="lazy"
        />
      )}
      {content && (
        <p className="text-sm text-surface-200 leading-relaxed break-words">
          {content}
        </p>
      )}
    </>
  );
}

function ReplyBanner({ replyTo }: { replyTo: NonNullable<Message['replyTo']> }) {
  const color = getUserColor(replyTo.sender.username);

  return (
    <div className="flex items-center gap-2 mb-1 pl-3 border-l-2 rounded-sm" style={{ borderColor: color }}>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold" style={{ color }}>
          {replyTo.sender.username}
        </span>
        <p className="text-xs text-surface-400 truncate max-w-md">
          {replyTo.imageUrl && !replyTo.content ? '📷 Imagem' : replyTo.content}
        </p>
      </div>
      {replyTo.imageUrl && (
        <img
          src={`${API_URL}${replyTo.imageUrl}`}
          alt=""
          className="w-8 h-8 rounded object-cover flex-shrink-0"
        />
      )}
    </div>
  );
}

function ReplyButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded text-surface-500 hover:text-surface-200 hover:bg-surface-600/50 opacity-0 group-hover:opacity-100 transition-all"
      aria-label="Responder"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </svg>
    </button>
  );
}

export const MessageItem = memo(function MessageItem({ message, isGrouped, onReply }: Props) {
  const { sender, content, imageUrl, replyTo, createdAt } = message;
  const color = getUserColor(sender.username);

  if (isGrouped) {
    return (
      <div className="group flex items-start gap-3 px-4 py-0.5 hover:bg-surface-800/30">
        <div className="w-10 flex-shrink-0 flex items-center justify-center">
          <span className="text-xs text-surface-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {replyTo && <ReplyBanner replyTo={replyTo} />}
          <MessageContent content={content} imageUrl={imageUrl} />
        </div>
        <ReplyButton onClick={() => onReply(message)} />
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-4 pt-3 pb-0.5 hover:bg-surface-800/30">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-semibold"
        style={{ backgroundColor: color }}
      >
        {sender.avatarUrl ? (
          <img src={sender.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          getInitials(sender.username)
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm" style={{ color }}>
            {sender.username}
          </span>
          <span className="text-xs text-surface-500">
            {formatMessageDate(createdAt)}
          </span>
        </div>
        {replyTo && <ReplyBanner replyTo={replyTo} />}
        <MessageContent content={content} imageUrl={imageUrl} />
      </div>
      <ReplyButton onClick={() => onReply(message)} />
    </div>
  );
});

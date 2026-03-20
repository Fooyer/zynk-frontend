import { memo } from 'react';
import { formatMessageDate, getInitials, getUserColor } from '../../utils/formatDate';
import type { Message } from '../../types';

interface Props {
  message: Message;
  /** Se a mensagem anterior é do mesmo sender (agrupa visualmente) */
  isGrouped: boolean;
}

/**
 * Componente de mensagem individual.
 * memo() evita re-render quando a lista atualiza mas esta mensagem não mudou.
 */
export const MessageItem = memo(function MessageItem({ message, isGrouped }: Props) {
  const { sender, content, createdAt } = message;
  const color = getUserColor(sender.username);

  // Mensagem agrupada: sem avatar, menor padding
  if (isGrouped) {
    return (
      <div className="group flex items-start gap-3 px-4 py-0.5 hover:bg-surface-800/30">
        {/* Espaço reservado para alinhar com o avatar */}
        <div className="w-10 flex-shrink-0 flex items-center justify-center">
          <span className="text-xs text-surface-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-sm text-surface-200 leading-relaxed break-words min-w-0">
          {content}
        </p>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-4 pt-3 pb-0.5 hover:bg-surface-800/30">
      {/* Avatar */}
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

      {/* Conteúdo */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold text-sm" style={{ color }}>
            {sender.username}
          </span>
          <span className="text-xs text-surface-500">
            {formatMessageDate(createdAt)}
          </span>
        </div>
        <p className="text-sm text-surface-200 leading-relaxed break-words">
          {content}
        </p>
      </div>
    </div>
  );
});

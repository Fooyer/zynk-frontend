import { memo, useEffect, useRef, useState } from 'react';
import { formatMessageDate, getInitials, getUserColor, formatFileSize } from '../../utils/formatDate';
import { getSocket } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { confirmDialog } from '../../stores/dialogStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { ContextMenuItem } from '../common/ContextMenuItem';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import type { Message } from '../../types';

const API_URL = 'https://zynk.fooyer.com';

interface Props {
  message: Message;
  isGrouped: boolean;
  onReply: (message: Message) => void;
}

function MessageMenuItems({ canCopy, canEdit, canDelete, onReply, onCopy, onEdit, onDelete }: {
  canCopy: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <ContextMenuItem
        onClick={onReply}
        icon={
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
        }
        label="Responder"
      />

      {canCopy && (
        <ContextMenuItem
          onClick={onCopy}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          }
          label="Copiar"
        />
      )}

      {canEdit && (
        <ContextMenuItem
          onClick={onEdit}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          }
          label="Editar"
        />
      )}

      {canDelete && (
        <ContextMenuItem
          onClick={onDelete}
          danger
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          }
          label="Excluir"
        />
      )}
    </>
  );
}

function FileChip({ fileUrl, fileName, fileSize }: { fileUrl: string; fileName: string; fileSize?: number | null }) {
  return (
    <a
      href={`${API_URL}${fileUrl}`}
      target="_blank"
      rel="noopener noreferrer"
      download={fileName}
      className="mt-1 flex items-center gap-2 pl-3 pr-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors max-w-xs"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400 flex-shrink-0">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-surface-200 truncate">{fileName}</p>
        {fileSize != null && <p className="text-[11px] text-surface-500">{formatFileSize(fileSize)}</p>}
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-500 flex-shrink-0">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </a>
  );
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const lines = code.split('\n');
  // Blocos curtos já vêm abertos — só os longos começam retraídos, pra não
  // esconder um trecho de 3 linhas atrás de um clique extra à toa.
  const [collapsed, setCollapsed] = useState(lines.length > 12);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div className="mt-1.5 rounded-xl border border-white/[0.08] bg-surface-950/60 overflow-hidden max-w-full">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.06]">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          {lang || 'código'} · {lines.length} {lines.length === 1 ? 'linha' : 'linhas'}
        </button>
        <button onClick={handleCopy} className="text-xs text-surface-500 hover:text-surface-200 transition-colors">
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      {!collapsed && (
        <pre className="px-3 py-2 overflow-x-auto text-xs leading-relaxed text-surface-200 font-mono whitespace-pre">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

type ContentPart = { type: 'text'; value: string } | { type: 'code'; lang: string; value: string };

// Divide o conteúdo em texto normal e blocos ```code``` — preserva
// indentação/quebras de linha exatamente como digitadas dentro do fence,
// sem depender de nenhuma lib de markdown.
function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content))) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'code', lang: match[1], value: match[2].replace(/\n$/, '') });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }
  return parts;
}

function MessageContent({ content, imageUrl, fileUrl, fileName, fileSize }: {
  content: string;
  imageUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const parts = content ? parseContent(content) : [];

  return (
    <>
      {imageUrl && (
        <img
          src={`${API_URL}${imageUrl}`}
          alt="Imagem"
          onClick={() => setExpanded(!expanded)}
          className={`rounded-xl border border-white/[0.08] shadow-panel cursor-pointer transition-all hover:brightness-110 ${
            expanded ? 'max-w-lg max-h-[500px]' : 'max-w-xs max-h-48'
          } object-cover mt-1`}
          loading="lazy"
        />
      )}
      {fileUrl && fileName && <FileChip fileUrl={fileUrl} fileName={fileName} fileSize={fileSize} />}
      {parts.map((part, i) =>
        part.type === 'code' ? (
          <CodeBlock key={i} code={part.value} lang={part.lang} />
        ) : (
          part.value.trim() && (
            <p key={i} className="text-sm text-surface-200 leading-relaxed break-words whitespace-pre-wrap">
              {part.value.trim()}
            </p>
          )
        ),
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
          {!replyTo.content && replyTo.imageUrl
            ? '📷 Imagem'
            : !replyTo.content && replyTo.fileUrl
              ? `📎 ${replyTo.fileName || 'Arquivo'}`
              : replyTo.content}
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
      className="p-1 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-white/[0.08] opacity-0 group-hover:opacity-100 transition-all"
      aria-label="Responder"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 17 4 12 9 7" />
        <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
      </svg>
    </button>
  );
}

function EditForm({ initialValue, onSave, onCancel }: {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLTextAreaElement>(null);
  const handleEditContextMenu = useEditableContextMenu(ref);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSave(value);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="mt-0.5">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onContextMenu={handleEditContextMenu}
        rows={1}
        className="w-full bg-surface-900/70 border border-accent-500/60 rounded-xl px-3 py-2 text-sm text-surface-100 resize-none focus:outline-none focus:ring-1 focus:ring-accent-500/40"
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = Math.min(el.scrollHeight, 200) + 'px';
        }}
      />
      <p className="text-[11px] text-surface-500 mt-1">
        esc para cancelar • enter para salvar
      </p>
    </div>
  );
}

export const MessageItem = memo(function MessageItem({ message, isGrouped, onReply }: Props) {
  const { sender, content, imageUrl, fileUrl, fileName, fileSize, replyTo, createdAt, editedAt } = message;
  const color = getUserColor(sender.username);
  const currentUser = useAuthStore((s) => s.user);

  const [isEditing, setIsEditing] = useState(false);

  const isOwn = Number(message.senderId) === Number(currentUser?.id);
  const canCopy = !message.isSystem && !!content;
  const canEdit = isOwn && !message.isSystem && !!content;
  const canDelete = isOwn && !message.isSystem;

  const handleDelete = async () => {
    useContextMenuStore.getState().close();
    const ok = await confirmDialog('Essa ação não pode ser desfeita.', {
      title: 'Excluir mensagem?',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    getSocket().emit('message:delete', { messageId: message.id });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (message.isSystem) return;
    e.preventDefault();
    // Captura a seleção de texto no momento em que o menu abre — clicar no
    // item "Copiar" depois colapsaria a seleção antes de conseguirmos lê-la.
    // Se houver algo selecionado, ele tem prioridade sobre a mensagem inteira.
    const selectedText = window.getSelection()?.toString() ?? '';
    const textToCopy = selectedText.trim() ? selectedText : content;

    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <MessageMenuItems
        canCopy={canCopy}
        canEdit={canEdit}
        canDelete={canDelete}
        onReply={() => { useContextMenuStore.getState().close(); onReply(message); }}
        onCopy={() => { useContextMenuStore.getState().close(); navigator.clipboard.writeText(textToCopy).catch(() => {}); }}
        onEdit={() => { useContextMenuStore.getState().close(); setIsEditing(true); }}
        onDelete={handleDelete}
      />
    ));
  };

  const handleSaveEdit = (value: string) => {
    const trimmed = value.trim();
    setIsEditing(false);
    useChatStore.getState().focusComposer();
    if (!trimmed || trimmed === content) return;
    getSocket().emit('message:edit', { messageId: message.id, content: trimmed });
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    useChatStore.getState().focusComposer();
  };

  if (isGrouped) {
    return (
      <div className="group flex items-start gap-3 mx-2 px-2 py-0.5 rounded-lg hover:bg-white/[0.03] transition-colors" onContextMenu={handleContextMenu}>
        <div className="w-10 flex-shrink-0 flex items-center justify-center">
          <span className="text-xs text-surface-500 opacity-0 group-hover:opacity-100 transition-opacity">
            {new Date(createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          {replyTo && <ReplyBanner replyTo={replyTo} />}
          {isEditing ? (
            <EditForm initialValue={content} onSave={handleSaveEdit} onCancel={handleCancelEdit} />
          ) : (
            <MessageContent content={content} imageUrl={imageUrl} fileUrl={fileUrl} fileName={fileName} fileSize={fileSize} />
          )}
        </div>
        <ReplyButton onClick={() => onReply(message)} />
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-3 mx-2 px-2 pt-3 pb-0.5 rounded-lg hover:bg-white/[0.03] transition-colors" onContextMenu={handleContextMenu}>
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
          {editedAt && (
            <span className="text-[10px] text-surface-600">(editado)</span>
          )}
        </div>
        {replyTo && <ReplyBanner replyTo={replyTo} />}
        {isEditing ? (
          <EditForm initialValue={content} onSave={handleSaveEdit} onCancel={() => setIsEditing(false)} />
        ) : (
          <MessageContent content={content} imageUrl={imageUrl} fileUrl={fileUrl} fileName={fileName} fileSize={fileSize} />
        )}
      </div>
      <ReplyButton onClick={() => onReply(message)} />
    </div>
  );
});

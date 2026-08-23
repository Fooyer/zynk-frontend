import { useState, useRef, useCallback, useEffect } from 'react';
import { getSocket } from '../../services/socket';
import { messagesAPI } from '../../services/api';
import { useChatStore } from '../../stores/chatStore';
import { alertDialog } from '../../stores/dialogStore';
import { getUserColor, formatFileSize } from '../../utils/formatDate';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import { PollComposerModal } from './PollComposerModal';
import { ContextMenuItem } from '../common/ContextMenuItem';
import type { Message } from '../../types';

interface Props {
  channelId: number;
  placeholder?: string;
  // Enquetes só fazem sentido em canal de servidor — DMChatArea não passa isso.
  allowPolls?: boolean;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 25 * 1024 * 1024; // 25 MB — igual ao limite do backend

export function MessageInput({ channelId, placeholder = 'Envie uma mensagem...', allowPolls }: Props) {
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  // Anexo genérico (não-imagem) — mutuamente exclusivo com imageFile.
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPollComposer, setShowPollComposer] = useState(false);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const lastTypingEmit = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const handleEditContextMenu = useEditableContextMenu(textareaRef);

  // Fecha o menu de ferramentas (+) em clique fora ou Esc.
  useEffect(() => {
    if (!showToolsMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (!toolsMenuRef.current?.contains(e.target as Node)) setShowToolsMenu(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowToolsMenu(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showToolsMenu]);

  const replyingTo = useChatStore((s) => s.replyingTo[channelId] ?? null);
  const setReplyingToRaw = useChatStore((s) => s.setReplyingTo);
  const setReplyingTo = useCallback(
    (message: Message | null) => setReplyingToRaw(channelId, message),
    [setReplyingToRaw, channelId],
  );
  const composerFocusTick = useChatStore((s) => s.composerFocusTick);

  const clearAttachment = useCallback(() => {
    setImageFile(null);
    setAttachedFile(null);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    textareaRef.current?.focus();
  }, []);

  // Sempre que uma resposta é iniciada ou cancelada (banner ✕, Escape, clique
  // em "responder" numa mensagem), o foco volta pro campo de digitação.
  useEffect(() => {
    textareaRef.current?.focus();
  }, [replyingTo]);

  // Sinal disparado por outros componentes (ex: salvar/cancelar edição de
  // mensagem) pedindo o foco de volta pro campo de digitação principal.
  useEffect(() => {
    if (composerFocusTick > 0) textareaRef.current?.focus();
  }, [composerFocusTick]);

  const handleFile = useCallback((file: File) => {
    if (file.size > MAX_SIZE) {
      alertDialog('Arquivo muito grande. Máximo 25 MB.', { title: 'Arquivo inválido' })
        .then(() => textareaRef.current?.focus());
      return;
    }

    if (IMAGE_TYPES.includes(file.type)) {
      setAttachedFile(null);
      setImageFile(file);
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    } else {
      setImageFile(null);
      setImagePreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setAttachedFile(file);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file);
    textareaRef.current?.focus();
  };

  // Ctrl+V com uma imagem (print, imagem copiada de outro app/navegador) ou
  // qualquer outro arquivo na área de transferência anexa direto.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          handleFile(file);
        }
        break;
      }
    }
  };

  // Envolve a seleção atual (ou insere um bloco vazio, se nada selecionado)
  // num code fence — preserva indentação/quebras de linha exatamente como
  // digitadas, sem precisar de nenhuma lib de markdown.
  const handleInsertCodeBlock = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const before = content.slice(0, start);
    const after = content.slice(end);
    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
    const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');

    const block = '```\n' + selected + (selected ? '\n' : '') + '```';
    const insertion = (needsLeadingNewline ? '\n' : '') + block + (needsTrailingNewline ? '\n' : '');
    const next = before + insertion + after;
    setContent(next);

    requestAnimationFrame(() => {
      el.focus();
      const codeStart = before.length + (needsLeadingNewline ? 1 : 0) + 4; // depois de "```\n"
      const codeEnd = codeStart + selected.length;
      el.setSelectionRange(codeStart, codeEnd);
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 128) + 'px';
    });
  };

  const handleSend = useCallback(async () => {
    const attachment = imageFile || attachedFile;
    if (!content.trim() && !attachment) return;
    if (uploading) return;

    let imageUrl: string | undefined;
    let fileUrl: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;
    let fileMimeType: string | undefined;

    if (attachment) {
      try {
        setUploading(true);
        const { data } = await messagesAPI.uploadFile(attachment);
        imageUrl = data.imageUrl;
        fileUrl = data.fileUrl;
        fileName = data.fileName;
        fileSize = data.fileSize;
        fileMimeType = data.fileMimeType;
      } catch {
        alertDialog('Erro ao enviar arquivo. Tente novamente.', { title: 'Falha no envio' })
          .then(() => textareaRef.current?.focus());
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    const socket = getSocket();
    socket.emit('message:send', {
      channelId,
      content: content.trim(),
      ...(imageUrl && { imageUrl }),
      ...(fileUrl && { fileUrl, fileName, fileSize, fileMimeType }),
      ...(replyingTo && { replyToId: replyingTo.id }),
    });

    setContent('');
    clearAttachment();
    setReplyingTo(null);
  }, [content, channelId, imageFile, attachedFile, uploading, clearAttachment, replyingTo, setReplyingTo]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape' && replyingTo) {
      setReplyingTo(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    const now = Date.now();
    if (now - lastTypingEmit.current > 2000) {
      lastTypingEmit.current = now;
      const socket = getSocket();
      socket.emit('message:typing', { channelId });
    }
  };

  const replyColor = replyingTo ? getUserColor(replyingTo.sender.username) : undefined;

  return (
    <div className="px-4 pb-4 pt-1">
      {/* Banner de resposta */}
      {replyingTo && (
        <div
          className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl bg-white/[0.04] border-l-2"
          style={{ borderColor: replyColor }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400 flex-shrink-0">
            <polyline points="9 17 4 12 9 7" />
            <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
          </svg>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold" style={{ color: replyColor }}>
              Respondendo a {replyingTo.sender.username}
            </span>
            <p className="text-xs text-surface-400 truncate">
              {replyingTo.imageUrl && !replyingTo.content ? '📷 Imagem' : replyingTo.content}
            </p>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 rounded-lg text-surface-500 hover:text-surface-200 hover:bg-white/[0.08] transition-all flex-shrink-0"
            aria-label="Cancelar resposta"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Preview da imagem */}
      {imagePreview && (
        <div className="mb-2 relative inline-block">
          <img
            src={imagePreview}
            alt="Preview"
            className="max-h-32 max-w-xs rounded-xl border border-white/[0.08] shadow-panel object-cover"
          />
          <button
            onClick={clearAttachment}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
            aria-label="Remover imagem"
          >
            ✕
          </button>
        </div>
      )}

      {/* Preview do arquivo genérico (não-imagem) */}
      {attachedFile && (
        <div className="mb-2 inline-flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400 flex-shrink-0">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-medium text-surface-200 truncate max-w-[220px]">{attachedFile.name}</p>
            <p className="text-[11px] text-surface-500">{formatFileSize(attachedFile.size)}</p>
          </div>
          <button
            onClick={clearAttachment}
            className="ml-1 w-6 h-6 flex-shrink-0 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
            aria-label="Remover arquivo"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 bg-surface-800/70 rounded-2xl px-4 py-2 border border-white/[0.08] shadow-panel focus-within:border-accent-500/50 focus-within:shadow-elevated transition-all">
        {/* Menu de ferramentas (anexar, bloco de código, enquete...) */}
        <div className="relative flex-shrink-0" ref={toolsMenuRef}>
          <button
            onClick={() => setShowToolsMenu((v) => !v)}
            disabled={uploading}
            className={`p-2 rounded-lg hover:text-accent-400 hover:bg-accent-500/10 disabled:opacity-30 transition-all ${
              showToolsMenu ? 'text-accent-400 bg-accent-500/10' : 'text-surface-400'
            }`}
            aria-label="Mais opções"
            aria-expanded={showToolsMenu}
            title="Mais opções"
          >
            <svg
              width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform ${showToolsMenu ? 'rotate-45' : ''}`}
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {showToolsMenu && (
            <div className="absolute bottom-full left-0 mb-2 z-20 zk-elevated rounded-xl p-1 min-w-[200px] animate-menu-in origin-bottom-left">
              <ContextMenuItem
                icon={(
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}
                label="Anexar arquivo"
                onClick={() => { setShowToolsMenu(false); fileInputRef.current?.click(); }}
              />
              <ContextMenuItem
                icon={(
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                )}
                label="Inserir bloco de código"
                onClick={() => { setShowToolsMenu(false); handleInsertCodeBlock(); }}
              />
              {allowPolls && (
                <ContextMenuItem
                  icon={(
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="20" x2="18" y2="10" />
                      <line x1="12" y1="20" x2="12" y2="4" />
                      <line x1="6" y1="20" x2="6" y2="14" />
                    </svg>
                  )}
                  label="Criar enquete"
                  onClick={() => { setShowToolsMenu(false); setShowPollComposer(true); }}
                />
              )}
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onContextMenu={handleEditContextMenu}
          rows={1}
          placeholder={replyingTo ? `Responder a ${replyingTo.sender.username}...` : placeholder}
          className="flex-1 bg-transparent text-surface-100 placeholder-surface-500 resize-none focus:outline-none text-sm leading-relaxed max-h-32 py-1.5"
          style={{ minHeight: '24px' }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 128) + 'px';
          }}
        />

        <button
          onClick={handleSend}
          disabled={(!content.trim() && !imageFile && !attachedFile) || uploading}
          className="p-2 rounded-lg text-accent-400 hover:bg-accent-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0"
          aria-label="Enviar"
        >
          {uploading ? (
            <svg width="20" height="20" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
            </svg>
          )}
        </button>
      </div>

      {showPollComposer && (
        <PollComposerModal channelId={channelId} onClose={() => setShowPollComposer(false)} />
      )}
    </div>
  );
}

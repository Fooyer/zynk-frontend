import { useState, useRef, useCallback } from 'react';
import { getSocket } from '../../services/socket';
import { messagesAPI } from '../../services/api';
import { useChatStore } from '../../stores/chatStore';
import { alertDialog } from '../../stores/dialogStore';
import { getUserColor } from '../../utils/formatDate';

interface Props {
  channelId: number;
  placeholder?: string;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export function MessageInput({ channelId, placeholder = 'Envie uma mensagem...' }: Props) {
  const [content, setContent] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const lastTypingEmit = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const replyingTo = useChatStore((s) => s.replyingTo);
  const setReplyingTo = useChatStore((s) => s.setReplyingTo);

  const clearImage = useCallback(() => {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [imagePreview]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      alertDialog('Tipo não suportado. Use JPEG, PNG, GIF ou WebP.', { title: 'Imagem inválida' });
      return;
    }
    if (file.size > MAX_SIZE) {
      alertDialog('Imagem muito grande. Máximo 5 MB.', { title: 'Imagem inválida' });
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSend = useCallback(async () => {
    if (!content.trim() && !imageFile) return;
    if (uploading) return;

    let imageUrl: string | undefined;

    if (imageFile) {
      try {
        setUploading(true);
        const { data } = await messagesAPI.uploadImage(imageFile);
        imageUrl = data.imageUrl;
      } catch {
        alertDialog('Erro ao enviar imagem. Tente novamente.', { title: 'Falha no envio' });
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
      ...(replyingTo && { replyToId: replyingTo.id }),
    });

    setContent('');
    clearImage();
    setReplyingTo(null);
  }, [content, channelId, imageFile, uploading, clearImage, replyingTo, setReplyingTo]);

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
          className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-surface-700/60 border-l-2"
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
            className="p-1 rounded text-surface-500 hover:text-surface-200 hover:bg-surface-600/50 transition-all flex-shrink-0"
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
            className="max-h-32 max-w-xs rounded-lg border border-surface-600 object-cover"
          />
          <button
            onClick={clearImage}
            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs transition-colors"
            aria-label="Remover imagem"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex items-end gap-2 bg-surface-700 rounded-xl px-4 py-2 border border-surface-600 focus-within:border-accent-500/50 transition-colors">
        {/* Botão de anexar imagem */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2 rounded-lg text-surface-400 hover:text-accent-400 hover:bg-accent-500/10 disabled:opacity-30 transition-all flex-shrink-0"
          aria-label="Anexar imagem"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
          disabled={(!content.trim() && !imageFile) || uploading}
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
    </div>
  );
}

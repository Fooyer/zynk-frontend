import { useEffect, useRef, useState } from 'react';
import { ticketsAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useTicketStore } from '../../stores/ticketStore';
import { confirmDialog } from '../../stores/dialogStore';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { TicketCard, TicketComment } from '../../types';

const COLUMNS: { id: TicketCard['status']; label: string; accent: string; dot: string }[] = [
  { id: 'backlog',     label: 'Backlog',        accent: 'border-white/[0.14]',   dot: 'bg-surface-500' },
  { id: 'in_progress', label: 'Em Andamento',   accent: 'border-yellow-500/60',  dot: 'bg-yellow-400' },
  { id: 'done',        label: 'Concluído',      accent: 'border-green-500/60',   dot: 'bg-green-400' },
];

function Avatar({ name, avatarUrl, size = 6 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const s = `w-${size} h-${size}`;
  if (avatarUrl) return <img src={avatarUrl} className={`${s} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div
      className={`${s} rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0`}
      style={{ backgroundColor: getUserColor(name) }}
    >
      {getInitials(name)}
    </div>
  );
}

function LikeButton({ ticket, onToggle }: { ticket: TicketCard; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold transition-colors ${
        ticket.likedByMe ? 'bg-accent-600/20 text-accent-400' : 'text-surface-500 hover:text-surface-200 hover:bg-white/[0.06]'
      }`}
      title={ticket.likedByMe ? 'Remover curtida' : 'Curtir'}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill={ticket.likedByMe ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      {ticket.likesCount > 0 && ticket.likesCount}
    </button>
  );
}

interface CreateTicketModalProps {
  onClose: () => void;
}

function CreateTicketModal({ onClose }: CreateTicketModalProps) {
  const createTicket = useTicketStore((s) => s.createTicket);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const handleTitleContextMenu = useEditableContextMenu(titleRef);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const handleDescriptionContextMenu = useEditableContextMenu(descriptionRef);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await createTicket({ title: title.trim(), description: description.trim() || undefined });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="zk-modal rounded-2xl w-[420px] p-5 flex flex-col gap-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-surface-100">Abrir ticket</h2>

        <input
          ref={titleRef}
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onContextMenu={handleTitleContextMenu}
          placeholder="Título do problema..."
          maxLength={255}
          className="zk-input w-full px-3 py-2 rounded-xl text-sm"
        />

        <textarea
          ref={descriptionRef}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onContextMenu={handleDescriptionContextMenu}
          placeholder="Descreva o problema (opcional)..."
          rows={4}
          className="zk-input w-full px-3 py-2 rounded-xl text-sm resize-none"
        />

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-surface-400 hover:text-surface-100 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={!title.trim() || isSaving} className="px-4 py-1.5 zk-btn-primary text-sm rounded-lg">
            {isSaving ? 'Abrindo...' : 'Abrir ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}

interface TicketDetailModalProps {
  ticket: TicketCard;
  isAdmin: boolean;
  onClose: () => void;
}

function TicketDetailModal({ ticket, isAdmin, onClose }: TicketDetailModalProps) {
  const updateTicket = useTicketStore((s) => s.updateTicket);
  const deleteTicket = useTicketStore((s) => s.deleteTicket);
  const toggleLike = useTicketStore((s) => s.toggleLike);
  const [title, setTitle] = useState(ticket.title);
  const [description, setDescription] = useState(ticket.description ?? '');
  const [status, setStatus] = useState(ticket.status);
  const [isSaving, setIsSaving] = useState(false);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [isCommenting, setIsCommenting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const handleTitleContextMenu = useEditableContextMenu(titleRef);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const handleDescriptionContextMenu = useEditableContextMenu(descriptionRef);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const handleCommentContextMenu = useEditableContextMenu(commentRef);

  useEffect(() => {
    setIsLoadingComments(true);
    ticketsAPI.getComments(ticket.id)
      .then(({ data }) => setComments(data))
      .finally(() => setIsLoadingComments(false));
  }, [ticket.id]);

  const save = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      await updateTicket(ticket.id, { title: title.trim(), description: description || undefined, status });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirmDialog('Essa ação não pode ser desfeita.', {
      title: 'Excluir este ticket?',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    await deleteTicket(ticket.id);
    onClose();
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || isCommenting) return;
    setIsCommenting(true);
    try {
      const { data } = await ticketsAPI.addComment(ticket.id, newComment.trim());
      setComments((prev) => [...prev, data]);
      setNewComment('');
    } finally {
      setIsCommenting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="zk-modal rounded-2xl w-[460px] max-h-[85vh] p-5 flex flex-col gap-4 overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {isAdmin ? (
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onContextMenu={handleTitleContextMenu}
            maxLength={255}
            className="text-base font-semibold text-surface-100 bg-transparent border-b border-white/[0.08] pb-1 focus:outline-none focus:border-accent-500/60 transition-colors"
          />
        ) : (
          <h2 className="text-base font-semibold text-surface-100">{ticket.title}</h2>
        )}

        <div>
          {isAdmin ? (
            <>
              <label className="text-xs font-medium text-surface-500 mb-1 block">Descrição</label>
              <textarea
                ref={descriptionRef}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onContextMenu={handleDescriptionContextMenu}
                placeholder="Sem descrição..."
                rows={4}
                className="zk-input w-full px-3 py-2 rounded-xl text-sm resize-none"
              />
            </>
          ) : ticket.description ? (
            <p className="text-sm text-surface-300 whitespace-pre-wrap leading-snug">{ticket.description}</p>
          ) : (
            <p className="text-sm text-surface-600 italic">Sem descrição.</p>
          )}
        </div>

        {isAdmin && (
          <div>
            <label className="text-xs font-medium text-surface-500 mb-1 block">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TicketCard['status'])}
              className="zk-input w-full px-3 py-2 rounded-xl text-sm"
            >
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-surface-500">
          <Avatar name={ticket.creator.username} avatarUrl={ticket.creator.avatarUrl} size={5} />
          <span>Aberto por {ticket.creator.username}</span>
          <span className="ml-auto">{new Date(ticket.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>

        {ticket.status === 'backlog' && (
          <div>
            <LikeButton ticket={ticket} onToggle={() => toggleLike(ticket.id)} />
          </div>
        )}

        {/* Comentários */}
        <div className="border-t border-white/[0.08] pt-3">
          <label className="text-xs font-medium text-surface-500 mb-2 block">Comentários</label>
          {isLoadingComments ? (
            <p className="text-xs text-surface-600">Carregando...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-surface-600 italic">Nenhum comentário ainda.</p>
          ) : (
            <div className="flex flex-col gap-2 mb-2">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2 items-start">
                  <Avatar name={c.author.username} avatarUrl={c.author.avatarUrl} size={5} />
                  <div className="flex-1 min-w-0 bg-white/[0.04] rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-xs font-semibold text-surface-200">{c.author.username}</span>
                      <span className="text-[10px] text-surface-600">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <p className="text-xs text-surface-300 whitespace-pre-wrap leading-snug">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {isAdmin && (
            <form onSubmit={handleAddComment} className="flex gap-2 mt-2">
              <textarea
                ref={commentRef}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onContextMenu={handleCommentContextMenu}
                placeholder="Comentar..."
                rows={2}
                className="zk-input flex-1 px-3 py-1.5 rounded-xl text-xs resize-none"
              />
              <button
                type="submit"
                disabled={!newComment.trim() || isCommenting}
                className="px-3 py-1.5 zk-btn-primary text-xs rounded-lg self-end"
              >
                Enviar
              </button>
            </form>
          )}
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex gap-2 justify-between border-t border-white/[0.08] pt-3">
            <button onClick={handleDelete} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors">
              Excluir
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-sm text-surface-400 hover:text-surface-100 transition-colors">
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={!title.trim() || isSaving}
                className="px-4 py-1.5 zk-btn-primary text-sm rounded-lg"
              >
                {isSaving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TicketsHub() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = !!user?.isAdmin;
  const tickets = useTicketStore((s) => s.tickets);
  const isLoaded = useTicketStore((s) => s.isLoaded);
  const loadTickets = useTicketStore((s) => s.loadTickets);
  const updateTicket = useTicketStore((s) => s.updateTicket);
  const toggleLike = useTicketStore((s) => s.toggleLike);

  const [showCreate, setShowCreate] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<TicketCard | null>(null);
  const draggingTicket = useRef<TicketCard | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TicketCard['status'] | null>(null);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  // Mantém o modal aberto sincronizado se o ticket mudar via socket (ex.: like de outra pessoa).
  const liveSelected = selectedTicket ? tickets.find((t) => t.id === selectedTicket.id) ?? selectedTicket : null;

  const moveTicket = (ticket: TicketCard, status: TicketCard['status']) => {
    if (!isAdmin || ticket.status === status) return;
    updateTicket(ticket.id, { status });
  };

  const onDragStart = (ticket: TicketCard) => {
    if (!isAdmin) return;
    draggingTicket.current = ticket;
  };

  const onDragOver = (e: React.DragEvent, colId: TicketCard['status']) => {
    if (!isAdmin) return;
    e.preventDefault();
    setDragOverCol(colId);
  };

  const onDrop = (e: React.DragEvent, colId: TicketCard['status']) => {
    if (!isAdmin) return;
    e.preventDefault();
    setDragOverCol(null);
    if (draggingTicket.current) {
      moveTicket(draggingTicket.current, colId);
      draggingTicket.current = null;
    }
  };

  const onDragEnd = () => {
    draggingTicket.current = null;
    setDragOverCol(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden zk-surface shadow-panel rounded-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] flex-shrink-0">
        <div>
          <h1 className="text-sm font-bold text-surface-100">Central de Tickets</h1>
          <p className="text-xs text-surface-500">Reporte problemas e acompanhe o andamento.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-1.5 zk-btn-primary text-sm rounded-lg">
          Abrir ticket
        </button>
      </div>

      {!isLoaded ? (
        <div className="flex-1 flex items-center justify-center text-sm text-surface-600">Carregando...</div>
      ) : (
        <div className="flex-1 flex gap-4 p-4 overflow-x-auto overflow-y-hidden">
          {COLUMNS.map((col) => {
            const colTickets = tickets.filter((t) => t.status === col.id);
            const isDragTarget = dragOverCol === col.id;

            return (
              <div
                key={col.id}
                className="flex-1 min-w-[240px] max-w-sm flex flex-col gap-3"
                onDragOver={(e) => onDragOver(e, col.id)}
                onDrop={(e) => onDrop(e, col.id)}
                onDragLeave={() => setDragOverCol(null)}
              >
                <div className={`flex items-center gap-2 pb-2 border-b-2 ${col.accent} transition-colors`}>
                  <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                  <span className="text-xs font-bold text-surface-200 uppercase tracking-wider">{col.label}</span>
                  <span className="ml-auto text-xs font-semibold text-surface-500 bg-white/[0.06] px-1.5 py-0.5 rounded-full">
                    {colTickets.length}
                  </span>
                </div>

                <div
                  className={`flex flex-col gap-2 flex-1 overflow-y-auto rounded-xl transition-colors ${
                    isDragTarget ? 'bg-surface-800/60 ring-1 ring-accent-500/30' : ''
                  }`}
                >
                  {colTickets.map((ticket) => (
                    <div
                      key={ticket.id}
                      draggable={isAdmin}
                      onDragStart={() => onDragStart(ticket)}
                      onDragEnd={onDragEnd}
                      onClick={() => setSelectedTicket(ticket)}
                      className={`bg-surface-800 hover:bg-white/[0.05] border border-white/[0.08] hover:border-white/[0.14] rounded-xl p-3 shadow-panel transition-all ${
                        isAdmin ? 'cursor-grab active:cursor-grabbing active:opacity-60' : 'cursor-pointer'
                      }`}
                    >
                      <p className="text-sm font-medium text-surface-100 leading-snug">{ticket.title}</p>

                      {ticket.description && (
                        <p className="text-xs text-surface-500 mt-1.5 line-clamp-2 leading-snug">{ticket.description}</p>
                      )}

                      <div className="flex items-center gap-2 mt-2.5">
                        <Avatar name={ticket.creator.username} avatarUrl={ticket.creator.avatarUrl} size={5} />
                        <span className="text-[10px] text-surface-600 truncate">{ticket.creator.username}</span>

                        {ticket.status === 'backlog' && (
                          <div className="ml-auto">
                            <LikeButton ticket={ticket} onToggle={() => toggleLike(ticket.id)} />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {colTickets.length === 0 && (
                    <div className={`flex-1 border-2 border-dashed rounded-xl flex items-center justify-center min-h-[100px] transition-colors ${
                      isDragTarget ? 'border-accent-500/50 bg-accent-500/5' : 'border-white/[0.08]'
                    }`}>
                      <span className="text-xs text-surface-600">
                        {isDragTarget ? 'Soltar aqui' : 'Vazio'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateTicketModal onClose={() => setShowCreate(false)} />}

      {liveSelected && (
        <TicketDetailModal
          ticket={liveSelected}
          isAdmin={isAdmin}
          onClose={() => setSelectedTicket(null)}
        />
      )}
    </div>
  );
}

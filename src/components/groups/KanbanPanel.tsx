import { useEffect, useRef, useState } from 'react';
import { groupsAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { useGroupStore } from '../../stores/groupStore';
import type { KanbanCard } from '../../types';

interface Props {
  groupId: number;
  channelId: number | null;
}

const COLUMNS: { id: KanbanCard['status']; label: string; accent: string; dot: string }[] = [
  { id: 'todo',  label: 'A Fazer',       accent: 'border-surface-600', dot: 'bg-surface-500' },
  { id: 'doing', label: 'Em Progresso',  accent: 'border-yellow-500/60', dot: 'bg-yellow-400' },
  { id: 'done',  label: 'Concluído',     accent: 'border-green-500/60',  dot: 'bg-green-400' },
];

function Avatar({ name, avatarUrl, size = 6 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const s = `w-${size} h-${size}`;
  if (avatarUrl) return <img src={avatarUrl} className={`${s} rounded-full object-cover flex-shrink-0`} />;
  return (
    <div className={`${s} rounded-full bg-accent-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0`}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

interface CardDetailProps {
  card: KanbanCard;
  groupId: number;
  channelId: number | null;
  members: { id: number; username: string; avatarUrl: string | null }[];
  onUpdate: (card: KanbanCard) => void;
  onDelete: (card: KanbanCard) => void;
  onClose: () => void;
}

function CardDetail({ card, groupId, channelId, members, onUpdate, onDelete, onClose }: CardDetailProps) {
  const user = useAuthStore((s) => s.user);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [assigneeId, setAssigneeId] = useState<number | null>(card.assignee?.id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const isOwner = Number(card.creator.id) === Number(user?.id);

  const save = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const { data } = await groupsAPI.updateCard(groupId, card.id, {
        title: title.trim(),
        description: description || undefined,
        assigneeId,
      });
      onUpdate(data);
      if (channelId) getSocket().emit('kanban:card-updated', { groupId, channelId, card: data });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Excluir este card?')) return;
    await groupsAPI.deleteCard(groupId, card.id);
    onDelete(card);
    if (channelId) getSocket().emit('kanban:card-deleted', { groupId, channelId, cardId: card.id });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-800 border border-surface-700 rounded-xl w-[420px] p-5 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          className="text-base font-semibold text-surface-100 bg-transparent border-b border-surface-700 pb-1 focus:outline-none focus:border-accent-500 transition-colors"
        />

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-surface-500 mb-1 block">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Adicione uma descrição..."
            rows={4}
            className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-sm text-surface-200 placeholder-surface-600 focus:outline-none focus:border-accent-500 resize-none transition-colors"
          />
        </div>

        {/* Assignee */}
        <div>
          <label className="text-xs font-medium text-surface-500 mb-1 block">Responsável</label>
          <select
            value={assigneeId ?? ''}
            onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-sm text-surface-200 focus:outline-none focus:border-accent-500 transition-colors"
          >
            <option value="">Ninguém</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.username}</option>
            ))}
          </select>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <Avatar name={card.creator.username} avatarUrl={card.creator.avatarUrl} size={5} />
          <span>Criado por {card.creator.username}</span>
          <span className="ml-auto">{new Date(card.createdAt).toLocaleDateString('pt-BR')}</span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 justify-between">
          {isOwner ? (
            <button onClick={handleDelete} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors">
              Excluir
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm text-surface-400 hover:text-surface-100 transition-colors">
              Cancelar
            </button>
            <button
              onClick={save}
              disabled={!title.trim() || isSaving}
              className="px-4 py-1.5 bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function KanbanPanel({ groupId, channelId }: Props) {
  const user = useAuthStore((s) => s.user);
  const groupMembers = useGroupStore((s) => s.members);
  const members = groupMembers.map((m) => ({ id: m.user.id, username: m.user.username, avatarUrl: m.user.avatarUrl }));

  const [cards, setCards] = useState<KanbanCard[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [selectedCard, setSelectedCard] = useState<KanbanCard | null>(null);
  const draggingCard = useRef<KanbanCard | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanCard['status'] | null>(null);

  useEffect(() => {
    groupsAPI.getKanban(groupId).then(({ data }) => setCards(data));
  }, [groupId]);

  // Real-time sync
  useEffect(() => {
    if (!channelId) return;
    const socket = getSocket();

    const onCreated = (card: KanbanCard) => setCards((prev) => [...prev, card]);
    const onUpdated = (card: KanbanCard) => setCards((prev) => prev.map((c) => (c.id === card.id ? card : c)));
    const onDeleted = (data: { cardId: number }) => setCards((prev) => prev.filter((c) => c.id !== data.cardId));

    socket.on('kanban:card-created', onCreated);
    socket.on('kanban:card-updated', onUpdated);
    socket.on('kanban:card-deleted', onDeleted);
    return () => {
      socket.off('kanban:card-created', onCreated);
      socket.off('kanban:card-updated', onUpdated);
      socket.off('kanban:card-deleted', onDeleted);
    };
  }, [channelId]);

  const handleAddCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || isAdding) return;
    setIsAdding(true);
    try {
      const { data } = await groupsAPI.createCard(groupId, { title: newTitle.trim() });
      setCards((prev) => [...prev, data]);
      setNewTitle('');
      if (channelId) getSocket().emit('kanban:card-created', { groupId, channelId, card: data });
    } finally {
      setIsAdding(false);
    }
  };

  const moveCard = async (card: KanbanCard, status: KanbanCard['status']) => {
    if (card.status === status) return;
    const { data } = await groupsAPI.updateCard(groupId, card.id, { status });
    setCards((prev) => prev.map((c) => (c.id === data.id ? data : c)));
    if (channelId) getSocket().emit('kanban:card-updated', { groupId, channelId, card: data });
  };

  const handleUpdate = (updated: KanbanCard) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleDelete = (card: KanbanCard) => {
    setCards((prev) => prev.filter((c) => c.id !== card.id));
  };

  // Drag & drop
  const onDragStart = (card: KanbanCard) => {
    draggingCard.current = card;
  };

  const onDragOver = (e: React.DragEvent, colId: KanbanCard['status']) => {
    e.preventDefault();
    setDragOverCol(colId);
  };

  const onDrop = (e: React.DragEvent, colId: KanbanCard['status']) => {
    e.preventDefault();
    setDragOverCol(null);
    if (draggingCard.current) {
      moveCard(draggingCard.current, colId);
      draggingCard.current = null;
    }
  };

  const onDragEnd = () => {
    draggingCard.current = null;
    setDragOverCol(null);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Add card bar */}
      <form onSubmit={handleAddCard} className="flex gap-2 px-4 py-3 border-b border-surface-700/50 flex-shrink-0">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Título da nova tarefa..."
          maxLength={255}
          className="flex-1 px-3 py-1.5 bg-surface-900 border border-surface-700 rounded-lg text-sm text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!newTitle.trim() || isAdding}
          className="px-4 py-1.5 bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
        >
          Adicionar
        </button>
      </form>

      {/* Board */}
      <div className="flex-1 flex gap-4 p-4 overflow-x-auto overflow-y-hidden">
        {COLUMNS.map((col) => {
          const colCards = cards.filter((c) => c.status === col.id);
          const isDragTarget = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              className="flex-1 min-w-[240px] max-w-sm flex flex-col gap-3"
              onDragOver={(e) => onDragOver(e, col.id)}
              onDrop={(e) => onDrop(e, col.id)}
              onDragLeave={() => setDragOverCol(null)}
            >
              {/* Column header */}
              <div className={`flex items-center gap-2 pb-2 border-b-2 ${col.accent} transition-colors`}>
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-xs font-bold text-surface-200 uppercase tracking-wider">{col.label}</span>
                <span className="ml-auto text-xs font-semibold text-surface-500 bg-surface-800 px-1.5 py-0.5 rounded-full">
                  {colCards.length}
                </span>
              </div>

              {/* Cards */}
              <div
                className={`flex flex-col gap-2 flex-1 overflow-y-auto rounded-lg transition-colors ${
                  isDragTarget ? 'bg-surface-800/60 ring-1 ring-accent-500/30' : ''
                }`}
              >
                {colCards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={() => onDragStart(card)}
                    onDragEnd={onDragEnd}
                    onClick={() => setSelectedCard(card)}
                    className="bg-surface-800 hover:bg-surface-750 border border-surface-700 hover:border-surface-600 rounded-lg p-3 cursor-grab active:cursor-grabbing active:opacity-60 transition-all group/card"
                  >
                    <p className="text-sm font-medium text-surface-100 leading-snug">{card.title}</p>

                    {card.description && (
                      <p className="text-xs text-surface-500 mt-1.5 line-clamp-2 leading-snug">{card.description}</p>
                    )}

                    <div className="flex items-center gap-2 mt-2.5">
                      {/* Creator */}
                      <Avatar name={card.creator.username} avatarUrl={card.creator.avatarUrl} size={5} />

                      {/* Assignee */}
                      {card.assignee && card.assignee.id !== card.creator.id && (
                        <>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-600">
                            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                          </svg>
                          <Avatar name={card.assignee.username} avatarUrl={card.assignee.avatarUrl} size={5} />
                          <span className="text-[10px] text-surface-500 truncate">{card.assignee.username}</span>
                        </>
                      )}
                      {!card.assignee && (
                        <span className="text-[10px] text-surface-600 ml-0.5">{card.creator.username}</span>
                      )}

                      {/* Drag handle hint */}
                      <div className="ml-auto opacity-0 group-hover/card:opacity-100 transition-opacity">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-500">
                          <circle cx="9" cy="5" r="1" fill="currentColor" /><circle cx="15" cy="5" r="1" fill="currentColor" />
                          <circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" />
                          <circle cx="9" cy="19" r="1" fill="currentColor" /><circle cx="15" cy="19" r="1" fill="currentColor" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}

                {colCards.length === 0 && (
                  <div className={`flex-1 border-2 border-dashed rounded-lg flex items-center justify-center min-h-[100px] transition-colors ${
                    isDragTarget ? 'border-accent-500/50 bg-accent-500/5' : 'border-surface-700/40'
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

      {/* Card detail modal */}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          groupId={groupId}
          channelId={channelId}
          members={members}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onClose={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}

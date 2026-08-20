import { useEffect, useRef, useState } from 'react';
import { groupsAPI } from '../../services/api';
import { getSocket } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { NotesSkeleton } from '../common/Skeleton';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import type { GroupNote } from '../../types';

interface Props {
  groupId: number;
  channelId: number | null;
}

export function NotesPanel({ groupId, channelId }: Props) {
  const user = useAuthStore((s) => s.user);
  const [note, setNote] = useState<GroupNote | null>(null);
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRemoteUpdate = useRef(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const handleContentContextMenu = useEditableContextMenu(contentRef);

  useEffect(() => {
    setIsLoading(true);
    groupsAPI.getNote(groupId).then(({ data }) => {
      if (data) {
        setNote(data);
        setContent(data.content ?? '');
      }
    }).finally(() => setIsLoading(false));
  }, [groupId]);

  // Real-time sync via socket
  useEffect(() => {
    if (!channelId) return;
    const socket = getSocket();

    const handleNotesUpdated = (data: { groupId: number; content: string; updatedBy: number }) => {
      if (data.groupId !== groupId || data.updatedBy === user?.id) return;
      isRemoteUpdate.current = true;
      setContent(data.content);
    };

    socket.on('notes:updated', handleNotesUpdated);
    return () => { socket.off('notes:updated', handleNotesUpdated); };
  }, [channelId, groupId, user?.id]);

  const handleChange = (value: string) => {
    setContent(value);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        const { data } = await groupsAPI.updateNote(groupId, value);
        setNote(data);
        setLastSaved(new Date());
        // Broadcast to group
        if (channelId) {
          getSocket().emit('notes:update', { groupId, channelId, content: value });
        }
      } finally {
        setIsSaving(false);
      }
    }, 800);
  };

  const timeAgo = lastSaved
    ? `salvo ${lastSaved.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : note?.updatedAt
    ? `salvo ${new Date(note.updatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-9 flex items-center px-4 gap-3 border-b border-white/[0.06] flex-shrink-0">
        <span className="text-xs text-surface-500">Notas compartilhadas — todos podem editar</span>
        <div className="ml-auto flex items-center gap-2 text-xs text-surface-500">
          {isSaving ? (
            <span className="text-accent-400">Salvando...</span>
          ) : timeAgo ? (
            <span>{timeAgo}</span>
          ) : null}
          {note?.editor && !isSaving && (
            <span>por {note.editor.username}</span>
          )}
        </div>
      </div>

      {/* Editor */}
      {isLoading ? <NotesSkeleton /> : (
        <textarea
          ref={contentRef}
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onContextMenu={handleContentContextMenu}
          placeholder="Escreva aqui... markdown é suportado. Todos no grupo veem em tempo real."
          className="flex-1 resize-none bg-surface-900 text-surface-100 text-sm p-4 focus:outline-none font-mono leading-relaxed placeholder-surface-600"
          spellCheck={false}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useChatStore } from '../../stores/chatStore';
import { usePollStore } from '../../stores/pollStore';
import { useAuthStore } from '../../stores/authStore';
import { confirmDialog } from '../../stores/dialogStore';
import { getSocket } from '../../services/socket';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { InviteFriendModal } from './InviteFriendModal';
import { CreateEventModal } from './CreateEventModal';
import { NotesPanel } from './NotesPanel';
import { KanbanPanel } from './KanbanPanel';
import { GroupCallView } from './GroupCallView';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';

export type Tab = 'chat' | 'kanban' | 'notes' | 'call';

const TAB_LABELS: Record<Tab, string> = {
  chat: 'Chat',
  kanban: 'Tasks',
  notes: 'Notas',
  call: 'Chamada',
};

interface Props {
  channelId: number | null;
  voice: ReturnType<typeof useVoiceRoom>;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

export function GroupView({ channelId, voice, activeTab, setActiveTab }: Props) {
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const groups = useGroupStore((s) => s.groups);
  const user = useAuthStore((s) => s.user);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const deleteGroup = useGroupStore((s) => s.deleteGroup);
  const leaveGroup = useGroupStore((s) => s.leaveGroup);
  const removeGroupFromState = useGroupStore((s) => s.removeGroupFromState);
  const setGroupName = useGroupStore((s) => s.setGroupName);

  const [showInvite, setShowInvite] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const group = groups.find((g) => g.id === activeGroupId);
  const features = group?.features ?? [];
  const hasKanban = features.includes('kanban');
  const hasNotes = features.includes('notes');
  const isOwner = Number(group?.ownerId) === Number(user?.id);
  const isThisGroupCall = !!group && voice.activeVc?.groupId === group.id;

  const visibleTabs = ([
    { id: 'chat' as Tab, visible: true },
    { id: 'call' as Tab, visible: isThisGroupCall },
    { id: 'kanban' as Tab, visible: hasKanban },
    { id: 'notes' as Tab, visible: hasNotes },
  ] as const).filter((t) => t.visible);

  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === activeTab)) setActiveTab('chat');
  }, [group?.id, isThisGroupCall]);

  useEffect(() => {
    if (channelId) {
      getSocket().emit('group:join-room', { channelId });
      loadMessages(channelId);
      usePollStore.getState().loadPolls(channelId);
    }
  }, [activeGroupId, channelId, loadMessages]);

  useEffect(() => {
    const socket = getSocket();
    const onGroupDeleted = (data: { groupId: number }) => {
      if (data.groupId === activeGroupId) removeGroupFromState(data.groupId);
    };
    const onGroupUpdated = (data: { groupId: number; name: string }) => {
      setGroupName(data.groupId, data.name);
    };
    socket.on('group:deleted', onGroupDeleted);
    socket.on('group:updated', onGroupUpdated);
    return () => {
      socket.off('group:deleted', onGroupDeleted);
      socket.off('group:updated', onGroupUpdated);
    };
  }, [activeGroupId, removeGroupFromState, setGroupName]);

  const handleLeaveOrDelete = async () => {
    if (!group) return;
    const ok = await confirmDialog('Essa ação não pode ser desfeita.', {
      title: `${isOwner ? 'Excluir' : 'Sair de'} "${group.name}"?`,
      confirmLabel: isOwner ? 'Excluir' : 'Sair',
      danger: isOwner,
    });
    if (!ok) return;
    setIsLeaving(true);
    try {
      if (isOwner) await deleteGroup(group.id);
      else await leaveGroup(group.id);
    } finally {
      setIsLeaving(false);
    }
  };

  if (!group) {
    return (
      <div className="flex-1 flex items-center justify-center zk-surface shadow-panel rounded-2xl">
        <div className="text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-surface-600 mb-3">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-surface-400 text-sm">Selecione um grupo para começar</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col zk-surface shadow-panel rounded-2xl min-w-0 overflow-hidden">
      {/* Header */}
      <div className="h-12 flex items-center px-4 border-b border-white/[0.06] gap-3 flex-shrink-0">
        <h2 className="text-base font-bold text-surface-100 truncate">{group.name}</h2>

        <div className="ml-auto flex items-center gap-1">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent-600 text-on-accent'
                  : 'text-surface-400 hover:text-surface-100 hover:bg-white/[0.08]'
              }`}
            >
              {TAB_LABELS[tab.id]}
            </button>
          ))}

          <div className="w-px h-6 bg-white/[0.08] mx-1" />

          {isOwner && (
            <button
              onClick={() => setShowCreateEvent(true)}
              className="p-1.5 text-surface-400 hover:text-surface-100 rounded transition-colors"
              title="Criar evento"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="12" y1="14" x2="12" y2="18" />
                <line x1="10" y1="16" x2="14" y2="16" />
              </svg>
            </button>
          )}

          <button
            onClick={() => setShowInvite(true)}
            className="p-1.5 text-surface-400 hover:text-surface-100 rounded transition-colors"
            title="Convidar amigo"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </button>

          <button
            onClick={handleLeaveOrDelete}
            disabled={isLeaving}
            className={`p-1.5 rounded transition-colors disabled:opacity-50 ${
              isOwner ? 'text-surface-500 hover:text-red-400' : 'text-surface-400 hover:text-surface-100'
            }`}
            title={isOwner ? 'Excluir grupo' : 'Sair do grupo'}
          >
            {isOwner ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Content — chat é o padrão; a aba "Chamada" (só existe enquanto
          conectado a uma voz deste grupo) abre a visão estilo app de
          reunião no lugar do chat. */}
      {activeTab === 'chat' && channelId && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <MessageList channelId={channelId} />
          <MessageInput channelId={channelId} allowPolls />
        </div>
      )}

      {activeTab === 'call' && isThisGroupCall && <GroupCallView voice={voice} />}

      {activeTab === 'kanban' && hasKanban && (
        <KanbanPanel groupId={group.id} channelId={group.channelId} />
      )}
      {activeTab === 'notes' && hasNotes && (
        <NotesPanel groupId={group.id} channelId={group.channelId} />
      )}

      <InviteFriendModal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        groupId={group.id}
      />

      {showCreateEvent && (
        <CreateEventModal groupId={group.id} onClose={() => setShowCreateEvent(false)} />
      )}
    </div>
  );
}

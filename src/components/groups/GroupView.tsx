import { useEffect, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useGameSessionStore } from '../../stores/gameSessionStore';
import { useCodeSessionStore } from '../../stores/codeSessionStore';
import { useChatStore } from '../../stores/chatStore';
import { useAuthStore } from '../../stores/authStore';
import { getSocket } from '../../services/socket';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { GroupMemberList } from './GroupMemberList';
import { InviteFriendModal } from './InviteFriendModal';
import { GameSessionPanel } from '../game/GameSessionPanel';
import { CodeSessionPanel } from '../code/CodeSessionPanel';

export function GroupView() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const groups = useGroupStore((s) => s.groups);
  const user = useAuthStore((s) => s.user);
  const loadMessages = useChatStore((s) => s.loadMessages);
  const loadActiveGame = useGameSessionStore((s) => s.loadActiveSession);
  const loadActiveCode = useCodeSessionStore((s) => s.loadActiveSession);
  const [showInvite, setShowInvite] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'game' | 'code'>('chat');

  const group = groups.find((g) => g.id === activeGroupId);

  const activeCodeSession = useCodeSessionStore((s) => s.activeSession);
  const setTunnelInfo = useCodeSessionStore((s) => s.setTunnelInfo);

  // Join socket room + load data
  useEffect(() => {
    if (group?.channelId) {
      getSocket().emit('group:join-room', { channelId: group.channelId });
      loadMessages(group.channelId);
    }
    if (activeGroupId) {
      loadActiveGame(activeGroupId);
      loadActiveCode(activeGroupId);
    }
  }, [activeGroupId, group?.channelId, loadMessages, loadActiveGame, loadActiveCode]);

  // Listen for tunnel status events at the group level (always mounted)
  useEffect(() => {
    const socket = getSocket();

    const handleTunnelStarted = (data: { sessionId: number; folderName: string; userId: number; username: string }) => {
      if (activeCodeSession && data.sessionId === activeCodeSession.id) {
        setTunnelInfo({ folderName: data.folderName, userId: data.userId, username: data.username });
      }
    };

    const handleTunnelStopped = (data: { sessionId: number }) => {
      if (activeCodeSession && data.sessionId === activeCodeSession.id) {
        setTunnelInfo(null);
      }
    };

    socket.on('code:tunnel-started', handleTunnelStarted);
    socket.on('code:tunnel-stopped', handleTunnelStopped);

    return () => {
      socket.off('code:tunnel-started', handleTunnelStarted);
      socket.off('code:tunnel-stopped', handleTunnelStopped);
    };
  }, [activeCodeSession?.id, setTunnelInfo]);

  if (!group) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface-900">
        <div className="text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-surface-600 mb-3">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-surface-400 text-sm">Selecione um grupo para comecar</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 flex flex-col bg-surface-900 min-w-0">
        {/* Header */}
        <div className="h-12 flex items-center px-4 border-b border-surface-700/50 gap-3 flex-shrink-0">
          <h2 className="text-base font-bold text-surface-100 truncate">{group.name}</h2>
          <span className="text-xs text-surface-400">{group.members?.length || 0} membros</span>

          <div className="ml-auto flex items-center gap-1">
            {/* Tab buttons */}
            {(['chat', 'game', 'code'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab
                    ? 'bg-accent-600 text-white'
                    : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700'
                }`}
              >
                {tab === 'chat' ? 'Chat' : tab === 'game' ? 'Jogar' : 'Codigo'}
              </button>
            ))}

            <div className="w-px h-6 bg-surface-700 mx-1" />

            <button
              onClick={() => setShowInvite(true)}
              className="p-1.5 text-surface-400 hover:text-surface-100 rounded transition-colors"
              title="Convidar amigo"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'chat' && group.channelId && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <MessageList channelId={group.channelId} />
            <MessageInput channelId={group.channelId} />
          </div>
        )}

        {activeTab === 'game' && (
          <GameSessionPanel groupId={group.id} channelId={group.channelId} />
        )}

        {activeTab === 'code' && (
          <CodeSessionPanel groupId={group.id} channelId={group.channelId} />
        )}
      </div>

      <GroupMemberList />

      <InviteFriendModal
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        groupId={group.id}
      />
    </>
  );
}

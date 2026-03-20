import { useState, useEffect, useRef, useCallback } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import { useFriendStore } from '../../stores/friendStore';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { ChannelMember } from '../../types';

interface ContextMenu {
  x: number;
  y: number;
  member: ChannelMember;
}

export function MemberList() {
  const members = useChannelStore((s) => s.members);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { friends, requests, sent, sendRequest, accept, remove, openDm } = useFriendStore();
  const setView = useUiStore((s) => s.setView);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha menu ao clicar fora
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu]);

  // Fecha menu com Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setContextMenu(null); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [contextMenu]);

  const getFriendshipStatus = useCallback(
    (userId: number) => {
      if (friends.some((f) => f.friend.id === userId)) return 'friend';
      if (requests.some((r) => r.requester.id === userId)) return 'incoming';
      if (sent.some((s) => s.addressee.id === userId)) return 'sent';
      return 'none';
    },
    [friends, requests, sent],
  );

  const handleContextMenu = (e: React.MouseEvent, member: ChannelMember) => {
    if (Number(member.user.id) === Number(currentUserId)) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, member });
  };

  const handleOpenDm = async (userId: number) => {
    setContextMenu(null);
    try {
      await openDm(userId);
      setView('home');
    } catch {
      // silencioso
    }
  };

  const handleSendRequest = async (username: string) => {
    setContextMenu(null);
    try { await sendRequest(username); } catch { /* silencioso */ }
  };

  const handleAccept = async (userId: number) => {
    setContextMenu(null);
    const req = requests.find((r) => r.requester.id === userId);
    if (req) await accept(req.id);
  };

  const handleRemoveFriend = async (userId: number) => {
    setContextMenu(null);
    const friend = friends.find((f) => f.friend.id === userId);
    if (friend) await remove(friend.id);
  };

  if (!activeChannelId) return null;

  const onlineMembers = members.filter((m) => m.user.status === 'online' || m.user.status === 'in_call');
  const offlineMembers = members.filter((m) => m.user.status !== 'online' && m.user.status !== 'in_call');

  const renderMember = (member: ChannelMember) => {
    const { user, role } = member;
    const color = getUserColor(user.username);
    const statusColor =
      user.status === 'online' ? 'bg-online' :
      user.status === 'in_call' ? 'bg-warning' :
      user.status === 'away' ? 'bg-away' : 'bg-offline';
    const isSelf = Number(user.id) === Number(currentUserId);

    return (
      <div
        key={member.id}
        onContextMenu={(e) => handleContextMenu(e, member)}
        className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors-fast ${
          !isSelf ? 'hover:bg-surface-700/50 cursor-context-menu' : ''
        }`}
      >
        <div className="relative flex-shrink-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{ backgroundColor: color }}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              getInitials(user.username)
            )}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-800 ${statusColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-surface-200 truncate">
            {user.username}
            {role === 'owner' && <span className="ml-1.5 text-xs text-warning">👑</span>}
          </p>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside className="w-56 bg-surface-800 border-l border-surface-700/50 flex-shrink-0 overflow-y-auto py-4">
        {onlineMembers.length > 0 && (
          <div className="mb-4">
            <h3 className="px-4 mb-1 text-xs font-semibold text-surface-400 uppercase tracking-wider">
              Online — {onlineMembers.length}
            </h3>
            <div className="px-2">{onlineMembers.map(renderMember)}</div>
          </div>
        )}
        {offlineMembers.length > 0 && (
          <div>
            <h3 className="px-4 mb-1 text-xs font-semibold text-surface-400 uppercase tracking-wider">
              Offline — {offlineMembers.length}
            </h3>
            <div className="px-2 opacity-50">{offlineMembers.map(renderMember)}</div>
          </div>
        )}
      </aside>

      {/* Context Menu */}
      {contextMenu && (() => {
        const { member } = contextMenu;
        const status = getFriendshipStatus(Number(member.user.id));
        return (
          <div
            ref={menuRef}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed z-50 bg-surface-900 border border-surface-700 rounded-lg shadow-2xl py-1 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* User info */}
            <div className="px-3 py-2 border-b border-surface-700/50">
              <p className="text-sm font-semibold text-surface-100">{member.user.username}</p>
              <p className={`text-xs ${member.user.status === 'online' ? 'text-success' : member.user.status === 'in_call' ? 'text-warning' : 'text-surface-400'}`}>
                {member.user.status === 'online' ? 'Online' : member.user.status === 'in_call' ? 'Em chamada' : 'Offline'}
              </p>
            </div>

            {/* Mensagem direta (sempre disponível para não-amigos também) */}
            {status === 'friend' && (
              <button
                onClick={() => handleOpenDm(Number(member.user.id))}
                className="w-full text-left px-3 py-2 text-sm text-surface-200 hover:bg-surface-700 transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Mensagem
              </button>
            )}

            {/* Ações de amizade */}
            {status === 'none' && (
              <button
                onClick={() => handleSendRequest(member.user.username)}
                className="w-full text-left px-3 py-2 text-sm text-accent-400 hover:bg-surface-700 transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Adicionar amigo
              </button>
            )}

            {status === 'incoming' && (
              <button
                onClick={() => handleAccept(Number(member.user.id))}
                className="w-full text-left px-3 py-2 text-sm text-success hover:bg-surface-700 transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Aceitar solicitação
              </button>
            )}

            {status === 'sent' && (
              <div className="px-3 py-2 text-sm text-surface-400 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Solicitação enviada
              </div>
            )}

            {status === 'friend' && (
              <button
                onClick={() => handleRemoveFriend(Number(member.user.id))}
                className="w-full text-left px-3 py-2 text-sm text-danger hover:bg-surface-700 transition-colors flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                Remover amigo
              </button>
            )}
          </div>
        );
      })()}
    </>
  );
}

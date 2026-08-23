import { useMemo, useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useFriendStore } from '../../stores/friendStore';
import { useGroupStore } from '../../stores/groupStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useEventStore } from '../../stores/eventStore';
import { useAuthStore } from '../../stores/authStore';
import { confirmDialog } from '../../stores/dialogStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { applyGroupOrder, useLayoutStore } from '../../stores/layoutStore';
import { CreateGroupModal } from '../groups/CreateGroupModal';
import { RenameGroupModal } from '../groups/RenameGroupModal';
import { InviteFriendModal } from '../groups/InviteFriendModal';
import { GroupRailSkeleton } from '../common/Skeleton';
import { ContextMenuItem, ContextMenuHeader } from '../common/ContextMenuItem';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { Group } from '../../types';

// ─── Linha do rail: ícone + rótulo em texto (em vez do círculo mudo do
// Discord) — deixa a navegação legível sem depender só de tooltip no hover,
// e a barra indicadora de ativo cresce na largura toda da linha. ──

function NavRow({
  active,
  onClick,
  onContextMenu,
  badge,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  badge?: number;
  icon: React.ReactNode;
  label: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-current={active ? 'true' : undefined}
      className={`group w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-xl text-left transition-colors border-l-[3px] ${
        active
          ? 'bg-accent-600/15 border-accent-500 text-surface-50'
          : 'border-transparent text-surface-300 hover:bg-white/[0.05] hover:text-surface-100'
      }`}
    >
      <span className="flex-shrink-0 flex items-center justify-center">{icon}</span>
      <span className="flex-1 min-w-0 text-sm font-medium truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-danger rounded-full text-white text-[10px] font-bold flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// ─── Ícone standalone usado no modo recolhido (só ícone, sem rótulo) ──

function NavIconButton({
  active,
  onClick,
  onContextMenu,
  title,
  badge,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  title: string;
  badge?: number;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      aria-label={title}
      className={`group relative w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold transition-all ${
        color
          ? `text-on-accent${active ? ' shadow-glow-accent' : ''}`
          : active
            ? 'bg-accent-600 text-on-accent shadow-glow-accent'
            : 'bg-white/[0.04] text-surface-300 hover:bg-white/[0.08] hover:text-surface-100'
      }`}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full text-white text-[9px] font-bold flex items-center justify-center border-2 border-surface-950">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

export function NavBar() {
  const { view, setView } = useUiStore();
  const pendingRequests = useFriendStore((s) => s.requests.length);
  const dmChannels = useFriendStore((s) => s.dmChannels);
  const unreadCounts = useUnreadStore((s) => s.counts);
  const channelGroupMap = useUnreadStore((s) => s.channelGroup);
  const events = useEventStore((s) => s.events);
  const groups = useGroupStore((s) => s.groups);
  const isLoadingGroups = useGroupStore((s) => s.isLoading);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const loadMembers = useGroupStore((s) => s.loadMembers);
  const leaveGroup = useGroupStore((s) => s.leaveGroup);
  const deleteGroup = useGroupStore((s) => s.deleteGroup);
  const currentUser = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const collapsed = useLayoutStore((s) => s.navCollapsed);
  const setCollapsed = useLayoutStore((s) => s.setNavCollapsed);
  const groupOrder = useLayoutStore((s) => s.groupOrder);
  const moveGroup = useLayoutStore((s) => s.moveGroup);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Group | null>(null);
  const [inviteGroupId, setInviteGroupId] = useState<number | null>(null);

  // ─── Reordenar servidores (grupos) por arrastar-e-soltar — ordem fica
  // salva localmente (zynk-layout) e é aplicada em cima da lista vinda do backend. ──
  const orderedGroups = useMemo(() => applyGroupOrder(groups, groupOrder), [groups, groupOrder]);

  // Badge do "Início" = pedidos de amizade pendentes + mensagens não lidas nas DMs
  const dmUnreadTotal = useMemo(
    () => dmChannels.reduce((sum, d) => sum + (unreadCounts[d.channelId] ?? 0), 0),
    [dmChannels, unreadCounts],
  );
  const homeBadge = pendingRequests + dmUnreadTotal;

  // Badge de "Eventos" = convites ainda não respondidos (myStatus null),
  // exceto os que eu mesmo criei (já entro "aceito" automaticamente).
  const pendingInvitesCount = useMemo(
    () => events.filter((e) => e.myStatus === null && Number(e.creator.id) !== Number(currentUser?.id)).length,
    [events, currentUser?.id],
  );

  // Badge de cada grupo (servidor) = soma das não lidas de todos os seus canais de texto
  const groupUnreadTotals = useMemo(() => {
    const totals: Record<number, number> = {};
    for (const [channelIdStr, groupId] of Object.entries(channelGroupMap)) {
      const count = unreadCounts[Number(channelIdStr)];
      if (count) totals[groupId] = (totals[groupId] ?? 0) + count;
    }
    return totals;
  }, [channelGroupMap, unreadCounts]);
  const [draggedGroupId, setDraggedGroupId] = useState<number | null>(null);
  const [dragOverInfo, setDragOverInfo] = useState<{ id: number; position: 'before' | 'after' } | null>(null);

  const handleGroupDragOver = (e: React.DragEvent<HTMLElement>, targetId: number) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    setDragOverInfo((prev) => (prev?.id === targetId && prev.position === position ? prev : { id: targetId, position }));
  };

  const handleGroupDrop = (targetId: number) => {
    const info = dragOverInfo;
    const draggedId = draggedGroupId;
    setDraggedGroupId(null);
    setDragOverInfo(null);
    if (draggedId == null || !info) return;
    moveGroup(draggedId, targetId, info.position, groups.map((g) => g.id));
  };

  const handleSelectGroup = (groupId: number) => {
    setActiveGroup(groupId);
    setView('group');
  };

  const handleInviteClick = (group: Group) => {
    useContextMenuStore.getState().close();
    loadMembers(group.id);
    setInviteGroupId(group.id);
  };

  const handleLeaveOrDelete = async (group: Group) => {
    useContextMenuStore.getState().close();
    const isOwner = Number(group.ownerId) === Number(currentUser?.id);
    const ok = await confirmDialog(`Essa ação não pode ser desfeita.`, {
      title: `${isOwner ? 'Excluir' : 'Sair de'} "${group.name}"?`,
      confirmLabel: isOwner ? 'Excluir' : 'Sair',
      danger: isOwner,
    });
    if (!ok) return;
    if (isOwner) await deleteGroup(group.id);
    else await leaveGroup(group.id);
  };

  const handleGroupContextMenu = (e: React.MouseEvent, group: Group) => {
    e.preventDefault();
    const isOwner = Number(group.ownerId) === Number(currentUser?.id);
    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{group.name}</ContextMenuHeader>

        {isOwner && (
          <ContextMenuItem
            onClick={() => { useContextMenuStore.getState().close(); setRenameTarget(group); }}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z" />
              </svg>
            }
            label="Renomear grupo"
          />
        )}

        <ContextMenuItem
          onClick={() => handleInviteClick(group)}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="8.5" cy="7" r="4" />
              <line x1="20" y1="8" x2="20" y2="14" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          }
          label="Convidar amigo"
        />

        <ContextMenuItem
          onClick={() => handleLeaveOrDelete(group)}
          danger
          icon={
            isOwner ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" /><path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            )
          }
          label={isOwner ? 'Excluir grupo' : 'Sair do grupo'}
        />
      </>
    ));
  };

  return (
    <>
      <nav className={`${collapsed ? 'w-14' : 'w-60'} zk-surface shadow-panel rounded-2xl flex flex-col flex-shrink-0 overflow-hidden transition-all duration-150`}>
        {collapsed ? (
          <>
            <div className="flex-1 overflow-y-auto py-3 flex flex-col items-center gap-1.5">
              <button
                onClick={() => setCollapsed(false)}
                title="Expandir menu"
                aria-label="Expandir menu"
                className="w-8 h-8 mb-1 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/[0.06] rounded-lg transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              <NavIconButton active={view === 'home'} onClick={() => setView('home')} title="Início" badge={homeBadge}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </NavIconButton>

              <NavIconButton active={view === 'events'} onClick={() => setView('events')} title="Eventos" badge={pendingInvitesCount}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </NavIconButton>

              <div className="w-6 h-px bg-white/[0.08] flex-shrink-0 my-1" />

              {isLoadingGroups && groups.length === 0 && <GroupRailSkeleton collapsed />}

              {orderedGroups.map((g) => (
                <div
                  key={g.id}
                  draggable
                  onDragStart={() => setDraggedGroupId(g.id)}
                  onDragEnd={() => { setDraggedGroupId(null); setDragOverInfo(null); }}
                  onDragOver={(e) => handleGroupDragOver(e, g.id)}
                  onDrop={(e) => { e.preventDefault(); handleGroupDrop(g.id); }}
                  className={`flex flex-col items-center gap-1.5 w-full ${draggedGroupId === g.id ? 'opacity-40' : ''}`}
                >
                  {dragOverInfo?.id === g.id && dragOverInfo.position === 'before' && draggedGroupId !== g.id && (
                    <div className="w-6 h-0.5 rounded-full bg-accent-400" />
                  )}
                  <NavIconButton
                    active={view === 'group' && g.id === activeGroupId}
                    onClick={() => handleSelectGroup(g.id)}
                    onContextMenu={(e) => handleGroupContextMenu(e, g)}
                    title={g.name}
                    badge={groupUnreadTotals[g.id] ?? 0}
                    color="rgb(var(--color-accent-600))"
                  >
                    <span className="text-[10px]">{g.name.slice(0, 2).toUpperCase()}</span>
                  </NavIconButton>
                  {dragOverInfo?.id === g.id && dragOverInfo.position === 'after' && draggedGroupId !== g.id && (
                    <div className="w-6 h-0.5 rounded-full bg-accent-400" />
                  )}
                </div>
              ))}

              <button
                onClick={() => setShowCreateGroup(true)}
                title="Criar grupo"
                aria-label="Criar grupo"
                className="w-9 h-9 rounded-xl flex items-center justify-center text-surface-500 hover:text-success hover:bg-white/[0.06] transition-colors flex-shrink-0"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            <div className="flex-shrink-0 border-t border-white/[0.06] py-2 flex flex-col items-center gap-1.5">
              <NavIconButton active={view === 'settings'} onClick={() => setView('settings')} title="Configurações">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-500 ease-out group-hover:rotate-90">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </NavIconButton>

              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0 overflow-hidden"
                title={currentUser?.username}
                style={{ backgroundColor: getUserColor(currentUser?.username ?? '') }}
              >
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  getInitials(currentUser?.username ?? '?')
                )}
              </div>

              <button
                onClick={logout}
                title="Sair da conta"
                aria-label="Sair da conta"
                className="w-9 h-9 rounded-lg flex items-center justify-center text-surface-400 hover:text-white hover:bg-danger transition-colors flex-shrink-0"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
              <div className="flex justify-end px-0.5 -mb-1">
                <button
                  onClick={() => setCollapsed(true)}
                  title="Recolher menu"
                  aria-label="Recolher menu"
                  className="w-6 h-6 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/[0.06] rounded transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
              </div>

              {/* Início / DMs */}
              <NavRow
                active={view === 'home'}
                onClick={() => setView('home')}
                badge={homeBadge}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                  </svg>
                }
                label="Início"
              />

              {/* Eventos */}
              <NavRow
                active={view === 'events'}
                onClick={() => setView('events')}
                badge={pendingInvitesCount}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                }
                label="Eventos"
              />

              {/* Grupos (servidores) */}
              <div>
                <div className="flex items-center justify-between px-2.5 mb-1.5">
                  <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">Grupos</span>
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    title="Criar grupo"
                    aria-label="Criar grupo"
                    className="w-4 h-4 flex items-center justify-center text-surface-500 hover:text-success transition-colors"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>

                {isLoadingGroups && groups.length === 0 ? (
                  <GroupRailSkeleton />
                ) : (
                <div className="space-y-0.5">
                  {orderedGroups.map((g) => (
                    <div
                      key={g.id}
                      draggable
                      onDragStart={() => setDraggedGroupId(g.id)}
                      onDragEnd={() => { setDraggedGroupId(null); setDragOverInfo(null); }}
                      onDragOver={(e) => handleGroupDragOver(e, g.id)}
                      onDrop={(e) => { e.preventDefault(); handleGroupDrop(g.id); }}
                      className={`cursor-grab active:cursor-grabbing ${draggedGroupId === g.id ? 'opacity-40' : ''}`}
                    >
                      {dragOverInfo?.id === g.id && dragOverInfo.position === 'before' && draggedGroupId !== g.id && (
                        <div className="h-0.5 mx-1 rounded-full bg-accent-400" />
                      )}
                      <NavRow
                        active={view === 'group' && g.id === activeGroupId}
                        onClick={() => handleSelectGroup(g.id)}
                        onContextMenu={(e) => handleGroupContextMenu(e, g)}
                        badge={groupUnreadTotals[g.id] ?? 0}
                        icon={
                          <span className="w-6 h-6 rounded-lg bg-accent-600 flex items-center justify-center text-on-accent text-[10px] font-bold">
                            {g.name.slice(0, 2).toUpperCase()}
                          </span>
                        }
                        label={g.name}
                      />
                      {dragOverInfo?.id === g.id && dragOverInfo.position === 'after' && draggedGroupId !== g.id && (
                        <div className="h-0.5 mx-1 rounded-full bg-accent-400" />
                      )}
                    </div>
                  ))}

                  {groups.length === 0 && (
                    <button
                      onClick={() => setShowCreateGroup(true)}
                      className="w-full flex items-center gap-2.5 pl-2.5 pr-2 py-2 rounded-lg border border-dashed border-surface-700 text-surface-500 hover:border-surface-500 hover:text-surface-300 transition-colors text-xs"
                    >
                      + Criar seu primeiro grupo
                    </button>
                  )}
                </div>
                )}
              </div>
            </div>

            {/* Rodapé — conta + configurações, sempre visíveis (nada escondido atrás de hover) */}
            <div className="flex-shrink-0 border-t border-white/[0.06] p-2 space-y-0.5">
              <NavRow
                active={view === 'settings'}
                onClick={() => setView('settings')}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-500 ease-out group-hover:rotate-90">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                }
                label="Configurações"
              />

              <div className="flex items-center gap-2 px-2 py-1.5 mt-1">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0 overflow-hidden"
                  style={{ backgroundColor: getUserColor(currentUser?.username ?? '') }}
                >
                  {currentUser?.avatarUrl ? (
                    <img src={currentUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(currentUser?.username ?? '?')
                  )}
                </div>
                <span className="flex-1 min-w-0 text-xs font-medium text-surface-200 truncate">{currentUser?.username}</span>
                <button
                  onClick={logout}
                  title="Sair da conta"
                  aria-label="Sair da conta"
                  className="flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-surface-400 hover:text-white hover:bg-danger transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}
      </nav>

      <CreateGroupModal isOpen={showCreateGroup} onClose={() => setShowCreateGroup(false)} />

      {renameTarget && (
        <RenameGroupModal
          isOpen={!!renameTarget}
          onClose={() => setRenameTarget(null)}
          groupId={renameTarget.id}
          currentName={renameTarget.name}
        />
      )}

      {inviteGroupId !== null && (
        <InviteFriendModal
          isOpen={inviteGroupId !== null}
          onClose={() => setInviteGroupId(null)}
          groupId={inviteGroupId}
        />
      )}
    </>
  );
}

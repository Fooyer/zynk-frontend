import { useMemo, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { useFriendStore } from '../../stores/friendStore';
import { useAuthStore } from '../../stores/authStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { alertDialog } from '../../stores/dialogStore';
import { ContextMenuItem, ContextMenuHeader } from '../common/ContextMenuItem';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { MemberListSkeleton } from '../common/Skeleton';
import type { GroupMemberEntry } from '../../types';

// ─── Roster de membros — em vez da lista "avatar redondo + nome" padrão,
// os avatares ganham anel de status (verde online / vermelho em chamada /
// cinza offline) e um cabeçalho tipo HUD com contador + barra de presença.
// Offline vem recolhido por padrão pra não poluir grupos grandes. ──────

function StatusAvatar({ status, username, avatarUrl, size = 36 }: {
  status: string;
  username: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const ringClass =
    status === 'online' ? 'bg-success' :
    status === 'in_call' ? 'bg-accent-500' :
    'bg-surface-600';
  const inner = size - 6;

  return (
    <div
      className={`relative flex-shrink-0 rounded-full flex items-center justify-center ${ringClass}`}
      style={{ width: size, height: size }}
    >
      <div
        className="rounded-full flex items-center justify-center text-white font-bold overflow-hidden flex-shrink-0"
        style={{ width: inner, height: inner, backgroundColor: getUserColor(username), fontSize: inner * 0.36 }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          getInitials(username)
        )}
      </div>
    </div>
  );
}

export function GroupMemberList() {
  const members = useGroupStore((s) => s.members);
  const isLoadingMembers = useGroupStore((s) => s.isLoadingMembers);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const collapsed = useLayoutStore((s) => (activeGroupId != null ? s.memberListCollapsedByGroup[activeGroupId] ?? false : false));
  const setCollapsedRaw = useLayoutStore((s) => s.setMemberListCollapsed);
  const setCollapsed = (v: boolean) => { if (activeGroupId != null) setCollapsedRaw(activeGroupId, v); };
  const currentUser = useAuthStore((s) => s.user);
  const isFriend = useFriendStore((s) => s.isFriend);
  const sendRequestByUserId = useFriendStore((s) => s.sendRequestByUserId);
  const [offlineOpen, setOfflineOpen] = useState(false);

  const openMemberMenu = (e: React.MouseEvent, m: GroupMemberEntry) => {
    e.preventDefault();
    e.stopPropagation();
    const isSelf = Number(m.user.id) === Number(currentUser?.id);
    const alreadyFriend = isFriend(m.user.id);

    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{m.user.username}</ContextMenuHeader>

        {!isSelf && !alreadyFriend && (
          <ContextMenuItem
            onClick={() => {
              useContextMenuStore.getState().close();
              sendRequestByUserId(m.user.id).catch((err: any) => {
                alertDialog(err.response?.data?.message || 'Erro ao enviar solicitação', { title: 'Não foi possível adicionar' });
              });
            }}
            icon={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" /><line x1="17" y1="11" x2="23" y2="11" />
              </svg>
            }
            label="Adicionar"
          />
        )}
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); navigator.clipboard.writeText(m.user.username).catch(() => {}); }}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          }
          label="Copiar nome de usuário"
        />
      </>
    ));
  };

  const online = useMemo(() => members.filter((m) => m.user.status !== 'offline'), [members]);
  const offline = useMemo(() => members.filter((m) => m.user.status === 'offline'), [members]);
  const presencePct = members.length ? Math.round((online.length / members.length) * 100) : 0;

  if (members.length === 0) {
    if (!isLoadingMembers) return null;
    return (
      <aside className="w-52 zk-surface shadow-panel rounded-2xl flex flex-col flex-shrink-0 overflow-y-auto">
        <MemberListSkeleton />
      </aside>
    );
  }

  const renderMember = (m: GroupMemberEntry) => (
    <div
      key={m.id}
      onContextMenu={(e) => openMemberMenu(e, m)}
      className={`group relative flex items-center gap-2.5 mx-2 pl-3 pr-2 py-1.5 rounded-lg transition-colors hover:bg-white/[0.05] ${
        m.user.status === 'offline' ? 'opacity-50 hover:opacity-90' : ''
      }`}
    >
      <span className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-0 group-hover:h-5 bg-accent-500 rounded-full transition-all duration-200" />
      <StatusAvatar status={m.user.status} username={m.user.username} avatarUrl={m.user.avatarUrl} size={32} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-mono truncate ${m.user.status === 'offline' ? 'text-surface-500' : 'text-surface-200'}`}>
          {m.user.username}
        </p>
        {m.role !== 'member' && (
          <p className="text-[9px] text-accent-400 font-mono tracking-wide">[{m.role.toUpperCase()}]</p>
        )}
      </div>
      {m.user.status === 'in_call' && (
        <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shadow-glow-accent-sm animate-pulse flex-shrink-0" />
      )}
    </div>
  );

  // Um único <aside> persistente (não duas returns condicionais) — a largura
  // anima via transition-all no próprio elemento, igual ao recolher do NavBar
  // (src/components/layout/NavBar.tsx). Trocar de elemento a cada toggle (como
  // era antes) não dava pra animar o fechamento: o painel antigo some do DOM
  // na hora, só o novo entra ganhava uma transição de entrada.
  //
  // key={activeGroupId} força remontar ao trocar de servidor — cada um tem seu
  // próprio estado salvo (memberListCollapsedByGroup), e trocar de servidor
  // deve aplicar o estado salvo na hora, sem "herdar" a transição de recolher/
  // expandir de um clique manual (essa só acontece dentro do mesmo servidor,
  // onde a key não muda).
  return (
    <aside key={activeGroupId} className={`${collapsed ? 'w-12' : 'w-52'} zk-surface shadow-panel rounded-2xl flex flex-col flex-shrink-0 overflow-hidden transition-all duration-150`}>
      {collapsed ? (
        <div className="flex flex-col items-center flex-shrink-0 overflow-y-auto py-3 gap-2.5 h-full">
          <button
            onClick={() => setCollapsed(false)}
            title="Mostrar membros"
            aria-label="Mostrar lista de membros"
            className="w-8 h-8 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-white/[0.06] rounded-lg transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="w-6 h-px bg-white/[0.08] flex-shrink-0" />
          {[...online, ...offline].map((m) => (
            <div key={m.id} title={m.user.username} className={m.user.status === 'offline' ? 'opacity-40' : ''}>
              <StatusAvatar status={m.user.status} username={m.user.username} avatarUrl={m.user.avatarUrl} size={32} />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Header estilo HUD — contador grande + barra de presença, em vez do rótulo "Membros" plano */}
          <div className="px-3 pt-3 pb-2.5 border-b border-white/[0.06] flex-shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="zk-label">Roster</span>
              <button
                onClick={() => setCollapsed(true)}
                title="Ocultar membros"
                aria-label="Ocultar lista de membros"
                className="w-5 h-5 flex items-center justify-center text-surface-500 hover:text-surface-200 rounded transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-bold font-mono text-surface-50 tabular-nums leading-none">{online.length}</span>
              <span className="text-[10px] text-surface-500 uppercase tracking-wide">/ {members.length} online</span>
            </div>
            <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden mt-2">
              <div
                className="h-full bg-accent-500 shadow-glow-accent-sm rounded-full transition-all duration-500"
                style={{ width: `${presencePct}%` }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {online.map(renderMember)}

            {offline.length > 0 && (
              <div className="mt-1 pt-1 border-t border-white/[0.05]">
                <button
                  onClick={() => setOfflineOpen((o) => !o)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 zk-label hover:text-surface-300 transition-colors"
                >
                  <svg
                    width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform ${offlineOpen ? 'rotate-90' : ''}`}
                  >
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  Offline — {offline.length}
                </button>
                {offlineOpen && <div className="pb-1">{offline.map(renderMember)}</div>}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

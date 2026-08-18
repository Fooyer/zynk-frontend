import { useState } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useFriendStore } from '../../stores/friendStore';
import { useGroupStore } from '../../stores/groupStore';
import { useAuthStore } from '../../stores/authStore';
import { CreateGroupModal } from '../groups/CreateGroupModal';
import { getUserColor } from '../../utils/formatDate';

// ─── Ícone de rail (círculo em repouso, squircle ativo/hover) ──

function RailIcon({
  active,
  onClick,
  title,
  color,
  badge,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  color?: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex items-center justify-center group/icon flex-shrink-0">
      <span
        className={`absolute -left-3 w-1 rounded-r-full bg-surface-50 transition-all duration-150 ${
          active ? 'h-8' : 'h-0 group-hover/icon:h-4'
        }`}
      />
      <button
        onClick={onClick}
        title={title}
        className={`relative w-12 h-12 rounded-full flex items-center justify-center text-surface-100 font-bold transition-all duration-150 flex-shrink-0 ${
          active ? 'rounded-2xl bg-accent-600 text-white' : 'bg-surface-700 hover:rounded-2xl hover:bg-accent-600 hover:text-white'
        }`}
        style={color ? { backgroundColor: color } : undefined}
      >
        {children}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger rounded-full text-white text-xs font-bold flex items-center justify-center border-2 border-surface-950">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>
    </div>
  );
}

export function NavBar() {
  const { view, setView } = useUiStore();
  const pendingRequests = useFriendStore((s) => s.requests.length);
  const groups = useGroupStore((s) => s.groups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const logout = useAuthStore((s) => s.logout);
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  const handleSelectGroup = (groupId: number) => {
    setActiveGroup(groupId);
    setView('group');
  };

  return (
    <>
      <nav className="w-[72px] bg-surface-950 flex flex-col items-center py-3 gap-2 flex-shrink-0 border-r border-surface-800 overflow-y-auto">
        {/* Home / DMs */}
        <RailIcon active={view === 'home'} onClick={() => setView('home')} title="Início" badge={pendingRequests}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        </RailIcon>

        <div className="w-8 h-px bg-surface-700 my-1 flex-shrink-0" />

        {/* Grupos (servidores) */}
        {groups.map((g) => (
          <RailIcon
            key={g.id}
            active={view === 'group' && g.id === activeGroupId}
            onClick={() => handleSelectGroup(g.id)}
            title={g.name}
            color={getUserColor(g.name)}
          >
            <span className="text-sm">{g.name.slice(0, 2).toUpperCase()}</span>
          </RailIcon>
        ))}

        {/* Criar grupo */}
        <div className="relative flex items-center justify-center flex-shrink-0">
          <button
            onClick={() => setShowCreateGroup(true)}
            title="Criar grupo"
            className="w-12 h-12 rounded-full hover:rounded-2xl bg-surface-700 hover:bg-success flex items-center justify-center text-success hover:text-white transition-all duration-150"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* Configurações + Sair — fixos no fundo */}
        <div className="mt-auto flex flex-col items-center gap-2">
          <RailIcon active={view === 'settings'} onClick={() => setView('settings')} title="Configurações">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </RailIcon>

          <button
            onClick={logout}
            title="Sair da conta"
            className="w-12 h-12 rounded-full flex items-center justify-center text-surface-300 hover:text-white hover:bg-danger transition-all duration-150 flex-shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </nav>

      <CreateGroupModal isOpen={showCreateGroup} onClose={() => setShowCreateGroup(false)} />
    </>
  );
}

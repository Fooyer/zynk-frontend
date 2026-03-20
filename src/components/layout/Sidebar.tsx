import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { ChannelList } from '../channels/ChannelList';
import { CreateChannelModal } from '../channels/CreateChannelModal';
import { DiscoverChannelsModal } from '../channels/DiscoverChannelsModal';
import { getInitials, getUserColor } from '../../utils/formatDate';

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDiscoverModal, setShowDiscoverModal] = useState(false);

  return (
    <>
      <aside className="w-60 bg-surface-800 flex flex-col border-r border-surface-700/50 flex-shrink-0">
        <div className="h-12 flex items-center px-4 border-b border-surface-700/50">
          <h1 className="text-base font-bold text-surface-100">Canais</h1>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          <ChannelList />
        </div>

        <div className="px-3 py-2 border-t border-surface-700/30">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-400 hover:text-surface-100 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" />
            </svg>
            Criar canal
          </button>
          <button
            onClick={() => setShowDiscoverModal(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-400 hover:text-surface-100 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            Descobrir canais
          </button>
        </div>

        {/* User panel */}
        <div className="px-3 py-3 bg-surface-900/50 border-t border-surface-700/50">
          <div className="flex items-center gap-2.5">
            {user && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold"
                style={{ backgroundColor: getUserColor(user.username) }}
              >
                {getInitials(user.username)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-100 truncate">{user?.username}</p>
              <p className="text-xs text-success">Online</p>
            </div>
            <button
              onClick={logout}
              className="p-1.5 text-surface-400 hover:text-danger rounded transition-colors"
              title="Sair"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <CreateChannelModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
      <DiscoverChannelsModal isOpen={showDiscoverModal} onClose={() => setShowDiscoverModal(false)} />
    </>
  );
}

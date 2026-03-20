import { useEffect } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

export function DMSidebar() {
  const { friends, dmChannels, activeDmChannelId, loadDmChannels, openDm, closeDm, setActiveDm } =
    useFriendStore();

  useEffect(() => {
    loadDmChannels();
  }, []);

  const onlineFriends = friends.filter((f) => f.friend.status === 'online');

  const handleOpenDm = async (friendId: number) => {
    try {
      await openDm(friendId);
    } catch {
      // silencioso
    }
  };

  return (
    <aside className="w-60 bg-surface-800 flex flex-col border-r border-surface-700/50 flex-shrink-0">
      {/* DMs */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Seção mensagens diretas */}
        <div className="px-3 mb-1">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider px-2 py-1.5">
            Mensagens Diretas
          </h3>
        </div>

        {dmChannels.length === 0 ? (
          <p className="text-xs text-surface-500 px-5 py-2">Nenhum chat ainda</p>
        ) : (
          <div className="px-2 space-y-0.5">
            {dmChannels.map((dm) => {
              const isActive = activeDmChannelId === dm.channelId;
              const color = getUserColor(dm.friend.username);
              return (
                <div
                  key={dm.channelId}
                  className={`group relative flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-surface-600 text-surface-100'
                      : 'text-surface-400 hover:text-surface-100 hover:bg-surface-700/70'
                  }`}
                  onClick={() => setActiveDm(dm.channelId)}
                >
                  <div className="relative flex-shrink-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                      style={{ backgroundColor: color }}
                    >
                      {dm.friend.avatarUrl ? (
                        <img
                          src={dm.friend.avatarUrl}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        getInitials(dm.friend.username)
                      )}
                    </div>
                    <div
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-800 ${
                        dm.friend.status === 'online' ? 'bg-online' : 'bg-offline'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{dm.friend.username}</p>
                    <p
                      className={`text-xs ${
                        dm.friend.status === 'online' ? 'text-success' : 'text-surface-500'
                      }`}
                    >
                      {dm.friend.status === 'online' ? 'Online' : 'Offline'}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeDm(dm.channelId); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface-500 text-surface-400 hover:text-surface-100 transition-all flex-shrink-0"
                    title="Fechar conversa"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <line x1="1" y1="1" x2="11" y2="11" />
                      <line x1="11" y1="1" x2="1" y2="11" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Amigos online */}
        {onlineFriends.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider px-5 py-1.5">
              Online — {onlineFriends.length}
            </h3>
            <div className="px-2 space-y-0.5">
              {onlineFriends.map((f) => {
                const color = getUserColor(f.friend.username);
                const hasDm = dmChannels.some((d) => d.friend.id === f.friend.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => handleOpenDm(f.friend.id)}
                    className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-surface-700/70 transition-colors text-left"
                    title={hasDm ? 'Abrir conversa' : 'Iniciar conversa'}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
                        style={{ backgroundColor: color }}
                      >
                        {getInitials(f.friend.username)}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-800 bg-online" />
                    </div>
                    <p className="text-sm font-medium truncate">{f.friend.username}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

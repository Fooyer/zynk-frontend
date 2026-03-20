import { useState, useEffect } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

type Tab = 'online' | 'all' | 'requests' | 'add';

export function FriendsPage() {
  const [tab, setTab] = useState<Tab>('online');
  const [username, setUsername] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  const { friends, requests, isLoading, error, loadAll, sendRequest, accept, reject, remove, openDm, clearError } =
    useFriendStore();

  useEffect(() => {
    loadAll();
  }, []);

  const onlineFriends = friends.filter((f) => f.friend.status === 'online');

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    try {
      await sendRequest(username.trim());
      setUsername('');
      setSendSuccess(true);
    } catch {
      // error in store
    }
  };

  const handleOpenDm = async (friendId: number) => {
    try {
      await openDm(friendId);
    } catch {
      // silencioso
    }
  };

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'online', label: 'Online', badge: onlineFriends.length },
    { id: 'all', label: 'Todos', badge: friends.length },
    { id: 'requests', label: 'Solicitações', badge: requests.length || undefined },
    { id: 'add', label: 'Adicionar' },
  ];

  const displayFriends = tab === 'online' ? onlineFriends : friends;

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-surface-900">
      {/* Header */}
      <header className="h-12 flex items-center gap-4 px-4 border-b border-surface-700/50 flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface-400 flex-shrink-0">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <h2 className="font-semibold text-surface-100 text-sm">Amigos</h2>
        <div className="w-px h-5 bg-surface-700" />
        <nav className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'bg-surface-700 text-surface-100'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-surface-700/50'
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span
                  className={`text-xs rounded-full px-1.5 py-0.5 font-semibold ${
                    t.id === 'requests'
                      ? 'bg-danger text-white'
                      : 'bg-surface-600 text-surface-300'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'add' ? (
          <div className="max-w-md mx-auto px-4 py-8">
            <h3 className="text-lg font-semibold text-surface-100 mb-1">Adicionar amigo</h3>
            <p className="text-sm text-surface-400 mb-6">
              Digite o username exato para enviar uma solicitação.
            </p>
            <form onSubmit={handleSendRequest} className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setSendSuccess(false);
                    clearError();
                  }}
                  placeholder="Username do amigo"
                  autoFocus
                  className="flex-1 bg-surface-800 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent-500 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!username.trim()}
                  className="px-4 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Enviar
                </button>
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              {sendSuccess && <p className="text-xs text-success">Solicitação enviada!</p>}
            </form>
          </div>
        ) : tab === 'requests' ? (
          <div className="px-4 py-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-surface-400">Nenhuma solicitação pendente</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                  Pendentes — {requests.length}
                </p>
                <div className="space-y-px">
                  {requests.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface-800 transition-colors group"
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                        style={{ backgroundColor: getUserColor(r.requester.username) }}
                      >
                        {getInitials(r.requester.username)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-100">{r.requester.username}</p>
                        <p className="text-xs text-surface-400">Solicitação de amizade recebida</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => accept(r.id)}
                          className="p-2 bg-success/20 hover:bg-success/30 text-success rounded-full transition-colors"
                          title="Aceitar"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                        <button
                          onClick={() => reject(r.id)}
                          className="p-2 bg-danger/20 hover:bg-danger/30 text-danger rounded-full transition-colors"
                          title="Recusar"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="px-4 py-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : displayFriends.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-surface-400">
                  {tab === 'online' ? 'Nenhum amigo online' : 'Nenhum amigo ainda'}
                </p>
                {tab === 'all' && (
                  <button
                    onClick={() => setTab('add')}
                    className="mt-3 text-sm text-accent-400 hover:text-accent-300 transition-colors"
                  >
                    Adicionar amigos
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                  {tab === 'online' ? `Online — ${displayFriends.length}` : `Todos os amigos — ${displayFriends.length}`}
                </p>
                <div className="space-y-px">
                  {displayFriends.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-surface-800 transition-colors group cursor-pointer"
                      onClick={() => handleOpenDm(f.friend.id)}
                    >
                      <div className="relative flex-shrink-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                          style={{ backgroundColor: getUserColor(f.friend.username) }}
                        >
                          {getInitials(f.friend.username)}
                        </div>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-900 ${
                            f.friend.status === 'online' ? 'bg-online' : 'bg-offline'
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-100">{f.friend.username}</p>
                        <p
                          className={`text-xs ${
                            f.friend.status === 'online' ? 'text-success' : 'text-surface-400'
                          }`}
                        >
                          {f.friend.status === 'online' ? 'Online' : 'Offline'}
                        </p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleOpenDm(f.friend.id); }}
                          className="p-2 bg-surface-600 hover:bg-surface-500 rounded-full transition-colors"
                          title="Mensagem"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); remove(f.id); }}
                          className="p-2 bg-surface-600 hover:bg-danger/30 text-surface-400 hover:text-danger rounded-full transition-colors"
                          title="Remover amigo"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

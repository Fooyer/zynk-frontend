import { useState, useEffect } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'friends' | 'requests' | 'add';

export function FriendsModal({ isOpen, onClose }: FriendsModalProps) {
  const [tab, setTab] = useState<Tab>('friends');
  const [username, setUsername] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);

  const { friends, requests, isLoading, error, loadAll, sendRequest, accept, reject, remove, clearError } =
    useFriendStore();

  useEffect(() => {
    if (isOpen) {
      loadAll();
      clearError();
      setSendSuccess(false);
      setUsername('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    try {
      await sendRequest(username.trim());
      setUsername('');
      setSendSuccess(true);
    } catch {
      // error is handled in store
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-800 rounded-xl w-full max-w-md shadow-2xl border border-surface-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-700/50">
          <h2 className="text-base font-semibold text-surface-100">Amigos</h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-100 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-700/50">
          <button
            onClick={() => setTab('friends')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'friends'
                ? 'text-accent-400 border-b-2 border-accent-400'
                : 'text-surface-400 hover:text-surface-200'
            }`}
          >
            Amigos ({friends.length})
          </button>
          <button
            onClick={() => setTab('requests')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              tab === 'requests'
                ? 'text-accent-400 border-b-2 border-accent-400'
                : 'text-surface-400 hover:text-surface-200'
            }`}
          >
            Solicitações
            {requests.length > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs bg-danger rounded-full text-white">
                {requests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('add')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === 'add'
                ? 'text-accent-400 border-b-2 border-accent-400'
                : 'text-surface-400 hover:text-surface-200'
            }`}
          >
            Adicionar
          </button>
        </div>

        {/* Content */}
        <div className="p-4 min-h-48 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === 'friends' ? (
            friends.length === 0 ? (
              <p className="text-center text-surface-400 text-sm py-8">Nenhum amigo ainda</p>
            ) : (
              <ul className="space-y-1">
                {friends.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-700/50"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                      style={{ backgroundColor: getUserColor(f.friend.username) }}
                    >
                      {getInitials(f.friend.username)}
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
                    <button
                      onClick={() => remove(f.id)}
                      className="text-surface-500 hover:text-danger text-xs transition-colors px-2 py-1 rounded"
                    >
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : tab === 'requests' ? (
            requests.length === 0 ? (
              <p className="text-center text-surface-400 text-sm py-8">Nenhuma solicitação pendente</p>
            ) : (
              <ul className="space-y-2">
                {requests.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-700/30"
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                      style={{ backgroundColor: getUserColor(r.requester.username) }}
                    >
                      {getInitials(r.requester.username)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-100">{r.requester.username}</p>
                      <p className="text-xs text-surface-400">Quer ser seu amigo</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => accept(r.id)}
                        className="px-2 py-1 text-xs bg-accent-600 hover:bg-accent-500 text-white rounded transition-colors"
                      >
                        Aceitar
                      </button>
                      <button
                        onClick={() => reject(r.id)}
                        className="px-2 py-1 text-xs text-surface-400 hover:text-danger transition-colors"
                      >
                        Recusar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <form onSubmit={handleSendRequest} className="space-y-4 pt-2">
              <div>
                <label className="block text-sm text-surface-300 mb-2">Nome de usuário</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    setSendSuccess(false);
                    clearError();
                  }}
                  placeholder="Digite o username..."
                  autoFocus
                  className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 focus:outline-none focus:border-accent-500 transition-colors"
                />
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              {sendSuccess && <p className="text-xs text-success">Solicitação enviada com sucesso!</p>}
              <button
                type="submit"
                disabled={!username.trim()}
                className="w-full py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                Enviar solicitação
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { FriendGridSkeleton } from '../common/Skeleton';
import { ContextMenuItem, ContextMenuHeader } from '../common/ContextMenuItem';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import type { FriendEntry, FriendRequest, SentRequest } from '../../types';

type Tab = 'online' | 'all' | 'requests' | 'add';

/** Extrai { username, tag } de "Nome#TAG" digitado pelo usuário. */
function parseHandle(handle: string): { username: string; tag: string } | null {
  const idx = handle.lastIndexOf('#');
  if (idx === -1) return null;
  const username = handle.slice(0, idx).trim();
  const tag = handle.slice(idx + 1).trim();
  if (!username || !/^[a-zA-Z0-9]{3,5}$/.test(tag)) return null;
  return { username, tag };
}

export function FriendsPage() {
  const [tab, setTab] = useState<Tab>('online');
  const [handle, setHandle] = useState('');
  const [sendSuccess, setSendSuccess] = useState(false);
  const handleRef = useRef<HTMLInputElement>(null);
  const handleHandleContextMenu = useEditableContextMenu(handleRef);

  const { friends, requests, sent, isLoading, error, loadAll, sendRequest, accept, reject, remove, openDm, clearError } =
    useFriendStore();

  useEffect(() => {
    loadAll();
  }, []);

  const onlineFriends = friends.filter((f) => f.friend.status === 'online' || f.friend.status === 'in_call');

  const parsedHandle = parseHandle(handle);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsedHandle) return;
    try {
      await sendRequest(parsedHandle.username, parsedHandle.tag);
      setHandle('');
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

  const openRequestMenu = (e: React.MouseEvent, r: FriendRequest) => {
    e.preventDefault();
    e.stopPropagation();
    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{r.requester.username}</ContextMenuHeader>
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); accept(r.id); }}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          }
          label="Aceitar"
        />
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); reject(r.id); }}
          danger
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          }
          label="Recusar"
        />
      </>
    ));
  };

  const openSentMenu = (e: React.MouseEvent, r: SentRequest) => {
    e.preventDefault();
    e.stopPropagation();
    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{r.addressee.username}</ContextMenuHeader>
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); reject(r.id); }}
          danger
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          }
          label="Cancelar solicitação"
        />
      </>
    ));
  };

  const openFriendMenu = (e: React.MouseEvent, f: FriendEntry) => {
    e.preventDefault();
    e.stopPropagation();
    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{f.friend.username}</ContextMenuHeader>
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); handleOpenDm(f.friend.id); }}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          }
          label="Enviar mensagem"
        />
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); navigator.clipboard.writeText(f.friend.username).catch(() => {}); }}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          }
          label="Copiar nome de usuário"
        />
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); remove(f.id); }}
          danger
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          }
          label="Remover amigo"
        />
      </>
    ));
  };

  const stats: { id: Tab; label: string; value: React.ReactNode; accent: string }[] = [
    { id: 'online', label: 'Online agora', value: onlineFriends.length, accent: 'text-success' },
    { id: 'all', label: 'Todos os amigos', value: friends.length, accent: 'text-surface-100' },
    { id: 'requests', label: 'Solicitações', value: requests.length, accent: requests.length > 0 ? 'text-danger' : 'text-surface-100' },
    {
      id: 'add',
      label: 'Adicionar amigo',
      accent: 'text-accent-400',
      value: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
    },
  ];

  const displayFriends = tab === 'online' ? onlineFriends : friends;

  return (
    <main className="flex-1 flex flex-col min-w-0 zk-surface shadow-panel rounded-2xl overflow-hidden">
      {/* Header — visão geral em cartões clicáveis, em vez de abas discretas */}
      <header className="px-6 pt-6 pb-4 border-b border-white/[0.06] flex-shrink-0">
        <h2 className="text-xl font-bold text-surface-50 mb-4">Amigos</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {stats.map((s) => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              aria-pressed={tab === s.id}
              className={`rounded-xl border p-3 text-left transition-colors ${
                tab === s.id
                  ? 'border-accent-500 bg-accent-600/10'
                  : 'border-white/[0.08] bg-surface-800/40 shadow-panel hover:border-white/[0.14] hover:bg-surface-800'
              }`}
            >
              <div className={`text-2xl font-bold leading-none mb-1.5 ${s.accent}`}>{s.value}</div>
              <div className="text-xs font-medium text-surface-400">{s.label}</div>
            </button>
          ))}
        </div>
      </header>

      {/* Content — key={tab} força remontar ao trocar de aba, pra reiniciar o fade */}
      <div key={tab} className="flex-1 overflow-y-auto px-6 py-5 animate-fade-in">
        {tab === 'add' ? (
          <div className="max-w-md mx-auto text-center py-6">
            <div className="w-14 h-14 rounded-2xl bg-accent-600/15 text-accent-400 flex items-center justify-center mx-auto mb-4">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="8.5" cy="7" r="4" />
                <line x1="20" y1="8" x2="20" y2="14" />
                <line x1="23" y1="11" x2="17" y2="11" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-surface-100 mb-1">Adicionar amigo</h3>
            <p className="text-sm text-surface-400 mb-6">
              Digite o nome completo com a tag para enviar uma solicitação.
            </p>
            <form onSubmit={handleSendRequest} className="space-y-3 text-left">
              <div className="flex gap-2">
                <input
                  ref={handleRef}
                  type="text"
                  value={handle}
                  onChange={(e) => {
                    setHandle(e.target.value);
                    setSendSuccess(false);
                    clearError();
                  }}
                  onContextMenu={handleHandleContextMenu}
                  placeholder="Usuário#TAG"
                  autoFocus
                  className="flex-1 zk-input rounded-xl px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={!parsedHandle}
                  className="px-4 py-2 zk-btn-primary text-sm rounded-xl"
                >
                  Enviar
                </button>
              </div>
              {error && <p className="text-xs text-danger">{error}</p>}
              {sendSuccess && <p className="text-xs text-success">Solicitação enviada!</p>}
            </form>
          </div>
        ) : tab === 'requests' ? (
          isLoading ? (
            <FriendGridSkeleton />
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
                  Recebidas {requests.length > 0 && `(${requests.length})`}
                </h3>
                {requests.length === 0 ? (
                  <p className="text-sm text-surface-400">Nenhuma solicitação pendente</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {requests.map((r) => (
                      <div
                        key={r.id}
                        onContextMenu={(e) => openRequestMenu(e, r)}
                        className="rounded-xl border-l-4 border-l-danger border border-white/[0.07] bg-surface-800/60 shadow-panel p-4"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                            style={{ backgroundColor: getUserColor(r.requester.username) }}
                          >
                            {getInitials(r.requester.username)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-surface-100 truncate">{r.requester.username}</p>
                            <p className="text-xs text-surface-400">quer ser seu amigo</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => accept(r.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-success/15 hover:bg-success/25 text-success text-xs font-semibold rounded-lg transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Aceitar
                          </button>
                          <button
                            onClick={() => reject(r.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.06] hover:bg-danger/20 text-surface-300 hover:text-danger text-xs font-semibold rounded-lg transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                            Recusar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wide mb-3">
                  Enviadas {sent.length > 0 && `(${sent.length})`}
                </h3>
                {sent.length === 0 ? (
                  <p className="text-sm text-surface-400">Nenhuma solicitação enviada aguardando resposta</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {sent.map((r) => (
                      <div
                        key={r.id}
                        onContextMenu={(e) => openSentMenu(e, r)}
                        className="rounded-xl border-l-4 border-l-accent-500 border border-white/[0.07] bg-surface-800/60 shadow-panel p-4"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                            style={{ backgroundColor: getUserColor(r.addressee.username) }}
                          >
                            {getInitials(r.addressee.username)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-surface-100 truncate">{r.addressee.username}</p>
                            <p className="text-xs text-surface-400">aguardando resposta</p>
                          </div>
                        </div>
                        <button
                          onClick={() => reject(r.id)}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-white/[0.06] hover:bg-danger/20 text-surface-300 hover:text-danger text-xs font-semibold rounded-lg transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          Cancelar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        ) : isLoading ? (
          <FriendGridSkeleton />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {displayFriends.map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-white/[0.07] bg-surface-800/60 shadow-panel hover:border-white/[0.14] hover:bg-surface-800 hover:shadow-elevated transition-all p-3 flex items-center gap-3 cursor-pointer"
                onClick={() => handleOpenDm(f.friend.id)}
                onContextMenu={(e) => openFriendMenu(e, f)}
              >
                <div className="relative flex-shrink-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                    style={{ backgroundColor: getUserColor(f.friend.username) }}
                  >
                    {getInitials(f.friend.username)}
                  </div>
                  <div
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface-900 ${
                      f.friend.status === 'online' ? 'bg-online' :
                      f.friend.status === 'in_call' ? 'bg-warning' : 'bg-offline'
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-surface-100 truncate">{f.friend.username}</p>
                  <p
                    className={`text-xs font-medium ${
                      f.friend.status === 'online' ? 'text-success' :
                      f.friend.status === 'in_call' ? 'text-warning' : 'text-surface-400'
                    }`}
                  >
                    {f.friend.status === 'online' ? 'Online' :
                     f.friend.status === 'in_call' ? 'Em chamada' : 'Offline'}
                  </p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleOpenDm(f.friend.id); }}
                    className="p-2 bg-white/[0.06] hover:bg-accent-600 hover:text-on-accent text-surface-300 rounded-lg transition-colors"
                    title="Mensagem"
                    aria-label={`Enviar mensagem para ${f.friend.username}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); remove(f.id); }}
                    className="p-2 bg-white/[0.06] hover:bg-danger/30 text-surface-300 hover:text-danger rounded-lg transition-colors"
                    title="Remover amigo"
                    aria-label={`Remover ${f.friend.username} da lista de amigos`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

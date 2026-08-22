import { useEffect } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { useCallStore } from '../../stores/callStore';
import { useUnreadStore } from '../../stores/unreadStore';
import { useContextMenuStore } from '../../stores/contextMenuStore';
import { confirmDialog, alertDialog } from '../../stores/dialogStore';
import { VoiceStatusBar } from '../groups/VoiceStatusBar';
import { DMListSkeleton } from '../common/Skeleton';
import { ContextMenuItem, ContextMenuHeader, ContextMenuSeparator } from '../common/ContextMenuItem';
import { getInitials, getUserColor } from '../../utils/formatDate';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';
import type { DmChannel } from '../../types';

interface DMSidebarProps {
  voice: ReturnType<typeof useVoiceRoom>;
}

export function DMSidebar({ voice }: DMSidebarProps) {
  const { dmChannels, activeDmChannelId, loadDmChannels, closeDm, setActiveDm, isDmLoading, isFriend, sendRequestByUserId } =
    useFriendStore();

  const callStatus = useCallStore((s) => s.status);
  const callPeerUsername = useCallStore((s) => s.peerUsername);
  const callPeerId = useCallStore((s) => s.peerId);
  const unreadCounts = useUnreadStore((s) => s.counts);

  useEffect(() => {
    loadDmChannels();
  }, []);

  const handleHangup = () => {
    window.dispatchEvent(new CustomEvent('call:hangup'));
  };

  const handleDeleteConversation = async (dm: DmChannel) => {
    const ok = await confirmDialog(`A conversa com ${dm.friend.username} vai sumir da sua lista.`, {
      title: 'Excluir conversa?',
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (ok) closeDm(dm.channelId);
  };

  const openDmMenu = (e: React.MouseEvent, dm: DmChannel) => {
    e.preventDefault();
    e.stopPropagation();
    const alreadyFriend = isFriend(dm.friend.id);

    useContextMenuStore.getState().open({ x: e.clientX, y: e.clientY }, (
      <>
        <ContextMenuHeader>{dm.friend.username}</ContextMenuHeader>

        {!alreadyFriend && (
          <ContextMenuItem
            onClick={() => {
              useContextMenuStore.getState().close();
              sendRequestByUserId(dm.friend.id).catch((err: any) => {
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
            label="Enviar solicitação de amizade"
          />
        )}
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); navigator.clipboard.writeText(dm.friend.username).catch(() => {}); }}
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          }
          label="Copiar nome de usuário"
        />
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() => { useContextMenuStore.getState().close(); handleDeleteConversation(dm); }}
          danger
          icon={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6" /><path d="M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          }
          label="Excluir conversa"
        />
      </>
    ));
  };

  const getStatusDotClass = (status: string) => {
    if (status === 'online') return 'bg-online';
    if (status === 'in_call') return 'bg-warning';
    return 'bg-offline';
  };

  const getStatusText = (status: string) => {
    if (status === 'online') return 'Online';
    if (status === 'in_call') return 'Em chamada';
    return 'Offline';
  };

  const getStatusTextClass = (status: string) => {
    if (status === 'online') return 'text-success';
    if (status === 'in_call') return 'text-warning';
    return 'text-surface-500';
  };

  return (
    <aside className="w-60 zk-surface shadow-panel rounded-2xl flex flex-col flex-shrink-0 overflow-hidden">
      {/* DMs */}
      <div className="flex-1 overflow-y-auto py-2">
        {/* Seção mensagens diretas */}
        <div className="px-3 mb-1">
          <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider px-2 py-1.5">
            Mensagens Diretas
          </h3>
        </div>

        {dmChannels.length === 0 ? (
          isDmLoading ? (
            <DMListSkeleton />
          ) : (
            <p className="text-xs text-surface-500 px-5 py-2">Nenhum chat ainda</p>
          )
        ) : (
          <div className="px-2 space-y-0.5">
            {dmChannels.map((dm) => {
              const isActive = activeDmChannelId === dm.channelId;
              const color = getUserColor(dm.friend.username);
              const isInCallWithMe = callStatus !== 'idle' && Number(callPeerId) === Number(dm.friend.id);
              return (
                <div
                  key={dm.channelId}
                  className={`group relative flex items-center gap-2.5 px-2 py-1.5 rounded-xl transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white/[0.08] text-surface-100'
                      : 'text-surface-400 hover:text-surface-100 hover:bg-white/[0.05]'
                  }`}
                  onClick={() => setActiveDm(dm.channelId)}
                  onContextMenu={(e) => openDmMenu(e, dm)}
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
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-800 ${getStatusDotClass(dm.friend.status)}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{dm.friend.username}</p>
                    <p className={`text-xs ${getStatusTextClass(dm.friend.status)}`}>
                      {getStatusText(dm.friend.status)}
                    </p>
                  </div>
                  {isInCallWithMe ? (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="flex-shrink-0 text-success animate-pulse"
                    >
                      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
                    </svg>
                  ) : (
                    <>
                      {!!unreadCounts[dm.channelId] && (
                        <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 bg-danger rounded-full text-white text-[10px] font-bold flex items-center justify-center group-hover:hidden">
                          {unreadCounts[dm.channelId] > 9 ? '9+' : unreadCounts[dm.channelId]}
                        </span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); closeDm(dm.channelId); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/[0.12] text-surface-400 hover:text-surface-100 transition-all flex-shrink-0"
                        title="Fechar conversa"
                      >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="1" y1="1" x2="11" y2="11" />
                          <line x1="11" y1="1" x2="1" y2="11" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Call de voz de grupo em andamento — colada no rodapé, mesma posição
          usada na seção de canais. Some sozinha quando não há call ativa. */}
      <VoiceStatusBar voice={voice} />

      {/* Indicador mínimo de chamada 1:1 ativa (controles completos ficam acima do chat) */}
      {callStatus !== 'idle' && (
        <div className="px-3 py-2 bg-accent-900 border-t border-white/[0.06]">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${callStatus === 'active' ? 'bg-success animate-pulse' : 'bg-warning animate-pulse'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-success truncate">
                {callStatus === 'active' ? 'Em chamada' : callStatus === 'calling' ? 'Chamando...' : 'Conectando...'}
              </p>
              {callPeerUsername && (
                <p className="text-xs text-surface-400 truncate">{callPeerUsername}</p>
              )}
            </div>
            <button
              onClick={handleHangup}
              title="Encerrar chamada"
              className="p-1.5 rounded bg-danger text-white hover:bg-red-700 transition-colors flex-shrink-0"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

import { useEffect, useState } from 'react';
import { useChannelStore } from '../../stores/channelStore';
import { useChatStore } from '../../stores/chatStore';
import { getSocket } from '../../services/socket';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function DiscoverChannelsModal({ isOpen, onClose }: Props) {
  const {
    discoverChannels,
    isLoadingDiscover,
    loadDiscoverChannels,
    joinChannel,
    setActiveChannel,
  } = useChannelStore();
  const loadMessages = useChatStore((s) => s.loadMessages);
  const [joiningId, setJoiningId] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadDiscoverChannels();
      setError('');
    }
  }, [isOpen, loadDiscoverChannels]);

  if (!isOpen) return null;

  const handleJoin = async (channelId: number) => {
    setJoiningId(channelId);
    setError('');
    try {
      await joinChannel(channelId);
      await setActiveChannel(channelId);
      await loadMessages(channelId);
      const socket = getSocket();
      socket.emit('channel:join', { channelId });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao entrar no canal');
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative w-full max-w-md bg-surface-800 rounded-2xl shadow-2xl p-6 mx-4 max-h-[80vh] flex flex-col">
        <h2 className="text-xl font-bold text-surface-50 mb-1">Descobrir canais</h2>
        <p className="text-sm text-surface-400 mb-4">Canais públicos que você ainda não participa</p>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoadingDiscover ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : discoverChannels.length === 0 ? (
            <p className="text-sm text-surface-500 text-center py-8">
              Nenhum canal disponível para entrar
            </p>
          ) : (
            discoverChannels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center justify-between p-3 bg-surface-700/50 rounded-lg hover:bg-surface-700 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-surface-400">#</span>
                    <span className="text-sm font-medium text-surface-100 truncate">
                      {channel.name}
                    </span>
                  </div>
                  {channel.description && (
                    <p className="text-xs text-surface-400 mt-0.5 truncate">
                      {channel.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleJoin(channel.id)}
                  disabled={joiningId === channel.id}
                  className="ml-3 px-3 py-1.5 text-xs font-semibold bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0"
                >
                  {joiningId === channel.id ? 'Entrando...' : 'Entrar'}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="pt-4 mt-2 border-t border-surface-700/50">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

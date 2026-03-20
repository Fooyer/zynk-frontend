import { useChannelStore } from '../../stores/channelStore';
import { useChatStore } from '../../stores/chatStore';
import { getSocket } from '../../services/socket';

export function ChannelList() {
  const { channels, activeChannelId, setActiveChannel } = useChannelStore();
  const loadMessages = useChatStore((s) => s.loadMessages);

  const handleSelect = async (channelId: number) => {
    setActiveChannel(channelId);
    await loadMessages(channelId);

    // Informa o server que entrou na room (para reconexões)
    const socket = getSocket();
    socket.emit('channel:join', { channelId });
  };

  return (
    <div className="flex flex-col gap-0.5 px-2">
      <div className="flex items-center justify-between px-2 py-2">
        <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
          Canais
        </span>
      </div>

      {channels.map((channel) => {
        const isActive = channel.id === activeChannelId;
        return (
          <button
            key={channel.id}
            onClick={() => handleSelect(channel.id)}
            className={`
              w-full text-left px-3 py-2 rounded-lg text-sm font-medium
              transition-colors-fast flex items-center gap-2
              ${isActive
                ? 'bg-surface-600 text-surface-50'
                : 'text-surface-300 hover:bg-surface-700 hover:text-surface-100'
              }
            `}
          >
            <span className="text-surface-400 text-base">#</span>
            <span className="truncate">{channel.name}</span>
          </button>
        );
      })}

      {channels.length === 0 && (
        <p className="px-3 py-4 text-sm text-surface-500 text-center">
          Nenhum canal ainda
        </p>
      )}
    </div>
  );
}

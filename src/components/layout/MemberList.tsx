import { useChannelStore } from '../../stores/channelStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

export function MemberList() {
  const members = useChannelStore((s) => s.members);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);

  if (!activeChannelId) return null;

  const onlineMembers = members.filter((m) => m.user.status === 'online');
  const offlineMembers = members.filter((m) => m.user.status !== 'online');

  const renderMember = (member: typeof members[0]) => {
    const { user, role } = member;
    const color = getUserColor(user.username);
    const statusColor =
      user.status === 'online' ? 'bg-online' :
      user.status === 'away' ? 'bg-away' : 'bg-offline';

    return (
      <div key={member.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-surface-700/50 transition-colors-fast">
        <div className="relative flex-shrink-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold"
            style={{ backgroundColor: color }}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              getInitials(user.username)
            )}
          </div>
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-800 ${statusColor}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-surface-200 truncate">
            {user.username}
            {role === 'owner' && (
              <span className="ml-1.5 text-xs text-warning">👑</span>
            )}
          </p>
        </div>
      </div>
    );
  };

  return (
    <aside className="w-56 bg-surface-800 border-l border-surface-700/50 flex-shrink-0 overflow-y-auto py-4">
      {onlineMembers.length > 0 && (
        <div className="mb-4">
          <h3 className="px-4 mb-1 text-xs font-semibold text-surface-400 uppercase tracking-wider">
            Online — {onlineMembers.length}
          </h3>
          <div className="px-2">
            {onlineMembers.map(renderMember)}
          </div>
        </div>
      )}

      {offlineMembers.length > 0 && (
        <div>
          <h3 className="px-4 mb-1 text-xs font-semibold text-surface-400 uppercase tracking-wider">
            Offline — {offlineMembers.length}
          </h3>
          <div className="px-2 opacity-50">
            {offlineMembers.map(renderMember)}
          </div>
        </div>
      )}
    </aside>
  );
}

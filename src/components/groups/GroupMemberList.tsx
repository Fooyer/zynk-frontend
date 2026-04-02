import { useGroupStore } from '../../stores/groupStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

export function GroupMemberList() {
  const members = useGroupStore((s) => s.members);

  const online = members.filter((m) => m.user.status !== 'offline');
  const offline = members.filter((m) => m.user.status === 'offline');

  const renderMember = (m: (typeof members)[0]) => (
    <div key={m.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-surface-700/50 transition-colors">
      <div className="relative flex-shrink-0">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold"
          style={{ backgroundColor: getUserColor(m.user.username) }}
        >
          {getInitials(m.user.username)}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-800 ${
            m.user.status === 'online'  ? 'bg-success' :
            m.user.status === 'in_call' ? 'bg-accent-500' :
            'bg-surface-500'
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs truncate ${m.user.status === 'offline' ? 'text-surface-500' : 'text-surface-200'}`}>
          {m.user.username}
        </p>
        {m.role !== 'member' && (
          <p className="text-[9px] text-accent-400 uppercase font-semibold">{m.role}</p>
        )}
      </div>
    </div>
  );

  if (members.length === 0) return null;

  return (
    <aside className="w-48 bg-surface-800 border-l border-surface-700/50 flex flex-col flex-shrink-0 overflow-y-auto">
      {online.length > 0 && (
        <>
          <div className="pt-4 pb-1 px-3">
            <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">
              Online — {online.length}
            </p>
          </div>
          {online.map(renderMember)}
        </>
      )}
      {offline.length > 0 && (
        <>
          <div className="pt-3 pb-1 px-3">
            <p className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">
              Offline — {offline.length}
            </p>
          </div>
          {offline.map(renderMember)}
        </>
      )}
    </aside>
  );
}

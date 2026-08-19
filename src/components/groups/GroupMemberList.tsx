import { useGroupStore } from '../../stores/groupStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { MemberListSkeleton } from '../common/Skeleton';

export function GroupMemberList() {
  const members = useGroupStore((s) => s.members);
  const isLoadingMembers = useGroupStore((s) => s.isLoadingMembers);
  const collapsed = useLayoutStore((s) => s.memberListCollapsed);
  const setCollapsed = useLayoutStore((s) => s.setMemberListCollapsed);

  const online = members.filter((m) => m.user.status !== 'offline');
  const offline = members.filter((m) => m.user.status === 'offline');

  if (members.length === 0) {
    if (!isLoadingMembers) return null;
    return (
      <aside className="w-48 bg-surface-800 border-l border-surface-700/50 flex flex-col flex-shrink-0 overflow-y-auto">
        <MemberListSkeleton />
      </aside>
    );
  }

  if (collapsed) {
    return (
      <aside className="w-12 bg-surface-800 border-l border-surface-700/50 flex flex-col items-center flex-shrink-0 overflow-y-auto py-3 gap-2">
        <button
          onClick={() => setCollapsed(false)}
          title="Mostrar membros"
          aria-label="Mostrar lista de membros"
          className="w-8 h-8 flex items-center justify-center text-surface-500 hover:text-surface-200 hover:bg-surface-700/50 rounded-lg transition-colors flex-shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="w-6 h-px bg-surface-700 my-0.5 flex-shrink-0" />
        {[...online, ...offline].map((m) => (
          <div key={m.id} title={m.user.username} className="relative flex-shrink-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-semibold ${
                m.user.status === 'offline' ? 'opacity-40' : ''
              }`}
              style={{ backgroundColor: getUserColor(m.user.username) }}
            >
              {getInitials(m.user.username)}
            </div>
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-800 ${
                m.user.status === 'online' ? 'bg-success' :
                m.user.status === 'in_call' ? 'bg-accent-500' :
                'bg-surface-500'
              }`}
            />
          </div>
        ))}
      </aside>
    );
  }

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

  return (
    <aside className="w-48 bg-surface-800 border-l border-surface-700/50 flex flex-col flex-shrink-0 overflow-y-auto">
      <div className="flex items-center justify-between pt-3 pb-1 px-3 flex-shrink-0">
        <span className="text-[10px] font-semibold text-surface-500 uppercase tracking-widest">Membros</span>
        <button
          onClick={() => setCollapsed(true)}
          title="Ocultar membros"
          aria-label="Ocultar lista de membros"
          className="w-5 h-5 flex items-center justify-center text-surface-500 hover:text-surface-200 rounded transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {online.length > 0 && (
        <>
          <div className="pt-2 pb-1 px-3">
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

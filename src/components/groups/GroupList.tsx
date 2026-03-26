import { useGroupStore } from '../../stores/groupStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

export function GroupList() {
  const groups = useGroupStore((s) => s.groups);
  const activeGroupId = useGroupStore((s) => s.activeGroupId);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);

  return (
    <div className="space-y-0.5">
      {groups.map((group) => (
        <button
          key={group.id}
          onClick={() => setActiveGroup(group.id)}
          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
            activeGroupId === group.id
              ? 'bg-surface-600 text-surface-100'
              : 'text-surface-300 hover:bg-surface-700 hover:text-surface-100'
          }`}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
            style={{ backgroundColor: getUserColor(group.name) }}
          >
            {getInitials(group.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{group.name}</p>
            <p className="text-xs text-surface-400">{group.members?.length || 0} membros</p>
          </div>
        </button>
      ))}

      {groups.length === 0 && (
        <p className="text-sm text-surface-500 text-center py-4 px-3">
          Nenhum grupo ainda. Crie um!
        </p>
      )}
    </div>
  );
}

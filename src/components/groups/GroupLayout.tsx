import { useEffect, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { GroupList } from './GroupList';
import { GroupView } from './GroupView';
import { CreateGroupModal } from './CreateGroupModal';

export function GroupLayout() {
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return (
    <>
      <aside className="w-60 bg-surface-800 flex flex-col border-r border-surface-700/50 flex-shrink-0">
        <div className="h-12 flex items-center px-4 border-b border-surface-700/50">
          <h1 className="text-base font-bold text-surface-100">Grupos</h1>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          <GroupList />
        </div>

        <div className="px-3 py-2 border-t border-surface-700/30">
          <button
            onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-400 hover:text-surface-100 hover:bg-surface-700 rounded-lg transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" />
            </svg>
            Criar grupo
          </button>
        </div>
      </aside>

      <GroupView />

      <CreateGroupModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </>
  );
}

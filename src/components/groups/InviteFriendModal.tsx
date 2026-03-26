import { useState } from 'react';
import { useFriendStore } from '../../stores/friendStore';
import { useGroupStore } from '../../stores/groupStore';
import { getInitials, getUserColor } from '../../utils/formatDate';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  groupId: number;
}

export function InviteFriendModal({ isOpen, onClose, groupId }: Props) {
  const friends = useFriendStore((s) => s.friends);
  const members = useGroupStore((s) => s.members);
  const inviteMember = useGroupStore((s) => s.inviteMember);
  const [inviting, setInviting] = useState<number | null>(null);

  if (!isOpen) return null;

  const memberIds = new Set(members.map((m) => m.user.id));
  const availableFriends = friends.filter((f) => !memberIds.has(f.friend.id));

  const handleInvite = async (userId: number) => {
    setInviting(userId);
    try {
      await inviteMember(groupId, userId);
    } finally {
      setInviting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-800 rounded-xl w-96 p-6 border border-surface-700 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-surface-100 mb-4">Convidar Amigo</h2>

        {availableFriends.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">
            Todos os seus amigos ja estao no grupo ou voce nao tem amigos adicionados.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1">
            {availableFriends.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-700 transition-colors">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                  style={{ backgroundColor: getUserColor(f.friend.username) }}
                >
                  {getInitials(f.friend.username)}
                </div>
                <span className="text-sm text-surface-100 flex-1">{f.friend.username}</span>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${f.friend.status === 'online' ? 'bg-success' : 'bg-surface-500'}`} />
                  <button
                    onClick={() => handleInvite(f.friend.id)}
                    disabled={inviting === f.friend.id}
                    className="px-3 py-1 text-xs bg-accent-600 hover:bg-accent-500 text-white rounded-md transition-colors disabled:opacity-50"
                  >
                    {inviting === f.friend.id ? '...' : 'Convidar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={onClose} className="mt-4 px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors self-end">
          Fechar
        </button>
      </div>
    </div>
  );
}

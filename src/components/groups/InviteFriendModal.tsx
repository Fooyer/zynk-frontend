import { useEffect, useState } from 'react';
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
  const loadAll = useFriendStore((s) => s.loadAll);
  const members = useGroupStore((s) => s.members);
  const inviteMember = useGroupStore((s) => s.inviteMember);

  const [inviting, setInviting] = useState<number | null>(null);
  const [invited, setInvited] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAll();
      setInvited(new Set());
      setError(null);
    }
  }, [isOpen, loadAll]);

  if (!isOpen) return null;

  const memberIds = new Set(members.map((m) => Number(m.user.id)));
  const availableFriends = friends.filter((f) => !memberIds.has(Number(f.friend.id)));

  const handleInvite = async (userId: number) => {
    setInviting(userId);
    setError(null);
    try {
      await inviteMember(groupId, userId);
      setInvited((prev) => new Set(prev).add(userId));
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Erro ao convidar'));
    } finally {
      setInviting(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="zk-modal rounded-2xl w-96 p-6 max-h-[80vh] flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-surface-100 mb-1">Convidar para o grupo</h2>
        <p className="text-xs text-surface-500 mb-4">Apenas amigos que ainda não estão no grupo aparecem aqui.</p>

        {error && (
          <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded px-3 py-2 mb-3">{error}</p>
        )}

        {availableFriends.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-8">
            Todos os seus amigos já estão no grupo ou você não tem amigos adicionados.
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1">
            {availableFriends.map((f) => {
              const wasInvited = invited.has(Number(f.friend.id));
              return (
                <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.05] transition-colors">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: getUserColor(f.friend.username) }}
                  >
                    {getInitials(f.friend.username)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-100 truncate">{f.friend.username}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`w-2 h-2 rounded-full ${f.friend.status === 'online' ? 'bg-success' : 'bg-surface-500'}`} />
                    {wasInvited ? (
                      <span className="px-3 py-1 text-xs text-green-400 bg-green-900/20 border border-green-800/40 rounded-md">
                        Convidado
                      </span>
                    ) : (
                      <button
                        onClick={() => handleInvite(Number(f.friend.id))}
                        disabled={inviting === Number(f.friend.id)}
                        className="px-3 py-1 zk-btn-primary text-xs rounded-lg"
                      >
                        {inviting === Number(f.friend.id) ? '...' : 'Convidar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <button onClick={onClose} className="mt-4 px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors self-end">
          Fechar
        </button>
      </div>
    </div>
  );
}

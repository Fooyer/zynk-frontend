import { useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateGroupModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState('');
  const [maxMembers, setMaxMembers] = useState(8);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createGroup = useGroupStore((s) => s.createGroup);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const group = await createGroup(name.trim(), maxMembers);
      setActiveGroup(group.id);
      setName('');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-surface-800 rounded-xl w-96 p-6 border border-surface-700" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-surface-100 mb-4">Criar Grupo</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Nome do grupo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="Meu grupo de amigos"
              className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-surface-100 text-sm placeholder-surface-500 focus:outline-none focus:border-accent-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Max. membros ({maxMembers})
            </label>
            <input
              type="range"
              min={2}
              max={10}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              className="w-full accent-accent-500"
            />
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

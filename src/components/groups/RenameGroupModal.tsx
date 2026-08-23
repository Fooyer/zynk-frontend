import { useRef, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  groupId: number;
  currentName: string;
}

export function RenameGroupModal({ isOpen, onClose, groupId, currentName }: Props) {
  const [name, setName] = useState(currentName);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renameGroup = useGroupStore((s) => s.renameGroup);
  const nameRef = useRef<HTMLInputElement>(null);
  const handleNameContextMenu = useEditableContextMenu(nameRef);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await renameGroup(groupId, name.trim());
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Erro ao renomear o grupo'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="zk-modal rounded-2xl w-[380px] p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-surface-100 mb-4">Renomear grupo</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            ref={nameRef}
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onContextMenu={handleNameContextMenu}
            maxLength={64}
            placeholder="Nome do grupo"
            className="w-full px-3 py-2 zk-input rounded-xl text-sm"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 zk-btn-primary text-sm rounded-xl"
            >
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

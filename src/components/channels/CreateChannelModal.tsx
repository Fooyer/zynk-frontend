import { useState } from 'react';
import { useChannelStore } from '../../stores/channelStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateChannelModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const createChannel = useChannelStore((s) => s.createChannel);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    setError('');
    try {
      const channel = await createChannel(name.trim(), description.trim() || undefined);
      setActiveChannel(channel.id);
      setName('');
      setDescription('');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao criar canal');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-surface-800 rounded-2xl shadow-2xl p-6 mx-4">
        <h2 className="text-xl font-bold text-surface-50 mb-1">Criar canal</h2>
        <p className="text-sm text-surface-400 mb-6">Canais são onde a conversa acontece</p>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Nome</label>
            <div className="flex items-center bg-surface-900 border border-surface-600 rounded-lg focus-within:border-accent-500 focus-within:ring-1 focus-within:ring-accent-500 transition-all">
              <span className="pl-3 text-surface-500">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-2 py-3 bg-transparent text-surface-100 placeholder-surface-500 focus:outline-none"
                placeholder="nome-do-canal"
                maxLength={64}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Descrição <span className="text-surface-500 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-surface-900 border border-surface-600 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
              placeholder="Sobre o que é este canal?"
              maxLength={255}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isLoading}
              className="flex-1 py-2.5 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
            >
              {isLoading ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { extractYouTubeVideoId } from '../../services/youtube';

interface Props {
  onClose: () => void;
  onSubmit: (videoId: string) => void;
  /** 'swap' força tocar na hora, interrompendo o vídeo atual — usado pelo
   *  botão "trocar vídeo". 'add' entra na fila (ou toca na hora se nada
   *  estiver rolando ainda) — usado pelo botão principal e pelo "+" da fila. */
  mode: 'add' | 'swap';
}

const COPY = {
  add: {
    title: 'Adicionar à fila',
    hint: 'Cole o link de um vídeo — entra no fim da fila (ou toca na hora, se ninguém estiver assistindo nada ainda).',
    submitLabel: 'Adicionar',
  },
  swap: {
    title: 'Trocar vídeo',
    hint: 'Cole o link de um vídeo — troca o que está passando agora pra todo mundo na call. A fila continua intacta.',
    submitLabel: 'Trocar agora',
  },
};

export function WatchTogetherModal({ onClose, onSubmit, mode }: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const videoId = extractYouTubeVideoId(value);
    if (!videoId) {
      setError('Link do YouTube inválido. Cole a URL completa do vídeo.');
      return;
    }
    onSubmit(videoId);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div className="zk-modal rounded-2xl w-96 p-6 animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-surface-100 mb-1">{copy.title}</h2>
        <p className="text-xs text-surface-500 mb-4">{copy.hint}</p>

        <form onSubmit={handleSubmit}>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full bg-surface-900/70 border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-surface-100 placeholder-surface-500 focus:outline-none focus:ring-1 focus:ring-accent-500/40"
          />
          {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

          <div className="flex items-center justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={!value.trim()} className="px-4 py-2 zk-btn-primary text-sm rounded-lg disabled:opacity-40">
              {copy.submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

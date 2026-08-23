interface Props {
  queue: string[];
  onRemove: (index: number) => void;
  onAdd: () => void;
  onSkip: () => void;
  onClose: () => void;
}

/** Painel lateral com a fila de próximos vídeos — thumbnails vêm direto do
 *  CDN público do YouTube (img.youtube.com), sem precisar da Data API. */
export function WatchQueuePanel({ queue, onRemove, onAdd, onSkip, onClose }: Props) {
  return (
    <div className="absolute top-0 right-0 bottom-0 z-20 w-64 bg-surface-950/95 backdrop-blur-sm border-l border-white/[0.08] flex flex-col animate-slide-in-right">
      <div className="flex items-center justify-between px-3 py-3 border-b border-white/[0.06] flex-shrink-0">
        <span className="text-sm font-semibold text-surface-100">Fila ({queue.length})</span>
        <button onClick={onClose} className="p-1 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-white/[0.08] transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <button
        onClick={onSkip}
        className="flex-shrink-0 mx-2 mt-2 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-sm text-surface-200 transition-colors flex items-center justify-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4" /><rect x="17" y="4" width="3" height="16" /></svg>
        Pular vídeo atual
      </button>

      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {queue.length === 0 ? (
          <p className="text-xs text-surface-500 text-center py-6 px-2">
            Nada na fila. Adicione um vídeo pra tocar assim que o atual terminar.
          </p>
        ) : (
          queue.map((videoId, i) => (
            <div key={`${videoId}-${i}`} className="group flex items-center gap-2 rounded-lg p-1.5 hover:bg-white/[0.05] transition-colors">
              <span className="text-xs text-surface-500 w-4 text-center flex-shrink-0">{i + 1}</span>
              <img
                src={`https://img.youtube.com/vi/${videoId}/mqdefault.jpg`}
                alt=""
                className="w-16 h-9 rounded object-cover flex-shrink-0 bg-surface-800"
              />
              <span className="flex-1 min-w-0 text-xs text-surface-300 truncate">{videoId}</span>
              <button
                onClick={() => onRemove(i)}
                title="Remover da fila"
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-surface-500 hover:text-danger transition-all flex-shrink-0"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      <button
        onClick={onAdd}
        className="flex-shrink-0 m-2 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-sm text-surface-200 transition-colors flex items-center justify-center gap-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Adicionar vídeo
      </button>
    </div>
  );
}

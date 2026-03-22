import { useEffect, useState } from 'react';
import type { ScreenSource } from '../../types';

interface Props {
  onSelect: (source: ScreenSource) => void;
  onCancel: () => void;
}

export function ScreenPicker({ onSelect, onCancel }: Props) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    window.electronAPI?.getScreenSources().then((s) => {
      setSources(s);
      setLoading(false);
      // Auto-seleciona a primeira tela inteira
      const firstScreen = s.find((src) => src.isScreen);
      if (firstScreen) setSelected(firstScreen.id);
    }).catch(() => setLoading(false));
  }, []);

  const screens = sources.filter((s) => s.isScreen);
  const windows = sources.filter((s) => !s.isScreen);

  const handleConfirm = () => {
    const source = sources.find((s) => s.id === selected);
    if (source) onSelect(source);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70" onClick={onCancel}>
      <div
        className="bg-surface-800 rounded-xl border border-surface-600/50 shadow-2xl w-[640px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-surface-700/50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-surface-100">Compartilhar tela</h2>
          <button
            onClick={onCancel}
            className="p-1 text-surface-400 hover:text-surface-100 rounded hover:bg-surface-700 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Telas */}
              {screens.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Telas</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {screens.map((source) => (
                      <SourceCard
                        key={source.id}
                        source={source}
                        isSelected={selected === source.id}
                        onClick={() => setSelected(source.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Janelas */}
              {windows.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">Janelas</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {windows.map((source) => (
                      <SourceCard
                        key={source.id}
                        source={source}
                        isSelected={selected === source.id}
                        onClick={() => setSelected(source.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {sources.length === 0 && (
                <p className="text-center text-surface-400 py-8">Nenhuma fonte disponível</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-surface-700/50 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg text-surface-300 hover:text-surface-100 hover:bg-surface-700 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="px-4 py-2 text-sm rounded-lg bg-accent-600 text-white font-medium hover:bg-accent-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Compartilhar
          </button>
        </div>
      </div>
    </div>
  );
}

function SourceCard({ source, isSelected, onClick }: { source: ScreenSource; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`group relative rounded-lg overflow-hidden border-2 transition-all ${
        isSelected
          ? 'border-accent-500 ring-1 ring-accent-500/30'
          : 'border-surface-600/50 hover:border-surface-500'
      }`}
    >
      <img
        src={source.thumbnail}
        alt={source.name}
        className="w-full aspect-video object-cover bg-surface-900"
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2">
        <span className="text-xs text-white font-medium truncate block">
          {source.isScreen ? `Tela ${source.name}` : source.name}
        </span>
      </div>
      {isSelected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-accent-500 flex items-center justify-center">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      )}
    </button>
  );
}

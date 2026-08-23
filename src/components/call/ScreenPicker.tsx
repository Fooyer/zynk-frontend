import { useEffect, useState } from 'react';
import { ScreenPickerSkeleton } from '../common/Skeleton';
import type { ScreenSource } from '../../types';

interface Props {
  onSelect: (source: ScreenSource) => void;
  onCancel: () => void;
}

export function ScreenPicker({ onSelect, onCancel }: Props) {
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');

  useEffect(() => {
    window.electronAPI?.getScreenSources().then((s) => {
      setSources(s);
      setLoading(false);
      // Auto-seleciona a primeira tela inteira; se não houver nenhuma, cai
      // pra aba de janelas e seleciona a primeira janela.
      const firstScreen = s.find((src) => src.isScreen);
      if (firstScreen) {
        setSelected(firstScreen.id);
      } else if (s.length > 0) {
        setSelected(s[0].id);
        setActiveTab('windows');
      }
    }).catch(() => setLoading(false));
  }, []);

  const screens = sources.filter((s) => s.isScreen);
  const windows = sources.filter((s) => !s.isScreen);
  const activeSources = activeTab === 'screens' ? screens : windows;

  const handleConfirm = () => {
    const source = sources.find((s) => s.id === selected);
    if (source) onSelect(source);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onCancel}>
      <div
        className="bg-surface-800 rounded-2xl border border-white/[0.08] shadow-modal w-[640px] max-h-[80vh] flex flex-col animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h2 className="text-base font-semibold text-surface-100">Compartilhar tela</h2>
          <button
            onClick={onCancel}
            className="p-1 text-surface-400 hover:text-surface-100 rounded hover:bg-white/[0.08] transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Abas */}
        {!loading && sources.length > 0 && (
          <div className="px-5 pt-3 flex items-center gap-1 border-b border-white/[0.06] flex-shrink-0">
            <button
              onClick={() => setActiveTab('screens')}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'screens'
                  ? 'border-accent-500 text-surface-100'
                  : 'border-transparent text-surface-400 hover:text-surface-200'
              }`}
            >
              Telas{screens.length > 0 ? ` (${screens.length})` : ''}
            </button>
            <button
              onClick={() => setActiveTab('windows')}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'windows'
                  ? 'border-accent-500 text-surface-100'
                  : 'border-transparent text-surface-400 hover:text-surface-200'
              }`}
            >
              Janelas{windows.length > 0 ? ` (${windows.length})` : ''}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <ScreenPickerSkeleton />
          ) : sources.length === 0 ? (
            <p className="text-center text-surface-400 py-8">Nenhuma fonte disponível</p>
          ) : activeSources.length === 0 ? (
            <p className="text-center text-surface-400 py-8">
              {activeTab === 'screens' ? 'Nenhuma tela disponível' : 'Nenhuma janela disponível'}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {activeSources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  isSelected={selected === source.id}
                  onClick={() => setSelected(source.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg text-surface-300 hover:text-surface-100 hover:bg-white/[0.08] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected}
            className="px-4 py-2 zk-btn-primary text-sm rounded-lg"
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
      className={`group relative rounded-xl overflow-hidden border-2 transition-all ${
        isSelected
          ? 'border-accent-500 ring-1 ring-accent-500/30 shadow-elevated'
          : 'border-white/[0.08] hover:border-white/[0.16] hover:shadow-elevated'
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

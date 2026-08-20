import { useEffect, useState } from 'react';

type UpdateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; version: string; percent: number }
  | { phase: 'ready'; version: string };

/**
 * Toast discreto no canto — não é um modal porque atualização nunca deve
 * interromper o que o usuário está fazendo (call em andamento, etc.). Se
 * ignorado, a atualização se aplica sozinha no próximo fechar de verdade do
 * app (ver autoInstallOnAppQuit no main.ts).
 */
export function UpdateToast() {
  const [state, setState] = useState<UpdateState>({ phase: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onUpdateAvailable((version) => {
      setState({ phase: 'downloading', version, percent: 0 });
    });
    window.electronAPI.onUpdateProgress((percent) => {
      setState((prev) => (prev.phase === 'downloading' ? { ...prev, percent } : prev));
    });
    window.electronAPI.onUpdateDownloaded((version) => {
      setDismissed(false);
      setState({ phase: 'ready', version });
    });
  }, []);

  if (state.phase === 'idle' || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[150] w-72 zk-elevated rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-accent-600/15 text-accent-400 flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          {state.phase === 'downloading' ? (
            <>
              <p className="text-sm font-semibold text-surface-100">Baixando atualização</p>
              <p className="text-xs text-surface-400 mt-0.5">Versão {state.version} — {state.percent}%</p>
              <div className="mt-2 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full bg-accent-500 transition-all duration-300"
                  style={{ width: `${state.percent}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-surface-100">Atualização pronta</p>
              <p className="text-xs text-surface-400 mt-0.5">Versão {state.version} — reinicie para aplicar.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => window.electronAPI?.restartToUpdate()}
                  className="zk-btn-primary px-3 py-1.5 text-xs rounded-lg"
                >
                  Reiniciar agora
                </button>
                <button
                  onClick={() => setDismissed(true)}
                  className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 transition-colors"
                >
                  Depois
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

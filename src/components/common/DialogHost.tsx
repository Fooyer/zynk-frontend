import { useEffect } from 'react';
import { useDialogStore } from '../../stores/dialogStore';

/**
 * Substitui window.confirm/window.alert por um diálogo no estilo do app.
 * Montado uma vez na raiz — dialogStore controla o que aparece aqui, então
 * qualquer parte do código (componente ou hook) pode disparar via
 * confirmDialog()/alertDialog() sem precisar de estado de modal local.
 */
export function DialogHost() {
  const request = useDialogStore((s) => s.request);
  const close = useDialogStore((s) => s.close);

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, close]);

  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={() => close(false)}
    >
      <div
        className="zk-modal rounded-2xl w-[380px] p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-5">
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
              request.danger ? 'bg-danger/15 text-danger' : 'bg-accent-600/15 text-accent-400'
            }`}
          >
            {request.danger ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            )}
          </div>
          <div className="min-w-0 pt-1">
            {request.title && <h2 className="text-sm font-bold text-surface-100 mb-1">{request.title}</h2>}
            <p className="text-sm text-surface-300 leading-relaxed">{request.message}</p>
          </div>
        </div>

        <div className="flex gap-3 justify-end">
          {request.kind === 'confirm' && (
            <button
              onClick={() => close(false)}
              className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
            >
              {request.cancelLabel}
            </button>
          )}
          <button
            onClick={() => close(true)}
            autoFocus
            className={`px-4 py-2 text-sm font-semibold uppercase tracking-wide rounded-xl transition-all ${
              request.danger
                ? 'bg-danger hover:bg-red-700 text-white'
                : 'zk-btn-primary'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
